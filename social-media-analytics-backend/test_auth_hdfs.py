"""Auth route checks and mocked WebHDFS data-path tests; no Hadoop service is implied."""
import json
import os
import tempfile
import time
import unittest
from pathlib import Path
from unittest.mock import patch

from api import auth as auth_api
from api.auth import LoginRequest
from config import settings
from fastapi import HTTPException
from fastapi.security import HTTPAuthorizationCredentials
from main import app
from services import auth_service, hdfs_storage


class AuthAndHdfsTests(unittest.TestCase):
    def test_development_signing_key_is_stable_across_backend_processes(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            key_path = os.path.join(temp_dir, "auth_secret_key")
            first_key = auth_service._development_secret(Path(key_path))
            second_key = auth_service._development_secret(Path(key_path))
            self.assertEqual(first_key, second_key)
            self.assertGreaterEqual(len(first_key), 32)

    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.db_path = os.path.join(self.temp.name, "test.sqlite")
        self.original_db_path = auth_service.DB_PATH
        auth_service.DB_PATH = self.db_path
        self.user = auth_service.create_user("test.account", "correct horse battery staple")

    def tearDown(self):
        auth_service.DB_PATH = self.original_db_path
        self.temp.cleanup()

    def test_successful_login_returns_bearer_token(self):
        result = auth_api.login(LoginRequest(username="test.account", password="correct horse battery staple"))
        self.assertEqual(result["token_type"], "bearer")
        self.assertEqual(auth_service.validate_token(result["access_token"])["username"], "test.account")

    def test_invalid_login_is_rejected(self):
        with self.assertRaises(HTTPException) as error:
            auth_api.login(LoginRequest(username="test.account", password="incorrect password"))
        self.assertEqual(error.exception.status_code, 401)

    def test_password_is_hashed_and_duplicate_user_is_rejected(self):
        with auth_service._connect() as conn:
            saved = conn.execute("SELECT password_hash FROM auth_users WHERE id=?", (self.user["id"],)).fetchone()[0]
        self.assertNotIn("correct horse battery staple", saved)
        with self.assertRaisesRegex(ValueError, "already exists"):
            auth_service.create_user("TEST.ACCOUNT", "another secure password")

    def test_expired_token_is_rejected_by_protected_route(self):
        issued = auth_service.issue_token(self.user, now=int(time.time()) - settings.AUTH_TOKEN_TTL_MINUTES * 60 - 5)
        self.assertIsNone(auth_service.validate_token(issued["access_token"]))
        credentials = HTTPAuthorizationCredentials(scheme="Bearer", credentials=issued["access_token"])
        with self.assertRaises(HTTPException) as error:
            auth_api.get_current_user(credentials)
        self.assertEqual(error.exception.status_code, 401)

    def test_protected_route_rejects_unauthenticated_request(self):
        with self.assertRaises(HTTPException) as error:
            auth_api.get_current_user(None)
        self.assertEqual(error.exception.status_code, 401)

    def test_private_api_routes_are_registered_with_auth_dependency(self):
        # FastAPI's newer lazy included-router wrappers do not expose ``path``
        # on app.routes until routing; OpenAPI resolves the complete route tree.
        paths = app.openapi()["paths"]
        private_paths = [path for path in paths if path.startswith(("/facebook", "/instagram", "/api/"))
                         and not path.startswith("/api/auth/")]
        self.assertGreater(len(private_paths), 0)
        self.assertIn("/api/unified/dashboard-analytics", private_paths)
        for path in private_paths:
            for operation in paths[path].values():
                self.assertIn({"HTTPBearer": []}, operation.get("security", []),
                              f"Route is missing bearer auth: {path}")

    def test_logout_revokes_session(self):
        token = auth_service.issue_token(self.user)["access_token"]
        credentials = HTTPAuthorizationCredentials(scheme="Bearer", credentials=token)
        auth_api.logout(credentials, auth_service.validate_token(token))
        self.assertIsNone(auth_service.validate_token(token))

    def test_mocked_hdfs_write_verify_and_idempotent_backfill(self):
        record = {"id": "post-1", "created_time": "2026-10-19T12:00:00Z", "text": "A Facebook post",
                  "sentiment": "positive", "sentiment_confidence": 0.9, "likes_count": 3,
                  "comments_count": 1, "shares_count": 2}
        fake_files = {}
        writes = []

        def fake_write(path, payload):
            writes.append(path)
            fake_files["/" + path.lstrip("/")] = dict(payload)

        with patch.object(settings, "HDFS_WEBHDFS_URL", "http://namenode:9870/webhdfs/v1"), \
             patch.object(settings, "HDFS_ROOT_PATH", "/test-root"), \
             patch.object(hdfs_storage, "check_status", return_value={"available": True}), \
             patch.object(hdfs_storage, "_fetch_records", return_value={"posts": [record], "comments": []}), \
             patch.object(hdfs_storage, "_mkdirs"), \
             patch.object(hdfs_storage, "_write_json", side_effect=fake_write), \
             patch.object(hdfs_storage, "_read_json", side_effect=lambda path: fake_files["/" + path.lstrip("/")]):
            exported = hdfs_storage.export_record("post", record)
            second = hdfs_storage.export_record("post", record)
            self.assertTrue(exported["verified"])
            self.assertEqual(exported["raw_path"], second["raw_path"])
            self.assertEqual(len(set(writes)), 2)
            self.assertEqual(fake_files[exported["processed_path"]]["sentiment_result"]["label"], "positive")

    def test_mocked_hdfs_backfill_exports_posts_and_comments(self):
        records = {"posts": [{"id": "p-1", "created_time": "2026-10-19T12:00:00Z", "text": "post", "sentiment": "positive"}],
                   "comments": [{"id": "c-1", "created_time": "2026-10-19T12:10:00Z", "post_id": "p-1", "text": "comment", "sentiment": "negative"}]}
        fake_files = {}

        def fake_write(path, payload):
            fake_files["/" + path.lstrip("/")] = dict(payload)

        with patch.object(settings, "HDFS_WEBHDFS_URL", "http://namenode:9870/webhdfs/v1"), \
             patch.object(settings, "HDFS_ROOT_PATH", "/test-root"), \
             patch.object(hdfs_storage, "check_status", return_value={"available": True}), \
             patch.object(hdfs_storage, "_fetch_records", return_value=records), \
             patch.object(hdfs_storage, "_mkdirs"), \
             patch.object(hdfs_storage, "_write_json", side_effect=fake_write), \
             patch.object(hdfs_storage, "_read_json", side_effect=lambda path: fake_files["/" + path.lstrip("/")]):
            result = hdfs_storage.backfill()
        self.assertEqual(result["posts_exported"], 1)
        self.assertEqual(result["comments_exported"], 1)
        self.assertEqual(result["files_written"], 4)
        self.assertTrue(result["verified"])
        self.assertNotIn("sentiment", fake_files[result["files"][0]])

    def test_mocked_hdfs_read_summary_uses_written_json_records(self):
        path = "/test-root/processed/facebook/posts/year=2026/month=10/day=19/post.json"
        record = {"id": "post-1", "record_type": "post", "sentiment_result": {"label": "negative"},
                  "likes_count": 4, "comments_count": 2, "shares_count": 1}
        with patch.object(settings, "HDFS_WEBHDFS_URL", "http://namenode:9870/webhdfs/v1"), \
             patch.object(hdfs_storage, "check_status", return_value={"available": True}), \
             patch.object(hdfs_storage, "_list_files", return_value=[path]), \
             patch.object(hdfs_storage, "_read_json", return_value=record):
            result = hdfs_storage.read_summary()
        self.assertEqual(result["files_read"], 1)
        self.assertEqual(result["sentiment_counts"], {"negative": 1})
        self.assertEqual(result["engagement"], {"likes": 4, "comments": 2, "shares": 1})

    def test_unconfigured_hdfs_fails_explicitly(self):
        with patch.object(settings, "HDFS_WEBHDFS_URL", ""):
            status = hdfs_storage.check_status()
            with self.assertRaisesRegex(hdfs_storage.HDFSStorageError, "not configured"):
                hdfs_storage.backfill()
        self.assertFalse(status["available"])
        self.assertFalse(status["configured"])


if __name__ == "__main__":
    unittest.main()

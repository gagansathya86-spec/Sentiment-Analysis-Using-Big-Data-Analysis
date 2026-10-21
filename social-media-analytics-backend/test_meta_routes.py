"""Offline route-level checks for authenticated Graph request construction."""
import io
import json
import urllib.parse
import unittest
from unittest.mock import patch
from urllib.error import HTTPError

from fastapi import HTTPException

from api import facebook, instagram


class FakeResponse(io.BytesIO):
    def __init__(self, payload):
        super().__init__(json.dumps(payload).encode("utf-8"))
        self.headers = {}

    def __enter__(self):
        return self

    def __exit__(self, *_args):
        self.close()
        return False

    def getcode(self):
        return 200


class MetaRouteRegressionTests(unittest.TestCase):
    def test_facebook_status_uses_configured_version_and_existing_user_token(self):
        requests = []

        def graph_open(request, timeout=None):
            parsed = urllib.parse.urlparse(request.full_url)
            query = urllib.parse.parse_qs(parsed.query)
            requests.append((parsed.path, query))
            if parsed.path.endswith("/me/accounts"):
                return FakeResponse({"data": [{"id": "page-1", "name": "Page", "access_token": "page-token"}]})
            return FakeResponse({"id": "user-1", "name": "User"})

        old_state = dict(facebook.ACTIVE_PAGE_STATE)
        facebook.ACTIVE_PAGE_STATE.update(selected_page_id=None, selected_page_name=None, page_tokens={})
        try:
            with patch.object(facebook, "_get_user_token", return_value="stored-user-token"), \
                    patch.object(facebook.social_service, "get_sync_statuses", return_value={}), \
                    patch.object(facebook, "graph_urlopen", side_effect=graph_open):
                result = facebook.get_facebook_status()
        finally:
            facebook.ACTIVE_PAGE_STATE.update(old_state)

        self.assertTrue(result["connected"])
        self.assertEqual(len(requests), 2)
        self.assertTrue(all(path.startswith("/v21.0/") for path, _ in requests))
        self.assertTrue(all(query.get("access_token") == ["stored-user-token"] for _, query in requests))

    def test_facebook_route_exposes_upstream_rate_limit_source(self):
        response = json.dumps({"error": {"code": 4, "message": "Application request limit reached"}, "retry_after_seconds": 20, "rate_limit_source": "meta_graph"}).encode()
        rate_error = HTTPError(
            "https://graph.facebook.com/v21.0/me", 429, "rate", 
            {"Retry-After": "20", "X-Projecti-Meta-Rate-Limit-Source": "meta_graph"}, io.BytesIO(response),
        )
        with patch.object(facebook, "_get_user_token", return_value="stored-user-token"), \
                patch.object(facebook.social_service, "get_sync_statuses", return_value={}), \
                patch.object(facebook, "graph_urlopen", side_effect=rate_error):
            with self.assertRaises(HTTPException) as raised:
                facebook.get_facebook_status()
        self.assertEqual(raised.exception.status_code, 429)
        self.assertEqual(raised.exception.detail["rate_limit_source"], "meta_graph")

    def test_instagram_discovery_and_media_use_existing_token_and_graph_version(self):
        requests = []

        def graph_open(request, timeout=None):
            parsed = urllib.parse.urlparse(request.full_url)
            query = urllib.parse.parse_qs(parsed.query)
            requests.append((parsed.path, query))
            if parsed.path.endswith("/me/accounts"):
                return FakeResponse({"data": [{"id": "page-1", "name": "Page", "access_token": "page-token"}]})
            if parsed.path.endswith("/page-1"):
                return FakeResponse({"id": "page-1", "name": "Page", "instagram_business_account": {"id": "ig-1", "username": "projecti"}})
            if parsed.path.endswith("/ig-1/media"):
                return FakeResponse({"data": [{"id": "media-1", "caption": "Real caption", "media_type": "IMAGE", "permalink": "https://example.test/p", "timestamp": "2026-10-20T12:00:00+0000"}]})
            raise AssertionError("Unexpected Graph endpoint")

        with patch.object(instagram, "_get_user_token", return_value="stored-user-token"), \
                patch.object(instagram.settings, "INSTAGRAM_PAGE_ID", "page-1"), \
                patch.object(instagram.settings, "INSTAGRAM_ACCOUNT_ID", "ig-1"), \
                patch.object(instagram, "graph_urlopen", side_effect=graph_open):
            result = instagram.get_instagram_media(limit=10)

        self.assertEqual(result["account"]["id"], "ig-1")
        self.assertEqual(result["data"][0]["id"], "media-1")
        self.assertEqual(len(requests), 3)
        self.assertTrue(all(path.startswith("/v21.0/") for path, _ in requests))
        self.assertEqual(requests[0][1].get("access_token"), ["stored-user-token"])
        self.assertEqual(requests[1][1].get("access_token"), ["stored-user-token"])
        self.assertEqual(requests[2][1].get("access_token"), ["page-token"])

    def test_instagram_route_surfaces_local_cooldown_source_without_meta_call(self):
        response = json.dumps({
            "error": {"code": 4, "message": "Meta has temporarily rate-limited this app."},
            "retry_after_seconds": 12,
            "rate_limit_source": "local_cooldown",
        }).encode()
        rate_error = HTTPError(
            "https://graph.facebook.com/v21.0/me/accounts", 429, "cooldown",
            {"Retry-After": "12", "X-Projecti-Meta-Rate-Limit-Source": "local_cooldown"}, io.BytesIO(response),
        )
        with patch.object(instagram, "_get_user_token", return_value="stored-user-token"), \
                patch.object(instagram.settings, "INSTAGRAM_PAGE_ID", ""), \
                patch.object(instagram.settings, "INSTAGRAM_ACCOUNT_ID", ""), \
                patch.object(instagram, "graph_urlopen", side_effect=rate_error):
            with self.assertRaises(HTTPException) as raised:
                instagram.get_instagram_media(limit=10)
        self.assertEqual(raised.exception.status_code, 429)
        self.assertEqual(raised.exception.detail["rate_limit_source"], "local_cooldown")
        self.assertEqual(raised.exception.detail["retry_after_seconds"], 12)


if __name__ == "__main__":
    unittest.main()

"""Offline regression coverage for Facebook comment sync and analysis."""
import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from api import facebook
from api import settings_api
from config import settings
from services import social_service
from services import facebook_token_service
from analytics.aspect_analysis import classify_comment_sentiment


class FacebookCommentTests(unittest.TestCase):
    def test_comment_pages_follow_next_cursor_and_keep_available_fields(self):
        pages = [
            {"data": [{"id": "c1", "message": "Great", "from": {"name": "A"}}],
             "paging": {"next": "https://graph.example/page2"}},
            {"data": [{"id": "c2", "message": "", "like_count": 3}], "paging": {}},
        ]

        class Response:
            def __init__(self, body):
                self.body = body
            def __enter__(self):
                return self
            def __exit__(self, *_args):
                return False
            def read(self):
                return json.dumps(self.body).encode()

        with patch.object(facebook.urllib.request, "urlopen", side_effect=[Response(p) for p in pages]) as opened:
            rows = facebook._fetch_comment_pages("https://graph.example/page1", "post-id")
        self.assertEqual([row["id"] for row in rows], ["c1", "c2"])
        self.assertEqual(rows[0]["author"], "A")
        self.assertEqual(rows[1]["message"], "")
        self.assertEqual(opened.call_count, 2)

    def test_aggregate_percentages_exclude_unanalyzed_and_include_neutral(self):
        rows = ([{"sentiment": "positive"}] * 2 + [{"sentiment": "negative"}] * 1 +
                [{"sentiment": "neutral"}] * 1 + [{"sentiment": "unknown"}] * 2)
        result = facebook._comment_summary(rows)
        self.assertEqual(result["comments_analyzed"], 4)
        self.assertEqual(result["unanalyzed_count"], 2)
        self.assertEqual(result["positive_percentage"], 50.0)
        self.assertEqual(result["negative_percentage"], 25.0)
        self.assertEqual(result["neutral_percentage"], 25.0)
        self.assertEqual(result["overall_sentiment"], "positive")

    def test_requested_five_comment_distribution_and_zero_safe_percentages(self):
        result = facebook._comment_summary(
            [{"sentiment": "positive"}] * 3 + [{"sentiment": "negative"}] * 2
        )
        self.assertEqual(result["positive_count"], 3)
        self.assertEqual(result["negative_count"], 2)
        self.assertEqual(result["neutral_count"], 0)
        self.assertEqual(result["positive_percentage"], 60.0)
        self.assertEqual(result["negative_percentage"], 40.0)
        self.assertEqual(result["neutral_percentage"], 0.0)
        empty = facebook._comment_summary([])
        self.assertEqual(empty["comments_analyzed"], 0)
        self.assertEqual((empty["positive_percentage"], empty["negative_percentage"], empty["neutral_percentage"]), (0.0, 0.0, 0.0))

    def test_five_contextual_comment_examples(self):
        examples = [
            ("The roads were really difficult though 😅", "positive", "negative"),
            ("Beautiful place, but the journey was scary", "positive", "negative"),
            ("I could spend the whole day here", "negative", "positive"),
            ("Feels like heaven indeed ❤️", "negative", "positive"),
            ("Absolutely breathtaking! 😍", "negative", "positive"),
        ]
        for text, baseline, expected in examples:
            with self.subTest(text=text):
                self.assertEqual(classify_comment_sentiment(text, baseline), expected)

    def test_comment_reanalysis_is_versioned_scoped_and_does_not_duplicate_rows(self):
        original_db = social_service.DB_PATH
        with tempfile.TemporaryDirectory() as directory:
            social_service.DB_PATH = str(Path(directory) / "social.db")
            social_service.init_db()
            social_service.upsert_post({"id": "target", "platform": "facebook", "text": "Parent post"})
            social_service.upsert_post({"id": "other", "platform": "facebook", "text": "Other post"})
            old_text = "I could spend the whole day here"
            digest = facebook.hashlib.sha256(old_text.encode("utf-8")).hexdigest()
            social_service.upsert_comment({"id": "target-comment", "post_id": "target", "platform": "facebook",
                                           "text": old_text, "sentiment": "negative", "text_hash": digest,
                                           "analysis_version": "old-model-version"})
            social_service.upsert_comment({"id": "other-comment", "post_id": "other", "platform": "facebook",
                                           "text": "Beautiful place", "sentiment": "positive", "text_hash": "old",
                                           "analysis_version": "old-model-version"})
            with patch.object(facebook, "_sync_facebook_comments", return_value={"synced": False, "cached": True}), \
                    patch.object(facebook, "get_best_model_dataset_id", return_value="local-model"), \
                    patch.object(facebook.model_service, "predict_texts", return_value={"predictions": [
                        {"predicted_sentiment": "negative", "confidence": 0.65}
                    ]}) as predictor, \
                    patch.object(facebook.hdfs_storage, "check_status", return_value={"configured": False, "available": False}):
                response = facebook.analyze_facebook_post_comments("target")
                repeated = facebook.analyze_facebook_post_comments("target")

            target = {row["id"]: row for row in social_service.get_social_comments("target", limit=20)}
            other = social_service.get_social_comments("other", limit=20)[0]
            self.assertEqual(response["summary"]["positive_count"], 1)
            self.assertEqual(response["analyzed_comments"][0]["sentiment"], "positive")
            self.assertEqual(repeated["analyzed_comments"][0]["sentiment"], "positive")
            self.assertEqual(predictor.call_count, 1, "current analysis version should be reused on the next request")
            self.assertEqual(len(target), 1, "reanalysis must update by comment id rather than insert duplicates")
            self.assertEqual(target["target-comment"]["analysis_version"], facebook.COMMENT_ANALYSIS_VERSION)
            self.assertEqual(other["analysis_version"], "old-model-version", "comments outside the requested post stay untouched")

        social_service.DB_PATH = original_db

    def test_comment_analysis_persists_individual_sentiment_and_reuses_model(self):
        original_db = social_service.DB_PATH
        with tempfile.TemporaryDirectory() as directory:
            social_service.DB_PATH = str(Path(directory) / "social.db")
            social_service.init_db()
            social_service.upsert_post({"id": "post-1", "platform": "facebook", "text": "Parent is positive"})
            for cid, body in (("a", "I love this"), ("b", "I hate this"), ("c", ""), ("d", "🔥")):
                social_service.upsert_comment({"id": cid, "post_id": "post-1", "platform": "facebook", "text": body})

            predictions = {"I love this": "positive", "I hate this": "negative"}
            with patch.object(facebook, "_sync_facebook_comments", return_value={"synced": False, "cached": True}), \
                    patch.object(facebook, "get_best_model_dataset_id", return_value="local-model"), \
                    patch.object(facebook.model_service, "predict_texts", side_effect=lambda _model, texts: {
                        "predictions": [{"predicted_sentiment": predictions[text], "confidence": 0.9} for text in texts]
                    }) as predictor, \
                    patch.object(facebook.hdfs_storage, "check_status", return_value={"configured": False, "available": False}):
                result = facebook.analyze_facebook_post_comments("post-1")
                repeated = facebook.analyze_facebook_post_comments("post-1")

            self.assertEqual(result["summary"]["comments_analyzed"], 3)
            self.assertEqual(result["summary"]["positive_count"], 2)
            self.assertEqual(result["summary"]["negative_count"], 1)
            self.assertEqual(result["summary"]["positive_percentage"], 66.67)
            by_id = {row["id"]: row for row in result["analyzed_comments"]}
            self.assertEqual(by_id["d"]["sentiment"], "positive")
            self.assertEqual(by_id["c"]["sentiment"], "unknown")
            self.assertEqual(result["summary"]["overall_sentiment"], "positive")
            self.assertEqual(repeated["summary"], result["summary"])
            self.assertEqual(predictor.call_count, 1, "unchanged comment text should reuse its saved model prediction")

        social_service.DB_PATH = original_db


class FacebookTokenPersistenceTests(unittest.TestCase):
    def setUp(self):
        self.original_db = social_service.DB_PATH
        self.original_key = settings.FACEBOOK_TOKEN_ENCRYPTION_KEY
        self.temp = tempfile.TemporaryDirectory()
        social_service.DB_PATH = str(Path(self.temp.name) / "tokens.db")
        from cryptography.fernet import Fernet
        settings.FACEBOOK_TOKEN_ENCRYPTION_KEY = Fernet.generate_key().decode("ascii")

    def tearDown(self):
        social_service.DB_PATH = self.original_db
        settings.FACEBOOK_TOKEN_ENCRYPTION_KEY = self.original_key
        self.temp.cleanup()

    def test_user_token_is_encrypted_and_survives_service_reload(self):
        token = "example-valid-looking-token"
        facebook_token_service.store_user_token(token)
        self.assertEqual(facebook_token_service.get_user_token(), token)
        with social_service.get_db() as conn:
            ciphertext = conn.execute("SELECT encrypted_user_token FROM facebook_token_store WHERE id=1").fetchone()[0]
        self.assertNotIn(token, ciphertext)
        self.assertEqual(facebook_token_service.stored_token_updated_at() is not None, True)

    def test_settings_update_persists_token_and_invalidates_page_token_cache(self):
        from api.settings_api import UpdateCredentialsRequest
        facebook.ACTIVE_PAGE_STATE["page_tokens"] = {"old-page": "expired-derived-token"}
        response = settings_api.update_credentials(UpdateCredentialsRequest(meta_access_token="replacement-token"))
        self.assertEqual(response["facebook_token_source"], "encrypted_sqlite")
        self.assertEqual(facebook_token_service.get_user_token(), "replacement-token")
        self.assertEqual(facebook.ACTIVE_PAGE_STATE["page_tokens"], {})

    def test_page_token_is_refreshed_from_current_user_token(self):
        facebook.clear_page_token_cache()
        with patch.object(facebook, "_get_user_token", return_value="fresh-user-token"), \
                patch.object(facebook, "_discover_managed_pages", side_effect=lambda _token: facebook.ACTIVE_PAGE_STATE["page_tokens"].update({"123": "fresh-page-token"})):
            self.assertEqual(facebook._get_active_token("123"), "fresh-page-token")


if __name__ == "__main__":
    unittest.main()

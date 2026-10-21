"""Mocked regression coverage for Instagram Graph normalization and isolation."""
import json
import os
import tempfile
import unittest
from unittest.mock import patch

from fastapi import HTTPException

from api import instagram
from services import social_service
from api.facebook import get_best_model_dataset_id
from services import model_service


class InstagramGraphTests(unittest.TestCase):
    def tearDown(self):
        instagram.ACTIVE_INSTAGRAM_STATE.update(account_id=None, account_name=None, page_id=None)

    def test_media_normalization_keeps_missing_values_unavailable(self):
        normalized = instagram._normalize_media(
            {"id": "ig-media-1", "caption": "A real caption", "timestamp": "2026-10-01T12:00:00+0000", "like_count": 0, "media_url": "https://instagram.test/media.jpg", "thumbnail_url": "https://instagram.test/thumb.jpg"},
            {"id": "ig-account-1", "username": "projecti"},
            {"id": "page-1", "name": "Page"},
        )
        self.assertEqual(normalized["platform"], "instagram")
        self.assertEqual(normalized["account_id"], "ig-account-1")
        self.assertEqual(normalized["likes_count"], 0)
        self.assertEqual(normalized["media_url"], "https://instagram.test/media.jpg")
        self.assertEqual(normalized["platform_metrics"]["thumbnail_url"], "https://instagram.test/thumb.jpg")
        self.assertIsNone(normalized["comments_count"])
        self.assertIsNone(normalized["shares_count"])

    def test_media_pagination_returns_meta_cursor_and_validates_next_page_host(self):
        first = {"data": [{"id": "m1"}], "paging": {"next": "https://graph.facebook.com/v21.0/ig/media?after=opaque", "cursors": {"after": "opaque"}}}
        second = {"data": [{"id": "m2"}], "paging": {"cursors": {"after": "last"}}}

        class FakeResponse:
            def __enter__(self):
                return self
            def __exit__(self, *_args):
                return False
            def read(self):
                return json.dumps(second).encode()

        with patch.object(instagram, "_graph", return_value=first), patch.object(instagram.urllib.request, "urlopen", return_value=FakeResponse()):
            rows, has_more, cursor = instagram._paginate("ig/media", "secret-token", {"fields": "id"})
        self.assertEqual([row["id"] for row in rows], ["m1", "m2"])
        self.assertFalse(has_more)
        self.assertEqual(cursor, "last")

    def test_linked_page_uses_supported_instagram_account_fields(self):
        responses = [
            {"data": [{"id": "page-1", "name": "Page", "access_token": "page-secret"}]},
            {"id": "page-1", "name": "Page", "instagram_business_account": {"id": "ig-1", "username": "projecti"}},
        ]
        with patch.object(instagram, "_graph", side_effect=responses) as graph:
            pages = instagram._managed_pages("user-secret")
        self.assertEqual(pages[0]["instagram_business_account"], {"id": "ig-1", "username": "projecti"})
        self.assertEqual(graph.call_args_list[0].args, ("me/accounts", "user-secret", {"fields": "id,name,access_token", "limit": 100}))
        self.assertEqual(graph.call_args_list[1].args, ("page-1", "user-secret", {"fields": "id,name,instagram_business_account{id,username}"}))

    def test_media_retrieval_uses_supported_fields_and_ten_item_page(self):
        resolved = {"account": {"id": "ig-1", "username": "projecti"}, "page": {"id": "page-1", "name": "Page"}, "token": "page-secret"}
        with patch.object(instagram, "_resolve_account", return_value=resolved), patch.object(instagram, "_paginate", return_value=([{"id": "media-1", "caption": "Hello", "media_type": "IMAGE", "permalink": "https://instagram.test/p/1", "timestamp": "2026-10-21T10:00:00+0000"}], False, None)) as paginate:
            result = instagram.get_instagram_media(limit=10, after=None)
        self.assertEqual(paginate.call_args.args, ("ig-1/media", "page-secret", {"fields": instagram.MEDIA_FIELDS, "limit": 10}))
        self.assertIn("like_count", paginate.call_args.args[2]["fields"])
        self.assertIn("comments_count", paginate.call_args.args[2]["fields"])
        self.assertNotIn("name", paginate.call_args.args[2]["fields"])
        self.assertEqual(result["data"][0]["id"], "media-1")

    def test_instagram_comment_fields_do_not_request_facebook_author_name(self):
        resolved = {"account": {"id": "ig-1"}, "page": {"id": "page-1"}, "token": "page-secret"}
        with patch.object(instagram, "_resolve_account", return_value=resolved), \
             patch.object(instagram.social_service, "get_social_posts", return_value=[{"id": "media-1"}]), \
             patch.object(instagram, "_paginate", return_value=([{"id": "comment-1", "username": "person", "text": "Real comment", "timestamp": "2026-10-21T10:00:00+0000"}], False, None)) as paginate:
            result = instagram.get_instagram_comments("media-1")
        requested_fields = paginate.call_args.args[2]["fields"]
        self.assertEqual(requested_fields, "id,text,timestamp,username,like_count")
        self.assertNotIn(",name", requested_fields)
        self.assertNotIn("from{", requested_fields)
        self.assertEqual(result["data"][0]["author"], "person")

    def test_meta_lookup_failure_is_not_reported_as_unconnected(self):
        with patch.object(instagram, "_resolve_account", side_effect=HTTPException(status_code=400, detail={"message": "Invalid field", "meta_code": 100})):
            status = instagram.get_instagram_status()
        self.assertIsNone(status["connected"])
        self.assertEqual(status["status"], "error")
        self.assertEqual(status["http_status"], 400)

    def test_account_resolution_requires_configured_link_and_does_not_expose_token(self):
        page = {"id": "page-1", "name": "Test Page", "access_token": "page-secret", "instagram_business_account": {"id": "ig-1", "username": "projecti"}}
        with patch.object(instagram, "_get_user_token", return_value="user-secret"), patch.object(instagram, "_managed_pages", return_value=[page]), patch.object(instagram, "_permission_report", return_value={"available": True, "granted": ["instagram_basic"]}), patch.object(instagram.settings, "INSTAGRAM_PAGE_ID", "page-1"), patch.object(instagram.settings, "INSTAGRAM_ACCOUNT_ID", "ig-1"):
            resolved = instagram._resolve_account()
            status = instagram.get_instagram_status()
        self.assertEqual(resolved["account"]["id"], "ig-1")
        self.assertEqual(resolved["token"], "page-secret")
        self.assertTrue(status["connected"])
        self.assertEqual(status["permissions"]["granted"], ["instagram_basic"])
        serialized_status = json.dumps(status)
        self.assertNotIn("page-secret", serialized_status)
        self.assertNotIn("user-secret", serialized_status)

    def test_permission_report_lists_only_granted_scopes_and_operation_requirements(self):
        response = {"data": [{"permission": "pages_show_list", "status": "granted"}, {"permission": "instagram_basic", "status": "granted"}, {"permission": "instagram_manage_comments", "status": "declined"}]}
        with patch.object(instagram, "_graph", return_value=response):
            report = instagram._permission_report("user-secret")
        self.assertEqual(report["granted"], ["instagram_basic", "pages_show_list"])
        self.assertEqual(report["declined"], ["instagram_manage_comments"])
        self.assertIn("insights", report["requirements"])
        self.assertIn("instagram_manage_insights", report["requirements"]["insights"])

    def test_media_insights_keep_partial_values_and_classify_meta_errors_independently(self):
        resolved = {"account": {"id": "ig-1"}, "token": "server-token"}
        post = {"id": "media-1", "media_type": "IMAGE", "platform_metrics": {}}
        responses = [
            {"data": [{"name": "reach", "values": [{"value": 12}]}]},
            HTTPException(status_code=403, detail={"message": "Permission denied", "meta_code": 10}),
            HTTPException(status_code=400, detail={"message": "Unsupported metric", "meta_code": 100}),
            {"data": [{"name": "total_interactions", "values": [{"value": 0}]}]},
        ]
        with patch.object(instagram, "_resolve_account", return_value=resolved), \
             patch.object(instagram.social_service, "get_social_posts", return_value=[post]), \
             patch.object(instagram, "_graph", side_effect=responses) as graph, \
             patch.object(instagram.social_service, "upsert_post"):
            result = instagram.get_instagram_media_insights("media-1")
        self.assertEqual(result["data"]["reach"]["values"][0]["value"], 12)
        self.assertEqual(result["data"]["total_interactions"]["values"][0]["value"], 0)
        self.assertEqual(result["statuses"]["saved"], "permission_required")
        self.assertEqual(result["statuses"]["shares"], "not_supported")
        self.assertEqual(graph.call_count, 4)

    def test_wrong_configured_account_is_rejected(self):
        page = {"id": "page-1", "name": "Test Page", "access_token": "page-secret", "instagram_business_account": {"id": "ig-1", "username": "projecti"}}
        with patch.object(instagram, "_get_user_token", return_value="user-secret"), patch.object(instagram, "_managed_pages", return_value=[page]), patch.object(instagram.settings, "INSTAGRAM_PAGE_ID", "page-1"), patch.object(instagram.settings, "INSTAGRAM_ACCOUNT_ID", "ig-other"):
            with self.assertRaises(HTTPException) as raised:
                instagram._resolve_account()
        self.assertEqual(raised.exception.status_code, 404)

    def test_caption_analysis_returns_classified_rows_and_preserves_captionless_media(self):
        posts = [
            {"id": "media-positive", "text": "A wonderful celebration", "sentiment": "unknown"},
            {"id": "media-no-caption", "text": "", "sentiment": "unknown"},
            {"id": "media-negative", "text": "A terrible day", "sentiment": "unknown"},
        ]
        predictions = {"predictions": [
            {"predicted_sentiment": "Positive", "confidence": 0.8},
            {"predicted_sentiment": "negative", "confidence": 0.7},
        ]}
        with patch.object(instagram, "_resolve_account", return_value={"account": {"id": "ig-1"}}), \
             patch.object(instagram.social_service, "get_social_posts", return_value=posts), \
             patch.object(instagram, "get_best_model_dataset_id", return_value="trained"), \
             patch.object(instagram.model_service, "predict_texts", return_value=predictions) as predict, \
             patch.object(instagram.social_service, "upsert_post") as upsert:
            result = instagram.analyze_instagram_media()

        self.assertEqual(predict.call_args.args[1], ["A wonderful celebration", "A terrible day"])
        self.assertEqual(result["summary"]["posts_analyzed"], 2)
        self.assertEqual(result["summary"]["sentiment_counts"], {"positive": 1, "negative": 1, "neutral": 0})
        self.assertEqual(len(result["media"]), 3)
        self.assertEqual(result["analyzed_posts"][0]["media_id"], "media-positive")
        self.assertEqual(result["analyzed_posts"][0]["caption"], "A wonderful celebration")
        self.assertEqual(result["media"][1]["caption"], "")
        self.assertEqual(upsert.call_count, 2)

    def test_caption_analysis_rejects_missing_predictions_instead_of_counting_attempts(self):
        posts = [{"id": "media-1", "text": "A real caption"}]
        with patch.object(instagram, "_resolve_account", return_value={"account": {"id": "ig-1"}}), \
             patch.object(instagram.social_service, "get_social_posts", return_value=posts), \
             patch.object(instagram, "get_best_model_dataset_id", return_value="trained"), \
             patch.object(instagram.model_service, "predict_texts", return_value={"predictions": []}):
            with self.assertRaises(HTTPException) as raised:
                instagram.analyze_instagram_media()
        self.assertEqual(raised.exception.status_code, 500)
        self.assertIn("incomplete result", raised.exception.detail)

    def test_caption_analysis_rejects_text_removed_by_model_preprocessing(self):
        posts = [{"id": "media-emoji", "text": "😊🎉"}]
        with patch.object(instagram, "_resolve_account", return_value={"account": {"id": "ig-1"}}), \
             patch.object(instagram.social_service, "get_social_posts", return_value=posts):
            with self.assertRaises(HTTPException) as raised:
                instagram.analyze_instagram_media()
        self.assertEqual(raised.exception.status_code, 400)
        self.assertIn("after preprocessing", raised.exception.detail)

    def test_model_labels_map_case_and_supported_numeric_training_labels(self):
        self.assertEqual(instagram.normalize_instagram_sentiment("Positive"), "positive")
        self.assertEqual(instagram.normalize_instagram_sentiment("Negative"), "negative")
        self.assertEqual(instagram.normalize_instagram_sentiment("neutral"), "neutral")
        self.assertEqual(instagram.normalize_instagram_sentiment(4), "positive")
        self.assertEqual(instagram.normalize_instagram_sentiment(0), "negative")
        self.assertEqual(instagram.normalize_instagram_sentiment(2), "neutral")
        self.assertIsNone(instagram.normalize_instagram_sentiment("surprise"))


class ExistingInstagramModelTests(unittest.TestCase):
    def test_existing_fitted_model_predicts_without_refitting_vectorizer(self):
        dataset_id = get_best_model_dataset_id()
        self.assertIsNotNone(dataset_id, "No registered trained sentiment model is available")
        result = model_service.predict_texts(dataset_id, [
            "Bengaluru is also celebrating Dasara same as mysore",
            "I absolutely love this wonderful and amazing experience",
            "This is terrible, awful and disappointing",
            "The item arrived yesterday and I opened the box",
        ])
        predictions = result["predictions"]
        self.assertEqual(len(predictions), 4)
        self.assertEqual(predictions[0]["predicted_sentiment"], "positive")
        self.assertEqual(predictions[1]["predicted_sentiment"], "positive")
        self.assertEqual(predictions[2]["predicted_sentiment"], "negative")
        # This repository's selected fitted classifier has only positive and
        # negative classes; neutral input must return one of those real classes.
        self.assertIn(predictions[3]["predicted_sentiment"], {"positive", "negative"})
        self.assertTrue(all(0 <= item["confidence"] <= 1 for item in predictions))


class InstagramStorageIsolationTests(unittest.TestCase):
    def test_instagram_records_and_sentiment_stay_separate_from_facebook(self):
        with tempfile.TemporaryDirectory() as directory, patch.object(social_service, "DB_PATH", os.path.join(directory, "social.sqlite")):
            social_service.init_db()
            for platform, account, post_id, label in (
                ("facebook", "page-1", "fb-1", "positive"),
                ("instagram", "ig-1", "ig-media-1", "negative"),
            ):
                social_service.upsert_post({"id": post_id, "platform": platform, "account_id": account, "account_name": account, "text": label, "sentiment": label, "created_time": "2026-10-01T12:00:00Z", "likes_count": 0, "comments_count": None, "shares_count": None, "platform_metrics": {"reach": 2}})
            instagram_posts = social_service.get_social_posts(platform="instagram", account_id="ig-1")
            facebook_posts = social_service.get_social_posts(platform="facebook", account_id="page-1")
            summary = social_service.get_social_dashboard_analytics("instagram", "ig-1")
        self.assertEqual([post["id"] for post in instagram_posts], ["ig-media-1"])
        self.assertEqual(instagram_posts[0]["platform_metrics"], {"reach": 2})
        self.assertIsNone(instagram_posts[0]["sentiment_confidence"])
        self.assertEqual([post["id"] for post in facebook_posts], ["fb-1"])
        self.assertEqual(summary["sentiment"]["counts"]["negative"], 1)
        self.assertEqual(summary["sentiment"]["counts"]["positive"], 0)


if __name__ == "__main__":
    unittest.main()

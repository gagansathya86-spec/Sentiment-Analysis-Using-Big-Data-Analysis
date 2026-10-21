"""Pure, in-memory regression fixtures for the Facebook analytics features."""
import unittest
from datetime import datetime, timedelta, timezone
import os
import tempfile

from analytics.aspect_analysis import analyze_text_aspects, get_aspect_analytics_summary
from analytics.crisis_alerts import detect_negative_spike, _group_page_records
from analytics.trend_discovery import compare_sentiment_periods, get_trend_discovery, _clean_tokens
from analytics.viral_potential import evaluate_post_viral_potential
from analytics.engagement_analytics import compute_engagement_score, compute_observed_engagement_subtotal, get_engagement_overview, get_best_posting_times
from services.social_service import _optional_count
from utils.time_utils import parse_utc_datetime
from services import social_service
from unittest.mock import patch
from api import engagement as engagement_api


class AspectAnalysisTests(unittest.TestCase):
    def test_separate_opinions_and_mixed_aspect(self):
        result = analyze_text_aspects("The camera is excellent, but the battery is terrible.")
        product = result["product_quality"]
        self.assertEqual(product["sentiment"], "mixed")
        self.assertEqual([mention["sentiment"] for mention in product["mentions"]], ["positive", "negative"])
        self.assertIn("camera", product["keywords"])
        self.assertIn("battery", product["keywords"])

    def test_negation_and_parent_sentiment_is_not_inherited(self):
        negated = analyze_text_aspects("Delivery was not late.", parent_sentiment="negative")
        self.assertEqual(negated["delivery"]["sentiment"], "positive")
        no_opinion = analyze_text_aspects("Delivery arrived today.", parent_sentiment="negative")
        self.assertEqual(no_opinion["delivery"]["sentiment"], "neutral")

    def test_empty_evidence_stays_empty_and_location_uses_textual_evidence(self):
        self.assertNotIn("location", analyze_text_aspects("Everything is excellent."))
        self.assertIn("location", analyze_text_aspects("The mountain journey was scary."))

    def test_aspect_query_scopes_comments_to_selected_page_posts(self):
        posts = [{"id": "p1", "account_id": "page-a", "text": "The road was beautiful", "sentiment": "positive", "created_time": "2026-01-01T00:00:00Z", "platform": "facebook"}]
        comments = [{"id": "c1", "post_id": "p1", "text": "The journey was scary", "sentiment": "negative", "created_time": "2026-01-01T00:00:00Z", "platform": "facebook"}, {"id": "c2", "post_id": "p2", "text": "Great road", "sentiment": "positive", "platform": "facebook"}]
        with patch.object(social_service, "get_social_posts", return_value=posts), patch.object(social_service, "get_social_comments", return_value=comments):
            data = get_aspect_analytics_summary(account_id="page-a")
        location = next(row for row in data["aspects"] if row["name"] == "Location")
        self.assertEqual(location["total_mentions"], 2)
        self.assertEqual(location["positive_count"], 1)
        self.assertEqual(location["negative_count"], 1)
        self.assertEqual(location["sentiment_score"], 0.0)
        self.assertEqual({row["record_id"] for row in location["negative_evidence"]}, {"c1"})


class DataQualityTests(unittest.TestCase):
    def test_graph_timestamp_offsets_parse_as_utc(self):
        parsed = parse_utc_datetime("2026-10-19T17:46:04+0000")
        self.assertEqual(parsed.isoformat(), "2026-10-19T17:46:04+00:00")
        self.assertIsNone(parse_utc_datetime("not a timestamp"))

    def test_engagement_formula_and_missing_metric_availability(self):
        self.assertEqual(compute_engagement_score(5, 32, 0), 69)
        self.assertIsNone(compute_engagement_score(5, 32, None))
        self.assertEqual(compute_observed_engagement_subtotal(5, 32, None), 69)
        posts = [{"id": "1", "platform": "facebook", "author": "Page", "text": "a", "likes_count": 5, "comments_count": 32, "shares_count": None, "sentiment": "positive", "created_time": "2026-10-19T17:46:04+0000"}, {"id": "2", "platform": "facebook", "author": "Page", "text": "b", "likes_count": 0, "comments_count": 0, "shares_count": 0, "sentiment": "neutral", "created_time": "2026-10-19T17:46:04+0000"}]
        with patch.object(social_service, "get_social_posts", return_value=posts):
            overview = get_engagement_overview("facebook")
            best_times = get_best_posting_times("facebook")
        self.assertIsNone(overview["total_engagement_score"])
        self.assertEqual(overview["observed_engagement_subtotal"], 69)
        self.assertEqual(overview["shares_unavailable_posts"], 1)
        self.assertEqual(best_times["valid_timestamp_posts"], 2)
        self.assertEqual(best_times["recommended_peak_hours"], ["17:00"])

    def test_best_time_recommendations_are_page_scoped_comparable_and_tentative(self):
        posts = [
            {"id": f"wed-{i}", "account_id": "page-a", "created_time": f"2026-10-21T09:{i * 10:02d}:00Z", "likes_count": likes, "comments_count": comments, "shares_count": None}
            for i, (likes, comments) in enumerate(((10, 0), (20, 2), (30, 3)))
        ]
        posts += [
            {"id": f"thu-{i}", "account_id": "page-a", "created_time": f"2026-10-22T15:{i * 10:02d}:00Z", "likes_count": 20, "comments_count": 0, "shares_count": None}
            for i in range(2)
        ]
        posts.append({"id": "invalid", "created_time": "not-a-date", "likes_count": 999, "comments_count": 0, "shares_count": None})
        with patch.object(social_service, "get_social_posts", return_value=posts) as get_posts:
            result = get_best_posting_times("facebook", account_id="page-a")
        get_posts.assert_called_once_with(platform="facebook", account_id="page-a", limit=5000)
        self.assertEqual(result["timezone"], "UTC")
        self.assertEqual(result["timestamped_posts"], 5)
        self.assertEqual(result["scored_posts"], 5)
        self.assertEqual(result["score_basis"]["metrics"], ["likes", "comments"])
        self.assertTrue(result["available"])
        self.assertTrue(result["tentative"])
        self.assertEqual(result["best_days"][0]["day"], "Wednesday")
        self.assertEqual(result["recommendations"][0]["day"], "Wednesday")

    def test_best_time_keeps_zero_and_missing_metrics_distinct_and_requires_samples(self):
        posts = [
            {"created_time": f"2026-10-21T09:{i * 10:02d}:00Z", "likes_count": 0, "comments_count": None, "shares_count": None}
            for i in range(2)
        ]
        with patch.object(social_service, "get_social_posts", return_value=posts):
            result = get_best_posting_times("facebook")
        self.assertEqual(result["scored_posts"], 2)
        self.assertEqual(result["score_basis"]["metrics"], ["likes"])
        self.assertEqual(result["best_hours"][0]["avg_engagement"], 0)
        self.assertFalse(result["available"])
        self.assertEqual(result["recommendations"], [])

    def test_best_time_ignores_invalid_metric_values(self):
        posts = [
            {"created_time": f"2026-10-21T09:{index * 10:02d}:00Z", "likes_count": value, "comments_count": None, "shares_count": None}
            for index, value in enumerate((float("nan"), -1, "not-a-count"))
        ]
        with patch.object(social_service, "get_social_posts", return_value=posts):
            result = get_best_posting_times("facebook")
        self.assertEqual(result["score_basis"]["metrics"], [])
        self.assertEqual(result["scored_posts"], 0)
        self.assertFalse(result["available"])

    def test_best_time_api_uses_selected_page_and_keeps_auth_registered(self):
        with patch.object(engagement_api, "ACTIVE_PAGE_STATE", {"selected_page_id": "page-a"}), patch.object(
            engagement_api.engagement_analytics, "get_best_posting_times", return_value={"available": True}
        ) as service_call:
            result = engagement_api.get_best_posting_times(platform="facebook")
        self.assertEqual(result, {"available": True})
        service_call.assert_called_once_with(platform="facebook", account_id="page-a")

    def test_engagement_overview_uses_selected_page(self):
        with patch.object(engagement_api, "ACTIVE_PAGE_STATE", {"selected_page_id": "page-a"}), patch.object(
            engagement_api.engagement_analytics, "get_engagement_overview", return_value={"account_id": "page-a"}
        ) as service_call:
            result = engagement_api.get_engagement_overview(platform="facebook")
        self.assertEqual(result["account_id"], "page-a")
        service_call.assert_called_once_with(platform="facebook", account_id="page-a")

    def test_engagement_overview_groups_valid_timestamps_and_compares_labeled_types(self):
        posts = []
        for media_type, likes in (("PHOTO", 1), ("PHOTO", 2), ("PHOTO", 3), ("VIDEO", 10), ("VIDEO", 11), ("VIDEO", 12)):
            posts.append({"id": f"{media_type}-{likes}", "platform": "facebook", "author": "Page", "text": "post", "likes_count": likes, "comments_count": 0, "shares_count": 0, "sentiment": "neutral", "created_time": "2026-10-21T00:30:00+02:00", "media_type": media_type})
        posts.append({"id": "invalid-date", "platform": "facebook", "author": "Page", "text": "post", "likes_count": 99, "comments_count": 0, "shares_count": 0, "sentiment": "neutral", "created_time": "bad timestamp", "media_type": "PHOTO"})
        with patch.object(social_service, "get_social_posts", return_value=posts):
            overview = get_engagement_overview("facebook", account_id="page-a")
        self.assertEqual(overview["engagement_by_date"], [{"date": "2026-10-20", "posts": 6, "average_engagement": 6.5}])
        comparison = overview["content_type_comparison"]
        self.assertTrue(comparison["available"])
        self.assertEqual({row["type"]: row["comparable_posts"] for row in comparison["types"]}, {"PHOTO": 4, "VIDEO": 3})

    def test_best_time_recommendations_read_scoped_sqlite_facebook_records(self):
        with tempfile.TemporaryDirectory() as temp_dir, patch.object(
            social_service, "DB_PATH", os.path.join(temp_dir, "posting-times.sqlite")
        ):
            social_service.init_db()
            for index, likes in enumerate((1, 2, 3)):
                social_service.upsert_post({
                    "id": f"page-a-{index}", "platform": "facebook", "account_id": "page-a",
                    "created_time": f"2026-10-21T09:{index * 10:02d}:00Z", "likes_count": likes,
                    "comments_count": 0, "shares_count": None,
                })
            social_service.upsert_post({
                "id": "page-b", "platform": "facebook", "account_id": "page-b",
                "created_time": "2026-10-21T09:30:00Z", "likes_count": 999,
                "comments_count": 0, "shares_count": None,
            })
            result = get_best_posting_times("facebook", account_id="page-a")
        self.assertTrue(result["available"])
        self.assertEqual(result["account_id"], "page-a")
        self.assertEqual(result["timestamped_posts"], 3)
        self.assertEqual(result["recommendations"][0]["scored_posts"], 3)
        self.assertEqual(result["recommendations"][0]["avg_engagement"], 2.0)

    def test_best_time_recommendations_read_scoped_sqlite_facebook_records(self):
        with tempfile.TemporaryDirectory() as temp_dir, patch.object(
            social_service, "DB_PATH", os.path.join(temp_dir, "posting-times.sqlite")
        ):
            social_service.init_db()
            for index, likes in enumerate((1, 2, 3)):
                social_service.upsert_post({
                    "id": f"page-a-{index}", "platform": "facebook", "account_id": "page-a",
                    "created_time": f"2026-10-21T09:{index * 10:02d}:00Z", "likes_count": likes,
                    "comments_count": 0, "shares_count": None,
                })
            social_service.upsert_post({
                "id": "page-b", "platform": "facebook", "account_id": "page-b",
                "created_time": "2026-10-21T09:30:00Z", "likes_count": 999,
                "comments_count": 0, "shares_count": None,
            })
            result = get_best_posting_times("facebook", account_id="page-a")
        self.assertTrue(result["available"])
        self.assertEqual(result["account_id"], "page-a")
        self.assertEqual(result["timestamped_posts"], 3)
        self.assertEqual(result["recommendations"][0]["scored_posts"], 3)
        self.assertEqual(result["recommendations"][0]["avg_engagement"], 2.0)

    def test_facebook_dashboard_uses_selected_page_and_preserves_missing_vs_zero(self):
        with tempfile.TemporaryDirectory() as temp_dir, patch.object(
            social_service, "DB_PATH", os.path.join(temp_dir, "dashboard.sqlite")
        ):
            social_service.init_db()
            social_service.upsert_post({
                "id": "selected-positive", "platform": "facebook", "account_id": "page-a",
                "created_time": "2026-10-21T06:15:00Z", "sentiment": "positive",
                "likes_count": 0, "comments_count": 0, "shares_count": None,
            })
            social_service.upsert_post({
                "id": "selected-negative", "platform": "facebook", "account_id": "page-a",
                "created_time": "invalid timestamp", "sentiment": "negative",
                "likes_count": None, "comments_count": 2, "shares_count": None,
            })
            social_service.upsert_post({
                "id": "other-page", "platform": "facebook", "account_id": "page-b",
                "created_time": "2026-10-21T18:00:00Z", "sentiment": "neutral",
                "likes_count": 50, "comments_count": 50, "shares_count": 50,
            })
            social_service.upsert_comment({
                "id": "selected-comment", "post_id": "selected-positive", "platform": "facebook",
                "created_time": "2026-10-21T19:15:00Z", "sentiment": "unknown",
            })

            result = social_service.get_facebook_dashboard_analytics("page-a")

        self.assertEqual(result["sentiment"]["counts"], {"positive": 1, "negative": 1, "neutral": 0})
        self.assertEqual(result["sentiment"]["total"], 2)
        self.assertEqual(result["sentiment"]["percentages"], {"positive": 50.0, "negative": 50.0, "neutral": 0.0})
        self.assertEqual(result["trends"]["trend_by_date"]["2026-10-21"]["positive"], 1)
        self.assertEqual(result["trends"]["trend_by_date"]["2026-10-21"]["negative"], 0)
        self.assertEqual(result["behavior"]["timestamped_activity_records"], 2)
        self.assertEqual(result["behavior"]["activity_by_period"]["morning"], 1)
        self.assertEqual(result["behavior"]["activity_by_period"]["evening"], 1)
        self.assertEqual(result["behavior"]["engagement"]["likes"]["total"], 0)
        self.assertTrue(result["behavior"]["engagement"]["likes"]["available"])
        self.assertEqual(result["behavior"]["engagement"]["comments"]["total"], 2)
        self.assertFalse(result["behavior"]["engagement"]["shares"]["available"])
        self.assertIsNone(result["behavior"]["engagement"]["shares"]["total"])


class PeriodAnalyticsTests(unittest.TestCase):
    def setUp(self):
        self.anchor = datetime.now(timezone.utc).replace(microsecond=0)

    def fixture(self, days_ago, sentiment, text):
        return {"created_time": (self.anchor - timedelta(days=days_ago)).isoformat(), "sentiment": sentiment, "text": text, "author": "Fixture"}

    def test_period_comparison_and_negative_spike_use_fixtures_only(self):
        rows = [self.fixture(13, "positive", "steady service") for _ in range(3)]
        rows += [self.fixture(1, "negative", "delivery delay broken") for _ in range(3)]
        comparison = compare_sentiment_periods(rows, 7)
        self.assertTrue(comparison["available"])
        self.assertEqual(comparison["negative_change_percentage_points"], 100.0)
        alert = detect_negative_spike(rows, threshold=50, min_volume=3, period_days=7)
        self.assertIsNotNone(alert)
        self.assertEqual(alert["current_period"]["sample_size"], 3)
        self.assertIn("delivery", {item["keyword"] for item in alert["keywords"]})

    def test_insufficient_data_does_not_trigger_alert(self):
        rows = [self.fixture(1, "negative", "delivery delay") for _ in range(2)]
        self.assertIsNone(detect_negative_spike(rows, threshold=5, min_volume=3, period_days=7))

    def test_alert_evidence_retains_record_page_post_and_comparison_period(self):
        old = [self.fixture(13, "positive", "good service") for _ in range(3)]
        new = [self.fixture(1, "negative", "bad service") for _ in range(3)]
        for index, row in enumerate(old + new):
            row.update({"id": f"c{index}", "record_type": "comment", "post_id": f"p{index}", "account_id": "page-a"})
        alert = detect_negative_spike(old + new, threshold=50, min_volume=3, period_days=7)
        self.assertEqual(alert["evidence"][0]["record_type"], "comment")
        self.assertEqual(alert["evidence"][0]["account_id"], "page-a")
        self.assertTrue(alert["evidence"][0]["record_id"].startswith("c"))
        self.assertEqual(alert["threshold_percentage_points"], 50)
        self.assertEqual(alert["period_days"], 7)

    def test_crisis_records_are_linked_and_grouped_by_page(self):
        posts = [{"id": "p-a", "account_id": "page-a"}, {"id": "p-b", "account_id": "page-b"}]
        comments = [{"id": "c-a", "post_id": "p-a"}, {"id": "c-orphan", "post_id": "missing"}]
        grouped = _group_page_records(posts, comments)
        self.assertEqual({row["id"] for row in grouped["page-a"]}, {"p-a", "c-a"})
        self.assertEqual({row["id"] for row in grouped["page-b"]}, {"p-b"})
        self.assertEqual(grouped["page-a"][1]["record_type"], "comment")


class ViralScoringTests(unittest.TestCase):
    def test_ingestion_preserves_missing_and_observed_zero_separately(self):
        self.assertIsNone(_optional_count({}, "likes_count", "likes"))
        self.assertIsNone(_optional_count({"likes_count": None}, "likes_count", "likes"))
        self.assertEqual(_optional_count({"likes_count": 0}, "likes_count", "likes"), 0)

    def test_missing_metrics_are_not_reported_as_zero_observations(self):
        result = evaluate_post_viral_potential({"id": "fixture", "text": "A Facebook post", "sentiment": "neutral"}, recommendation_history=[])
        self.assertIsNone(result["likes"])
        self.assertIsNone(result["comments"])
        self.assertIsNone(result["shares"])
        self.assertFalse(any(result["engagement_metrics_available"].values()))
        self.assertFalse(result["growth_data_available"])
        self.assertEqual(result["score_type"], "heuristic")

    def test_available_engagement_metrics_are_exposed(self):
        result = evaluate_post_viral_potential({"id": "fixture", "text": "Facebook update", "likes_count": 12, "comments_count": 4, "shares_count": 2, "sentiment": "positive", "sentiment_confidence": 0.9}, recommendation_history=[])
        self.assertEqual((result["likes"], result["comments"], result["shares"]), (12, 4, 2))
        self.assertTrue(all(result["engagement_metrics_available"].values()))
        self.assertGreaterEqual(result["viral_score"], 0)
        self.assertLessEqual(result["viral_score"], 100)

    def test_small_volume_input_changes_heuristic_score(self):
        base = {"id": "fixture", "likes_count": 0, "comments_count": 0, "shares_count": None, "sentiment": "neutral", "created_time": "2026-01-01T00:00:00+0000"}
        more = {**base, "likes_count": 4}
        low = evaluate_post_viral_potential(base, recommendation_history=[])
        higher = evaluate_post_viral_potential(more, recommendation_history=[])
        self.assertGreater(higher["viral_score"], low["viral_score"])


class TrendQualityTests(unittest.TestCase):
    def test_stopwords_and_plural_normalization(self):
        self.assertEqual(_clean_tokens("The roads and road were really difficult"), ["road", "road", "difficult"])

    def test_keyword_sentiment_uses_occurrence_clause_and_hashtags_are_literal(self):
        posts = [{"id": "p1", "text": "Beautiful road but scary journey ordinaryword #Travel fb_demo_103", "sentiment": "positive", "created_time": "2026-01-01T00:00:00+0000"}]
        with patch.object(social_service, "get_social_posts", return_value=posts), patch.object(social_service, "get_social_comments", return_value=[]):
            result = get_trend_discovery("facebook")
        terms = {row["keyword"]: row for row in result["top_keywords"]}
        self.assertEqual(terms["beautiful"]["positive"], 1)
        self.assertEqual(terms["scary"]["negative"], 1)
        self.assertNotIn("ordinaryword", result["top_hashtags"])
        self.assertEqual(result["top_hashtags"], [{"hashtag": "#travel", "count": 1}])
        self.assertFalse(result["emerging_topics_available"])


if __name__ == "__main__":
    unittest.main()

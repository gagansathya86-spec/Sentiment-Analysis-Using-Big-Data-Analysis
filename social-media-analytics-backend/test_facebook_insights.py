"""Offline coverage for the Facebook Page post performance endpoint."""
import unittest
from unittest.mock import patch

from fastapi import HTTPException

from api import facebook


POST_ID = "1424956857362457_122098780125467376"


def metric_response(name, value):
    return {"data": [{"name": name, "period": "lifetime", "values": [{"value": value}]}]}


def engagement_response():
    return {
        "from": {"id": "1424956857362457", "name": "Page"},
        "reactions": {"summary": {"total_count": 1}},
        "comments": {"summary": {"total_count": 5}},
        # Missing shares is intentionally not a synthetic zero.
    }


class FacebookPostInsightsTests(unittest.TestCase):
    def call_endpoint(self, fake_graph):
        with patch.object(facebook, "_get_active_token", return_value="test-token"), \
                patch.object(facebook, "_facebook_graph_json", side_effect=fake_graph):
            return facebook.get_facebook_post_insights(POST_ID)

    def test_success_returns_replacement_metrics_and_actual_engagement(self):
        def fake_graph(path, params, _token):
            if path.endswith("/insights"):
                metric = params["metric"]
                values = {"post_media_view": 21, "post_total_media_view_unique": 4}
                return metric_response(metric, values[metric]), None
            return engagement_response(), None

        response = self.call_endpoint(fake_graph)
        self.assertEqual(response["page_id"], "1424956857362457")
        self.assertEqual(response["metrics"]["media_views"]["value"], 21)
        self.assertEqual(response["metrics"]["unique_viewers"]["value"], 4)
        self.assertEqual(response["metrics"]["reactions"]["value"], 1)
        self.assertEqual(response["metrics"]["comments"]["value"], 5)
        self.assertFalse(response["metrics"]["shares"]["available"])
        self.assertIsNone(response["metrics"]["shares"]["value"])

    def test_permission_error_for_one_metric_preserves_other_metrics(self):
        def fake_graph(path, params, _token):
            if path.endswith("/insights") and params["metric"] == "post_total_media_view_unique":
                return None, {"http_status": 400, "code": 200, "subcode": None, "message": "Permissions error"}
            if path.endswith("/insights"):
                return metric_response(params["metric"], 21), None
            return engagement_response(), None

        response = self.call_endpoint(fake_graph)
        self.assertEqual(response["metrics"]["unique_viewers"]["status"], "permission_error")
        self.assertIn("ANALYZE", response["metrics"]["unique_viewers"]["reason"])
        self.assertEqual(response["metrics"]["media_views"]["value"], 21)

    def test_unsupported_metric_is_reported_without_losing_supported_metric(self):
        def fake_graph(path, params, _token):
            if path.endswith("/insights") and params["metric"] == "post_media_view":
                return None, {"http_status": 400, "code": 100, "subcode": None, "message": "The value must be a valid insights metric"}
            if path.endswith("/insights"):
                return metric_response(params["metric"], 4), None
            return engagement_response(), None

        response = self.call_endpoint(fake_graph)
        self.assertEqual(response["metrics"]["media_views"]["status"], "unsupported_metric")
        self.assertEqual(response["metrics"]["unique_viewers"]["value"], 4)

    def test_no_value_is_not_converted_to_zero_but_real_zero_is_preserved(self):
        def fake_graph(path, params, _token):
            if path.endswith("/insights") and params["metric"] == "post_media_view":
                return {"data": []}, None
            if path.endswith("/insights"):
                return metric_response(params["metric"], 0), None
            return engagement_response(), None

        response = self.call_endpoint(fake_graph)
        self.assertEqual(response["metrics"]["media_views"]["status"], "no_data")
        self.assertIsNone(response["metrics"]["media_views"]["value"])
        self.assertTrue(response["metrics"]["unique_viewers"]["available"])
        self.assertEqual(response["metrics"]["unique_viewers"]["value"], 0)

    def test_expired_token_is_actionable_and_marked_invalid(self):
        failure = {"http_status": 400, "code": 190, "subcode": 463, "message": "Session expired"}
        with patch.object(facebook, "_get_active_token", return_value="test-token"), \
                patch.object(facebook, "_facebook_graph_json", return_value=(None, failure)), \
                patch.object(facebook, "_mark_user_token_invalid") as mark_invalid:
            with self.assertRaises(HTTPException) as raised:
                facebook.get_facebook_post_insights(POST_ID)
        self.assertEqual(raised.exception.status_code, 401)
        self.assertIn("Reconnect Facebook", raised.exception.detail)
        mark_invalid.assert_called_once()


if __name__ == "__main__":
    unittest.main()

import sqlite3
import tempfile
import unittest
from contextlib import contextmanager
from datetime import datetime, timedelta, timezone
from unittest.mock import patch

from analytics import crisis_alerts


class CrisisMonitoringTests(unittest.TestCase):
    def setUp(self):
        self.now = datetime.now(timezone.utc).replace(microsecond=0)

    def item(self, days, sentiment, item_id):
        return {"id": item_id, "created_time": (self.now - timedelta(days=days)).isoformat(),
                "sentiment": sentiment, "text": "service delay", "permalink": f"https://example.test/{item_id}"}

    def test_compares_pp_and_requires_three_classified_records_per_window(self):
        rows = [self.item(13, "positive", f"p{i}") for i in range(3)]
        rows += [self.item(1, "negative", f"n{i}") for i in range(3)]
        result = crisis_alerts.compare_negative_windows(rows, threshold=35, as_of=self.now)
        self.assertEqual(result["outcome"], "alert")
        self.assertEqual(result["change_percentage_points"], 100.0)
        self.assertEqual(result["current_period"]["negative_percent"], 100.0)
        short = crisis_alerts.compare_negative_windows(rows[:2] + rows[3:], threshold=1, as_of=self.now)
        self.assertEqual(short["outcome"], "insufficient_data")

    def test_unknown_sentiment_and_invalid_time_do_not_count(self):
        rows = [self.item(13, "positive", f"p{i}") for i in range(3)]
        rows += [self.item(1, "negative", f"n{i}") for i in range(2)]
        rows += [self.item(1, "unknown", "unknown"), {"created_time": "not-a-date", "sentiment": "negative"}]
        result = crisis_alerts.compare_negative_windows(rows, as_of=self.now)
        self.assertEqual(result["outcome"], "insufficient_data")
        self.assertEqual(result["invalid_timestamp_count"], 1)

    def test_no_risk_is_distinct_from_insufficient(self):
        rows = [self.item(13, "positive", f"old{i}") for i in range(3)]
        rows += [self.item(1, "positive", f"new{i}") for i in range(3)]
        self.assertEqual(crisis_alerts.compare_negative_windows(rows, as_of=self.now)["outcome"], "no_risk")

    def test_scan_deduplicates_alerts_and_status_is_platform_scoped(self):
        with tempfile.TemporaryDirectory() as directory:
            db_path = f"{directory}/test.sqlite"
            @contextmanager
            def db():
                conn = sqlite3.connect(db_path)
                conn.row_factory = sqlite3.Row
                try:
                    yield conn
                    conn.commit()
                finally:
                    conn.close()
            with db() as conn:
                conn.executescript("""
                CREATE TABLE crisis_alerts(id TEXT PRIMARY KEY,severity TEXT,platform TEXT,title TEXT,message TEXT,negative_ratio REAL,threshold REAL,affected_volume INTEGER,time_window TEXT,evidence_json TEXT,status TEXT,created_at TEXT,account_id TEXT,source_type TEXT,resolved_at TEXT);
                CREATE TABLE crisis_scans(id TEXT PRIMARY KEY,platform TEXT,account_id TEXT,period_days INTEGER,outcome TEXT,details_json TEXT,created_at TEXT);
                """)
                for platform in ("facebook", "instagram"):
                    conn.execute("INSERT INTO crisis_alerts(id,severity,platform,title,message,status,created_at,account_id,source_type,evidence_json) VALUES(?,?,?,?,?,'active',?,?, 'live','{}')", (f"{platform}-seed", "WARNING", platform, "title", "message", self.now.isoformat(), platform))
            with patch.object(crisis_alerts.social_service, "get_db", db):
                self.assertEqual(len(crisis_alerts.get_crisis_alerts(platform="all")), 2)
                self.assertEqual(len(crisis_alerts.get_crisis_alerts(platform="instagram")), 1)
                self.assertEqual(len(crisis_alerts.get_crisis_alerts(status="active", platform="facebook")), 1)
            old = [dict(self.item(13, "positive", f"o{i}"), account_id="fb1", platform="facebook") for i in range(3)]
            new = [dict(self.item(1, "negative", f"c{i}"), account_id="fb1", platform="facebook") for i in range(3)]
            with patch.object(crisis_alerts.social_service, "get_db", db), \
                 patch.object(crisis_alerts.social_service, "get_social_posts", return_value=old + new), \
                 patch.object(crisis_alerts.social_service, "get_social_comments", return_value=[]):
                first = crisis_alerts.run_crisis_scan(platform="facebook", threshold=35)
                alert_id = next(item["id"] for item in first["alerts"] if item["id"].startswith("alert_facebook_spike_"))
                crisis_alerts.update_alert_status(alert_id, "reviewed", "facebook")
                second = crisis_alerts.run_crisis_scan(platform="facebook", threshold=35)
                generated = [item for item in second["alerts"] if item["id"].startswith("alert_facebook_spike_")]
                self.assertEqual(len(generated), 1)
                self.assertEqual(generated[0]["status"], "reviewed")
                self.assertEqual(second["scans"][0]["platform"], "facebook")


if __name__ == "__main__":
    unittest.main()

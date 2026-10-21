import io
import json
import sqlite3
import threading
import tempfile
import time
import unittest
from contextlib import closing
from unittest.mock import patch
from urllib.error import HTTPError

from services import meta_graph


class FakeResponse(io.BytesIO):
    def __init__(self, payload, headers=None):
        super().__init__(json.dumps(payload).encode())
        self.headers = headers or {}
        self.status = 200

    def getcode(self):
        return self.status

    def __enter__(self):
        return self

    def __exit__(self, *_args):
        self.close()


class MetaGraphRequestTests(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        self.db_path = meta_graph._COOLDOWN_DB
        meta_graph._COOLDOWN_DB = self.temp_dir.name + "/meta-cooldown.sqlite"
        meta_graph.clear_cache()
        with meta_graph._lock:
            meta_graph._cooldowns.clear()
            meta_graph._backoff_counts.clear()
            meta_graph._flights.clear()

    def tearDown(self):
        with meta_graph._lock:
            meta_graph._cooldowns.clear()
            meta_graph._backoff_counts.clear()
            meta_graph._flights.clear()
        meta_graph._COOLDOWN_DB = self.db_path
        self.temp_dir.cleanup()

    def request(self, suffix="/me?access_token=private-token"):
        from urllib.request import Request
        return Request("https://graph.facebook.com/v21.0" + suffix)

    def test_successful_account_response_is_cached_and_logs_usage_without_token(self):
        calls = []

        def urlopen(_request, timeout=None):
            calls.append(timeout)
            return FakeResponse({"id": "u1"}, {"X-App-Usage": '{"call_count":3}'})

        with patch.object(meta_graph.urllib.request, "urlopen", side_effect=urlopen), \
             self.assertLogs("services.meta_graph", level="INFO") as logs:
            first = meta_graph.urlopen(self.request(), timeout=4).read()
            second = meta_graph.urlopen(self.request(), timeout=4).read()
        self.assertEqual(json.loads(first), {"id": "u1"})
        self.assertEqual(first, second)
        self.assertEqual(len(calls), 1)
        self.assertIn("X-App-Usage", " ".join(logs.output))
        self.assertNotIn("private-token", " ".join(logs.output))

    def test_page_account_details_are_cached(self):
        calls = []

        def urlopen(_request, timeout=None):
            calls.append(1)
            return FakeResponse({"id": "page-1", "instagram_business_account": {"id": "ig-1"}})

        request = self.request("/123?fields=id%2Cname%2Cinstagram_business_account%7Bid%2Cusername%7D&access_token=private-token")
        with patch.object(meta_graph.urllib.request, "urlopen", side_effect=urlopen):
            first = json.loads(meta_graph.urlopen(request).read())
            second = json.loads(meta_graph.urlopen(request).read())
        self.assertEqual(first, second)
        self.assertEqual(len(calls), 1)

    def test_concurrent_identical_requests_are_single_flight(self):
        started = threading.Event()
        release = threading.Event()
        calls = []
        results = []

        def urlopen(_request, timeout=None):
            calls.append(1)
            started.set()
            release.wait(2)
            return FakeResponse({"data": [1]})

        def call():
            results.append(json.loads(meta_graph.urlopen(self.request("/me/accounts?access_token=private-token"), timeout=4).read()))

        with patch.object(meta_graph.urllib.request, "urlopen", side_effect=urlopen):
            first = threading.Thread(target=call)
            second = threading.Thread(target=call)
            first.start()
            self.assertTrue(started.wait(1))
            second.start()
            time.sleep(0.02)
            release.set()
            first.join(2)
            second.join(2)
        self.assertEqual(len(calls), 1)
        self.assertEqual(results, [{"data": [1]}, {"data": [1]}])

    def test_code_four_uses_retry_after_and_pauses_without_inline_retry(self):
        attempts = []

        def urlopen(_request, timeout=None):
            attempts.append(1)
            if len(attempts) == 1:
                raise HTTPError("https://graph.facebook.com/v21.0/me", 403, "rate", {"Retry-After": "0.01"}, io.BytesIO(
                    b'{"error":{"code":4,"message":"Application request limit reached"}}'))
            return FakeResponse({"id": "ok"})

        with patch.object(meta_graph.urllib.request, "urlopen", side_effect=urlopen):
            with self.assertRaises(HTTPError) as raised:
                meta_graph.urlopen(self.request(), timeout=4)
        self.assertEqual(raised.exception.code, 429)
        self.assertEqual(raised.exception.headers.get("Retry-After"), "1")
        self.assertEqual(len(attempts), 1)
        self.assertIn(b'"rate_limit_source": "meta_graph"', raised.exception.read())

    def test_long_retry_after_pauses_requests_without_another_graph_call(self):
        calls = []

        def urlopen(_request, timeout=None):
            calls.append(1)
            raise HTTPError("https://graph.facebook.com/v21.0/me", 403, "rate", {"Retry-After": "120"}, io.BytesIO(
                b'{"error":{"code":4,"message":"Application request limit reached"}}'))

        request = self.request("/me?access_token=cooldown-token")
        with patch.object(meta_graph.urllib.request, "urlopen", side_effect=urlopen), patch.object(meta_graph.time, "sleep") as sleep:
            with self.assertRaises(HTTPError) as raised:
                meta_graph.urlopen(request, timeout=4)
            with self.assertRaises(HTTPError) as blocked:
                meta_graph.urlopen(request, timeout=4)
        self.assertEqual(raised.exception.code, 429)
        self.assertEqual(blocked.exception.code, 429)
        self.assertEqual(len(calls), 1)
        self.assertEqual(blocked.exception.headers.get("Retry-After"), "120")

    def test_retry_timing_in_meta_error_body_is_honored(self):
        error = HTTPError(
            "https://graph.facebook.com/v21.0/me", 403, "rate", {},
            io.BytesIO(b'{"error":{"code":4,"retry_after_seconds":45,"message":"limited"}}'),
        )
        with patch.object(meta_graph.urllib.request, "urlopen", side_effect=error):
            with self.assertRaises(HTTPError) as raised:
                meta_graph.urlopen(self.request("/me?access_token=body-delay-token"))
        self.assertEqual(raised.exception.headers.get("Retry-After"), "45")

    def test_cooldown_is_shared_across_module_reloads_and_success_clears_it(self):
        request = self.request("/me/accounts?access_token=shared-token")
        with patch.object(meta_graph.urllib.request, "urlopen", side_effect=HTTPError(
            "https://graph.facebook.com/v21.0/me/accounts", 403, "rate", {}, io.BytesIO(
                b'{"error":{"code":4,"message":"Application request limit reached"}}'))):
            with self.assertRaises(HTTPError):
                meta_graph.urlopen(request)
        with meta_graph._lock:
            meta_graph._cooldowns.clear()
            meta_graph._backoff_counts.clear()
        with self.assertRaises(HTTPError) as paused:
            meta_graph.urlopen(self.request("/123?access_token=another-token"))
        self.assertIn(b'"rate_limit_source": "local_cooldown"', paused.exception.read())

        # Expire shared state, then a successful Meta response is accepted and clears backoff.
        with closing(sqlite3.connect(meta_graph._COOLDOWN_DB)) as conn:
            conn.execute("UPDATE meta_rate_limit_state SET retry_at=?", (time.time() - 1,))
            conn.commit()
        with patch.object(meta_graph.urllib.request, "urlopen", return_value=FakeResponse({"id": "ok"})):
            self.assertEqual(json.loads(meta_graph.urlopen(request).read()), {"id": "ok"})
        with closing(sqlite3.connect(meta_graph._COOLDOWN_DB)) as conn:
            self.assertIsNone(conn.execute("SELECT 1 FROM meta_rate_limit_state").fetchone())


if __name__ == "__main__":
    unittest.main()

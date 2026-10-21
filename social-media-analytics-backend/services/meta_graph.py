"""Shared, token-safe request controls for Facebook and Instagram Graph GETs."""
from __future__ import annotations

import hashlib
import io
import json
import logging
import math
import random
import sqlite3
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
from contextlib import closing
from datetime import datetime, timezone
from email.utils import parsedate_to_datetime
from typing import Any, Dict, Optional

from config import BASE_DIR

logger = logging.getLogger(__name__)
_lock = threading.RLock()
_cache: Dict[str, tuple[float, bytes, Dict[str, str], int]] = {}
_flights: Dict[str, Dict[str, Any]] = {}
_cooldowns: Dict[str, float] = {}
_backoff_counts: Dict[str, int] = {}
_COOLDOWN_BUCKET = "meta_application"
_COOLDOWN_DB = str(BASE_DIR / "data" / "social_feed.db")
_MAX_CACHE_ENTRIES = 1000
_MAX_BACKOFF_SECONDS = 900.0


class CachedMetaResponse(io.BytesIO):
    def __init__(self, body: bytes, headers: Dict[str, str], status: int = 200):
        super().__init__(body)
        self.headers = headers
        self.status = status

    def getcode(self):
        return self.status

    def __enter__(self):
        return self

    def __exit__(self, *_args):
        self.close()
        return False


def _url(request: Any) -> str:
    return request.full_url if isinstance(request, urllib.request.Request) else str(request)


def _response_headers(headers: Any) -> Dict[str, str]:
    return {str(key): str(value) for key, value in (headers.items() if headers else [])}


def _cache_ttl(path: str) -> int:
    lower = path.lower()
    if "/insights" in lower:
        return 300
    if "/me/accounts" in lower or "/me/permissions" in lower or lower.endswith("/me"):
        return 60
    # Page and Instagram Professional account detail lookups use /{id} and
    # are repeated during status/account resolution.
    parts = [part for part in lower.split("/") if part]
    if len(parts) == 2 and parts[0].startswith("v"):
        return 60
    if any(edge in lower for edge in ("/media", "/posts", "/comments")):
        return 30
    return 0


def _retry_after(headers: Any) -> Optional[float]:
    value = headers.get("Retry-After") if headers else None
    if not value:
        return None
    try:
        return max(0.0, float(value))
    except (TypeError, ValueError):
        try:
            retry_at = parsedate_to_datetime(value)
            if retry_at.tzinfo is None:
                retry_at = retry_at.replace(tzinfo=timezone.utc)
            return max(0.0, (retry_at - datetime.now(timezone.utc)).total_seconds())
        except (TypeError, ValueError, OverflowError):
            return None


def _has_access_token(url: str) -> bool:
    parsed = urllib.parse.urlparse(url)
    return bool((urllib.parse.parse_qs(parsed.query).get("access_token") or [""])[0])


def _read_cooldown():
    """Read the app-wide cooldown shared by backend worker processes via SQLite."""
    try:
        with closing(sqlite3.connect(_COOLDOWN_DB, timeout=5)) as conn:
            conn.execute("CREATE TABLE IF NOT EXISTS meta_rate_limit_state (bucket TEXT PRIMARY KEY, retry_at REAL NOT NULL, failures INTEGER NOT NULL)")
            row = conn.execute("SELECT retry_at, failures FROM meta_rate_limit_state WHERE bucket=?", (_COOLDOWN_BUCKET,)).fetchone()
            conn.commit()
        if row:
            _cooldowns[_COOLDOWN_BUCKET], _backoff_counts[_COOLDOWN_BUCKET] = float(row[0]), int(row[1])
            return float(row[0]), int(row[1])
    except (OSError, sqlite3.Error) as exc:
        logger.warning("Meta cooldown shared-state read unavailable (%s); using process-local state", type(exc).__name__)
    return _cooldowns.get(_COOLDOWN_BUCKET, 0.0), _backoff_counts.get(_COOLDOWN_BUCKET, 0)


def _record_cooldown(delay: Optional[float]) -> tuple[float, int]:
    """Atomically increment backoff state so concurrent workers cannot reset it."""
    failures = _backoff_counts.get(_COOLDOWN_BUCKET, 0) + 1
    try:
        with closing(sqlite3.connect(_COOLDOWN_DB, timeout=5)) as conn:
            conn.execute("CREATE TABLE IF NOT EXISTS meta_rate_limit_state (bucket TEXT PRIMARY KEY, retry_at REAL NOT NULL, failures INTEGER NOT NULL)")
            conn.execute("BEGIN IMMEDIATE")
            row = conn.execute("SELECT failures FROM meta_rate_limit_state WHERE bucket=?", (_COOLDOWN_BUCKET,)).fetchone()
            failures = (int(row[0]) if row else 0) + 1
            computed_delay = delay if delay is not None else min(_MAX_BACKOFF_SECONDS, (2 ** min(failures - 1, 9)) * random.uniform(1.0, 1.5))
            retry_at = time.time() + computed_delay
            conn.execute("INSERT INTO meta_rate_limit_state(bucket,retry_at,failures) VALUES(?,?,?) ON CONFLICT(bucket) DO UPDATE SET retry_at=excluded.retry_at, failures=excluded.failures", (_COOLDOWN_BUCKET, retry_at, failures))
            conn.commit()
    except (OSError, sqlite3.Error) as exc:
        logger.warning("Meta cooldown shared-state write unavailable (%s); retaining process-local state", type(exc).__name__)
        computed_delay = delay if delay is not None else min(_MAX_BACKOFF_SECONDS, (2 ** min(failures - 1, 9)) * random.uniform(1.0, 1.5))
        retry_at = time.time() + computed_delay
    _cooldowns[_COOLDOWN_BUCKET] = retry_at
    _backoff_counts[_COOLDOWN_BUCKET] = failures
    return computed_delay, failures


def _clear_cooldown():
    _cooldowns.pop(_COOLDOWN_BUCKET, None)
    _backoff_counts.pop(_COOLDOWN_BUCKET, None)
    try:
        with closing(sqlite3.connect(_COOLDOWN_DB, timeout=5)) as conn:
            conn.execute("DELETE FROM meta_rate_limit_state WHERE bucket=?", (_COOLDOWN_BUCKET,))
            conn.commit()
    except (OSError, sqlite3.Error) as exc:
        logger.warning("Meta cooldown shared-state clear unavailable (%s); retaining process-local state", type(exc).__name__)


def _log_usage(path: str, headers: Any, status: int):
    usage = {key: headers.get(key) for key in (
        "X-App-Usage", "X-Page-Usage", "X-Business-Use-Case-Usage"
    ) if headers and headers.get(key)}
    logger.info("Meta Graph response status=%s path=%s usage=%s", status, path, usage or "unreported")


def _error_parts(error: urllib.error.HTTPError):
    raw = error.read()
    headers = _response_headers(error.headers)
    try:
        payload = json.loads(raw.decode("utf-8"))
        graph_error = payload.get("error") or {}
    except (ValueError, UnicodeDecodeError):
        payload, graph_error = {}, {}
    return raw, headers, payload, graph_error


def _rate_limited_error(url: str, retry_seconds: float, message: str, source: str):
    retry_seconds = max(1.0, retry_seconds)
    wait_seconds = math.ceil(retry_seconds)
    payload = json.dumps({"error": {"code": 4, "message": message}, "retry_after_seconds": wait_seconds, "rate_limit_source": source}).encode()
    headers = {"Content-Type": "application/json", "Retry-After": str(wait_seconds), "X-Projecti-Meta-Rate-Limit-Source": source}
    return urllib.error.HTTPError(url, 429, "Meta Graph API rate limited", headers, io.BytesIO(payload))


def _copy_http_error(error: urllib.error.HTTPError, body: bytes, headers: Dict[str, str]):
    return urllib.error.HTTPError(error.url, error.code, error.reason, headers, io.BytesIO(body))


def clear_cache():
    """Clear cached Graph responses when a user explicitly requests refresh."""
    with _lock:
        _cache.clear()


def urlopen(request: Any, timeout: Optional[float] = None, *, cache_ttl: Optional[int] = None):
    """GET wrapper with short cache, single-flight, and shared app-level code-4 cooldown."""
    url = _url(request)
    parsed = urllib.parse.urlparse(url)
    if parsed.scheme != "https" or parsed.hostname != "graph.facebook.com":
        return urllib.request.urlopen(request, timeout=timeout)

    path = parsed.path
    headers_in = request.headers if isinstance(request, urllib.request.Request) else {}
    refresh = any(str(key).lower() == "cache-control" and "no-cache" in str(value).lower()
                  for key, value in headers_in.items())
    ttl = (0 if refresh else (_cache_ttl(path) if cache_ttl is None else cache_ttl))
    key = hashlib.sha256(url.encode("utf-8")).hexdigest()
    now = time.monotonic()

    with _lock:
        cached = _cache.get(key)
        if ttl and cached and cached[0] > now:
            return CachedMetaResponse(cached[1], cached[2], cached[3])
        if refresh:
            _cache.pop(key, None)
        blocked_until, failures = _read_cooldown()
        wall_now = time.time()
        if blocked_until > wall_now:
            remaining = blocked_until - wall_now
            raise _rate_limited_error(url, remaining, "Meta has temporarily rate-limited this app. Please wait before trying again.", "local_cooldown")
        flight = _flights.get(key)
        owner = flight is None
        if owner:
            flight = {"event": threading.Event(), "response": None, "error": None}
            _flights[key] = flight

    if not owner:
        flight["event"].wait()
        if flight.get("exception"):
            raise flight["exception"]
        if flight["error"]:
            error, body, headers = flight["error"]
            raise _copy_http_error(error, body, headers)
        body, headers, status = flight["response"]
        return CachedMetaResponse(body, headers, status)

    try:
        try:
            with urllib.request.urlopen(request, timeout=timeout) as response:
                body = response.read()
                response_headers = _response_headers(getattr(response, "headers", None))
                status = getattr(response, "getcode", lambda: 200)() or 200
            _log_usage(path, response_headers, status)
            with _lock:
                if ttl:
                    if len(_cache) >= _MAX_CACHE_ENTRIES:
                        _cache.pop(next(iter(_cache)))
                    _cache[key] = (time.monotonic() + ttl, body, response_headers, status)
                if failures:
                    _clear_cooldown()
                flight["response"] = (body, response_headers, status)
            return CachedMetaResponse(body, response_headers, status)
        except urllib.error.HTTPError as error:
            body, response_headers, payload, graph_error = _error_parts(error)
            _log_usage(path, response_headers, error.code)
            if graph_error.get("code") != 4:
                raise _copy_http_error(error, body, response_headers)

            supplied_delay = _retry_after(response_headers)
            if supplied_delay is None:
                body_delay = payload.get("retry_after_seconds")
                if body_delay is None:
                    body_delay = graph_error.get("retry_after_seconds")
                try:
                    supplied_delay = max(0.0, float(body_delay)) if body_delay is not None else None
                except (TypeError, ValueError):
                    supplied_delay = None
            with _lock:
                delay, next_failure = _record_cooldown(supplied_delay)
            source = "meta_graph"
            logger.warning("Meta Graph returned code=4 path=%s token_present=%s retry_after=%.1fs failures=%s; paused", path, _has_access_token(url), delay, next_failure)
            raise _rate_limited_error(
                url, delay,
                str(graph_error.get("message") or "Meta has temporarily rate-limited this app. Please wait before trying again."),
                source,
            )
    except urllib.error.HTTPError as error:
        body = error.read()
        response_headers = _response_headers(error.headers)
        with _lock:
            flight["error"] = (error, body, response_headers)
        raise _copy_http_error(error, body, response_headers)
    except Exception as error:
        with _lock:
            flight["exception"] = error
        raise
    finally:
        with _lock:
            flight["event"].set()
            _flights.pop(key, None)

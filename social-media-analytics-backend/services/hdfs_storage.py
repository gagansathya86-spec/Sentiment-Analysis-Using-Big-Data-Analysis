"""Verified JSON record storage over Hadoop WebHDFS REST API.

The local SQLite database remains authoritative. HDFS writes are explicit,
repeatable per-record writes with date partitions and a verification read.
"""
import hashlib
import json
import sqlite3
from datetime import datetime, timezone
from typing import Any, Dict, Iterable, List, Optional
from urllib.parse import quote, urlencode, urlparse, urlunparse

import requests

from config import settings
from services.social_service import DB_PATH


class HDFSStorageError(RuntimeError):
    pass


def _configured() -> bool:
    return bool(settings.HDFS_WEBHDFS_URL.strip())


def _base_url() -> str:
    return settings.HDFS_WEBHDFS_URL.rstrip("/")


def _params(params: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    result = dict(params or {})
    if settings.HDFS_USER:
        result["user.name"] = settings.HDFS_USER
    return result


def _url(path: str, params: Optional[Dict[str, Any]] = None) -> str:
    root = _base_url()
    if not root:
        raise HDFSStorageError("HDFS is not configured. Set HDFS_WEBHDFS_URL to the NameNode WebHDFS endpoint.")
    normalized = "/" + path.strip("/") if path.strip("/") else "/"
    # The configured endpoint may already contain /webhdfs/v1; only append the file path.
    return f"{root}{quote(normalized, safe='/')}?{urlencode(_params(params))}"


def _request(method: str, path: str = "/", params: Optional[Dict[str, Any]] = None, **kwargs):
    try:
        response = requests.request(method, _url(path, params), timeout=settings.HDFS_TIMEOUT_SECONDS, **kwargs)
        response.raise_for_status()
        return response
    except requests.RequestException as exc:
        raise HDFSStorageError(f"WebHDFS request failed for {path}: {exc}") from exc


def _mkdirs(path: str) -> None:
    _request("PUT", path, {"op": "MKDIRS"})


def _write_json(path: str, payload: Dict[str, Any]) -> None:
    body = json.dumps(payload, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    try:
        response = requests.put(_url(path, {"op": "CREATE", "overwrite": "true"}), data=b"", allow_redirects=False,
                                timeout=settings.HDFS_TIMEOUT_SECONDS)
        if response.status_code not in (307, 201):
            response.raise_for_status()
            raise HDFSStorageError(f"WebHDFS CREATE returned unexpected HTTP {response.status_code} for {path}.")
        if response.status_code == 307:
            location = response.headers.get("Location")
            if not location:
                raise HDFSStorageError(f"WebHDFS did not provide a DataNode redirect for {path}.")
            if settings.HDFS_DATANODE_HOST_OVERRIDE:
                parsed = urlparse(location)
                location = urlunparse(parsed._replace(netloc=settings.HDFS_DATANODE_HOST_OVERRIDE))
            data_response = requests.put(location, data=body, headers={"Content-Type": "application/octet-stream"},
                                         timeout=settings.HDFS_TIMEOUT_SECONDS)
            data_response.raise_for_status()
    except requests.RequestException as exc:
        raise HDFSStorageError(f"WebHDFS write failed for {path}: {exc}") from exc


def _read_json(path: str) -> Dict[str, Any]:
    try:
        response = requests.get(_url(path, {"op": "OPEN"}), timeout=settings.HDFS_TIMEOUT_SECONDS)
        response.raise_for_status()
        return response.json()
    except (requests.RequestException, ValueError) as exc:
        raise HDFSStorageError(f"Could not read back HDFS file {path}: {exc}") from exc


def check_status() -> Dict[str, Any]:
    if not _configured():
        return {"configured": False, "available": False, "verified": False,
                "message": "HDFS is not configured. Set HDFS_WEBHDFS_URL to enable real HDFS storage.",
                "webhdfs_url": None, "root_path": settings.HDFS_ROOT_PATH}
    try:
        result = _request("GET", "/", {"op": "GETHOMEDIRECTORY"}).json()
        return {"configured": True, "available": True, "verified": True,
                "message": "NameNode WebHDFS endpoint responded successfully.",
                "webhdfs_url": _base_url(), "root_path": settings.HDFS_ROOT_PATH,
                "hdfs_home": result.get("Path")}
    except HDFSStorageError as exc:
        return {"configured": True, "available": False, "verified": False,
                "message": str(exc), "webhdfs_url": _base_url(), "root_path": settings.HDFS_ROOT_PATH}


def _partition(record: Dict[str, Any]) -> str:
    value = record.get("created_time") or record.get("fetched_at") or datetime.now(timezone.utc).isoformat()
    try:
        moment = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    except ValueError:
        moment = datetime.now(timezone.utc)
    return f"year={moment:%Y}/month={moment:%m}/day={moment:%d}"


def _record_path(area: str, kind: str, record: Dict[str, Any]) -> str:
    record_id = str(record.get("id") or "")
    if not record_id:
        raise HDFSStorageError("Cannot export a Facebook record without an id.")
    key = hashlib.sha256(record_id.encode("utf-8")).hexdigest()
    return f"{settings.HDFS_ROOT_PATH.strip('/')}/{area}/facebook/{kind}/{_partition(record)}/{key}.json"


def _export_record(kind: str, record: Dict[str, Any], area: str, processed: bool = False) -> str:
    path = _record_path(area, kind, record)
    parent = path.rsplit("/", 1)[0]
    _mkdirs(parent)
    payload = dict(record)
    if processed:
        payload["record_type"] = kind[:-1] if kind.endswith("s") else kind
        payload["exported_at"] = datetime.now(timezone.utc).isoformat()
        payload["sentiment_result"] = {
            "label": payload.pop("sentiment", "unknown"),
            "confidence": payload.pop("sentiment_confidence", 0.0),
        }
        if "aspects_json" in payload:
            try:
                payload["aspects"] = json.loads(payload.pop("aspects_json") or "{}")
            except (ValueError, TypeError):
                payload["aspects"] = {}
    else:
        # Raw partitions contain captured Facebook content/metrics only.
        for derived in ("sentiment", "sentiment_confidence", "aspects_json", "aspects", "viral_score"):
            payload.pop(derived, None)
    _write_json(path, payload)
    # Confirm the file exists and is readable; a 200 on CREATE alone is insufficient.
    stored = _read_json(path)
    if str(stored.get("id")) != str(record.get("id")):
        raise HDFSStorageError(f"HDFS verification failed for {path}: record id does not match.")
    return "/" + path.lstrip("/")


def export_record(record_type: str, record: Dict[str, Any]) -> Dict[str, Any]:
    if record_type not in ("post", "comment"):
        raise ValueError("record_type must be 'post' or 'comment'.")
    kind = record_type + "s"
    raw_path = _export_record(kind, record, "raw")
    processed_path = _export_record(kind, record, "processed", processed=True)
    return {"status": "stored", "verified": True, "raw_path": raw_path, "processed_path": processed_path}


def _fetch_records(include_sample: bool = False) -> Dict[str, List[Dict[str, Any]]]:
    with sqlite3.connect(DB_PATH) as conn:
        conn.row_factory = sqlite3.Row
        sample_clause = "" if include_sample else " AND is_sample=0"
        posts = [dict(row) for row in conn.execute(f"SELECT * FROM social_posts WHERE platform='facebook'{sample_clause} ORDER BY created_time")]
        comments = [dict(row) for row in conn.execute(f"SELECT * FROM social_comments WHERE platform='facebook'{sample_clause} ORDER BY created_time")]
    return {"posts": posts, "comments": comments}


def backfill(include_sample: bool = False) -> Dict[str, Any]:
    status = check_status()
    if not status["available"]:
        raise HDFSStorageError(status["message"])
    rows = _fetch_records(include_sample)
    files = []
    for kind, records in rows.items():
        for record in records:
            raw_path = _export_record(kind, record, "raw")
            processed_path = _export_record(kind, record, "processed", processed=True)
            files.extend([raw_path, processed_path])
    return {"status": "complete", "verified": True, "posts_exported": len(rows["posts"]),
            "comments_exported": len(rows["comments"]), "files_written": len(files),
            "files": files, "hdfs_root": "/" + settings.HDFS_ROOT_PATH.strip("/")}


def _list_files(path: str) -> Iterable[str]:
    response = _request("GET", path, {"op": "LISTSTATUS"}).json()
    for entry in response.get("FileStatuses", {}).get("FileStatus", []):
        child = path.rstrip("/") + "/" + entry["pathSuffix"]
        if entry.get("type") == "DIRECTORY":
            yield from _list_files(child)
        elif entry.get("type") == "FILE" and child.endswith(".json"):
            yield child


def read_summary() -> Dict[str, Any]:
    status = check_status()
    if not status["available"]:
        raise HDFSStorageError(status["message"])
    processed_root = f"{settings.HDFS_ROOT_PATH.strip('/')}/processed/facebook"
    try:
        paths = list(_list_files(processed_root))
    except HDFSStorageError as exc:
        # A healthy, empty namespace returns a useful empty summary.
        if "404" in str(exc):
            return {"source": "hdfs", "files_read": 0, "posts": 0, "comments": 0,
                    "sentiment_counts": {}, "engagement": {"likes": 0, "comments": 0, "shares": 0}, "files": []}
        raise
    counts: Dict[str, int] = {}
    engagement = {"likes": 0, "comments": 0, "shares": 0}
    totals = {"posts": 0, "comments": 0}
    for path in paths:
        record = _read_json("/" + path.lstrip("/"))
        kind = record.get("record_type")
        if kind not in ("post", "comment"):
            continue
        totals["posts" if kind == "post" else "comments"] += 1
        label = record.get("sentiment_result", {}).get("label", "unknown")
        counts[label] = counts.get(label, 0) + 1
        if kind == "post":
            for metric in engagement:
                value = record.get(f"{metric}_count")
                if isinstance(value, (int, float)):
                    engagement[metric] += int(value)
    return {"source": "hdfs", "files_read": len(paths), **totals,
            "sentiment_counts": counts, "engagement": engagement,
            "files": ["/" + item.lstrip("/") for item in paths]}

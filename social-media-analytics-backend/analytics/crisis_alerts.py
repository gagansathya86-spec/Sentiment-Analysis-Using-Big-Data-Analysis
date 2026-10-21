"""Persisted Facebook and Instagram negative-sentiment surveillance."""
import json
import re
from collections import Counter
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional

from config import settings
from services import social_service
from analytics import aspect_analysis
from utils.time_utils import parse_utc_datetime


def get_crisis_alerts(status=None, platform=None, account_id=None):
    query = "SELECT * FROM crisis_alerts WHERE 1=1"
    params = {}
    if platform and platform.lower() != "all":
        query += " AND platform = :platform"
        params["platform"] = platform.lower()
    if account_id:
        query += " AND account_id = :account_id"
        params["account_id"] = str(account_id)
    if status and status.lower() != "all":
        query += " AND status = :status"
        params["status"] = status.lower()
    query += " ORDER BY created_at DESC"
    with social_service.get_db() as conn:
        rows = conn.execute(query, params).fetchall()
    results = []
    for row in rows:
        item = dict(row)
        item["source_type"] = item.get("source_type") or "legacy_unverified"
        try:
            item["evidence"] = json.loads(item.get("evidence_json") or "[]")
        except (TypeError, ValueError):
            item["evidence"] = []
        results.append(item)
    return results


def update_alert_status(alert_id, new_status, platform="facebook"):
    status = str(new_status).lower()
    if status not in ("active", "reviewed", "resolved"):
        raise ValueError("Status must be active, reviewed, or resolved.")
    resolved_at = datetime.now(timezone.utc).isoformat() if status == "resolved" else None
    with social_service.get_db() as conn:
        conn.execute("UPDATE crisis_alerts SET status=?, resolved_at=? WHERE id=? AND platform=?", (status, resolved_at, alert_id, platform.lower()))
        row = conn.execute("SELECT * FROM crisis_alerts WHERE id=? AND platform=?", (alert_id, platform.lower())).fetchone()
    if not row:
        return None
    result = dict(row)
    result["evidence"] = json.loads(result.get("evidence_json") or "[]")
    return result


def _group_page_records(posts, comments):
    post_by_id = {str(row.get("id")): row for row in posts}
    grouped = {}
    for post in posts:
        account = str(post.get("account_id") or "unknown")
        grouped.setdefault(account, []).append({**post, "record_type": "post", "post_id": post.get("id"), "source_url": post.get("permalink")})
    for comment in comments:
        parent = post_by_id.get(str(comment.get("post_id")))
        if parent:
            account = str(parent.get("account_id") or "unknown")
            grouped.setdefault(account, []).append({**comment, "account_id": account, "record_type": "comment", "source_url": parent.get("permalink")})
    return grouped


def _period_stats(records, start, end):
    selected = [(item, parse_utc_datetime(item.get("created_time"))) for item in records]
    selected = [(item, stamp) for item, stamp in selected if stamp and start < stamp <= end]
    classified = [(item, str(item.get("sentiment") or "").lower()) for item, _ in selected]
    classified = [(item, label) for item, label in classified if label in {"positive", "negative", "neutral"}]
    counts = Counter(label for _, label in classified)
    n = len(classified)
    return {"start": start.isoformat(), "end": end.isoformat(), "sample_size": n,
            "dated_items": len(selected), "unclassified_items": len(selected) - n,
            "positive_count": counts["positive"], "negative_count": counts["negative"],
            "neutral_count": counts["neutral"], "negative_percent": round(counts["negative"] * 100 / n, 1) if n else None}, classified


def compare_negative_windows(items, threshold=35.0, min_volume=3, period_days=7, as_of=None):
    """Evaluate adjacent windows; unknown sentiments and invalid dates never enter rates."""
    now = parse_utc_datetime(as_of) if as_of else datetime.now(timezone.utc)
    if now is None:
        now = datetime.now(timezone.utc)
    current_start = now - timedelta(days=int(period_days))
    previous_start = current_start - timedelta(days=int(period_days))
    current, current_items = _period_stats(items, current_start, now)
    previous, _ = _period_stats(items, previous_start, current_start)
    minimum = max(3, int(min_volume))
    invalid_dates = sum(1 for item in items if parse_utc_datetime(item.get("created_time")) is None)
    result = {"outcome": "insufficient_data", "reason": None, "period_days": int(period_days),
              "threshold_percentage_points": float(threshold), "minimum_items_per_period": minimum,
              "current_period": current, "previous_period": previous,
              "invalid_timestamp_count": invalid_dates}
    if current["sample_size"] < minimum or previous["sample_size"] < minimum:
        result["reason"] = f"Each period requires at least {minimum} dated, classified items."
        return result
    change = round(current["negative_percent"] - previous["negative_percent"], 1)
    result["change_percentage_points"] = change
    result["outcome"] = "alert" if change >= float(threshold) else "no_risk"
    result["reason"] = "Negative sentiment rose by the configured percentage-point threshold." if result["outcome"] == "alert" else "Sufficient data was available and the configured threshold was not met."
    if result["outcome"] != "alert":
        return result
    negative = [item for item, label in current_items if label == "negative"]
    keywords, aspects = Counter(), Counter()
    for item in negative:
        words = re.findall(r"\b[a-zA-Z]{3,}\b", (item.get("text") or "").lower())
        keywords.update(w for w in words if w not in {"the", "and", "was", "were", "with", "for", "this", "that", "very", "not"})
        for name, value in aspect_analysis.analyze_text_aspects(item.get("text") or "").items():
            aspects[name] += len(value.get("mentions", []))
    result["evidence"] = [{"platform": item.get("platform"), "record_id": item.get("id"),
        "record_type": item.get("record_type", "post"), "post_id": item.get("post_id") or item.get("id"),
        "account_id": item.get("account_id"), "author": item.get("author") or "User",
        "text": (item.get("text") or "")[:300], "time": item.get("created_time"),
        "sentiment": item.get("sentiment"), "source_url": item.get("source_url") or item.get("permalink")} for item in negative[:10]]
    result["keywords"] = [{"keyword": w, "count": n} for w, n in keywords.most_common(8)]
    result["aspects"] = [{"aspect": a.replace("_", " "), "count": n} for a, n in aspects.most_common(8)]
    return result


def detect_negative_spike(items, threshold=35.0, min_volume=3, period_days=7):
    """Compatibility helper: return alert evidence only when threshold is supported."""
    result = compare_negative_windows(items, threshold, min_volume, period_days)
    return result if result["outcome"] == "alert" else None


def run_crisis_scan(threshold=None, min_volume=None, period_days=7, platform="all", account_id=None):
    platforms = ("facebook", "instagram") if (platform or "all").lower() == "all" else ((platform.lower(),) if platform.lower() in {"facebook", "instagram"} else ())
    if not platforms:
        raise ValueError("Unsupported social platform.")
    threshold = float(threshold if threshold is not None else getattr(settings, "ALERT_NEGATIVE_THRESHOLD", 35.0))
    minimum = max(3, int(min_volume if min_volume is not None else getattr(settings, "ALERT_MIN_SAMPLE_SIZE", 3)))
    scans, alerts = [], []
    for current_platform in platforms:
        posts = social_service.get_social_posts(platform=current_platform, account_id=account_id, limit=2000)
        ids = {str(post.get("id")) for post in posts}
        comments = [row for row in social_service.get_social_comments(limit=3000, platform=current_platform) if str(row.get("post_id")) in ids]
        groups = _group_page_records(posts, comments)
        if not groups:
            groups = {str(account_id or "unknown"): []}
        for account, records in groups.items():
            result = compare_negative_windows(records, threshold, minimum, period_days)
            result.update(platform=current_platform, account_id=account, stored_posts=len(posts), stored_comments=len(comments),
                          data_coverage_note="Analysis uses only synchronized records with valid timestamps and recognized sentiment labels; unavailable or unsynchronized comments are excluded.")
            scan_id = f"scan_{current_platform}_{account}_{datetime.now(timezone.utc).strftime('%Y%m%d%H%M%S%f')}"
            with social_service.get_db() as conn:
                conn.execute("INSERT INTO crisis_scans (id,platform,account_id,period_days,outcome,details_json,created_at) VALUES (?,?,?,?,?,?,?)",
                    (scan_id, current_platform, account, int(period_days), result["outcome"], json.dumps(result), datetime.now(timezone.utc).isoformat()))
            scans.append(result)
            if result["outcome"] != "alert":
                continue
            day_key = result["current_period"]["start"][:10]
            account_key = re.sub(r"[^a-zA-Z0-9_-]", "_", account)[:32]
            alert_id = f"alert_{current_platform}_spike_{account_key}_{day_key}_{period_days}d"
            # A rolling window can move its start date each day. Reuse an unresolved
            # incident while the newly detected period overlaps its stored period.
            new_start = parse_utc_datetime(result["current_period"]["start"])
            new_end = parse_utc_datetime(result["current_period"]["end"])
            with social_service.get_db() as conn:
                prior_rows = conn.execute("SELECT id,evidence_json FROM crisis_alerts WHERE platform=? AND account_id=? AND source_type='live' AND status IN ('active','reviewed')", (current_platform, account)).fetchall()
            for prior in prior_rows:
                try:
                    prior_period = json.loads(prior["evidence_json"] or "{}").get("current_period", {})
                    prior_start = parse_utc_datetime(prior_period.get("start"))
                    prior_end = parse_utc_datetime(prior_period.get("end"))
                except (TypeError, ValueError):
                    continue
                if prior_start and prior_end and new_start and new_end and new_start <= prior_end and prior_start <= new_end:
                    alert_id = prior["id"]
                    break
            change = result["change_percentage_points"]
            severity = "CRITICAL" if change >= 2 * threshold else "WARNING"
            message = (f"Negative {current_platform.title()} sentiment increased by {change:.1f} percentage points "
                f"({result['previous_period']['negative_percent']:.1f}% to {result['current_period']['negative_percent']:.1f}%) "
                f"across consecutive {period_days}-day windows. Potential issue; review source evidence.")
            with social_service.get_db() as conn:
                conn.execute("""INSERT INTO crisis_alerts (id,severity,platform,title,message,negative_ratio,threshold,affected_volume,time_window,evidence_json,status,created_at,account_id,source_type)
                    VALUES (?,?,?,?,?,?,?,?,?,?,'active',?,?, 'live') ON CONFLICT(id) DO UPDATE SET severity=excluded.severity,message=excluded.message,negative_ratio=excluded.negative_ratio,threshold=excluded.threshold,affected_volume=excluded.affected_volume,time_window=excluded.time_window,evidence_json=excluded.evidence_json""",
                    (alert_id,severity,current_platform,f"Potential increase in negative {current_platform.title()} feedback",message,result["current_period"]["negative_percent"],threshold,result["current_period"]["negative_count"],f"{period_days} days: {result['previous_period']['start'][:10]} → {result['current_period']['end'][:10]}",json.dumps(result),datetime.now(timezone.utc).isoformat(),account))
    alerts = get_crisis_alerts(platform=platform, account_id=account_id)
    return {"alerts": alerts, "scans": scans}


def run_crisis_detection(threshold=None, min_volume=None, period_days=7, platform="facebook", account_id=None):
    """Backward compatible list-returning entry point for existing callers."""
    return run_crisis_scan(threshold, min_volume, period_days, platform, account_id)["alerts"]


def get_crisis_scans(platform="all", limit=50):
    query = "SELECT * FROM crisis_scans"
    params = []
    if platform and platform.lower() != "all":
        query += " WHERE platform=?"
        params.append(platform.lower())
    query += " ORDER BY created_at DESC LIMIT ?"
    params.append(max(1, min(int(limit), 500)))
    with social_service.get_db() as conn:
        rows = conn.execute(query, params).fetchall()
    items = []
    for row in rows:
        item = dict(row)
        item["details"] = json.loads(item.pop("details_json") or "{}")
        items.append(item)
    return items

"""
Crisis Monitoring & Negative Sentiment Spike Detection Engine
Monitors social media feeds for elevated negative sentiment spikes,
concentrated customer complaints, and emerging crisis keywords.
"""
import sqlite3
import json
import uuid
import re
from datetime import datetime, timezone
from typing import Dict, Any, List, Optional

from config import settings
from services import social_service


def get_crisis_alerts(status: Optional[str] = None, platform: Optional[str] = None) -> List[Dict[str, Any]]:
    with social_service.get_db() as conn:
        cursor = conn.cursor()
        query = "SELECT * FROM crisis_alerts WHERE 1=1"
        params = {}
        
        if status and status.lower() != "all":
            query += " AND status = :status"
            params["status"] = status.lower()
            
        if platform and platform.lower() != "all":
            query += " AND platform = :platform"
            params["platform"] = platform.lower()
            
        query += " ORDER BY CASE severity WHEN 'CRITICAL' THEN 1 WHEN 'WARNING' THEN 2 ELSE 3 END, created_at DESC"
        cursor.execute(query, params)
        rows = cursor.fetchall()
        
        alerts = []
        for r in rows:
            d = dict(r)
            try:
                d["evidence"] = json.loads(d.get("evidence_json") or "[]")
            except Exception:
                d["evidence"] = []
            alerts.append(d)
        return alerts


def update_alert_status(alert_id: str, new_status: str) -> Optional[Dict[str, Any]]:
    valid_statuses = ("active", "reviewed", "resolved")
    status_clean = new_status.lower()
    if status_clean not in valid_statuses:
        raise ValueError(f"Invalid status '{new_status}'. Must be one of: {valid_statuses}")
        
    resolved_at = datetime.now(timezone.utc).isoformat() if status_clean == "resolved" else None
    
    with social_service.get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("""
            UPDATE crisis_alerts 
            SET status = :status, resolved_at = :resolved_at
            WHERE id = :id
        """, {"status": status_clean, "resolved_at": resolved_at, "id": alert_id})
        conn.commit()
        
        cursor.execute("SELECT * FROM crisis_alerts WHERE id = :id", {"id": alert_id})
        row = cursor.fetchone()
        if not row:
            return None
        d = dict(row)
        try:
            d["evidence"] = json.loads(d.get("evidence_json") or "[]")
        except Exception:
            d["evidence"] = []
        return d


def run_crisis_detection(threshold: Optional[float] = None, min_volume: Optional[int] = None) -> List[Dict[str, Any]]:
    """Evaluates stored social posts and comments against crisis thresholds and persists newly detected alerts."""
    spike_threshold = threshold if threshold is not None else getattr(settings, "ALERT_NEGATIVE_THRESHOLD", 35.0)
    min_posts = min_volume if min_volume is not None else getattr(settings, "ALERT_MIN_SAMPLE_SIZE", 3)
    
    posts = social_service.get_social_posts(limit=200)
    comments = social_service.get_social_comments(limit=300)
    
    new_alerts = []
    
    # Check 1: Post-level comment complaint clusters
    # If a specific post has >= 3 negative comments or >= 50% negative comments
    post_comments_map = {}
    for c in comments:
        pid = c.get("post_id")
        post_comments_map.setdefault(pid, []).append(c)
        
    for p in posts:
        pid = p["id"]
        post_comms = post_comments_map.get(pid, [])
        if len(post_comms) >= 2:
            neg_comms = [c for c in post_comms if c.get("sentiment") == "negative"]
            neg_pct = (len(neg_comms) / len(post_comms)) * 100
            
            if neg_pct >= spike_threshold:
                severity = "CRITICAL" if (neg_pct >= 60.0 or len(neg_comms) >= 4) else "WARNING"
                alert_id = f"alert_post_{pid}"
                
                # Extract negative keywords from evidence
                kw_set = set()
                evidence_list = []
                for c in neg_comms:
                    words = re.findall(r"\b[a-zA-Z]{4,}\b", c.get("text", "").lower())
                    kw_set.update([w for w in words if w in ("crash", "charge", "refund", "outage", "broken", "scam", "late", "delay", "worst", "terrible", "disappointed", "unacceptable")])
                    if len(evidence_list) < 4:
                        evidence_list.append({
                            "author": c.get("author", "User"),
                            "text": c.get("text", ""),
                            "time": c.get("created_time")
                        })
                        
                title = f"Negative Sentiment Spike on {p['platform'].capitalize()} Post"
                message = f"Post '{p['text'][:60]}...' generated {len(neg_comms)} negative comments ({neg_pct:.1f}% negative ratio, exceeding {spike_threshold:.1f}% threshold)."
                
                with social_service.get_db() as conn:
                    cursor = conn.cursor()
                    cursor.execute("""
                        INSERT INTO crisis_alerts (
                            id, severity, platform, title, message, negative_ratio,
                            threshold, affected_volume, time_window, evidence_json, status, created_at
                        ) VALUES (
                            :id, :severity, :platform, :title, :message, :negative_ratio,
                            :threshold, :affected_volume, :time_window, :evidence_json, 'active', :created_at
                        )
                        ON CONFLICT(id) DO UPDATE SET
                            severity = excluded.severity,
                            negative_ratio = excluded.negative_ratio,
                            message = excluded.message,
                            evidence_json = excluded.evidence_json
                    """, {
                        "id": alert_id,
                        "severity": severity,
                        "platform": p["platform"],
                        "title": title,
                        "message": message,
                        "negative_ratio": round(neg_pct, 1),
                        "threshold": spike_threshold,
                        "affected_volume": len(neg_comms),
                        "time_window": p.get("created_time") or "Recent",
                        "evidence_json": json.dumps(evidence_list),
                        "created_at": datetime.now(timezone.utc).isoformat()
                    })
                    conn.commit()
                new_alerts.append(alert_id)
                
    # Check 2: Platform-wide negative ratio
    for platform_name in ("facebook", "instagram"):
        plat_posts = [p for p in posts if p["platform"] == platform_name]
        if len(plat_posts) >= min_posts:
            neg_p = [p for p in plat_posts if p.get("sentiment") == "negative"]
            neg_ratio = (len(neg_p) / len(plat_posts)) * 100
            
            if neg_ratio >= spike_threshold:
                alert_id = f"alert_platform_{platform_name}"
                title = f"{platform_name.capitalize()} Platform Negative Spike"
                message = f"{platform_name.capitalize()} currently registers {neg_ratio:.1f}% negative posts across {len(plat_posts)} total posts, exceeding threshold ({spike_threshold:.1f}%)."
                evidence = [{"author": p["author"], "text": p["text"][:100], "time": p["created_time"]} for p in neg_p[:3]]
                
                with social_service.get_db() as conn:
                    cursor = conn.cursor()
                    cursor.execute("""
                        INSERT INTO crisis_alerts (
                            id, severity, platform, title, message, negative_ratio,
                            threshold, affected_volume, time_window, evidence_json, status, created_at
                        ) VALUES (
                            :id, :severity, :platform, :title, :message, :negative_ratio,
                            :threshold, :affected_volume, :time_window, :evidence_json, 'active', :created_at
                        )
                        ON CONFLICT(id) DO UPDATE SET
                            severity = excluded.severity,
                            negative_ratio = excluded.negative_ratio,
                            message = excluded.message,
                            evidence_json = excluded.evidence_json
                    """, {
                        "id": alert_id,
                        "severity": "CRITICAL" if neg_ratio >= 50.0 else "WARNING",
                        "platform": platform_name,
                        "title": title,
                        "message": message,
                        "negative_ratio": round(neg_ratio, 1),
                        "threshold": spike_threshold,
                        "affected_volume": len(neg_p),
                        "time_window": "Recent Activity",
                        "evidence_json": json.dumps(evidence),
                        "created_at": datetime.now(timezone.utc).isoformat()
                    })
                    conn.commit()
                new_alerts.append(alert_id)
                
    return get_crisis_alerts()


# Run initial detection pass on module load
try:
    run_crisis_detection()
except Exception:
    pass

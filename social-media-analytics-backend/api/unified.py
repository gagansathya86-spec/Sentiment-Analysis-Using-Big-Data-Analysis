"""
Unified Multi-Platform Analytics API Router
Provides cross-platform data access, unified metrics, combined charts,
filtering (All, Facebook, Instagram), synchronization, and CSV export.
"""
from fastapi import APIRouter, Query, HTTPException, Response
from typing import Optional, List, Dict, Any
import pandas as pd
import io

from services import social_service
from config import settings

router = APIRouter(prefix="/api/unified", tags=["Unified Analytics"])


@router.get("/status")
def get_unified_status():
    """Returns platform connection status, record counts, and last synchronization timestamps."""
    sync_statuses = social_service.get_sync_statuses()
    metrics = social_service.get_unified_metrics()
    
    return {
        "facebook": {
            "configured": bool(settings.FACEBOOK_ACCESS_TOKEN or settings.META_ACCESS_TOKEN),
            "posts_count": metrics["platforms"]["facebook"]["posts"],
            "comments_count": metrics["platforms"]["facebook"]["comments"],
            "last_sync": sync_statuses.get("facebook", {}).get("last_sync"),
            "sync_status": sync_statuses.get("facebook", {}).get("status", "idle")
        },
        "instagram": {
            "configured": bool(settings.INSTAGRAM_ACCESS_TOKEN or settings.META_ACCESS_TOKEN or settings.FACEBOOK_ACCESS_TOKEN),
            "posts_count": metrics["platforms"]["instagram"]["posts"],
            "comments_count": metrics["platforms"]["instagram"]["comments"],
            "last_sync": sync_statuses.get("instagram", {}).get("last_sync"),
            "sync_status": sync_statuses.get("instagram", {}).get("status", "idle")
        },
        "total_records": metrics["total_records"],
        "database": "SQLite (social_feed.db)",
        "processing_engine": settings.PROCESSING_ENGINE
    }


@router.get("/metrics")
def get_metrics(platform: Optional[str] = Query("all")):
    """Returns KPI summary cards for the given platform filter (all, facebook, instagram)."""
    return social_service.get_unified_metrics(platform=platform)


@router.get("/feed")
def get_social_feed(
    platform: Optional[str] = Query("all"),
    sentiment: Optional[str] = Query("all"),
    search: Optional[str] = Query(None),
    limit: int = Query(50),
    offset: int = Query(0)
):
    """Returns normalized social posts with sentiment and engagement scores."""
    posts = social_service.get_social_posts(
        platform=platform,
        sentiment=sentiment,
        search=search,
        limit=limit,
        offset=offset
    )
    return {
        "data": posts,
        "count": len(posts),
        "limit": limit,
        "offset": offset,
        "platform_filter": platform,
        "sentiment_filter": sentiment
    }


@router.get("/charts")
def get_charts_data(platform: Optional[str] = Query("all")):
    """Returns aggregated data formatted for Recharts:
    1. Sentiment breakdown by platform
    2. Sentiment timeline
    3. Cross-platform engagement comparison"""
    posts = social_service.get_social_posts(platform=platform, limit=500)
    
    # 1. Distribution for Pie / Bar
    sent_counts = {"positive": 0, "negative": 0, "neutral": 0}
    for p in posts:
        s = p.get("sentiment", "neutral").lower()
        if s in sent_counts:
            sent_counts[s] += 1
        else:
            sent_counts["neutral"] += 1
            
    distribution = [
        {"name": "Positive", "value": sent_counts["positive"], "color": "var(--success)"},
        {"name": "Negative", "value": sent_counts["negative"], "color": "var(--error)"},
        {"name": "Neutral", "value": sent_counts["neutral"], "color": "var(--text-muted)"}
    ]
    
    # 2. Timeline by Date
    timeline_dict = {}
    for p in posts:
        t_str = p.get("created_time")
        if not t_str:
            continue
        date_key = t_str[:10]  # YYYY-MM-DD
        if date_key not in timeline_dict:
            timeline_dict[date_key] = {
                "date": date_key,
                "positive": 0,
                "negative": 0,
                "neutral": 0,
                "facebook": 0,
                "instagram": 0
            }
        s = p.get("sentiment", "neutral").lower()
        if s in ("positive", "negative", "neutral"):
            timeline_dict[date_key][s] += 1
        else:
            timeline_dict[date_key]["neutral"] += 1
            
        plat = p.get("platform", "facebook").lower()
        if plat in timeline_dict[date_key]:
            timeline_dict[date_key][plat] += 1
            
    timeline = sorted(list(timeline_dict.values()), key=lambda x: x["date"])
    
    # 3. Platform Comparison
    fb_posts = [p for p in posts if p["platform"] == "facebook"]
    ig_posts = [p for p in posts if p["platform"] == "instagram"]
    
    platform_comparison = [
        {
            "platform": "Facebook",
            "posts": len(fb_posts),
            "avg_likes": round(sum(p["likes_count"] for p in fb_posts) / max(len(fb_posts), 1), 1),
            "avg_comments": round(sum(p["comments_count"] for p in fb_posts) / max(len(fb_posts), 1), 1),
            "positive_pct": round((len([p for p in fb_posts if p["sentiment"] == "positive"]) / max(len(fb_posts), 1)) * 100, 1),
            "negative_pct": round((len([p for p in fb_posts if p["sentiment"] == "negative"]) / max(len(fb_posts), 1)) * 100, 1)
        },
        {
            "platform": "Instagram",
            "posts": len(ig_posts),
            "avg_likes": round(sum(p["likes_count"] for p in ig_posts) / max(len(ig_posts), 1), 1),
            "avg_comments": round(sum(p["comments_count"] for p in ig_posts) / max(len(ig_posts), 1), 1),
            "positive_pct": round((len([p for p in ig_posts if p["sentiment"] == "positive"]) / max(len(ig_posts), 1)) * 100, 1),
            "negative_pct": round((len([p for p in ig_posts if p["sentiment"] == "negative"]) / max(len(ig_posts), 1)) * 100, 1)
        }
    ]
    
    return {
        "sentiment_distribution": distribution,
        "timeline": timeline,
        "platform_comparison": platform_comparison
    }


@router.post("/seed-sample")
def seed_sample_data():
    """Resets or repopulates the database with realistic sample demonstration posts and comments."""
    social_service.seed_sample_multiplatform_data()
    return {
        "status": "success",
        "message": "Sample demonstration data loaded successfully for Facebook and Instagram.",
        "metrics": social_service.get_unified_metrics()
    }


@router.get("/export")
def export_unified_csv(platform: Optional[str] = Query("all")):
    """Generates and downloads a clean CSV containing all normalized social records."""
    posts = social_service.get_social_posts(platform=platform, limit=1000)
    comments = social_service.get_social_comments(limit=1000)
    
    rows = []
    for p in posts:
        rows.append({
            "id": p["id"],
            "type": "POST",
            "platform": p["platform"],
            "author": p["author"],
            "text": p["text"],
            "created_time": p["created_time"],
            "likes": p["likes_count"],
            "comments": p["comments_count"],
            "shares": p.get("shares_count", 0),
            "sentiment": p["sentiment"],
            "confidence": p.get("sentiment_confidence", 0.0),
            "permalink": p.get("permalink", "")
        })
    for c in comments:
        if platform == "all" or c.get("platform") == platform:
            rows.append({
                "id": c["id"],
                "type": "COMMENT",
                "platform": c["platform"],
                "author": c["author"],
                "text": c["text"],
                "created_time": c["created_time"],
                "likes": c.get("likes_count", 0),
                "comments": 0,
                "shares": 0,
                "sentiment": c["sentiment"],
                "confidence": c.get("sentiment_confidence", 0.0),
                "permalink": ""
            })
            
    df = pd.DataFrame(rows)
    stream = io.StringIO()
    df.to_csv(stream, index=False)
    
    response = Response(content=stream.getvalue(), media_type="text/csv")
    response.headers["Content-Disposition"] = f"attachment; filename=social_intelligence_export_{platform}.csv"
    return response

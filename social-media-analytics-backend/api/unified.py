"""
Unified Multi-Platform Analytics API Router
Provides cross-platform data access, unified metrics, combined charts,
Facebook filtering, synchronization, and CSV export.
"""
from fastapi import APIRouter, Query, HTTPException, Response
from typing import Optional, List, Dict, Any
import pandas as pd
import io

from services import social_service
from config import settings
from api.facebook import ACTIVE_PAGE_STATE
from api.instagram import ACTIVE_INSTAGRAM_STATE

router = APIRouter(prefix="/api/unified", tags=["Unified Analytics"])


@router.get("/status")
def get_unified_status(demo_mode: bool = Query(False)):
    """Returns platform connection status, record counts, and last synchronization timestamps."""
    sync_statuses = social_service.get_sync_statuses()
    metrics = social_service.get_unified_metrics(include_sample=demo_mode)
    
    return {
        "facebook": {
            "configured": bool(settings.FACEBOOK_ACCESS_TOKEN or settings.META_ACCESS_TOKEN),
            "status": "active" if (settings.FACEBOOK_ACCESS_TOKEN or settings.META_ACCESS_TOKEN) else "unconfigured",
            "posts_count": metrics["platforms"]["facebook"]["posts"],
            "comments_count": metrics["platforms"]["facebook"]["comments"],
            "last_sync": sync_statuses.get("facebook", {}).get("last_sync"),
            "sync_status": sync_statuses.get("facebook", {}).get("status", "idle"),
            "active": True
        },
        "total_records": metrics["total_records"],
        "has_live_data": social_service.has_live_data(),
        "has_sample_data": social_service.has_sample_data(),
        "demo_mode": demo_mode,
        "database": "SQLite (social_feed.db)",
        "processing_engine": settings.PROCESSING_ENGINE
    }


@router.get("/metrics")
def get_metrics(platform: Optional[str] = Query("all"), demo_mode: bool = Query(False)):
    """Returns KPI summary cards for Facebook posts and comments."""
    account_id = (ACTIVE_INSTAGRAM_STATE.get("account_id") or settings.INSTAGRAM_ACCOUNT_ID or None) if platform == "instagram" else ACTIVE_PAGE_STATE.get("selected_page_id") if platform == "facebook" else None
    return social_service.get_unified_metrics(platform=platform, account_id=account_id, include_sample=demo_mode)


@router.get("/dashboard-analytics")
def get_dashboard_analytics(platform: str = Query("facebook")):
    """Return sentiment and behavior summaries from the selected platform's stored analyses."""
    selected = platform.lower()
    account_id = (ACTIVE_INSTAGRAM_STATE.get("account_id") or settings.INSTAGRAM_ACCOUNT_ID or None) if selected == "instagram" else ACTIVE_PAGE_STATE.get("selected_page_id")
    return social_service.get_social_dashboard_analytics(platform=selected, account_id=account_id)


@router.get("/feed")
def get_social_feed(
    platform: Optional[str] = Query("all"),
    sentiment: Optional[str] = Query("all"),
    search: Optional[str] = Query(None),
    demo_mode: bool = Query(False),
    limit: int = Query(50),
    offset: int = Query(0)
):
    """Returns normalized social posts with sentiment and engagement scores.
    By default (demo_mode=False), returns only real live posts from Facebook API."""
    posts = social_service.get_social_posts(
        platform=platform,
        sentiment=sentiment,
        search=search,
        include_sample=demo_mode,
        account_id=((ACTIVE_INSTAGRAM_STATE.get("account_id") or settings.INSTAGRAM_ACCOUNT_ID or None) if platform == "instagram" else (ACTIVE_PAGE_STATE.get("selected_page_id") if platform == "facebook" else None)),
        limit=limit,
        offset=offset
    )
    return {
        "data": posts,
        "count": len(posts),
        "limit": limit,
        "offset": offset,
        "platform_filter": platform,
        "sentiment_filter": sentiment,
        "demo_mode": demo_mode,
        "is_sample_feed": any(p.get("is_sample") == 1 for p in posts)
    }


@router.get("/charts")
def get_charts_data(platform: Optional[str] = Query("all"), demo_mode: bool = Query(False)):
    """Returns aggregated data formatted for Recharts:
    1. Sentiment breakdown by platform
    2. Sentiment timeline
    3. Cross-platform engagement comparison"""
    account_id = (ACTIVE_INSTAGRAM_STATE.get("account_id") or settings.INSTAGRAM_ACCOUNT_ID or None) if platform == "instagram" else ACTIVE_PAGE_STATE.get("selected_page_id") if platform == "facebook" else None
    posts = social_service.get_social_posts(platform=platform, account_id=account_id, include_sample=demo_mode, limit=500)
    
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
    platform_names = sorted({(p.get("platform") or "facebook").lower() for p in posts})
    platform_comparison = [
        {
            "platform": selected_platform.title(),
            "posts": len(selected_posts := [p for p in posts if (p.get("platform") or "facebook").lower() == selected_platform]),
            "avg_likes": round(sum(p["likes_count"] for p in selected_posts if p.get("likes_count") is not None) / max(sum(p.get("likes_count") is not None for p in selected_posts), 1), 1) if any(p.get("likes_count") is not None for p in selected_posts) else None,
            "avg_comments": round(sum(p["comments_count"] for p in selected_posts if p.get("comments_count") is not None) / max(sum(p.get("comments_count") is not None for p in selected_posts), 1), 1) if any(p.get("comments_count") is not None for p in selected_posts) else None,
            "positive_pct": round((len([p for p in selected_posts if p["sentiment"] == "positive"]) / max(len(selected_posts), 1)) * 100, 1),
            "negative_pct": round((len([p for p in selected_posts if p["sentiment"] == "negative"]) / max(len(selected_posts), 1)) * 100, 1)
        }
        for selected_platform in platform_names
    ]
    
    return {
        "sentiment_distribution": distribution,
        "timeline": timeline,
        "platform_comparison": platform_comparison,
        "total_posts": len(posts)
    }


@router.post("/seed-sample")
def seed_sample_data():
    """Explicitly triggers loading of sample demonstration posts and comments."""
    social_service.seed_sample_facebook_data()
    return {
        "status": "success",
        "message": "Sample demonstration data loaded successfully for testing.",
        "metrics": social_service.get_unified_metrics(include_sample=True)
    }


@router.post("/clear-sample")
def clear_sample_data():
    """Explicitly clears sample demonstration data without touching real live records."""
    social_service.clear_sample_data()
    return {
        "status": "success",
        "message": "Sample demonstration data cleared. Feed now shows only live data.",
        "metrics": social_service.get_unified_metrics(include_sample=False)
    }


@router.get("/demo-status")
def get_demo_status():
    """Returns whether live data or demo data is present."""
    return {
        "has_live_data": social_service.has_live_data(),
        "has_sample_data": social_service.has_sample_data()
    }



@router.get("/export")
def export_unified_csv(platform: Optional[str] = Query("all")):
    """Generates and downloads a clean CSV containing all normalized social records."""
    account_id = (ACTIVE_INSTAGRAM_STATE.get("account_id") or settings.INSTAGRAM_ACCOUNT_ID or None) if platform == "instagram" else ACTIVE_PAGE_STATE.get("selected_page_id") if platform == "facebook" else None
    posts = social_service.get_social_posts(platform=platform, account_id=account_id, limit=1000)
    post_ids = {str(post.get("id")) for post in posts}
    comments = [comment for comment in social_service.get_social_comments(limit=1000, platform=platform) if str(comment.get("post_id")) in post_ids]
    
    rows = []
    for p in posts:
        rows.append({
            "id": p["id"],
            "type": "POST",
            "platform": p["platform"],
            "author": p["author"],
            "text": p["text"],
            "created_time": p["created_time"],
            "likes": p.get("likes_count"),
            "comments": p.get("comments_count"),
            "shares": p.get("shares_count"),
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

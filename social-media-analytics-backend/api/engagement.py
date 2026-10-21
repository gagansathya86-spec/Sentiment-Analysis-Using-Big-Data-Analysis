"""
Engagement Analytics API Router
Provides endpoints for engagement score calculation, cross-platform performance,
sentiment vs engagement correlation, and optimal posting times.
"""
from fastapi import APIRouter, Query
from typing import Optional
from analytics import engagement_analytics
from api.facebook import ACTIVE_PAGE_STATE
from api.instagram import ACTIVE_INSTAGRAM_STATE
from config import settings

router = APIRouter(prefix="/api/engagement-stats", tags=["Engagement Analytics"])


@router.get("/overview")
def get_engagement_overview(platform: Optional[str] = Query(None)):
    """Returns engagement totals, averages per post, platform comparisons, and top 10 engaging posts."""
    account_id = ACTIVE_PAGE_STATE.get("selected_page_id") if platform == "facebook" else (ACTIVE_INSTAGRAM_STATE.get("account_id") or settings.INSTAGRAM_ACCOUNT_ID or None) if platform == "instagram" else None
    return engagement_analytics.get_engagement_overview(platform=platform, account_id=account_id)


@router.get("/sentiment-correlation")
def get_sentiment_correlation(platform: Optional[str] = Query(None)):
    """Returns comparative engagement averages grouped by sentiment category."""
    account_id = ACTIVE_PAGE_STATE.get("selected_page_id") if platform == "facebook" else (ACTIVE_INSTAGRAM_STATE.get("account_id") or settings.INSTAGRAM_ACCOUNT_ID or None) if platform == "instagram" else None
    return engagement_analytics.get_engagement_vs_sentiment(platform=platform, account_id=account_id)


@router.get("/best-times")
def get_best_posting_times(platform: Optional[str] = Query(None)):
    """Returns hourly and daily engagement distributions and peak recommended posting windows."""
    account_id = ACTIVE_PAGE_STATE.get("selected_page_id") if platform == "facebook" else ACTIVE_INSTAGRAM_STATE.get("account_id") if platform == "instagram" else None
    return engagement_analytics.get_best_posting_times(platform=platform, account_id=account_id)

"""
Engagement Analytics API Router
Provides endpoints for engagement score calculation, cross-platform performance,
sentiment vs engagement correlation, and optimal posting times.
"""
from fastapi import APIRouter, Query
from typing import Optional
from analytics import engagement_analytics

router = APIRouter(prefix="/api/engagement-stats", tags=["Engagement Analytics"])


@router.get("/overview")
def get_engagement_overview(platform: Optional[str] = Query(None)):
    """Returns engagement totals, averages per post, platform comparisons, and top 10 engaging posts."""
    return engagement_analytics.get_engagement_overview(platform=platform)


@router.get("/sentiment-correlation")
def get_sentiment_correlation(platform: Optional[str] = Query(None)):
    """Returns comparative engagement averages grouped by sentiment category."""
    return engagement_analytics.get_engagement_vs_sentiment(platform=platform)


@router.get("/best-times")
def get_best_posting_times(platform: Optional[str] = Query(None)):
    """Returns hourly and daily engagement distributions and peak recommended posting windows."""
    return engagement_analytics.get_best_posting_times(platform=platform)

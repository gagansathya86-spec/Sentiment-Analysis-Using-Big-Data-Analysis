"""
Trend & Keyword Discovery API Router
Provides endpoints for keyword frequencies, hashtag counts, emerging topics,
and cross-platform keyword analysis.
"""
from fastapi import APIRouter, Query
from typing import Optional
from analytics import trend_discovery

router = APIRouter(prefix="/api/trends-discovery", tags=["Trend Discovery"])


@router.get("/summary")
def get_trends_summary(platform: Optional[str] = Query(None), top_n: int = Query(25)):
    """Returns top keywords, positive/negative keyword lists, hashtags, and emerging topics."""
    return trend_discovery.get_trend_discovery(platform=platform, top_n=top_n)

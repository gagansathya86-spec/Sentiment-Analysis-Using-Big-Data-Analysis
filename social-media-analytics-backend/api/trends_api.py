"""
Trend & Keyword Discovery API Router
Provides endpoints for keyword frequencies, hashtag counts, emerging topics,
and cross-platform keyword analysis.
"""
from fastapi import APIRouter, Query
from typing import Optional
from analytics import trend_discovery
from api.facebook import ACTIVE_PAGE_STATE
from api.instagram import ACTIVE_INSTAGRAM_STATE
from config import settings

router = APIRouter(prefix="/api/trends-discovery", tags=["Trend Discovery"])


@router.get("/summary")
def get_trends_summary(platform: Optional[str] = Query("facebook"), top_n: int = Query(25), period_days: int = Query(7, ge=1, le=90)):
    """Returns top keywords, positive/negative keyword lists, hashtags, and emerging topics."""
    account_id = (ACTIVE_INSTAGRAM_STATE.get("account_id") or settings.INSTAGRAM_ACCOUNT_ID or None) if platform == "instagram" else ACTIVE_PAGE_STATE.get("selected_page_id") if platform == "facebook" else None
    return trend_discovery.get_trend_discovery(platform=platform, top_n=top_n, period_days=period_days, account_id=account_id)

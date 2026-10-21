"""
Viral Post Potential API Router
Provides endpoints to score viral potential of social posts and rank top candidates.
"""
from fastapi import APIRouter, Query, HTTPException
from pydantic import BaseModel
from typing import Optional, List, Dict, Any

from analytics import viral_potential
from api.facebook import ACTIVE_PAGE_STATE
from api.instagram import ACTIVE_INSTAGRAM_STATE
from services import social_service
from config import settings

router = APIRouter(prefix="/api/viral", tags=["Viral Potential"])


class ScorePostRequest(BaseModel):
    text: str
    likes: int = 0
    comments: int = 0
    created_time: Optional[str] = None
    sentiment: Optional[str] = "positive"
    confidence: Optional[float] = 0.85
    media_type: Optional[str] = "POST"
    platform: str = "facebook"


@router.get("/ranked-posts")
def get_ranked_posts(limit: int = Query(20), platform: str = Query("facebook")):
    """Returns stored Facebook posts ranked by an explainable engagement score."""
    return {
        "ranked_posts": viral_potential.get_ranked_viral_posts(limit=limit, platform=platform, account_id=(ACTIVE_INSTAGRAM_STATE.get("account_id") or settings.INSTAGRAM_ACCOUNT_ID or None) if platform == "instagram" else ACTIVE_PAGE_STATE.get("selected_page_id") if platform == "facebook" else None),
        "methodology": "Multi-factor heuristic analyzing Facebook engagement volume, discussion ratio, posting time, sentiment, and shares.",
        "model_status": "heuristic_only",
        "model_reason": "The current database has no labeled viral outcome or historical engagement snapshots for training or growth estimates.",
        "disclaimer": "Experimental descriptive score — not a trained model, calibrated probability, or guaranteed prediction."
    }


@router.get("/recommendations")
def get_facebook_recommendations(platform: str = Query("facebook")):
    """Returns recommendations with evidence from stored live Facebook analytics."""
    account_id = (ACTIVE_INSTAGRAM_STATE.get("account_id") or settings.INSTAGRAM_ACCOUNT_ID or None) if platform == "instagram" else ACTIVE_PAGE_STATE.get("selected_page_id") if platform == "facebook" else None
    history = social_service.get_social_posts(platform=platform, account_id=account_id, limit=500)
    return viral_potential.get_facebook_recommendations(history=history, platform=platform, account_id=account_id)


@router.post("/score-draft")
def score_draft_post(request: ScorePostRequest):
    """Calculates viral potential score and actionable recommendations for a post draft or hypothetical post."""
    post_dict = {
        "id": "draft",
        "text": request.text,
        "likes_count": request.likes,
        "comments_count": request.comments,
        "platform": request.platform,
        "created_time": request.created_time,
        "sentiment": request.sentiment,
        "sentiment_confidence": request.confidence,
        "media_type": request.media_type
    }
    return viral_potential.evaluate_post_viral_potential(post_dict)

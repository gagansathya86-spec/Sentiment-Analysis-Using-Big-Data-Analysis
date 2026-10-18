"""
Viral Post Potential API Router
Provides endpoints to score viral potential of social posts and rank top candidates.
"""
from fastapi import APIRouter, Query, HTTPException
from pydantic import BaseModel
from typing import Optional, List, Dict, Any

from analytics import viral_potential

router = APIRouter(prefix="/api/viral", tags=["Viral Potential"])


class ScorePostRequest(BaseModel):
    text: str
    likes: int = 0
    comments: int = 0
    platform: str = "facebook"
    created_time: Optional[str] = None
    sentiment: Optional[str] = "positive"
    confidence: Optional[float] = 0.85
    media_type: Optional[str] = "POST"


@router.get("/ranked-posts")
def get_ranked_posts(platform: Optional[str] = Query(None), limit: int = Query(20)):
    """Returns stored social media posts ranked by estimated viral potential score (0-100)."""
    return {
        "ranked_posts": viral_potential.get_ranked_viral_posts(platform=platform, limit=limit),
        "methodology": "Multi-factor heuristic analyzing interaction volume, discussion velocity ratio, timing window, and emotional polarity.",
        "disclaimer": "Descriptive heuristic score — not a guaranteed prediction."
    }


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

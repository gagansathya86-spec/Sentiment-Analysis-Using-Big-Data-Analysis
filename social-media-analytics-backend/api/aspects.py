"""
Aspect-Based Sentiment Analysis API Router
Provides endpoints for fine-grained aspect sentiment analysis,
aspect configuration, and single-text clause evaluation.
"""
from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel
from typing import Dict, Any, List, Optional

from analytics import aspect_analysis
from api.facebook import ACTIVE_PAGE_STATE
from api.instagram import ACTIVE_INSTAGRAM_STATE
from config import settings

router = APIRouter(prefix="/api/aspects", tags=["Aspect Analysis"])


class AnalyzeTextRequest(BaseModel):
    text: str
    parent_sentiment: Optional[str] = None


class UpdateAspectConfigRequest(BaseModel):
    aspects: Dict[str, List[str]]


@router.get("/summary")
def get_aspect_summary(platform: Optional[str] = Query(None), account_id: Optional[str] = Query(None)):
    """Returns aggregated aspect-based sentiment metrics across all collected social posts and comments."""
    if not account_id and platform == "facebook":
        account_id = ACTIVE_PAGE_STATE.get("selected_page_id")
    elif not account_id and platform == "instagram":
        account_id = ACTIVE_INSTAGRAM_STATE.get("account_id") or settings.INSTAGRAM_ACCOUNT_ID or None
    return aspect_analysis.get_aspect_analytics_summary(platform=platform, account_id=account_id)


@router.get("/config")
def get_aspect_config():
    """Returns current configured aspect definitions and keyword lexicons."""
    return {
        "aspects": aspect_analysis.DEFAULT_ASPECTS,
        "aspect_count": len(aspect_analysis.DEFAULT_ASPECTS)
    }


@router.post("/config")
def update_aspect_config(request: UpdateAspectConfigRequest):
    """Updates the runtime aspect keyword seeds."""
    if not request.aspects:
        raise HTTPException(status_code=400, detail="Aspects configuration dictionary cannot be empty.")
    aspect_analysis.DEFAULT_ASPECTS.update(request.aspects)
    return {
        "status": "updated",
        "aspects": aspect_analysis.DEFAULT_ASPECTS,
        "message": f"Successfully updated {len(request.aspects)} aspect lexicons."
    }


@router.post("/analyze-text")
def analyze_single_text(request: AnalyzeTextRequest):
    """Evaluates aspects and polarities for a specific input text."""
    if not request.text.strip():
        raise HTTPException(status_code=400, detail="Text cannot be empty.")
        
    detected = aspect_analysis.analyze_text_aspects(request.text, parent_sentiment=request.parent_sentiment)
    local_labels = {mention["sentiment"] for aspect in detected.values() for mention in aspect.get("mentions", [])} - {"neutral"}
    overall = "mixed" if len(local_labels) > 1 else next(iter(local_labels), "neutral")
    return {
        "text": request.text,
        "clauses": aspect_analysis.extract_clauses(request.text),
        "overall_sentiment": overall,
        "detected_aspects": detected
    }

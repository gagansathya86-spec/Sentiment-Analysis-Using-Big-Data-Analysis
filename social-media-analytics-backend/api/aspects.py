"""
Aspect-Based Sentiment Analysis API Router
Provides endpoints for fine-grained aspect sentiment analysis,
aspect configuration, and single-text clause evaluation.
"""
from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel
from typing import Dict, Any, List, Optional

from analytics import aspect_analysis

router = APIRouter(prefix="/api/aspects", tags=["Aspect Analysis"])


class AnalyzeTextRequest(BaseModel):
    text: str
    parent_sentiment: Optional[str] = None


class UpdateAspectConfigRequest(BaseModel):
    aspects: Dict[str, List[str]]


@router.get("/summary")
def get_aspect_summary(platform: Optional[str] = Query(None)):
    """Returns aggregated aspect-based sentiment metrics across all collected social posts and comments."""
    return aspect_analysis.get_aspect_analytics_summary(platform=platform)


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
    return {
        "text": request.text,
        "clauses": aspect_analysis.extract_clauses(request.text),
        "detected_aspects": detected
    }

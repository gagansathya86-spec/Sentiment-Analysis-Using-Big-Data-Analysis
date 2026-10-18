"""
Crisis Alerts & Negative Sentiment Monitoring API Router
Provides endpoints to list detected crisis alerts, review or resolve alerts,
run manual sentiment spike scans, and configure alert thresholds.
"""
from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel
from typing import Optional, List, Dict, Any

from config import settings
from analytics import crisis_alerts

router = APIRouter(prefix="/api/alerts", tags=["Crisis Alerts"])


class UpdateStatusRequest(BaseModel):
    status: str  # 'active', 'reviewed', 'resolved'


class UpdateThresholdRequest(BaseModel):
    threshold: float
    min_volume: Optional[int] = 3


@router.get("")
def list_alerts(
    status: Optional[str] = Query(None),
    platform: Optional[str] = Query(None)
):
    """Returns detected crisis alerts filtered by status (active/reviewed/resolved) and platform."""
    alerts = crisis_alerts.get_crisis_alerts(status=status, platform=platform)
    active_count = len([a for a in alerts if a.get("status") == "active"])
    critical_count = len([a for a in alerts if a.get("severity") == "CRITICAL" and a.get("status") == "active"])
    
    return {
        "alerts": alerts,
        "summary": {
            "total_alerts": len(alerts),
            "active_alerts": active_count,
            "critical_active": critical_count
        },
        "threshold": getattr(settings, "ALERT_NEGATIVE_THRESHOLD", 35.0)
    }


@router.post("/{alert_id}/status")
def change_alert_status(alert_id: str, request: UpdateStatusRequest):
    """Marks an alert as reviewed or resolved."""
    try:
        updated = crisis_alerts.update_alert_status(alert_id, request.status)
        if not updated:
            raise HTTPException(status_code=404, detail=f"Alert with id '{alert_id}' not found.")
        return {
            "status": "success",
            "alert": updated,
            "message": f"Alert '{alert_id}' status updated to '{request.status}'."
        }
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/refresh")
def refresh_alerts(threshold: Optional[float] = Query(None)):
    """Runs a fresh crisis detection pass across all stored social media posts and comments."""
    alerts = crisis_alerts.run_crisis_detection(threshold=threshold)
    return {
        "status": "refreshed",
        "total_alerts": len(alerts),
        "alerts": alerts,
        "message": f"Crisis detection completed. {len(alerts)} alerts currently tracked."
    }


@router.get("/config")
def get_alert_config():
    """Returns current negative sentiment alert thresholds."""
    return {
        "negative_spike_threshold_percent": getattr(settings, "ALERT_NEGATIVE_THRESHOLD", 35.0),
        "min_sample_size": getattr(settings, "ALERT_MIN_SAMPLE_SIZE", 3)
    }


@router.post("/config")
def update_alert_config(request: UpdateThresholdRequest):
    """Updates negative sentiment spike threshold."""
    if request.threshold < 5.0 or request.threshold > 95.0:
        raise HTTPException(status_code=400, detail="Threshold percentage must be between 5.0% and 95.0%.")
    settings.ALERT_NEGATIVE_THRESHOLD = request.threshold
    if request.min_volume:
        settings.ALERT_MIN_SAMPLE_SIZE = request.min_volume
    return {
        "status": "updated",
        "negative_spike_threshold_percent": settings.ALERT_NEGATIVE_THRESHOLD,
        "min_sample_size": settings.ALERT_MIN_SAMPLE_SIZE,
        "message": f"Alert threshold successfully updated to {settings.ALERT_NEGATIVE_THRESHOLD}%."
    }

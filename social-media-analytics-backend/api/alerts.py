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
from api.facebook import ACTIVE_PAGE_STATE
from api.instagram import ACTIVE_INSTAGRAM_STATE

router = APIRouter(prefix="/api/alerts", tags=["Crisis Alerts"])


class UpdateStatusRequest(BaseModel):
    status: str  # 'active', 'reviewed', 'resolved'
    platform: str = "facebook"


class UpdateThresholdRequest(BaseModel):
    threshold: float
    min_volume: Optional[int] = 3


@router.get("")
def list_alerts(
    status: Optional[str] = Query(None),
    platform: Optional[str] = Query("all")
):
    """Returns detected crisis alerts filtered by status (active/reviewed/resolved) and platform."""
    account_id = ACTIVE_INSTAGRAM_STATE.get("account_id") or settings.INSTAGRAM_ACCOUNT_ID if platform == "instagram" else ACTIVE_PAGE_STATE.get("selected_page_id") if platform == "facebook" else None
    alerts = crisis_alerts.get_crisis_alerts(status=status, platform=platform, account_id=account_id)
    live_alerts = [a for a in alerts if a.get("source_type") == "live"]
    active_count = len([a for a in live_alerts if a.get("status") == "active"])
    critical_count = len([a for a in live_alerts if a.get("severity") == "CRITICAL" and a.get("status") == "active"])
    
    return {
        "alerts": alerts,
        "scans": crisis_alerts.get_crisis_scans(platform=platform or "all"),
        "summary": {
            "total_alerts": len(alerts),
            "active_alerts": active_count,
            "critical_active": critical_count
            ,"demo_alerts": sum(a.get("source_type") == "demo" for a in alerts)
            ,"unverified_legacy_alerts": sum(a.get("source_type") not in ("live", "demo") for a in alerts)
            ,"live_alerts": len(live_alerts)
        },
        "threshold": getattr(settings, "ALERT_NEGATIVE_THRESHOLD", 35.0)
    }


@router.post("/{alert_id}/status")
def change_alert_status(alert_id: str, request: UpdateStatusRequest):
    """Marks an alert as reviewed or resolved."""
    try:
        updated = crisis_alerts.update_alert_status(alert_id, request.status, request.platform)
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
def refresh_alerts(threshold: Optional[float] = Query(None), period_days: int = Query(7, ge=1, le=90), platform: str = Query("all")):
    """Runs a fresh crisis detection pass across all stored social media posts and comments."""
    account_id = ACTIVE_INSTAGRAM_STATE.get("account_id") or settings.INSTAGRAM_ACCOUNT_ID if platform == "instagram" else ACTIVE_PAGE_STATE.get("selected_page_id") if platform == "facebook" else None
    result = crisis_alerts.run_crisis_scan(threshold=threshold, period_days=period_days, platform=platform, account_id=account_id)
    alerts = result["alerts"]
    return {
        "status": "refreshed",
        "total_alerts": len(alerts),
        "alerts": alerts,
        "scans": result["scans"],
        "message": f"Crisis detection completed. {len(alerts)} alerts currently tracked."
    }


@router.get("/config")
def get_alert_config():
    """Returns current negative sentiment alert thresholds."""
    return {
        "negative_spike_threshold_percent": getattr(settings, "ALERT_NEGATIVE_THRESHOLD", 35.0),
        "negative_spike_increase_percentage_points": getattr(settings, "ALERT_NEGATIVE_THRESHOLD", 35.0),
        "min_sample_size": max(3, int(getattr(settings, "ALERT_MIN_SAMPLE_SIZE", 3)))
    }


@router.post("/config")
def update_alert_config(request: UpdateThresholdRequest):
    """Updates negative sentiment spike threshold."""
    if request.threshold < 5.0 or request.threshold > 95.0:
        raise HTTPException(status_code=400, detail="Increase threshold must be between 5 and 95 percentage points.")
    if request.min_volume is not None:
        if request.min_volume < 3 or request.min_volume > 10000:
            raise HTTPException(status_code=400, detail="Minimum sample size must be between 3 and 10000.")
    settings.ALERT_NEGATIVE_THRESHOLD = request.threshold
    if request.min_volume is not None:
        settings.ALERT_MIN_SAMPLE_SIZE = max(3, request.min_volume)
    return {
        "status": "updated",
        "negative_spike_threshold_percent": settings.ALERT_NEGATIVE_THRESHOLD,
        "negative_spike_increase_percentage_points": settings.ALERT_NEGATIVE_THRESHOLD,
        "min_sample_size": settings.ALERT_MIN_SAMPLE_SIZE,
        "message": f"Alert increase threshold successfully updated to {settings.ALERT_NEGATIVE_THRESHOLD} percentage points."
    }

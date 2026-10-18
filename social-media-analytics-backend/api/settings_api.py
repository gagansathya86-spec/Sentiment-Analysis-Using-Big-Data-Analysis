"""
Settings & System Diagnostics API Router
Provides endpoints to test Facebook & Instagram Meta Graph API credentials,
inspect permissions, review processing engine modes, and adjust alert thresholds.
"""
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional, Dict, Any
import urllib.request
import urllib.error
import json

from config import settings
from services import social_service
from services.processing_engine import get_processing_engine
from utils import file_utils

router = APIRouter(prefix="/api/settings", tags=["Settings & Status"])


class UpdateCredentialsRequest(BaseModel):
    meta_access_token: Optional[str] = None
    facebook_page_id: Optional[str] = None
    instagram_account_id: Optional[str] = None
    processing_engine: Optional[str] = None  # 'pandas' or 'spark'


@router.get("/status")
def get_system_status():
    """Returns comprehensive health, integration statuses, and storage metrics."""
    fb_token = settings.FACEBOOK_ACCESS_TOKEN or settings.META_ACCESS_TOKEN
    ig_token = settings.INSTAGRAM_ACCESS_TOKEN or settings.META_ACCESS_TOKEN
    
    engine = get_processing_engine()
    models = file_utils.get_model_registry()
    datasets = file_utils.get_dataset_registry()
    metrics = social_service.get_unified_metrics()
    
    return {
        "backend": {
            "status": "online",
            "app_name": settings.APP_NAME,
            "environment": settings.ENV,
            "processing_engine": engine.engine_name
        },
        "meta_integration": {
            "token_configured": bool(fb_token or ig_token),
            "meta_api_version": getattr(settings, "META_API_VERSION", "v21.0"),
            "facebook_page_id": getattr(settings, "FACEBOOK_PAGE_ID", "me"),
            "instagram_account_id": getattr(settings, "INSTAGRAM_ACCOUNT_ID", "auto")
        },
        "data_storage": {
            "sqlite_database": "data/social_feed.db",
            "total_social_records": metrics["total_records"],
            "registered_datasets_count": len(datasets),
            "trained_models_count": len(models)
        },
        "monitoring": {
            "alert_negative_threshold_percent": getattr(settings, "ALERT_NEGATIVE_THRESHOLD", 35.0),
            "alert_min_sample_size": getattr(settings, "ALERT_MIN_SAMPLE_SIZE", 3)
        }
    }


@router.post("/test-meta")
def test_meta_connection():
    """Runs a live verification check against Meta Graph API using the configured token."""
    token = settings.META_ACCESS_TOKEN or settings.FACEBOOK_ACCESS_TOKEN
    if not token:
        raise HTTPException(status_code=400, detail="No Meta Graph API access token configured in environment (.env).")
        
    api_ver = getattr(settings, "META_API_VERSION", "v21.0")
    
    # 1. Test /me
    url_me = f"https://graph.facebook.com/{api_ver}/me?fields=id,name&access_token={token}"
    req = urllib.request.Request(url_me, headers={"User-Agent": "Mozilla/5.0"})
    
    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            me_data = json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        raw = e.read().decode("utf-8")
        try:
            err = json.loads(raw).get("error", {})
            code = err.get("code")
            msg = err.get("message", raw)
            if code == 190:
                raise HTTPException(
                    status_code=401,
                    detail=f"Token Expired or Invalid (OAuthException 190): {msg}. Please generate a new User or Page token from Meta Developer Portal."
                )
            raise HTTPException(status_code=e.code, detail=f"Meta API Error ({code}): {msg}")
        except json.JSONDecodeError:
            raise HTTPException(status_code=e.code, detail=raw)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Connection error: {str(e)}")

    # 2. Test /me/permissions
    permissions = []
    try:
        url_perm = f"https://graph.facebook.com/{api_ver}/me/permissions?access_token={token}"
        req_p = urllib.request.Request(url_perm, headers={"User-Agent": "Mozilla/5.0"})
        with urllib.request.urlopen(req_p, timeout=10) as resp_p:
            perm_data = json.loads(resp_p.read().decode("utf-8"))
            permissions = [p["permission"] for p in perm_data.get("data", []) if p.get("status") == "granted"]
    except Exception:
        pass

    # 3. Test /me/accounts for Instagram Business accounts
    connected_pages = []
    try:
        url_pages = f"https://graph.facebook.com/{api_ver}/me/accounts?fields=id,name,instagram_business_account{{id,username,name}}&access_token={token}"
        req_pages = urllib.request.Request(url_pages, headers={"User-Agent": "Mozilla/5.0"})
        with urllib.request.urlopen(req_pages, timeout=10) as resp_pg:
            pages_res = json.loads(resp_pg.read().decode("utf-8"))
            for p in pages_res.get("data", []):
                connected_pages.append({
                    "page_id": p.get("id"),
                    "page_name": p.get("name"),
                    "instagram_business_account": p.get("instagram_business_account")
                })
    except Exception:
        pass

    return {
        "status": "valid",
        "user": me_data,
        "granted_permissions": permissions,
        "required_permissions_check": {
            "pages_show_list": "pages_show_list" in permissions,
            "pages_read_engagement": "pages_read_engagement" in permissions,
            "instagram_basic": "instagram_basic" in permissions,
            "instagram_manage_comments": "instagram_manage_comments" in permissions
        },
        "connected_pages": connected_pages,
        "message": f"Successfully validated Meta access token for user '{me_data.get('name')}'."
    }


@router.post("/update-credentials")
def update_credentials(request: UpdateCredentialsRequest):
    """Updates runtime credentials and processing engine without requiring server restart."""
    if request.meta_access_token:
        settings.META_ACCESS_TOKEN = request.meta_access_token.strip()
        settings.FACEBOOK_ACCESS_TOKEN = request.meta_access_token.strip()
        settings.INSTAGRAM_ACCESS_TOKEN = request.meta_access_token.strip()
    if request.facebook_page_id:
        settings.FACEBOOK_PAGE_ID = request.facebook_page_id.strip()
    if request.instagram_account_id:
        settings.INSTAGRAM_ACCOUNT_ID = request.instagram_account_id.strip()
    if request.processing_engine:
        if request.processing_engine.lower() in ("pandas", "spark"):
            settings.PROCESSING_ENGINE = request.processing_engine.lower()
        else:
            raise HTTPException(status_code=400, detail="Processing engine must be 'pandas' or 'spark'.")
            
    return {
        "status": "updated",
        "message": "Runtime configuration updated successfully.",
        "active_engine": settings.PROCESSING_ENGINE,
        "facebook_page_id": settings.FACEBOOK_PAGE_ID,
        "instagram_account_id": settings.INSTAGRAM_ACCOUNT_ID
    }

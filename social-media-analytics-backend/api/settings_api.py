"""
Settings & System Diagnostics API Router
Provides endpoints to test Facebook Meta Graph API credentials,
inspect permissions, review processing engine modes, and adjust alert thresholds.
"""
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional, Dict, Any
import urllib.request
import urllib.error
import urllib.parse
import json

from config import settings
from services.meta_graph import clear_cache as clear_meta_cache, urlopen as graph_urlopen
from services import social_service, facebook_token_service
from services.processing_engine import get_processing_engine
from utils import file_utils

router = APIRouter(prefix="/api/settings", tags=["Settings & Status"])


class UpdateCredentialsRequest(BaseModel):
    meta_access_token: Optional[str] = None
    facebook_page_id: Optional[str] = None
    processing_engine: Optional[str] = None  # 'pandas' or 'spark'


@router.get("/status")
def get_system_status():
    """Returns comprehensive health, integration statuses, and storage metrics."""
    try:
        fb_token = facebook_token_service.get_user_token()
        stored_token = facebook_token_service.has_stored_user_token()
    except facebook_token_service.FacebookTokenStoreError:
        fb_token, stored_token = False, False
    
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
            "token_configured": bool(fb_token),
            "token_source": "encrypted_sqlite" if stored_token else ("environment" if fb_token else "unconfigured"),
            "meta_api_version": getattr(settings, "META_API_VERSION", "v21.0"),
            "facebook_page_id": getattr(settings, "FACEBOOK_PAGE_ID", "me"),
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
    try:
        token = facebook_token_service.get_user_token()
    except facebook_token_service.FacebookTokenStoreError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    if not token:
        raise HTTPException(status_code=400, detail="No Meta Graph API access token configured in environment (.env).")

    clear_meta_cache()
        
    api_ver = getattr(settings, "META_API_VERSION", "v21.0")
    
    # 1. Test /me
    url_me = f"https://graph.facebook.com/{api_ver}/me?" + urllib.parse.urlencode({"fields": "id,name", "access_token": token})
    req = urllib.request.Request(url_me, headers={"User-Agent": "Mozilla/5.0"})
    
    try:
        with graph_urlopen(req, timeout=10) as resp:
            me_data = json.loads(resp.read().decode("utf-8"))
        from api.facebook import clear_page_token_cache
        clear_page_token_cache()
    except urllib.error.HTTPError as e:
        raw = e.read().decode("utf-8")
        try:
            payload = json.loads(raw)
            err = payload.get("error", {})
            code = err.get("code")
            msg = err.get("message", raw)
            if code == 4 or e.code == 429:
                retry_after = e.headers.get("Retry-After") if e.headers else None
                raise HTTPException(status_code=429, detail={
                    "message": "Meta has temporarily rate-limited this app. Please wait before retrying.",
                    "meta_code": 4, "retry_after_seconds": retry_after,
                    "rate_limit_source": payload.get("rate_limit_source") or (e.headers.get("X-Projecti-Meta-Rate-Limit-Source") if e.headers else None),
                }, headers={"Retry-After": str(retry_after)} if retry_after else None) from e
            if code == 190:
                from api.facebook import _mark_user_token_invalid
                _mark_user_token_invalid("Facebook authorization expired or was revoked. Replace the User Access Token in Settings.")
                raise HTTPException(
                    status_code=401,
                    detail=f"Facebook authorization has expired or been revoked (OAuthException 190): {msg}. Reconnect using a fresh User Access Token from the existing Meta app; expired tokens cannot be refreshed without renewed authorization."
                )
            raise HTTPException(status_code=e.code, detail=f"Meta API Error ({code}): {msg}")
        except json.JSONDecodeError:
            raise HTTPException(status_code=e.code, detail=raw)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Connection error: {str(e)}")

    # 2. Test /me/permissions
    permissions = []
    try:
        url_perm = f"https://graph.facebook.com/{api_ver}/me/permissions?" + urllib.parse.urlencode({"access_token": token})
        req_p = urllib.request.Request(url_perm, headers={"User-Agent": "Mozilla/5.0"})
        with graph_urlopen(req_p, timeout=10) as resp_p:
            perm_data = json.loads(resp_p.read().decode("utf-8"))
            permissions = [p["permission"] for p in perm_data.get("data", []) if p.get("status") == "granted"]
    except Exception:
        pass

    # 3. List Facebook Pages accessible to this token.
    connected_pages = []
    try:
        url_pages = f"https://graph.facebook.com/{api_ver}/me/accounts?" + urllib.parse.urlencode({"fields": "id,name,access_token,tasks", "limit": 100, "access_token": token})
        req_pages = urllib.request.Request(url_pages, headers={"User-Agent": "Mozilla/5.0"})
        with graph_urlopen(req_pages, timeout=10) as resp_pg:
            pages_res = json.loads(resp_pg.read().decode("utf-8"))
            for p in pages_res.get("data", []):
                page_id = str(p.get("id") or "")
                if page_id and p.get("access_token"):
                    from api.facebook import ACTIVE_PAGE_STATE
                    ACTIVE_PAGE_STATE["page_tokens"][page_id] = p["access_token"]
                connected_pages.append({
                    "page_id": p.get("id"),
                    "page_name": p.get("name"),
                    "page_token_available": bool(p.get("access_token")),
                    "tasks": p.get("tasks", []),
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
            "pages_read_user_content": "pages_read_user_content" in permissions,
        },
        "connected_pages": connected_pages,
        "message": f"Successfully validated Meta access token for user '{me_data.get('name')}'."
    }


@router.post("/update-credentials")
def update_credentials(request: UpdateCredentialsRequest):
    """Encrypt and persist a replacement User token; refresh derived Page tokens."""
    if request.meta_access_token:
        try:
            facebook_token_service.store_user_token(request.meta_access_token.strip())
        except ValueError as exc:
            raise HTTPException(status_code=422, detail=str(exc)) from exc
        except facebook_token_service.FacebookTokenStoreError as exc:
            raise HTTPException(status_code=503, detail=str(exc)) from exc
        from api.facebook import clear_page_token_cache
        clear_page_token_cache()
    if request.facebook_page_id:
        settings.FACEBOOK_PAGE_ID = request.facebook_page_id.strip()
    if request.processing_engine:
        if request.processing_engine.lower() in ("pandas", "spark"):
            settings.PROCESSING_ENGINE = request.processing_engine.lower()
        else:
            raise HTTPException(status_code=400, detail="Processing engine must be 'pandas' or 'spark'.")
            
    return {
        "status": "updated",
        "message": "Configuration updated. The Facebook token is encrypted in SQLite and will survive backend restarts.",
        "facebook_token_source": "encrypted_sqlite" if request.meta_access_token else None,
        "active_engine": settings.PROCESSING_ENGINE,
        "facebook_page_id": settings.FACEBOOK_PAGE_ID,
    }

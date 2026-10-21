from fastapi import APIRouter, HTTPException
from typing import Any, Dict, List, Optional
from config import settings
import urllib.request
import urllib.error
import urllib.parse
import json
import pandas as pd
from services import model_service, dataset_service, social_service, hdfs_storage, facebook_token_service
from services.meta_graph import urlopen as graph_urlopen
from analytics import aspect_analysis
from utils import file_utils
import re
import hashlib
import hmac
import logging
from datetime import datetime, timezone, timedelta

POSITIVE_EMOJIS = {"👍", "❤️", "🔥", "😊", "😂", "😍", "🙌", "👏", "🎉", "😁", "🥰", "💪", "💕", "💖", "💯", "😎", "🤗", "🥳", "😇", "👌", "✌️", "💖", "💗", "💙", "💚", "💛", "💜"}
NEGATIVE_EMOJIS = {"👎", "😡", "😢", "😭", "💔", "😠", "🤬", "😞", "😔", "🤢", "🤮", "🤡", "💩", "👿", "🖕", "😒", "🙄", "😤"}

def classify_emoji_text(text: str) -> str:
    """Classify text that has no alphabetic characters based on emojis."""
    pos_count = 0
    neg_count = 0
    for char in text:
        if char in POSITIVE_EMOJIS:
            pos_count += 1
        elif char in NEGATIVE_EMOJIS:
            neg_count += 1
            
    if pos_count > neg_count:
        return "positive"
    elif neg_count > pos_count:
        return "negative"
    return "unknown"

router = APIRouter(prefix="/facebook", tags=["facebook"])
logger = logging.getLogger(__name__)
COMMENT_ANALYSIS_VERSION = "tfidf_nb_context_lexicon_v1"

def get_best_model_dataset_id():
    registry = file_utils.get_model_registry()
    if not registry:
        return None
    best_id = None
    max_rows = -1
    for d_id, entry in registry.items():
        rows = entry.get("metrics", {}).get("train_rows", 0)
        if rows > max_rows:
            max_rows = rows
            best_id = d_id
    return best_id


# In-memory runtime state for active selected Facebook Page and discovered Page Tokens
ACTIVE_PAGE_STATE = {
    "selected_page_id": None,
    "selected_page_name": None,
    "page_tokens": {}
}
_INVALID_USER_TOKEN_FINGERPRINT: Optional[str] = None
_INVALID_USER_TOKEN_MESSAGE: Optional[str] = None


def _token_fingerprint(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def _get_active_token(page_id: Optional[str] = None) -> str:
    """Return a Page token, refreshing the page-token cache from the current user token."""
    if page_id and page_id in ACTIVE_PAGE_STATE["page_tokens"]:
        return ACTIVE_PAGE_STATE["page_tokens"][page_id]
    user_token = _get_user_token()
    if user_token and page_id and page_id not in ("me", "None"):
        _discover_managed_pages(user_token)
        if page_id in ACTIVE_PAGE_STATE["page_tokens"]:
            return ACTIVE_PAGE_STATE["page_tokens"][page_id]
    return user_token


def _get_user_token() -> str:
    global _INVALID_USER_TOKEN_FINGERPRINT, _INVALID_USER_TOKEN_MESSAGE
    try:
        token = facebook_token_service.get_user_token()
    except facebook_token_service.FacebookTokenStoreError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    if token and _INVALID_USER_TOKEN_FINGERPRINT and hmac.compare_digest(
        _token_fingerprint(token), _INVALID_USER_TOKEN_FINGERPRINT
    ):
        raise HTTPException(status_code=401, detail=_INVALID_USER_TOKEN_MESSAGE or "Facebook authorization must be renewed in Settings.")
    return token


def _mark_user_token_invalid(message: str) -> None:
    global _INVALID_USER_TOKEN_FINGERPRINT, _INVALID_USER_TOKEN_MESSAGE
    try:
        token = facebook_token_service.get_user_token()
    except facebook_token_service.FacebookTokenStoreError:
        token = settings.FACEBOOK_ACCESS_TOKEN or settings.META_ACCESS_TOKEN or ""
    if token:
        _INVALID_USER_TOKEN_FINGERPRINT = _token_fingerprint(token)
        _INVALID_USER_TOKEN_MESSAGE = message


def clear_page_token_cache() -> None:
    """Invalidate all derived Page tokens after the configured user token changes."""
    global _INVALID_USER_TOKEN_FINGERPRINT, _INVALID_USER_TOKEN_MESSAGE
    ACTIVE_PAGE_STATE["page_tokens"].clear()
    _INVALID_USER_TOKEN_FINGERPRINT = None
    _INVALID_USER_TOKEN_MESSAGE = None
    from services.meta_graph import clear_cache
    clear_cache()


def _meta_rate_limit_exception(error: urllib.error.HTTPError, graph_error: Optional[Dict[str, Any]] = None):
    retry_after = error.headers.get("Retry-After") if error.headers else None
    return HTTPException(
        status_code=429,
        detail={"message": "Meta has temporarily rate-limited this app. Please wait before retrying.",
                "meta_code": 4, "retry_after_seconds": retry_after,
                "rate_limit_source": error.headers.get("X-Projecti-Meta-Rate-Limit-Source") if error.headers else "meta_graph"},
        headers={"Retry-After": str(retry_after)} if retry_after else None,
    )


def _discover_managed_pages(token: str) -> List[Dict[str, Any]]:
    """Discovers Facebook Pages managed by the authenticated user via /me/accounts."""
    if not token:
        return []
    version = getattr(settings, "META_API_VERSION", "v21.0")
    query = urllib.parse.urlencode({"fields": "id,name,category,access_token,tasks,followers_count,fan_count", "access_token": token, "limit": 100})
    url = f"https://graph.facebook.com/{version}/me/accounts?{query}"
    req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'})
    try:
        with graph_urlopen(req, timeout=12) as response:
            data = json.loads(response.read().decode("utf-8"))
            pages = []
            while True:
                pages.extend(data.get("data", []))
                for p in data.get("data", []):
                    pid = str(p.get("id"))
                    ptoken = p.get("access_token")
                    if pid and ptoken:
                        ACTIVE_PAGE_STATE["page_tokens"][pid] = ptoken
                next_url = (data.get("paging") or {}).get("next")
                if not next_url:
                    break
                req = urllib.request.Request(next_url, headers={"User-Agent": "Projecti Facebook Analytics"})
                with graph_urlopen(req, timeout=12) as response:
                    data = json.loads(response.read().decode("utf-8"))
            return pages
    except urllib.error.HTTPError as exc:
        try:
            info = json.loads(exc.read().decode("utf-8")).get("error", {})
        except (ValueError, UnicodeDecodeError):
            info = {}
        if info.get("code") == 4 or exc.code == 429:
            raise _meta_rate_limit_exception(exc, info) from exc
        return []
    except Exception:
        return []


@router.get("/pages")
def get_facebook_pages(refresh: bool = False):
    """Discovers and returns all Facebook Pages accessible with the configured token,
    with special verification for 'Social Media Sentiment Test Page'."""
    token = _get_user_token()
    if refresh:
        from services.meta_graph import clear_cache
        clear_cache()
    if not token:
        return {
            "connected": False,
            "status": "unconfigured",
            "message": "Facebook access token is not configured in .env",
            "pages": [],
            "selected_page": None,
            "test_page_found": False
        }

    # Query Meta Graph API /me/accounts
    version = getattr(settings, "META_API_VERSION", "v21.0")
    query = urllib.parse.urlencode({"fields": "id,name,category,access_token,tasks,followers_count,fan_count", "access_token": token, "limit": 100})
    url = f"https://graph.facebook.com/{version}/me/accounts?{query}"
    req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'})
    try:
        with graph_urlopen(req, timeout=12) as response:
            data = json.loads(response.read().decode("utf-8"))
            raw_pages = data.get("data", [])
            
            pages_list = []
            test_page_found = False
            test_page_obj = None

            for p in raw_pages:
                pid = str(p.get("id"))
                pname = p.get("name", "Unnamed Page")
                ptoken = p.get("access_token")
                if pid and ptoken:
                    ACTIVE_PAGE_STATE["page_tokens"][pid] = ptoken
                    
                is_test = "social media sentiment" in pname.lower() or "sentiment test" in pname.lower()
                if is_test:
                    test_page_found = True
                    test_page_obj = {"id": pid, "name": pname}

                pages_list.append({
                    "id": pid,
                    "name": pname,
                    "category": p.get("category", "General"),
                    "followers_count": p.get("followers_count", 0),
                    "tasks": p.get("tasks", []),
                    "has_page_token": bool(ptoken),
                    "is_test_page": is_test
                })

            # Auto-select test page if found, or first page, or keep existing
            if not ACTIVE_PAGE_STATE["selected_page_id"]:
                if test_page_obj:
                    ACTIVE_PAGE_STATE["selected_page_id"] = test_page_obj["id"]
                    ACTIVE_PAGE_STATE["selected_page_name"] = test_page_obj["name"]
                elif pages_list:
                    ACTIVE_PAGE_STATE["selected_page_id"] = pages_list[0]["id"]
                    ACTIVE_PAGE_STATE["selected_page_name"] = pages_list[0]["name"]

            return {
                "connected": True,
                "status": "active",
                "count": len(pages_list),
                "pages": pages_list,
                "selected_page_id": ACTIVE_PAGE_STATE["selected_page_id"],
                "selected_page_name": ACTIVE_PAGE_STATE["selected_page_name"],
                "test_page_found": test_page_found,
                "message": (
                    f"Discovered {len(pages_list)} Facebook Page(s). "
                    + ("'Social Media Sentiment Test Page' verified." if test_page_found else "Specific test page not found in /me/accounts.")
                )
            }

    except urllib.error.HTTPError as e:
        raw = e.read().decode("utf-8")
        try:
            err = json.loads(raw).get("error", {})
            code = err.get("code")
            subcode = err.get("error_subcode")
            msg = err.get("message", raw)
            if code == 4 or e.code == 429:
                raise _meta_rate_limit_exception(e, err) from e
            if code == 190:
                _mark_user_token_invalid("Facebook authorization expired or was revoked. Replace the User Access Token in Settings, then select the Page again.")
            status_label = "token_expired" if code == 190 else "error"
            return {
                "connected": False,
                "status": status_label,
                "error_code": code,
                "error_subcode": subcode,
                "error_message": msg,
                "pages": [],
                "selected_page": None,
                "test_page_found": False,
                "action_required": "Please generate a new User Access Token in Meta Graph API Explorer with permissions: 'pages_show_list', 'pages_read_engagement', and 'pages_manage_posts'."
            }
        except HTTPException:
            raise
        except Exception:
            return {"connected": False, "status": "error", "error_message": raw, "pages": []}
    except Exception as e:
        return {"connected": False, "status": "error", "error_message": str(e), "pages": []}


@router.post("/select-page")
def select_facebook_page(page_id: str, page_name: Optional[str] = None):
    """Sets the currently active Facebook Page for post retrieval and sentiment analysis."""
    ACTIVE_PAGE_STATE["selected_page_id"] = str(page_id)
    if page_name:
        ACTIVE_PAGE_STATE["selected_page_name"] = page_name
    return {
        "status": "success",
        "selected_page_id": ACTIVE_PAGE_STATE["selected_page_id"],
        "selected_page_name": ACTIVE_PAGE_STATE["selected_page_name"],
        "message": f"Active Facebook Page set to ID: {page_id}"
    }


@router.get("/status")
def get_facebook_status(refresh: bool = False):
    if refresh:
        from services.meta_graph import clear_cache
        clear_cache()
    token = _get_user_token()
    sync_info = social_service.get_sync_statuses().get("facebook", {})
    if not token:
        return {
            "connected": False,
            "configured": False,
            "status": "unconfigured",
            "message": "Facebook access token is not configured in .env",
            "last_sync": sync_info.get("last_sync"),
            "target_test_page": "Social Media Sentiment Test Page"
        }
    
    # 1. First test token validity via /me
    version = getattr(settings, "META_API_VERSION", "v21.0")
    me_url = f"https://graph.facebook.com/{version}/me?" + urllib.parse.urlencode({"fields": "id,name", "access_token": token})
    req = urllib.request.Request(me_url, headers={'User-Agent': 'Mozilla/5.0'})
    try:
        with graph_urlopen(req, timeout=10) as response:
            user_data = json.loads(response.read().decode("utf-8"))
            
            # 2. Discover pages and check access to 'Social Media Sentiment Test Page'
            pages = _discover_managed_pages(token)
            test_page = next((p for p in pages if "sentiment" in p.get("name", "").lower()), None)
            
            selected_id = ACTIVE_PAGE_STATE["selected_page_id"] or (test_page["id"] if test_page else (pages[0]["id"] if pages else None))
            selected_name = ACTIVE_PAGE_STATE["selected_page_name"] or (test_page["name"] if test_page else (pages[0]["name"] if pages else None))
            
            return {
                "connected": True,
                "configured": True,
                "status": "active",
                "user": user_data,
                "managed_pages_count": len(pages),
                "target_test_page": "Social Media Sentiment Test Page",
                "test_page_accessible": bool(test_page),
                "test_page_details": {"id": test_page["id"], "name": test_page["name"]} if test_page else None,
                "selected_page_id": selected_id,
                "selected_page_name": selected_name,
                "last_sync": sync_info.get("last_sync"),
                "message": (
                    f"Connected as {user_data.get('name')}. "
                    + (f"Access to '{test_page['name']}' verified." if test_page else f"Found {len(pages)} managed page(s).")
                )
            }
    except urllib.error.HTTPError as e:
        raw = e.read().decode("utf-8")
        try:
            err = json.loads(raw).get("error", {})
            code = err.get("code")
            subcode = err.get("error_subcode")
            msg = err.get("message", raw)
            if code == 4 or e.code == 429:
                raise _meta_rate_limit_exception(e, err) from e
            if code == 190:
                _mark_user_token_invalid("Facebook authorization expired or was revoked. Replace the User Access Token in Settings, then select the Page again.")
            return {
                "connected": False,
                "configured": True,
                "status": "token_expired" if code == 190 and subcode == 463 else ("token_invalid" if code == 190 else ("permission_error" if code in (10, 200) else "error")),
                "error_code": code,
                "error_subcode": subcode,
                "error_message": msg,
                "target_test_page": "Social Media Sentiment Test Page",
                "last_sync": sync_info.get("last_sync"),
                "action_required": "Reconnect Facebook in Settings. Create a fresh User Access Token for the existing Meta app with pages_show_list, pages_read_engagement, and pages_read_user_content, update it in Settings, then test the connection."
            }
        except HTTPException:
            raise
        except Exception:
            return {"connected": False, "configured": True, "status": "error", "error_message": raw}
    except Exception as e:
        return {"connected": False, "configured": True, "status": "error", "error_message": str(e)}


@router.get("/posts")
def get_facebook_posts(page_id: Optional[str] = None, allow_cached: bool = False, refresh: bool = False):
    """Fetches real posts exclusively from the selected Facebook Page.
    Never silently falls back to sample data on API error unless allow_cached=True is explicitly requested."""
    user_token = _get_user_token()
    if refresh:
        from services.meta_graph import clear_cache
        clear_cache()
    if not user_token:
        if allow_cached:
            stored = social_service.get_social_posts(platform="facebook", account_id=page_id, include_sample=True, limit=50)
            if stored:
                return [{"id": p["id"], "message": p["text"], "created_time": p["created_time"], "comments_count": p["comments_count"], "likes_count": p["likes_count"], "shares_count": p.get("shares_count"), "is_cached": True} for p in stored]
        raise HTTPException(status_code=401, detail="Facebook access token is missing or not configured in .env.")
    
    # Resolve target page_id
    target_page_id = page_id or ACTIVE_PAGE_STATE["selected_page_id"] or getattr(settings, "FACEBOOK_PAGE_ID", "me")
    
    # If target_page_id is 'me', attempt to resolve to discovered Page
    if target_page_id == "me":
        pages = _discover_managed_pages(user_token)
        test_page = next((p for p in pages if "sentiment" in p.get("name", "").lower()), None)
        if test_page:
            target_page_id = str(test_page["id"])
            ACTIVE_PAGE_STATE["selected_page_id"] = target_page_id
            ACTIVE_PAGE_STATE["selected_page_name"] = test_page.get("name")
        elif pages:
            target_page_id = str(pages[0]["id"])
            ACTIVE_PAGE_STATE["selected_page_id"] = target_page_id
            ACTIVE_PAGE_STATE["selected_page_name"] = pages[0].get("name")
            
    # Resolve effective token (use Page Access Token if discovered)
    effective_token = _get_active_token(target_page_id)
    url = f"https://graph.facebook.com/v21.0/{target_page_id}/posts?fields=id,message,created_time,comments.summary(true),reactions.summary(true),shares&access_token={effective_token}"
    
    all_posts = []
    
    try:
        while url:
            req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'})
            with graph_urlopen(req, timeout=12) as response:
                data = json.loads(response.read().decode("utf-8"))
                
                for post in data.get("data", []):
                    comments_summary = post.get("comments", {}).get("summary", {})
                    reactions_summary = post.get("reactions", {}).get("summary", {})
                    comments_count = comments_summary.get("total_count")
                    likes_count = reactions_summary.get("total_count")
                    shares_count = post.get("shares", {}).get("count") if isinstance(post.get("shares"), dict) else None
                    clean_post = {
                        "id": post.get("id"),
                        "message": post.get("message", ""),
                        "created_time": post.get("created_time"),
                        "comments_count": comments_count,
                        "likes_count": likes_count,
                        "shares_count": shares_count,
                        "page_id": target_page_id
                    }
                    all_posts.append(clean_post)
                
                paging = data.get("paging", {})
                url = paging.get("next")
                
        return all_posts
        
    except urllib.error.HTTPError as e:
        error_msg = e.read().decode("utf-8")
        if allow_cached:
            stored = social_service.get_social_posts(platform="facebook", account_id=target_page_id, include_sample=True, limit=50)
            if stored:
                return [{"id": p["id"], "message": p["text"], "created_time": p["created_time"], "comments_count": p["comments_count"], "likes_count": p["likes_count"], "shares_count": p.get("shares_count"), "is_cached": True} for p in stored]
        try:
            error_data = json.loads(error_msg)
            err = error_data.get("error", {})
            fb_error = err.get("message", str(e))
            code = err.get("code")
            if code == 4 or e.code == 429:
                raise _meta_rate_limit_exception(e, err) from e
            if code == 190 and err.get("error_subcode") == 463:
                detail = f"Facebook access token expired (OAuthException 190/463): {fb_error}. Reconnect in Settings with a fresh User Access Token from the existing Meta app; Meta cannot refresh this expired session without renewed authorization."
                _mark_user_token_invalid("Facebook authorization expired (OAuthException 190/463). Replace the User Access Token in Settings; the expired session cannot be refreshed without renewed authorization.")
            elif code == 190:
                detail = f"Facebook access token is invalid or revoked (OAuthException 190): {fb_error}. Reconnect in Settings with a fresh token from the existing Meta app."
                _mark_user_token_invalid("Facebook authorization is invalid or revoked. Replace the User Access Token in Settings.")
            else:
                detail = f"Facebook API error ({code}): {fb_error}"
        except json.JSONDecodeError:
            detail = f"Facebook API error ({e.code}): {error_msg}"
            
        raise HTTPException(status_code=e.code, detail=detail)
    except Exception as e:
        if allow_cached:
            stored = social_service.get_social_posts(platform="facebook", account_id=target_page_id, include_sample=True, limit=50)
            if stored:
                return [{"id": p["id"], "message": p["text"], "created_time": p["created_time"], "comments_count": p["comments_count"], "likes_count": p["likes_count"], "shares_count": p.get("shares_count"), "is_cached": True} for p in stored]
        raise HTTPException(status_code=500, detail=f"An unexpected error occurred while fetching Facebook posts: {str(e)}")


@router.post("/analyze")
def analyze_facebook_posts(page_id: Optional[str] = None, refresh: bool = True):
    """Fetches live posts from the selected Facebook Page and runs the real sentiment analysis pipeline.
    Never silently substitutes sample data on failure."""
    target_page_id = page_id or ACTIVE_PAGE_STATE["selected_page_id"] or getattr(settings, "FACEBOOK_PAGE_ID", "me")
    target_page_name = ACTIVE_PAGE_STATE["selected_page_name"] or "Facebook Page"

    # Fetch real live posts from Facebook API
    posts = get_facebook_posts(page_id=target_page_id, allow_cached=False, refresh=refresh)
    if not posts:
        raise HTTPException(status_code=404, detail="No posts found on the selected Facebook Page to analyze.")

    # Filter out posts without text
    valid_posts = [p for p in posts if p.get("message", "").strip()]
    if not valid_posts:
        raise HTTPException(status_code=404, detail="No posts with text content found on this Facebook Page.")

    best_dataset_id = get_best_model_dataset_id()
    if not best_dataset_id:
        raise HTTPException(status_code=400, detail="Sentiment model is not trained yet. Please train or load a model.")

    texts = [p["message"] for p in valid_posts]
    
    try:
        prediction_result = model_service.predict_texts(best_dataset_id, texts)
        predictions = prediction_result.get("predictions", [])
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error running model prediction on Facebook post text: {str(e)}")

    positive_count = 0
    negative_count = 0
    analyzed_posts = []
    storage = {"status": "disabled", "records_written": 0, "verified": False,
               "message": "HDFS is not configured; Facebook records remain saved in SQLite."}
    hdfs_status = hdfs_storage.check_status()
    if hdfs_status["available"]:
        storage = {"status": "stored", "records_written": 0, "verified": True, "files": []}
    elif hdfs_status["configured"]:
        storage = {"status": "failed", "records_written": 0, "verified": False,
                   "message": hdfs_status["message"], "sqlite_preserved": True}
    
    for i, post in enumerate(valid_posts):
        pred_info = predictions[i]
        sentiment = pred_info.get("predicted_sentiment", "unknown")
        
        s_lower = str(sentiment).lower()
        if "positive" in s_lower or s_lower == "4":
            sentiment = "positive"
            positive_count += 1
        elif "negative" in s_lower or s_lower == "0":
            sentiment = "negative"
            negative_count += 1
        else:
            if s_lower == "2" or "neutral" in s_lower:
                sentiment = "neutral"
                
        post_record = {
            "id": post["id"],
            "platform": "facebook",
            "account_id": str(target_page_id),
            "account_name": target_page_name,
            "author": target_page_name,
            "text": post["message"],
            "created_time": post["created_time"],
            "comments_count": post.get("comments_count", 0),
            "likes_count": post.get("likes_count", 0),
            "shares_count": post.get("shares_count"),
            "sentiment": sentiment,
            "sentiment_confidence": pred_info.get("confidence", 0.0),
            "is_sample": 0  # Real live post from Facebook Graph API
        }
        social_service.upsert_post(post_record)
        if storage["status"] == "stored":
            try:
                exported = hdfs_storage.export_record("post", post_record)
                storage["records_written"] += 1
                storage["files"].extend([exported["raw_path"], exported["processed_path"]])
            except hdfs_storage.HDFSStorageError as exc:
                storage["status"] = "failed"
                storage["verified"] = False
                storage["message"] = str(exc)
                storage["sqlite_preserved"] = True
        analyzed_posts.append({
            "id": post["id"],
            "message": post["message"],
            "created_time": post["created_time"],
            "comments_count": post.get("comments_count", 0),
            "likes_count": post.get("likes_count", 0),
            "shares_count": post.get("shares_count"),
            "sentiment": sentiment,
            "prediction": pred_info.get("confidence"),
            "page_id": target_page_id
        })

    social_service.update_sync_status("facebook", "analyzed", len(analyzed_posts))

    total_fetched = len(posts)
    posts_analyzed = len(valid_posts)
    pos_pct = round((positive_count / posts_analyzed) * 100, 2) if posts_analyzed > 0 else 0.0
    neg_pct = round((negative_count / posts_analyzed) * 100, 2) if posts_analyzed > 0 else 0.0

    return {
        "page_id": target_page_id,
        "page_name": target_page_name,
        "summary": {
            "total_posts_fetched": total_fetched,
            "posts_analyzed": posts_analyzed,
            "positive_count": positive_count,
            "negative_count": negative_count,
            "positive_percentage": pos_pct,
            "negative_percentage": neg_pct
        },
        "analyzed_posts": analyzed_posts,
        "hdfs_storage": storage
    }


@router.post("/load-demo")
def load_demo_data():
    """Explicitly loads sample demo data for demonstration purposes."""
    social_service.seed_sample_facebook_data()
    return {
        "status": "success",
        "message": "Demo sample data loaded successfully. Switch to live mode anytime by clicking 'Clear Demo Data'."
    }


@router.post("/clear-demo")
def clear_demo_data():
    """Explicitly removes sample demo data while preserving real live records."""
    social_service.clear_sample_data()
    return {
        "status": "success",
        "message": "Demo sample data removed. Now viewing live data only."
    }



COMMENT_SYNC_INTERVAL = timedelta(minutes=15)
COMMENT_FIELDS = "id,message,created_time,from,like_count"


def _facebook_comment_error(error: urllib.error.HTTPError) -> HTTPException:
    raw = error.read().decode("utf-8", errors="replace")
    try:
        info = json.loads(raw).get("error", {})
        message = info.get("message", raw or str(error))
        code = info.get("code")
        subcode = info.get("error_subcode")
    except (ValueError, AttributeError):
        message, code = raw or str(error), None
    if code == 190 and subcode == 463:
        status, prefix = 401, "Facebook access token expired"
    elif code == 190:
        status, prefix = 401, "Facebook access token invalid or revoked"
    elif code in (4, 17, 32, 613):  # Meta throttling codes
        status, prefix = 429, "Facebook API rate limit reached"
    elif code in (10, 200):
        status, prefix = 403, "Facebook denied access to comments or replies"
    elif code == 100:
        status, prefix = 404, "Facebook post is unsupported, unavailable, or inaccessible to this Page token"
    else:
        status, prefix = (error.code if 400 <= error.code < 500 else 502), "Facebook API error"
    if status == 429:
        retry_after = error.headers.get("Retry-After") if error.headers else None
        source = error.headers.get("X-Projecti-Meta-Rate-Limit-Source") if error.headers else None
        return HTTPException(status_code=status, detail={"message": f"Meta temporarily rate-limited this app. Please wait before retrying. {message}", "meta_code": code, "retry_after_seconds": retry_after, "rate_limit_source": source or "meta_graph"}, headers={"Retry-After": str(retry_after)} if retry_after else None)
    return HTTPException(status_code=status, detail=f"{prefix}: {message}")


def _fetch_comment_pages(url: str, parent_id: str, replies_to: Optional[str] = None, refresh: bool = False) -> List[Dict[str, Any]]:
    records = []
    page_count = 0
    while url:
        page_count += 1
        if page_count > 1000:
            raise HTTPException(status_code=502, detail="Facebook comment pagination exceeded the safety limit.")
        request_headers = {"User-Agent": "Projecti Facebook Analytics"}
        if refresh:
            request_headers["Cache-Control"] = "no-cache"
        req = urllib.request.Request(url, headers=request_headers)
        with graph_urlopen(req, timeout=20) as response:
            data = json.loads(response.read().decode("utf-8"))
        for raw_comment in data.get("data", []):
            cid = raw_comment.get("id")
            if not cid:
                continue
            author_data = raw_comment.get("from") or {}
            records.append({
                "id": str(cid), "post_id": str(parent_id), "reply_to_comment_id": replies_to,
                "message": raw_comment.get("message") or "", "created_time": raw_comment.get("created_time"),
                "author": author_data.get("name") or "Unknown", "like_count": raw_comment.get("like_count")
            })
        url = (data.get("paging") or {}).get("next")
    return records


def _fetch_facebook_comments(post_id: str, refresh: bool = False) -> List[Dict[str, Any]]:
    token = _get_active_token(ACTIVE_PAGE_STATE.get("selected_page_id") or post_id.split("_", 1)[0])
    if not token:
        raise HTTPException(status_code=401, detail="Facebook access token is missing or not configured.")
    version = getattr(settings, "META_API_VERSION", "v21.0")
    base = f"https://graph.facebook.com/{version}/{post_id}/comments"
    query = urllib.parse.urlencode({"fields": COMMENT_FIELDS, "limit": 100, "access_token": token})
    try:
        comments = _fetch_comment_pages(f"{base}?{query}", post_id, refresh=refresh)
        reply_warning = None
        # Replies use the official Comment /comments edge. Keep each reply linked
        # to its parent comment while retaining the Facebook post ID.
        for parent in list(comments):
            reply_url = f"https://graph.facebook.com/{version}/{parent['id']}/comments?{query}"
            try:
                comments.extend(_fetch_comment_pages(reply_url, post_id, replies_to=parent["id"], refresh=refresh))
            except urllib.error.HTTPError as exc:
                # Permissions may allow top-level comments but not replies. Make
                # that limitation explicit instead of losing the comments fetched.
                if exc.code in (400, 403):
                    reply_warning = "Facebook did not permit reading replies for at least one comment. Top-level comments were retained."
                    continue
                raise
        unique = {comment["id"]: comment for comment in comments}
        return list(unique.values()), reply_warning
    except urllib.error.HTTPError as exc:
        api_error = _facebook_comment_error(exc)
        if api_error.status_code == 401:
            _mark_user_token_invalid(api_error.detail)
        raise api_error from exc
    except (urllib.error.URLError, TimeoutError) as exc:
        raise HTTPException(status_code=502, detail=f"Facebook comments could not be reached: {exc}") from exc
    except (ValueError, KeyError) as exc:
        raise HTTPException(status_code=502, detail=f"Facebook returned an invalid comments response: {exc}") from exc


def _sync_facebook_comments(post_id: str, force: bool = False) -> Dict[str, Any]:
    sync = social_service.get_comment_sync(post_id)
    if not force and sync and sync.get("last_synced_at"):
        try:
            last = datetime.fromisoformat(sync["last_synced_at"])
            if datetime.now(timezone.utc) - last < COMMENT_SYNC_INTERVAL and sync.get("status") == "success":
                return {"synced": False, "cached": True, "last_synced_at": sync["last_synced_at"]}
        except ValueError:
            pass
    comments, reply_warning = _fetch_facebook_comments(post_id, refresh=force)
    fetched_at = datetime.now(timezone.utc).isoformat()
    for item in comments:
        social_service.upsert_comment({**item, "platform": "facebook", "text": item["message"], "fetched_at": fetched_at})
    social_service.set_comment_sync(post_id, "success")
    result = {"synced": True, "cached": False, "newly_seen": len(comments), "last_synced_at": fetched_at}
    if reply_warning:
        result["warning"] = reply_warning
    return result


def _comment_summary(comments: List[Dict[str, Any]]) -> Dict[str, Any]:
    counts = {label: sum(1 for item in comments if item.get("sentiment") == label)
              for label in ("positive", "negative", "neutral")}
    analyzed = sum(counts.values())
    unknown = sum(1 for item in comments if item.get("sentiment") == "unknown")
    if not analyzed:
        overall = "unknown"
    elif counts["positive"] == counts["negative"] == counts["neutral"]:
        overall = "mixed"
    else:
        max_count = max(counts.values())
        leaders = [label for label, count in counts.items() if count == max_count]
        overall = leaders[0] if len(leaders) == 1 else "mixed"
    return {
        "total_comments": len(comments), "comments_analyzed": analyzed,
        "unanalyzed_count": unknown, "positive_count": counts["positive"],
        "negative_count": counts["negative"], "neutral_count": counts["neutral"],
        "unknown_count": unknown, "overall_sentiment": overall,
        "positive_percentage": round(counts["positive"] * 100 / analyzed, 2) if analyzed else 0.0,
        "negative_percentage": round(counts["negative"] * 100 / analyzed, 2) if analyzed else 0.0,
        "neutral_percentage": round(counts["neutral"] * 100 / analyzed, 2) if analyzed else 0.0,
    }


@router.get("/posts/{post_id}/comments")
def get_facebook_post_comments(post_id: str, limit: int = 100, offset: int = 0, sync: bool = True):
    sync_info = {"synced": False, "cached": True}
    sample = social_service.is_sample_post(post_id)
    if sync and not sample:
        try:
            sync_info = _sync_facebook_comments(post_id)
        except HTTPException as exc:
            social_service.set_comment_sync(post_id, "error", str(exc.detail))
            # Existing cached data stays visible but carries a visible sync error.
            existing = social_service.get_social_comments(post_id, limit=1, include_sample=sample)
            if not existing:
                raise
            retry_after = exc.headers.get("Retry-After") if exc.headers else None
            sync_info = {"synced": False, "cached": True, "error": exc.detail,
                         "rate_limited": exc.status_code == 429, "retry_after_seconds": retry_after,
                         "rate_limit_source": exc.headers.get("X-Projecti-Meta-Rate-Limit-Source") if exc.headers else None}
    all_rows = social_service.get_social_comments(post_id, limit=100000, include_sample=sample)
    page = social_service.get_social_comments(post_id, limit=max(1, min(limit, 500)), offset=max(0, offset), include_sample=sample)
    return {"comments": page, "summary": _comment_summary(all_rows), "offset": max(0, offset),
            "limit": max(1, min(limit, 500)), "has_more": offset + len(page) < len(all_rows),
            "sync": sync_info}


@router.post("/posts/{post_id}/comments/analyze")
def analyze_facebook_post_comments(post_id: str, force_sync: bool = False, limit: int = 100, offset: int = 0):
    sample = social_service.is_sample_post(post_id)
    if sample:
        sync_info = {"synced": False, "cached": True, "sample_data": True}
    else:
        try:
            sync_info = _sync_facebook_comments(post_id, force=force_sync)
        except HTTPException as exc:
            social_service.set_comment_sync(post_id, "error", str(exc.detail))
            if not social_service.get_social_comments(post_id, limit=1, include_sample=sample):
                raise
            retry_after = exc.headers.get("Retry-After") if exc.headers else None
            sync_info = {"synced": False, "cached": True, "error": exc.detail,
                         "rate_limited": exc.status_code == 429, "retry_after_seconds": retry_after,
                         "rate_limit_source": exc.headers.get("X-Projecti-Meta-Rate-Limit-Source") if exc.headers else None}

    rows = social_service.get_social_comments(post_id, limit=100000, include_sample=sample)
    to_analyze = []
    for row in rows:
        digest = hashlib.sha256((row.get("text") or "").encode("utf-8")).hexdigest()
        if (row.get("text_hash") == digest and row.get("sentiment") != "unknown"
                and row.get("analysis_version") == COMMENT_ANALYSIS_VERSION):
            continue
        row["_text_hash"] = digest
        if any(character.isalpha() for character in (row.get("text") or "")):
            to_analyze.append(row)

    predictions_map = {}
    if to_analyze:
        dataset_id = get_best_model_dataset_id()
        if not dataset_id:
            raise HTTPException(status_code=400, detail="The existing sentiment model is not trained or available.")
        try:
            predictions = model_service.predict_texts(dataset_id, [row["text"] for row in to_analyze]).get("predictions", [])
        except Exception as exc:
            raise HTTPException(status_code=500, detail=f"Sentiment prediction failed: {exc}") from exc
        predictions_map = {row["id"]: prediction for row, prediction in zip(to_analyze, predictions)}

    now = datetime.now(timezone.utc).isoformat()
    export_records = []
    for row in rows:
        digest = row.get("_text_hash") or hashlib.sha256((row.get("text") or "").encode("utf-8")).hexdigest()
        prediction = predictions_map.get(row["id"])
        if prediction:
            raw = str(prediction.get("predicted_sentiment", "unknown")).lower()
            base_sentiment = "positive" if "positive" in raw or raw == "4" else "negative" if "negative" in raw or raw == "0" else "neutral" if "neutral" in raw or raw == "2" else "unknown"
            sentiment = aspect_analysis.classify_comment_sentiment(row.get("text") or "", base_sentiment)
            confidence = prediction.get("confidence")
            analyzed_at = now
        elif (row.get("text_hash") == digest and row.get("sentiment") != "unknown"
              and row.get("analysis_version") == COMMENT_ANALYSIS_VERSION):
            sentiment, confidence, analyzed_at = row["sentiment"], row.get("sentiment_confidence"), row.get("analyzed_at")
        elif row.get("text"):
            sentiment = classify_emoji_text(row["text"])
            confidence = None
            analyzed_at = now if sentiment != "unknown" else None
        else:
            sentiment, confidence, analyzed_at = "unknown", None, None
        record = {**row, "sentiment": sentiment, "sentiment_confidence": confidence or 0.0,
                  "text_hash": digest, "analysis_version": COMMENT_ANALYSIS_VERSION if sentiment != "unknown" else None,
                  "analyzed_at": analyzed_at, "fetched_at": row.get("fetched_at") or now}
        social_service.upsert_comment(record)
        if prediction or sentiment != row.get("sentiment") or row.get("text_hash") != digest:
            export_records.append(record)

    stored = social_service.get_social_comments(post_id, limit=100000, include_sample=sample)
    storage = {"status": "disabled", "files": [], "message": "HDFS is not configured; SQLite contains the comment records."}
    hdfs_status = hdfs_storage.check_status()
    if hdfs_status.get("configured") and not hdfs_status.get("available"):
        storage = {"status": "failed", "files": [], "message": hdfs_status.get("message"), "sqlite_preserved": True}
    elif hdfs_status.get("available"):
        storage = {"status": "stored", "files": []}
        try:
            for record in export_records:
                result = hdfs_storage.export_record("comment", record)
                storage["files"].extend([result["raw_path"], result["processed_path"]])
        except hdfs_storage.HDFSStorageError as exc:
            storage.update({"status": "failed", "message": str(exc), "sqlite_preserved": True})
    page_size = max(1, min(limit, 500))
    page_offset = max(0, offset)
    page = stored[page_offset:page_offset + page_size]
    return {"summary": _comment_summary(stored), "analyzed_comments": [
        {"id": row["id"], "post_id": row["post_id"], "message": row["text"], "created_time": row["created_time"],
         "author": row["author"] or "Unknown", "like_count": row["likes_count"],
         "reply_to_comment_id": row.get("reply_to_comment_id"), "sentiment": row["sentiment"],
         "prediction": row["sentiment_confidence"], "analyzed_at": row.get("analyzed_at")}
        for row in page], "offset": page_offset, "limit": page_size,
        "has_more": page_offset + len(page) < len(stored), "sync": sync_info, "hdfs_storage": storage}



def _facebook_graph_json(path: str, params: Dict[str, Any], token: str, refresh: bool = False):
    """Make a Graph request without ever logging its URL or access token."""
    version = getattr(settings, "META_API_VERSION", "v21.0")
    query = {**params, "access_token": token}
    url = f"https://graph.facebook.com/{version}/{path}?{urllib.parse.urlencode(query)}"
    headers = {"User-Agent": "Projecti Facebook Analytics"}
    if refresh:
        headers["Cache-Control"] = "no-cache"
    request = urllib.request.Request(url, headers=headers)
    try:
        with graph_urlopen(request, timeout=12) as response:
            return json.loads(response.read().decode("utf-8")), None
    except urllib.error.HTTPError as exc:
        try:
            payload = json.loads(exc.read().decode("utf-8"))
            error = payload.get("error", {})
            message = str(error.get("message") or "Facebook Graph API request failed")
        except (json.JSONDecodeError, UnicodeDecodeError):
            error = {}
            message = "Facebook Graph API returned an unreadable error response."
        # Defensive redaction in case Meta includes request details in its message.
        message = message.replace(token, "[redacted]")
        details = {
            "http_status": exc.code,
            "code": error.get("code"),
            "subcode": error.get("error_subcode"),
            "type": error.get("type"),
            "message": message,
            "retry_after_seconds": exc.headers.get("Retry-After") if exc.headers else None,
            "rate_limit_source": payload.get("rate_limit_source"),
        }
        logger.warning(
            "Facebook Graph request failed (code=%s, subcode=%s)",
            details["code"], details["subcode"],
        )
        return None, details
    except (urllib.error.URLError, TimeoutError, json.JSONDecodeError) as exc:
        logger.warning("Facebook Graph request unavailable (%s)", type(exc).__name__)
        return None, {"type": "temporary_error", "message": "Facebook Graph API could not be reached. Try again shortly."}


def _insight_error_status(error: Dict[str, Any], metric: str, version: str) -> Dict[str, Any]:
    code = error.get("code")
    message = str(error.get("message") or "")
    lowered = message.lower()
    if code == 190:
        return {"status": "token_invalid", "reason": "The Facebook token is expired or revoked. Reconnect Facebook in Settings."}
    if code in (10, 200) or "permission" in lowered or "insufficient" in lowered:
        return {"status": "permission_error", "reason": "Meta denied this metric. Verify the token has read_insights and pages_read_engagement and that the Page grants the ANALYZE task."}
    if code in (4, 17, 32, 613) or error.get("http_status") == 429:
        return {"status": "rate_limited", "reason": "Meta temporarily rate-limited this app. Please wait before retrying.", "retry_after_seconds": error.get("retry_after_seconds"), "rate_limit_source": error.get("rate_limit_source")}
    if "must be a valid insights metric" in lowered or "invalid metric" in lowered or code == 12:
        return {"status": "unsupported_metric", "reason": f"Meta does not support {metric} on Graph API {version}."}
    if "unsupported get request" in lowered or "does not exist" in lowered or "cannot be loaded" in lowered:
        return {"status": "post_unavailable", "reason": "This post is inaccessible, unavailable, or does not support Page insights."}
    return {"status": "api_error", "reason": message or "Meta could not return this metric."}


def _lifetime_metric_value(data: Dict[str, Any], metric: str):
    for item in data.get("data", []):
        if item.get("name") != metric:
            continue
        values = item.get("values") or []
        # For these post-level metrics, the metric-level period is authoritative.
        if item.get("period") == "lifetime" and values and "value" in values[0]:
            return values[0]["value"]
    return None


@router.get("/posts/{post_id}/insights")
def get_facebook_post_insights(post_id: str, refresh: bool = False):
    # Page post IDs are {page_id}_{post_id}; derive the token from this post,
    # even if the user has since selected another Page in the UI.
    page_id = post_id.split("_", 1)[0] if "_" in post_id else ACTIVE_PAGE_STATE.get("selected_page_id")
    token = _get_active_token(page_id)
    if not token:
        raise HTTPException(status_code=401, detail="Facebook access token is missing or not configured.")

    version = getattr(settings, "META_API_VERSION", "v21.0")
    metrics = {
        "media_views": {"label": "Media views", "metric": "post_media_view"},
        "unique_viewers": {"label": "Unique viewers", "metric": "post_total_media_view_unique"},
    }
    def fetch_graph(path, params):
        if refresh:
            return _facebook_graph_json(path, params, token, refresh=True)
        return _facebook_graph_json(path, params, token)

    result_metrics: Dict[str, Dict[str, Any]] = {}
    for key, definition in metrics.items():
        metric = definition["metric"]
        data, error = fetch_graph(f"{post_id}/insights", {"metric": metric})
        if error:
            issue = _insight_error_status(error, metric, version)
            if issue["status"] == "token_invalid":
                _mark_user_token_invalid(issue["reason"])
                raise HTTPException(status_code=401, detail=issue["reason"])
            result_metrics[key] = {**definition, "available": False, "value": None, **issue}
            # Do not compound a rate limit by making more insight calls.
            if issue["status"] == "rate_limited":
                for remaining_key, remaining in metrics.items():
                    result_metrics.setdefault(remaining_key, {
                        **remaining, "available": False, "value": None,
                        "status": "rate_limited", "reason": issue["reason"],
                    })
                break
            continue
        value = _lifetime_metric_value(data or {}, metric)
        if value is None:
            result_metrics[key] = {
                **definition, "available": False, "value": None,
                "status": "no_data", "reason": "Meta returned no lifetime value for this metric on this post.",
            }
        else:
            result_metrics[key] = {**definition, "available": True, "value": value, "status": "available", "period": "lifetime"}

    # Counts are separately useful engagement fields. Their absence is unknown,
    # not an invented zero; one failed engagement field does not erase insights.
    if any(metric.get("status") == "rate_limited" for metric in result_metrics.values()):
        rate_metric = next(metric for metric in result_metrics.values() if metric.get("status") == "rate_limited")
        raise HTTPException(status_code=429, detail={"message": rate_metric["reason"], "meta_code": 4, "retry_after_seconds": rate_metric.get("retry_after_seconds"), "rate_limit_source": rate_metric.get("rate_limit_source")}, headers={"Retry-After": str(rate_metric["retry_after_seconds"])} if rate_metric.get("retry_after_seconds") else None)
    post_data, post_error = fetch_graph(
        post_id,
        {"fields": "from,reactions.summary(total_count),comments.summary(total_count),shares"},
    )
    if post_error and (post_error.get("code") == 4 or post_error.get("http_status") == 429):
        retry_after = post_error.get("retry_after_seconds")
        raise HTTPException(status_code=429, detail={"message": "Meta temporarily rate-limited this app. Please wait before retrying.", "meta_code": 4, "retry_after_seconds": retry_after, "rate_limit_source": post_error.get("rate_limit_source")}, headers={"Retry-After": str(retry_after)} if retry_after else None)
    if post_error and post_error.get("code") == 190:
        reason = "The Facebook token is expired or revoked. Reconnect Facebook in Settings."
        _mark_user_token_invalid(reason)
        raise HTTPException(status_code=401, detail=reason)
    engagement_definitions = {
        "reactions": ("Reactions", (post_data or {}).get("reactions", {}).get("summary", {}).get("total_count")),
        "comments": ("Comments", (post_data or {}).get("comments", {}).get("summary", {}).get("total_count")),
        "shares": ("Shares", (post_data or {}).get("shares", {}).get("count")),
    }
    for key, (label, value) in engagement_definitions.items():
        if value is not None:
            result_metrics[key] = {"label": label, "available": True, "value": value, "status": "available"}
        else:
            if post_error:
                issue = _insight_error_status(post_error, key, version)
                reason, status = issue["reason"], issue["status"]
            else:
                reason, status = "Meta did not return this count for the post.", "no_data"
            result_metrics[key] = {"label": label, "available": False, "value": None, "status": status, "reason": reason}

    return {
        "post_id": post_id,
        "page_id": page_id,
        "api_version": version,
        "available": any(metric["available"] for metric in result_metrics.values()),
        "metrics": result_metrics,
        "source": "facebook_graph_api",
    }

@router.post("/import-dataset")
def import_facebook_as_dataset():
    posts = get_facebook_posts()
    if not posts:
        raise HTTPException(status_code=404, detail="No posts found to import.")

    data_rows = []
    
    # Process posts
    for post in posts:
        if post.get("message", "").strip():
            data_rows.append({
                "id": post.get("id"),
                "type": "Post",
                "text": post.get("message"),
                "created_time": post.get("created_time"),
                "likes": post.get("likes_count", 0)
            })
            
            # Fetch comments for this post if there are any
            if post.get("comments_count", 0) > 0:
                comments_response = get_facebook_post_comments(post.get("id"), limit=500, sync=True)
                for comment in comments_response["comments"]:
                    comment_text = comment.get("text") or comment.get("message") or ""
                    if comment_text.strip():
                        data_rows.append({
                            "id": comment.get("id"),
                            "type": "Comment",
                            "text": comment_text,
                            "created_time": comment.get("created_time"),
                            "likes": comment.get("like_count", 0)
                        })

    if not data_rows:
        raise HTTPException(status_code=404, detail="No text-based posts or comments found.")

    # Convert to DataFrame and to CSV bytes
    df = pd.DataFrame(data_rows)
    csv_bytes = df.to_csv(index=False).encode('utf-8')
    
    # Save via dataset_service
    try:
        entry = dataset_service.save_uploaded_csv(csv_bytes, "Facebook_Import.csv")
        return {
            "dataset_id": entry["dataset_id"],
            "filename": entry["original_filename"],
            "rows": entry["rows"],
            "columns": entry["columns"],
            "detected_mapping": entry["mapping"],
            "message": "Facebook data successfully imported as a dataset."
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to save Facebook dataset: {e}")

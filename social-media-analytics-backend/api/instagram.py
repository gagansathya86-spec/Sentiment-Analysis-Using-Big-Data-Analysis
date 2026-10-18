"""
Instagram Graph API Integration Router
Implements Instagram Professional/Business account integration via Meta Graph API.
Fetches media, comments, and engagement metrics, runs NLP sentiment analysis,
normalizes data, and enables dataset import into the Big Data pipeline.
"""
from fastapi import APIRouter, HTTPException, Query
from config import settings
import urllib.request
import urllib.error
import json
import re
from datetime import datetime, timezone
from typing import Dict, Any, List, Optional
import pandas as pd

from services import model_service, dataset_service, social_service
from utils import file_utils
from api.facebook import classify_emoji_text, get_best_model_dataset_id

router = APIRouter(prefix="/instagram", tags=["instagram"])


def _get_active_token() -> str:
    return (
        settings.INSTAGRAM_ACCESS_TOKEN
        or settings.META_ACCESS_TOKEN
        or settings.FACEBOOK_ACCESS_TOKEN
        or ""
    )


def _call_meta_graph(endpoint: str, token: str, params: Optional[Dict[str, str]] = None) -> Dict[str, Any]:
    """Helper to query Meta Graph API with comprehensive error parsing."""
    api_version = getattr(settings, "META_API_VERSION", "v21.0")
    query_str = f"access_token={token}"
    if params:
        for k, v in params.items():
            query_str += f"&{k}={urllib.parse.quote(str(v))}"
            
    url = f"https://graph.facebook.com/{api_version}/{endpoint.lstrip('/')}?{query_str}"
    
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"})
    try:
        with urllib.request.urlopen(req, timeout=12) as response:
            return json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        raw_err = e.read().decode("utf-8")
        try:
            err_json = json.loads(raw_err)
            fb_err = err_json.get("error", {})
            message = fb_err.get("message", str(e))
            code = fb_err.get("code")
            subcode = fb_err.get("error_subcode")
            
            # Actionable diagnostics
            if code == 190:
                if subcode == 463:
                    detail = f"Meta Token Expired (OAuthException 190/463): The configured access token has expired. Please generate a new User or Page Access Token from Meta Graph API Explorer."
                else:
                    detail = f"Invalid Meta Token (OAuthException 190): {message}"
            elif "permission" in message.lower() or code in (10, 200, 298):
                detail = f"Missing Meta Permission: {message}. Ensure 'instagram_basic', 'pages_show_list', and 'pages_read_engagement' are granted."
            else:
                detail = f"Meta Graph API error ({code}): {message}"
                
            raise HTTPException(status_code=e.code, detail=detail)
        except json.JSONDecodeError:
            raise HTTPException(status_code=e.code, detail=f"Meta API error ({e.code}): {raw_err}")
    except urllib.error.URLError as e:
        raise HTTPException(status_code=502, detail=f"Network error connecting to Meta Graph API: {str(e.reason)}")


def _resolve_instagram_account_id(token: str) -> Optional[Dict[str, Any]]:
    """Discovers connected Instagram Business Account via Facebook Page connection."""
    configured_id = getattr(settings, "INSTAGRAM_ACCOUNT_ID", "")
    if configured_id and configured_id.lower() != "auto":
        return {"id": configured_id, "username": "configured_account", "source": "config"}
        
    # Search via /me/accounts
    try:
        pages_data = _call_meta_graph("me/accounts", token, {
            "fields": "id,name,access_token,instagram_business_account{id,username,name,profile_picture_url,followers_count,media_count}"
        })
        for page in pages_data.get("data", []):
            ig_acc = page.get("instagram_business_account")
            if ig_acc and ig_acc.get("id"):
                return {
                    "id": ig_acc.get("id"),
                    "username": ig_acc.get("username", "instagram_user"),
                    "name": ig_acc.get("name", page.get("name")),
                    "profile_picture_url": ig_acc.get("profile_picture_url"),
                    "followers_count": ig_acc.get("followers_count", 0),
                    "media_count": ig_acc.get("media_count", 0),
                    "page_id": page.get("id"),
                    "page_name": page.get("name"),
                    "source": "facebook_page_link"
                }
    except Exception:
        pass
        
    return None


@router.get("/status")
def get_instagram_status():
    """Returns current Instagram connection status, token validity, and account info."""
    token = _get_active_token()
    sync_info = social_service.get_sync_statuses().get("instagram", {})
    
    if not token:
        return {
            "connected": False,
            "configured": False,
            "status": "unconfigured",
            "message": "No Meta / Instagram access token configured in environment (.env).",
            "account": None,
            "last_sync": sync_info.get("last_sync"),
            "required_permissions": ["instagram_basic", "pages_show_list", "pages_read_engagement", "instagram_manage_comments"]
        }
        
    # Test token with Meta API
    try:
        user_info = _call_meta_graph("me", token, {"fields": "id,name"})
        ig_account = _resolve_instagram_account_id(token)
        
        if ig_account:
            return {
                "connected": True,
                "configured": True,
                "status": "active",
                "meta_user": user_info,
                "account": ig_account,
                "api_flow": "Instagram Graph API via Facebook Page Link (Recommended)",
                "last_sync": sync_info.get("last_sync"),
                "message": f"Successfully connected to Instagram Professional Account @{ig_account.get('username')}"
            }
        else:
            return {
                "connected": False,
                "configured": True,
                "status": "no_linked_account",
                "meta_user": user_info,
                "account": None,
                "api_flow": "Instagram Graph API",
                "message": (
                    "Token is valid for Meta user, but no connected Instagram Professional/Business "
                    "account was found on any managed Facebook Pages. Ensure your Instagram account "
                    "is switched to Professional (Creator or Business) and linked to your Facebook Page."
                ),
                "setup_guide": [
                    "1. Open Instagram App -> Settings -> Account -> Switch to Professional Account.",
                    "2. Open Facebook Page -> Settings -> Linked Accounts -> Instagram -> Connect Account.",
                    "3. In Meta Graph API Explorer, select your Page and generate token with 'instagram_basic' and 'pages_show_list'."
                ],
                "last_sync": sync_info.get("last_sync")
            }
    except HTTPException as e:
        return {
            "connected": False,
            "configured": True,
            "status": "error",
            "error_detail": e.detail,
            "account": None,
            "last_sync": sync_info.get("last_sync")
        }


@router.get("/media")
def get_instagram_media(use_stored_if_offline: bool = Query(True)):
    """Fetches accessible Instagram media/posts."""
    token = _get_active_token()
    
    if not token:
        if use_stored_if_offline:
            stored = social_service.get_social_posts(platform="instagram", limit=50)
            if stored:
                return {"data": stored, "source": "stored_cache", "message": "Showing stored Instagram posts."}
        raise HTTPException(status_code=401, detail="Instagram access token is missing or not configured.")
        
    try:
        ig_acc = _resolve_instagram_account_id(token)
        if not ig_acc:
            if use_stored_if_offline:
                stored = social_service.get_social_posts(platform="instagram", limit=50)
                if stored:
                    return {"data": stored, "source": "stored_cache", "message": "Showing cached Instagram media."}
            raise HTTPException(status_code=404, detail="No connected Instagram Professional account found.")
            
        endpoint = f"{ig_acc['id']}/media"
        params = {
            "fields": "id,caption,media_type,media_url,permalink,timestamp,like_count,comments_count"
        }
        res = _call_meta_graph(endpoint, token, params)
        media_items = res.get("data", [])
        
        # Normalize items
        cleaned = []
        for m in media_items:
            cleaned.append({
                "id": m.get("id"),
                "platform": "instagram",
                "caption": m.get("caption", ""),
                "media_type": m.get("media_type", "IMAGE"),
                "media_url": m.get("media_url", ""),
                "permalink": m.get("permalink", ""),
                "created_time": m.get("timestamp"),
                "likes_count": m.get("like_count", 0),
                "comments_count": m.get("comments_count", 0),
                "author": ig_acc.get("username", "instagram_account")
            })
        return {"data": cleaned, "source": "meta_graph_api"}
    except HTTPException as e:
        if use_stored_if_offline:
            stored = social_service.get_social_posts(platform="instagram", limit=50)
            if stored:
                return {
                    "data": stored,
                    "source": "stored_cache",
                    "api_error": e.detail,
                    "message": "Live API unavailable (token expired or permission error). Displaying cached records."
                }
        raise e


@router.post("/analyze")
def analyze_instagram_media():
    """Runs NLP sentiment analysis pipeline on accessible Instagram media captions."""
    media_response = get_instagram_media(use_stored_if_offline=True)
    posts = media_response.get("data", [])
    
    if not posts:
        raise HTTPException(status_code=404, detail="No Instagram media items found to analyze.")
        
    valid_posts = [p for p in posts if (p.get("caption") or p.get("text", "")).strip()]
    if not valid_posts:
        raise HTTPException(status_code=404, detail="No Instagram posts with non-empty captions available.")
        
    best_dataset_id = get_best_model_dataset_id()
    if not best_dataset_id:
        raise HTTPException(status_code=400, detail="Sentiment model not trained yet. Train a model in Training Pipeline.")
        
    captions = [p.get("caption") or p.get("text", "") for p in valid_posts]
    
    try:
        pred_res = model_service.predict_texts(best_dataset_id, captions)
        predictions = pred_res.get("predictions", [])
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Model prediction failed: {str(e)}")
        
    positive_count = 0
    negative_count = 0
    neutral_count = 0
    
    analyzed_posts = []
    for i, post in enumerate(valid_posts):
        pred_info = predictions[i]
        sentiment_label = pred_info.get("predicted_sentiment", "unknown").lower()
        confidence = pred_info.get("confidence", 0.0)
        
        if "positive" in sentiment_label or sentiment_label == "4":
            sentiment = "positive"
            positive_count += 1
        elif "negative" in sentiment_label or sentiment_label == "0":
            sentiment = "negative"
            negative_count += 1
        else:
            sentiment = "neutral"
            neutral_count += 1
            
        post_record = {
            "id": post.get("id"),
            "platform": "instagram",
            "account_name": post.get("author", "instagram"),
            "author": post.get("author", "instagram"),
            "text": post.get("caption") or post.get("text", ""),
            "media_type": post.get("media_type", "IMAGE"),
            "permalink": post.get("permalink", ""),
            "created_time": post.get("created_time"),
            "likes_count": post.get("likes_count", 0),
            "comments_count": post.get("comments_count", 0),
            "shares_count": 0,
            "sentiment": sentiment,
            "sentiment_confidence": confidence,
            "is_sample": post.get("is_sample", 0)
        }
        
        # Save to SQLite unified social database
        social_service.upsert_post(post_record)
        analyzed_posts.append(post_record)
        
    total_analyzed = len(analyzed_posts)
    social_service.update_sync_status("instagram", "analyzed", total_analyzed)
    
    return {
        "summary": {
            "total_posts_fetched": len(posts),
            "posts_analyzed": total_analyzed,
            "positive_count": positive_count,
            "negative_count": negative_count,
            "neutral_count": neutral_count,
            "positive_percentage": round((positive_count / max(total_analyzed, 1)) * 100, 1),
            "negative_percentage": round((negative_count / max(total_analyzed, 1)) * 100, 1),
            "neutral_percentage": round((neutral_count / max(total_analyzed, 1)) * 100, 1)
        },
        "analyzed_posts": analyzed_posts
    }


@router.get("/media/{media_id}/comments")
def get_instagram_comments(media_id: str):
    """Fetches comments for an Instagram media item."""
    token = _get_active_token()
    if not token:
        # Fallback to stored comments
        comments = social_service.get_social_comments(post_id=media_id)
        if comments:
            return comments
        raise HTTPException(status_code=401, detail="Instagram access token is missing or not configured.")
        
    try:
        endpoint = f"{media_id}/comments"
        params = {"fields": "id,text,timestamp,username,like_count"}
        res = _call_meta_graph(endpoint, token, params)
        comments = []
        for c in res.get("data", []):
            comments.append({
                "id": c.get("id"),
                "post_id": media_id,
                "platform": "instagram",
                "message": c.get("text", ""),
                "author": c.get("username", "instagram_user"),
                "created_time": c.get("timestamp"),
                "like_count": c.get("like_count", 0)
            })
        return comments
    except HTTPException as e:
        # Check stored cache
        comments = social_service.get_social_comments(post_id=media_id)
        if comments:
            return comments
        raise e


@router.post("/media/{media_id}/comments/analyze")
def analyze_instagram_comments(media_id: str):
    """Analyzes sentiment for Instagram post comments."""
    comments = get_instagram_comments(media_id)
    if not comments:
        return {
            "summary": {"total_comments": 0, "comments_analyzed": 0, "positive_count": 0, "negative_count": 0, "positive_percentage": 0.0, "negative_percentage": 0.0},
            "analyzed_comments": []
        }
        
    best_dataset_id = get_best_model_dataset_id()
    text_comments = [c for c in comments if re.search(r"[a-zA-Z]", c.get("message", "") or c.get("text", ""))]
    
    predictions_map = {}
    if text_comments and best_dataset_id:
        texts = [c.get("message") or c.get("text", "") for c in text_comments]
        try:
            pred_res = model_service.predict_texts(best_dataset_id, texts)
            for i, c in enumerate(text_comments):
                predictions_map[c["id"]] = pred_res["predictions"][i]
        except Exception:
            pass
            
    positive_count = 0
    negative_count = 0
    neutral_count = 0
    analyzed = []
    
    for c in comments:
        cid = c["id"]
        raw_text = c.get("message") or c.get("text", "")
        if cid in predictions_map:
            p = predictions_map[cid]
            lbl = p.get("predicted_sentiment", "").lower()
            conf = p.get("confidence", 0.0)
            if "positive" in lbl or lbl == "4":
                sentiment = "positive"
                positive_count += 1
            elif "negative" in lbl or lbl == "0":
                sentiment = "negative"
                negative_count += 1
            else:
                sentiment = "neutral"
                neutral_count += 1
        else:
            sentiment = classify_emoji_text(raw_text)
            conf = 0.75
            if sentiment == "positive":
                positive_count += 1
            elif sentiment == "negative":
                negative_count += 1
            else:
                sentiment = "neutral"
                neutral_count += 1
                
        record = {
            "id": cid,
            "post_id": media_id,
            "platform": "instagram",
            "author": c.get("author", "User"),
            "text": raw_text,
            "created_time": c.get("created_time"),
            "likes_count": c.get("like_count") or c.get("likes_count", 0),
            "sentiment": sentiment,
            "sentiment_confidence": conf
        }
        social_service.upsert_comment(record)
        analyzed.append(record)
        
    total = len(analyzed)
    return {
        "summary": {
            "total_comments": total,
            "comments_analyzed": total,
            "positive_count": positive_count,
            "negative_count": negative_count,
            "neutral_count": neutral_count,
            "positive_percentage": round((positive_count / max(total, 1)) * 100, 1),
            "negative_percentage": round((negative_count / max(total, 1)) * 100, 1)
        },
        "analyzed_comments": analyzed
    }


@router.post("/import-dataset")
def import_instagram_as_dataset():
    """Imports Instagram media and comments into the core Big Data dataset registry."""
    posts_res = get_instagram_media(use_stored_if_offline=True)
    posts = posts_res.get("data", [])
    if not posts:
        raise HTTPException(status_code=404, detail="No Instagram posts found to import.")
        
    rows = []
    for p in posts:
        caption = p.get("caption") or p.get("text", "")
        if caption.strip():
            rows.append({
                "id": p.get("id"),
                "type": "Post",
                "platform": "instagram",
                "text": caption,
                "created_time": p.get("created_time"),
                "likes": p.get("likes_count", 0),
                "comments": p.get("comments_count", 0)
            })
            
            # Fetch and include comments if available
            try:
                comments = get_instagram_comments(p.get("id"))
                for c in comments:
                    c_text = c.get("message") or c.get("text", "")
                    if c_text.strip():
                        rows.append({
                            "id": c.get("id"),
                            "type": "Comment",
                            "platform": "instagram",
                            "text": c_text,
                            "created_time": c.get("created_time"),
                            "likes": c.get("like_count", 0),
                            "comments": 0
                        })
            except Exception:
                pass
                
    if not rows:
        raise HTTPException(status_code=404, detail="No Instagram text records found to import.")
        
    df = pd.DataFrame(rows)
    csv_bytes = df.to_csv(index=False).encode("utf-8")
    
    try:
        entry = dataset_service.save_uploaded_csv(csv_bytes, "Instagram_Import.csv")
        return {
            "dataset_id": entry["dataset_id"],
            "filename": entry["original_filename"],
            "rows": entry["rows"],
            "columns": entry["columns"],
            "detected_mapping": entry["mapping"],
            "message": "Instagram data successfully imported as a Big Data dataset."
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to save Instagram dataset: {str(e)}")

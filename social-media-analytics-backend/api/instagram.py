"""Instagram Graph API integration for linked Professional accounts.

This uses the existing Meta user token, encrypted token store, social records,
sentiment model, and authentication dependency. Tokens never leave the backend.
"""
from datetime import datetime, timezone
import hashlib
import json
import logging
import urllib.error
import urllib.parse
import urllib.request
from typing import Any, Dict, Optional

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel

from config import settings
from services import model_service, social_service
from services import meta_graph
from services.meta_graph import urlopen as graph_urlopen
from api.facebook import ACTIVE_PAGE_STATE, _get_user_token, get_best_model_dataset_id

router = APIRouter(prefix="/instagram", tags=["Instagram"])
logger = logging.getLogger(__name__)
ACTIVE_INSTAGRAM_STATE: Dict[str, Optional[str]] = {"account_id": None, "account_name": None, "page_id": None}
GRAPH_HOST = "graph.facebook.com"
# Fields supported by the Instagram Graph API media object. Keep Page fields
# (such as Page `name`) in the separate Page discovery query below.
MEDIA_FIELDS = "id,caption,media_type,media_url,thumbnail_url,permalink,timestamp,like_count,comments_count"


def normalize_instagram_sentiment(value: Any) -> Optional[str]:
    """Map supported model labels to dashboard categories; unknown stays unknown."""
    label = str(value).strip().lower()
    return {"positive": "positive", "negative": "negative", "neutral": "neutral",
            "4": "positive", "0": "negative", "2": "neutral"}.get(label)


class SelectInstagramAccountRequest(BaseModel):
    account_id: str


def _graph(path: str, token: str, params: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    query = dict(params or {})
    query["access_token"] = token
    url = f"https://{GRAPH_HOST}/{settings.META_API_VERSION}/{path.lstrip('/')}?{urllib.parse.urlencode(query)}"
    request = urllib.request.Request(url, headers={"User-Agent": "FB-Sentiments-Analytics"})
    try:
        with graph_urlopen(request, timeout=20) as response:
            return json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        payload = {}
        try:
            payload = json.loads(exc.read().decode("utf-8"))
            meta_error = payload.get("error", {})
        except (ValueError, UnicodeDecodeError):
            meta_error = {}
        code = meta_error.get("code")
        message = meta_error.get("message") or "Meta Graph API request failed."
        status = 429 if code == 4 or exc.code == 429 else 401 if code == 190 else 403 if code in (10, 200, 294) else exc.code
        if status == 429:
            message = "Meta temporarily rate-limited Instagram requests. Please wait before retrying."
        raise HTTPException(status_code=status, detail={"message": message, "meta_code": code, "meta_subcode": meta_error.get("error_subcode"), "retry_after_seconds": payload.get("retry_after_seconds"), "rate_limit_source": payload.get("rate_limit_source") or (exc.headers.get("X-Projecti-Meta-Rate-Limit-Source") if exc.headers else None)}) from exc
    except (urllib.error.URLError, TimeoutError) as exc:
        raise HTTPException(status_code=502, detail="Could not connect to the Meta Graph API.") from exc
    except (ValueError, UnicodeDecodeError) as exc:
        raise HTTPException(status_code=502, detail="Meta Graph API returned an invalid response.") from exc


def _managed_pages(token: str):
    # Discover Pages first, then query each Page's linked Professional account
    # with the supported fields. Keep Page tokens backend-side for media calls.
    result = _graph("me/accounts", token, {"fields": "id,name,access_token", "limit": 100})
    pages = list(result.get("data") or [])
    while (next_url := (result.get("paging") or {}).get("next")):
        parsed = urllib.parse.urlparse(next_url)
        if parsed.scheme != "https" or parsed.hostname != GRAPH_HOST:
            raise HTTPException(status_code=502, detail="Meta returned an unexpected pagination URL.")
        request = urllib.request.Request(next_url, headers={"User-Agent": "FB-Sentiments-Analytics"})
        try:
            with graph_urlopen(request, timeout=20) as response:
                result = json.loads(response.read().decode("utf-8"))
        except urllib.error.HTTPError as exc:
            if exc.code == 429:
                raise
            raise HTTPException(status_code=502, detail="Could not retrieve the next page of managed accounts from Meta.") from exc
        except (urllib.error.URLError, ValueError) as exc:
            raise HTTPException(status_code=502, detail="Could not retrieve the next page of managed accounts from Meta.") from exc
        pages.extend(result.get("data") or [])
    linked_pages = []
    for page in pages:
        page_id = page.get("id")
        if not page_id:
            continue
        linked = _graph(f"{page_id}", token, {"fields": "id,name,instagram_business_account{id,username}"})
        linked_pages.append({**page, **linked})
    return linked_pages


def _resolve_account():
    try:
        user_token = _get_user_token()
    except HTTPException:
        raise
    if not user_token:
        raise HTTPException(status_code=503, detail="No Meta user token is configured. Add it in Settings; it will remain encrypted on the backend.")
    pages = _managed_pages(user_token)
    configured_page_id = settings.INSTAGRAM_PAGE_ID.strip()
    explicitly_selected_page = configured_page_id or ACTIVE_INSTAGRAM_STATE.get("page_id") or ""
    selected_page_id = explicitly_selected_page or ACTIVE_PAGE_STATE.get("selected_page_id") or ""
    configured_ig_id = settings.INSTAGRAM_ACCOUNT_ID.strip()
    candidates = [page for page in pages if not selected_page_id or str(page.get("id")) == str(selected_page_id)]
    if configured_ig_id:
        candidates = [page for page in candidates if str((page.get("instagram_business_account") or {}).get("id")) == configured_ig_id]
    linked = next((page for page in candidates if page.get("instagram_business_account")), None)
    if not linked and not explicitly_selected_page:
        linked = next((page for page in pages if page.get("instagram_business_account") and (not configured_ig_id or str(page["instagram_business_account"].get("id")) == configured_ig_id)), None)
    if not linked and configured_page_id:
        raise HTTPException(status_code=404, detail="The configured Facebook Page was not returned by Meta or has no linked Instagram Professional account.")
    if not linked:
        raise HTTPException(status_code=404, detail="No linked Instagram Professional account was found for the selected accessible Facebook Page.")
    ig_account = linked["instagram_business_account"]
    if configured_ig_id and str(ig_account.get("id")) != configured_ig_id:
        raise HTTPException(status_code=403, detail="The Instagram account linked to the configured Page does not match INSTAGRAM_ACCOUNT_ID.")
    page_token = linked.get("access_token")
    if not page_token:
        page_token = user_token
    if not page_token:
        raise HTTPException(status_code=503, detail="Meta returned no usable token for the linked Page.")
    account_id = str(ig_account.get("id") or "")
    if not account_id:
        raise HTTPException(status_code=502, detail="Meta did not return an Instagram Professional account ID.")
    ACTIVE_INSTAGRAM_STATE.update(account_id=account_id, account_name=ig_account.get("username"), page_id=str(linked.get("id")))
    return {"account": ig_account, "page": linked, "token": page_token, "user_token": user_token}


def _permission_report(user_token: str) -> Dict[str, Any]:
    """Report grants from the current token without treating them as API guarantees."""
    try:
        response = _graph("me/permissions", user_token)
        grants = {str(item.get("permission")): str(item.get("status", "unknown")).lower()
                  for item in response.get("data", []) if item.get("permission")}
        return {
            "available": True,
            "granted": sorted(name for name, state in grants.items() if state == "granted"),
            "declined": sorted(name for name, state in grants.items() if state == "declined"),
            "requirements": {
                "account_discovery": ["pages_show_list"],
                "media": ["instagram_basic", "pages_read_engagement"],
                "comments": ["instagram_manage_comments", "pages_read_engagement"],
                "insights": ["instagram_manage_insights", "instagram_basic", "pages_read_engagement", "pages_show_list"],
            },
            "note": "Grants are token-level indicators. Meta's response to each operation is authoritative for account eligibility, app review, and API-version support.",
        }
    except HTTPException as exc:
        if exc.status_code == 429:
            raise
        detail = exc.detail if isinstance(exc.detail, str) else exc.detail
        return {"available": False, "granted": [], "declined": [], "error": detail}


def _paginate(path: str, token: str, params: Dict[str, Any], max_pages: int = 100):
    result = _graph(path, token, params)
    rows = list(result.get("data") or [])
    pages = 1
    while (next_url := (result.get("paging") or {}).get("next")) and pages < max_pages:
        parsed = urllib.parse.urlparse(next_url)
        if parsed.scheme != "https" or parsed.hostname != GRAPH_HOST:
            raise HTTPException(status_code=502, detail="Meta returned an unexpected pagination URL.")
        request = urllib.request.Request(next_url, headers={"User-Agent": "FB-Sentiments-Analytics"})
        try:
            with graph_urlopen(request, timeout=20) as response:
                result = json.loads(response.read().decode("utf-8"))
        except urllib.error.HTTPError as exc:
            if exc.code == 429:
                raise
            raise HTTPException(status_code=exc.code, detail="Meta rejected a paginated data request.") from exc
        except (urllib.error.URLError, ValueError) as exc:
            raise HTTPException(status_code=502, detail="Could not retrieve the next page of Instagram data.") from exc
        rows.extend(result.get("data") or [])
        pages += 1
    paging = result.get("paging") or {}
    return rows, bool(paging.get("next")), (paging.get("cursors") or {}).get("after")


def _normalize_media(row: Dict[str, Any], account: Dict[str, Any], page: Dict[str, Any]):
    return {
        "id": str(row["id"]), "platform": "instagram", "account_id": str(account["id"]),
        "account_name": account.get("username") or "Instagram account", "author": account.get("username") or "Instagram account",
        "text": row.get("caption") or "", "media_type": row.get("media_type") or "UNKNOWN",
        "media_url": row.get("media_url"), "thumbnail_url": row.get("thumbnail_url"),
        "permalink": row.get("permalink") or "", "created_time": row.get("timestamp"),
        "likes_count": row.get("like_count"), "comments_count": row.get("comments_count"), "shares_count": None,
        "platform_metrics": {"instagram_media_type": row.get("media_type"), "media_url": row.get("media_url"), "thumbnail_url": row.get("thumbnail_url")},
        "sentiment": "unknown", "sentiment_confidence": 0, "is_sample": 0,
    }


@router.get("/status")
def get_instagram_status(refresh: bool = False):
    try:
        if refresh:
            meta_graph.clear_cache()
        resolved = _resolve_account()
        account = resolved["account"]
        account_id = str(account.get("id") or "")
        username = account.get("username")
        if not account_id or not username:
            raise HTTPException(status_code=502, detail="Meta returned the linked Instagram account without its required ID or username.")
        return {"connected": True, "status": "active", "account": {"id": account_id, "username": username}, "facebook_page": {"id": str(resolved["page"]["id"]), "name": resolved["page"].get("name")}, "permissions": _permission_report(resolved["user_token"]), "message": "Linked Instagram Professional account is accessible through the configured Meta token."}
    except HTTPException as exc:
        if exc.status_code == 429:
            raise
        detail = exc.detail if isinstance(exc.detail, str) else exc.detail
        missing_link = exc.status_code == 404
        return {"connected": False if missing_link else None, "status": "not_connected" if missing_link else "error", "account": None, "http_status": exc.status_code, "error": detail}


@router.get("/accounts")
def get_instagram_accounts(refresh: bool = False):
    if refresh:
        meta_graph.clear_cache()
    user_token = _get_user_token()
    if not user_token:
        raise HTTPException(status_code=503, detail="No Meta user token is configured.")
    pages = _managed_pages(user_token)
    page_filter = settings.INSTAGRAM_PAGE_ID.strip()
    configured_ig_id = settings.INSTAGRAM_ACCOUNT_ID.strip()
    accounts = []
    for page in pages:
        ig = page.get("instagram_business_account") or {}
        if not ig.get("id") or (page_filter and str(page.get("id")) != page_filter):
            continue
        if configured_ig_id and str(ig.get("id")) != configured_ig_id:
            continue
        if not ig.get("username"):
            continue
        accounts.append({"id": str(ig["id"]), "username": ig["username"], "page_id": str(page["id"]), "page_name": page.get("name")})
    return {"accounts": accounts, "selected_account_id": ACTIVE_INSTAGRAM_STATE.get("account_id"), "configured_account_id": configured_ig_id or None}


@router.post("/select-account")
def select_instagram_account(request: SelectInstagramAccountRequest):
    requested_id = request.account_id.strip()
    options = get_instagram_accounts()["accounts"]
    account = next((item for item in options if item["id"] == requested_id), None)
    if not account:
        raise HTTPException(status_code=403, detail="The Instagram account is not accessible through the authorized Meta token or configured Page.")
    ACTIVE_INSTAGRAM_STATE.update(account_id=account["id"], account_name=account.get("username"), page_id=account["page_id"])
    return {"status": "selected", "account": account}


@router.get("/media")
def get_instagram_media(limit: int = Query(10, ge=1, le=100), after: Optional[str] = Query(None), sync: bool = Query(False), refresh: bool = False):
    if refresh:
        meta_graph.clear_cache()
    resolved = _resolve_account()
    params: Dict[str, Any] = {"fields": MEDIA_FIELDS, "limit": limit}
    if after:
        params["after"] = after
    rows, has_more, next_cursor = _paginate(f"{resolved['account']['id']}/media", resolved["token"], params, max_pages=1)
    media = [_normalize_media(row, resolved["account"], resolved["page"]) for row in rows if row.get("id")]
    if sync:
        for post in media:
            social_service.upsert_post(post)
        social_service.update_sync_status("instagram", "success", records=len(media))
    return {"data": media, "account": {"id": str(resolved["account"]["id"]), "username": resolved["account"].get("username")}, "paging": {"next": next_cursor, "has_more": has_more}, "synced": sync}


@router.post("/sync")
def sync_instagram_media(max_pages: int = Query(100, ge=1, le=100), refresh: bool = True):
    if refresh:
        meta_graph.clear_cache()
    resolved = _resolve_account()
    rows, truncated, _ = _paginate(f"{resolved['account']['id']}/media", resolved["token"], {"fields": MEDIA_FIELDS, "limit": 100}, max_pages=max_pages)
    posts = [_normalize_media(row, resolved["account"], resolved["page"]) for row in rows if row.get("id")]
    for post in posts:
        social_service.upsert_post(post)
    social_service.update_sync_status("instagram", "partial" if truncated else "success", records=len(posts))
    return {"status": "partial" if truncated else "success", "records_synced": len(posts), "has_more": truncated, "media": posts[:10], "account": {"id": str(resolved["account"]["id"]), "username": resolved["account"].get("username")}, "message": "Instagram media synchronized from Meta. Captions without text remain available as media records but are not sentiment-labeled."}


@router.post("/analyze")
def analyze_instagram_media():
    resolved = _resolve_account()
    posts = social_service.get_social_posts(platform="instagram", account_id=str(resolved["account"]["id"]), limit=5000)
    # Keep the full media list in the response so captionless media remains
    # visible in the dashboard, but only send real, non-empty captions to the model.
    captioned = [(post, (post.get("text") or post.get("caption") or "").strip()) for post in posts]
    captioned = [(post, caption) for post, caption in captioned if caption]
    if not captioned:
        raise HTTPException(status_code=404, detail="No Instagram captions are stored for sentiment analysis. Synchronize media first.")
    from nlp.preprocessing import preprocess_text
    empty_after_preprocessing = [str(post.get("id") or post.get("media_id") or "unknown")
                                 for post, caption in captioned if not preprocess_text(caption)]
    if empty_after_preprocessing:
        raise HTTPException(status_code=400, detail="Instagram captions contain no text supported by the trained model after preprocessing (media IDs: " + ", ".join(empty_after_preprocessing) + ").")
    dataset_id = get_best_model_dataset_id()
    if not dataset_id:
        raise HTTPException(status_code=400, detail="Sentiment model is not trained. Train a model before analyzing Instagram captions.")
    try:
        prediction_result = model_service.predict_texts(dataset_id, [caption for _, caption in captioned])
    except Exception as exc:
        logger.exception("Instagram caption prediction failed")
        raise HTTPException(status_code=500, detail=f"Instagram caption prediction failed: {exc}") from exc

    predictions = prediction_result.get("predictions") if isinstance(prediction_result, dict) else None
    if not isinstance(predictions, list) or len(predictions) != len(captioned):
        raise HTTPException(status_code=500, detail="Instagram caption prediction returned an incomplete result. Check the trained model response.")

    classified = {}
    analyzed = []
    for (post, caption), prediction in zip(captioned, predictions):
        if not isinstance(prediction, dict):
            raise HTTPException(status_code=500, detail="Instagram caption prediction returned an invalid result row.")
        raw_label = prediction.get("predicted_sentiment")
        sentiment = normalize_instagram_sentiment(raw_label) if raw_label is not None else None
        if sentiment is None:
            raise HTTPException(status_code=500, detail=f"Instagram model returned an unsupported sentiment label: {raw_label!r}.")
        confidence = prediction.get("confidence")
        if confidence is not None:
            try:
                confidence = float(confidence)
            except (TypeError, ValueError) as exc:
                raise HTTPException(status_code=500, detail="Instagram model returned an invalid confidence value.") from exc
            if not 0 <= confidence <= 1:
                raise HTTPException(status_code=500, detail="Instagram model returned a confidence value outside the 0–1 range.")
        media_id = str(post.get("id") or post.get("media_id") or "")
        if not media_id:
            raise HTTPException(status_code=500, detail="Instagram caption record is missing its media ID.")
        post["sentiment"] = sentiment
        post["sentiment_confidence"] = confidence
        post["fetched_at"] = datetime.now(timezone.utc).isoformat()
        social_service.upsert_post(post)
        result = {**post, "id": media_id, "media_id": media_id, "caption": caption,
                  "text": caption, "sentiment": sentiment, "sentiment_confidence": confidence,
                  "prediction": confidence}
        classified[media_id] = result
        analyzed.append(result)

    # Return every synchronized media record. Captionless items retain their
    # stored state and are excluded from successful classification counts.
    media = []
    for post in posts:
        media_id = str(post.get("id") or post.get("media_id") or "")
        if media_id in classified:
            media.append(classified[media_id])
        else:
            media.append({**post, "id": media_id, "media_id": media_id,
                          "caption": post.get("text") or post.get("caption") or ""})
    counts = {name: sum(item["sentiment"] == name for item in analyzed) for name in ("positive", "negative", "neutral")}
    return {"platform": "instagram", "account_id": str(resolved["account"]["id"]), "media": media,
            "analyzed_posts": analyzed, "summary": {"posts_analyzed": len(analyzed),
            "sentiment_counts": counts, "sentiment_percentages": {name: round(value * 100 / len(analyzed), 1) for name, value in counts.items()}}}


@router.get("/media/{media_id}/comments")
def get_instagram_comments(media_id: str, limit: int = Query(100, ge=1, le=100), after: Optional[str] = Query(None)):
    resolved = _resolve_account()
    parent = social_service.get_social_posts(platform="instagram", account_id=str(resolved["account"]["id"]), limit=5000)
    if str(media_id) not in {str(post.get("id")) for post in parent}:
        raise HTTPException(status_code=404, detail="Instagram media was not found in the connected account's synchronized records.")
    # Instagram comment authors expose username; `from{name}` is a Facebook
    # Graph field and causes (#100) on Instagram Comment objects.
    comment_params: Dict[str, Any] = {"fields": "id,text,timestamp,username,like_count", "limit": limit}
    if after:
        comment_params["after"] = after
    rows, has_more, next_cursor = _paginate(f"{media_id}/comments", resolved["token"], comment_params, max_pages=1)
    comments = []
    for row in rows:
        if not row.get("id"):
            continue
        item = {"id": str(row["id"]), "post_id": str(media_id), "platform": "instagram", "author": row.get("username") or (row.get("from") or {}).get("name") or "Instagram user", "text": row.get("text") or "", "created_time": row.get("timestamp"), "likes_count": row.get("like_count"), "sentiment": "unknown", "sentiment_confidence": 0, "is_sample": 0, "fetched_at": datetime.now(timezone.utc).isoformat()}
        social_service.upsert_comment(item)
        comments.append(item)
    return {"data": comments, "count": len(comments), "has_more": has_more, "next": next_cursor}


@router.post("/media/{media_id}/comments/analyze")
def analyze_instagram_comments(media_id: str, limit: int = Query(100, ge=1, le=100), after: Optional[str] = Query(None)):
    fetched = get_instagram_comments(media_id, limit=limit, after=after)
    comments = fetched["data"]
    nonempty = [comment for comment in comments if (comment.get("text") or "").strip()]
    if not nonempty:
        return {"platform": "instagram", "post_id": str(media_id), "analyzed_comments": [], "message": "No accessible non-empty Instagram comments were returned."}
    version = "instagram_shared_model_v1"
    stored = {str(item.get("id")): item for item in social_service.get_social_comments(post_id=media_id, limit=5000, platform="instagram")}
    pending = []
    analyzed_by_id = {}
    for comment in nonempty:
        text_hash = hashlib.sha256(comment["text"].encode("utf-8")).hexdigest()
        previous = stored.get(str(comment["id"]))
        if previous and previous.get("text_hash") == text_hash and previous.get("analysis_version") == version and previous.get("sentiment") in {"positive", "negative", "neutral"}:
            analyzed_by_id[str(comment["id"])] = previous
        else:
            pending.append((comment, text_hash))
    if pending:
        dataset_id = get_best_model_dataset_id()
        if not dataset_id:
            raise HTTPException(status_code=400, detail="Sentiment model is not trained. Train a model before analyzing Instagram comments.")
        predictions = model_service.predict_texts(dataset_id, [comment["text"] for comment, _ in pending]).get("predictions", [])
        for (comment, text_hash), prediction in zip(pending, predictions):
            comment["sentiment"] = str(prediction.get("predicted_sentiment") or "unknown").lower()
            comment["sentiment_confidence"] = prediction.get("confidence")
            comment["analyzed_at"] = datetime.now(timezone.utc).isoformat()
            comment["text_hash"] = text_hash
            comment["analysis_version"] = version
            social_service.upsert_comment(comment)
            analyzed_by_id[str(comment["id"])] = comment
    nonempty = [analyzed_by_id.get(str(comment["id"]), comment) for comment in nonempty]
    return {"platform": "instagram", "post_id": str(media_id), "analyzed_comments": nonempty, "has_more": fetched["has_more"], "next": fetched["next"]}


@router.get("/media/{media_id}/insights")
def get_instagram_media_insights(media_id: str, refresh: bool = False):
    """Fetch current-version media insight metrics independently, preserving unsupported values as unavailable."""
    if refresh:
        meta_graph.clear_cache()
    resolved = _resolve_account()
    posts = social_service.get_social_posts(platform="instagram", account_id=str(resolved["account"]["id"]), limit=5000)
    post = next((row for row in posts if str(row.get("id")) == str(media_id)), None)
    if not post:
        raise HTTPException(status_code=404, detail="Instagram media was not found in the connected account's synchronized records.")
    metric_names = ("reach", "saved", "shares", "total_interactions")
    metrics: Dict[str, Any] = {}
    errors: Dict[str, Any] = {}
    statuses: Dict[str, str] = {}
    for metric in metric_names:
        try:
            result = _graph(f"{media_id}/insights", resolved["token"], {"metric": metric})
            rows = result.get("data") or []
            metrics[metric] = rows[0] if rows else None
            if not rows:
                statuses[metric] = "not_supported"
                errors[metric] = "Meta returned no value for this metric on this media item."
            else:
                statuses[metric] = "available"
        except HTTPException as exc:
            metrics[metric] = None
            errors[metric] = exc.detail
            detail = exc.detail if isinstance(exc.detail, dict) else {}
            code = detail.get("meta_code")
            if exc.status_code == 429 or code == 4 or exc.status_code >= 500:
                statuses[metric] = "temporarily_unavailable"
                # A shared app rate limit applies to all remaining metrics; don't compound it.
                if exc.status_code == 429 or code == 4:
                    for remaining in metric_names[metric_names.index(metric) + 1:]:
                        metrics[remaining] = None
                        statuses[remaining] = "temporarily_unavailable"
                        errors[remaining] = {"message": "Skipped because Meta rate-limited this request.", "meta_code": 4}
                    break
            elif code in (10, 200) or exc.status_code == 403:
                statuses[metric] = "permission_required"
            elif code == 100:
                statuses[metric] = "not_supported"
            else:
                statuses[metric] = "temporarily_unavailable"
    stored = post.get("platform_metrics") or {}
    stored["insights"] = metrics
    social_service.upsert_post({**post, "platform_metrics": stored})
    return {"available": any(value is not None for value in metrics.values()), "platform": "instagram", "account_id": str(resolved["account"]["id"]), "media_id": str(media_id), "media_type": post.get("media_type"), "data": metrics, "statuses": statuses, "unavailable": errors, "api_version": settings.META_API_VERSION}


@router.get("/insights")
def get_instagram_account_insights(refresh: bool = False):
    """Request account insights from Meta using the configured version; expose unavailable metrics honestly."""
    if refresh:
        meta_graph.clear_cache()
    resolved = _resolve_account()
    requested = ("reach", "accounts_engaged", "total_interactions")
    metrics: Dict[str, Any] = {}
    unavailable: Dict[str, Any] = {}
    for metric in requested:
        try:
            response = _graph(f"{resolved['account']['id']}/insights", resolved["token"], {"metric": metric, "period": "day"})
            rows = response.get("data") or []
            metrics[metric] = rows[0] if rows else None
            if not rows:
                unavailable[metric] = "Meta returned no values for this metric."
        except HTTPException as exc:
            if exc.status_code == 429:
                raise
            metrics[metric] = None
            unavailable[metric] = exc.detail
    return {"available": any(value is not None for value in metrics.values()), "account_id": str(resolved["account"]["id"]), "data": metrics, "unavailable": unavailable, "api_version": settings.META_API_VERSION, "message": "Metrics are returned only when supported by the account, token permissions, and configured Graph API version."}

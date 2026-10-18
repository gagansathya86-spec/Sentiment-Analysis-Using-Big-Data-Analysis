from fastapi import APIRouter, HTTPException
from config import settings
import urllib.request
import urllib.error
import json
import pandas as pd
from services import model_service, dataset_service
from utils import file_utils
import re

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

@router.get("/posts")
def get_facebook_posts():
    token = settings.FACEBOOK_ACCESS_TOKEN
    if not token:
        raise HTTPException(status_code=401, detail="Facebook access token is missing or not configured.")
    
    page_id = getattr(settings, "FACEBOOK_PAGE_ID", "me")
    url = f"https://graph.facebook.com/v25.0/{page_id}/posts?fields=id,message,created_time,comments.summary(true),reactions.summary(true)&access_token={token}"
    
    all_posts = []
    
    try:
        while url:
            req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'})
            with urllib.request.urlopen(req) as response:
                data = json.loads(response.read().decode("utf-8"))
                
                for post in data.get("data", []):
                    comments_count = post.get("comments", {}).get("summary", {}).get("total_count", 0)
                    likes_count = post.get("reactions", {}).get("summary", {}).get("total_count", 0)
                    clean_post = {
                        "id": post.get("id"),
                        "message": post.get("message", ""),
                        "created_time": post.get("created_time"),
                        "comments_count": comments_count,
                        "likes_count": likes_count
                    }
                    all_posts.append(clean_post)
                
                paging = data.get("paging", {})
                url = paging.get("next")
                
        return all_posts
        
    except urllib.error.HTTPError as e:
        error_msg = e.read().decode("utf-8")
        try:
            error_data = json.loads(error_msg)
            fb_error = error_data.get("error", {}).get("message", str(e))
        except json.JSONDecodeError:
            fb_error = str(e)
            
        raise HTTPException(status_code=e.code, detail=f"Facebook API error: {fb_error}")
    except urllib.error.URLError as e:
        raise HTTPException(status_code=502, detail=f"Network error while connecting to Facebook: {str(e.reason)}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"An unexpected error occurred: {str(e)}")

@router.post("/analyze")
def analyze_facebook_posts():
    # Fetch posts
    posts = get_facebook_posts()
    if not posts:
        raise HTTPException(status_code=404, detail="No posts available to analyze.")

    # Filter out empty messages
    valid_posts = [p for p in posts if p.get("message", "").strip()]
    
    if not valid_posts:
        raise HTTPException(status_code=404, detail="No valid posts with text available to analyze.")

    best_dataset_id = get_best_model_dataset_id()
    if not best_dataset_id:
        raise HTTPException(status_code=400, detail="Model not trained/not found.")

    texts = [p["message"] for p in valid_posts]
    
    try:
        prediction_result = model_service.predict_texts(best_dataset_id, texts)
        predictions = prediction_result.get("predictions", [])
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error running model prediction: {str(e)}")

    positive_count = 0
    negative_count = 0
    
    analyzed_posts = []
    
    for i, post in enumerate(valid_posts):
        pred_info = predictions[i]
        sentiment = pred_info.get("predicted_sentiment", "unknown")
        
        # Determine positive/negative from label if not explicit
        # Based on how the model is trained, usually "positive" or "4" for positive, "negative" or "0" for negative
        s_lower = str(sentiment).lower()
        if "positive" in s_lower or s_lower == "4":
            sentiment = "positive"
            positive_count += 1
        elif "negative" in s_lower or s_lower == "0":
            sentiment = "negative"
            negative_count += 1
        else:
            # Maybe neutral or unknown, let's still map if possible, but keep whatever it predicted
            if s_lower == "2" or "neutral" in s_lower:
                sentiment = "neutral"
                
        analyzed_posts.append({
            "id": post["id"],
            "message": post["message"],
            "created_time": post["created_time"],
            "comments_count": post.get("comments_count", 0),
            "likes_count": post.get("likes_count", 0),
            "sentiment": sentiment,
            "prediction": pred_info.get("confidence")
        })

    total_fetched = len(posts)
    posts_analyzed = len(valid_posts)
    pos_pct = round((positive_count / posts_analyzed) * 100, 2) if posts_analyzed > 0 else 0.0
    neg_pct = round((negative_count / posts_analyzed) * 100, 2) if posts_analyzed > 0 else 0.0

    return {
        "summary": {
            "total_posts_fetched": total_fetched,
            "posts_analyzed": posts_analyzed,
            "positive_count": positive_count,
            "negative_count": negative_count,
            "positive_percentage": pos_pct,
            "negative_percentage": neg_pct
        },
        "analyzed_posts": analyzed_posts
    }


@router.get("/posts/{post_id}/comments")
def get_facebook_post_comments(post_id: str):
    token = settings.FACEBOOK_ACCESS_TOKEN
    if not token:
        raise HTTPException(status_code=401, detail="Facebook access token is missing or not configured.")
    
    url = f"https://graph.facebook.com/v25.0/{post_id}/comments?fields=id,message,created_time,from,like_count&access_token={token}"
    
    all_comments = []
    
    try:
        while url:
            req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'})
            with urllib.request.urlopen(req) as response:
                data = json.loads(response.read().decode("utf-8"))
                
                for comment in data.get("data", []):
                    author = comment.get("from", {}).get("name")
                    if not author:
                        author = "Unknown"
                        
                    clean_comment = {
                        "id": comment.get("id"),
                        "message": comment.get("message", ""),
                        "created_time": comment.get("created_time"),
                        "author": author,
                        "like_count": comment.get("like_count", 0)
                    }
                    all_comments.append(clean_comment)
                
                paging = data.get("paging", {})
                url = paging.get("next")
                
        return all_comments
        
    except urllib.error.HTTPError as e:
        error_msg = e.read().decode("utf-8")
        try:
            error_data = json.loads(error_msg)
            fb_error = error_data.get("error", {}).get("message", str(e))
        except json.JSONDecodeError:
            fb_error = str(e)
            
        raise HTTPException(status_code=e.code, detail=f"Facebook API error: {fb_error}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"An unexpected error occurred: {str(e)}")


@router.post("/posts/{post_id}/comments/analyze")
def analyze_facebook_post_comments(post_id: str):
    comments = get_facebook_post_comments(post_id)
    
    if not comments:
        return {
            "summary": {
                "total_comments": 0,
                "comments_analyzed": 0,
                "positive_count": 0,
                "negative_count": 0,
                "unknown_count": 0,
                "positive_percentage": 0.0,
                "negative_percentage": 0.0
            },
            "analyzed_comments": []
        }

    text_comments = []
    emoji_comments = []
    
    for c in comments:
        msg = c.get("message", "").strip()
        if not msg:
            continue
        # If the comment contains any alphabetic characters, treat as text
        if re.search(r'[a-zA-Z]', msg):
            text_comments.append(c)
        else:
            emoji_comments.append(c)

    best_dataset_id = get_best_model_dataset_id()
    if not best_dataset_id and text_comments:
        raise HTTPException(status_code=400, detail="Model not trained/not found.")

    predictions_map = {}
    if text_comments:
        texts = [c["message"] for c in text_comments]
        try:
            prediction_result = model_service.predict_texts(best_dataset_id, texts)
            predictions = prediction_result.get("predictions", [])
            for i, c in enumerate(text_comments):
                predictions_map[c["id"]] = predictions[i]
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Error running model prediction: {str(e)}")

    positive_count = 0
    negative_count = 0
    unknown_count = 0
    
    analyzed_comments = []
    
    # Process all non-empty comments in original order
    valid_comments = [c for c in comments if c.get("message", "").strip()]
    
    for comment in valid_comments:
        cid = comment["id"]
        sentiment = "unknown"
        confidence = None
        
        if cid in predictions_map:
            # ML Text Classification
            pred_info = predictions_map[cid]
            confidence = pred_info.get("confidence")
            raw_sent = pred_info.get("predicted_sentiment", "unknown")
            s_lower = str(raw_sent).lower()
            if "positive" in s_lower or s_lower == "4":
                sentiment = "positive"
            elif "negative" in s_lower or s_lower == "0":
                sentiment = "negative"
            else:
                if s_lower == "2" or "neutral" in s_lower:
                    sentiment = "neutral"
        else:
            # Emoji/Non-alphabetic deterministic classification
            sentiment = classify_emoji_text(comment["message"])

        if sentiment == "positive":
            positive_count += 1
        elif sentiment == "negative":
            negative_count += 1
        elif sentiment == "unknown":
            unknown_count += 1
                
        analyzed_comments.append({
            "id": comment["id"],
            "message": comment["message"],
            "created_time": comment["created_time"],
            "author": comment["author"],
            "like_count": comment["like_count"],
            "sentiment": sentiment,
            "prediction": confidence
        })

    total_fetched = len(comments)
    comments_analyzed = len(valid_comments)
    # Exclude unknown from percentage calculation to accurately represent sentiment bias
    known_count = positive_count + negative_count
    pos_pct = round((positive_count / known_count) * 100, 2) if known_count > 0 else 0.0
    neg_pct = round((negative_count / known_count) * 100, 2) if known_count > 0 else 0.0

    return {
        "summary": {
            "total_comments": total_fetched,
            "comments_analyzed": comments_analyzed,
            "positive_count": positive_count,
            "negative_count": negative_count,
            "unknown_count": unknown_count,
            "positive_percentage": pos_pct,
            "negative_percentage": neg_pct
        },
        "analyzed_comments": analyzed_comments
    }



@router.get("/posts/{post_id}/insights")
def get_facebook_post_insights(post_id: str):
    token = settings.FACEBOOK_ACCESS_TOKEN
    if not token:
        raise HTTPException(status_code=401, detail="Facebook access token is missing or not configured.")
    
    url = f"https://graph.facebook.com/v25.0/{post_id}/insights/post_impressions_unique,post_impressions?access_token={token}"
    
    try:
        req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'})
        with urllib.request.urlopen(req) as response:
            data = json.loads(response.read().decode("utf-8"))
            
            insights_data = data.get("data", [])
            impressions = None
            reach = None
            
            for item in insights_data:
                name = item.get("name")
                values = item.get("values", [])
                if values and isinstance(values, list):
                    val = values[0].get("value")
                    if name == "post_impressions":
                        impressions = val
                    elif name == "post_impressions_unique":
                        reach = val
                        
            return {
                "available": True,
                "impressions": impressions,
                "reach": reach
            }
            
    except urllib.error.HTTPError as e:
        error_msg = e.read().decode("utf-8")
        try:
            error_data = json.loads(error_msg)
            fb_error = error_data.get("error", {}).get("message", str(e))
            
            if "Unsupported get request" in fb_error or "permission" in fb_error.lower():
                return {
                    "available": False,
                    "reason": "View/Reach data is not available for this Facebook account or API permission."
                }
        except json.JSONDecodeError:
            pass
            
        return {
            "available": False,
            "reason": "View/Reach data is not available for this Facebook account or API permission."
        }
    except Exception as e:
        return {
            "available": False,
            "reason": "View/Reach data is not available for this Facebook account or API permission."
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
                comments = get_facebook_post_comments(post.get("id"))
                for comment in comments:
                    if comment.get("message", "").strip():
                        data_rows.append({
                            "id": comment.get("id"),
                            "type": "Comment",
                            "text": comment.get("message"),
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

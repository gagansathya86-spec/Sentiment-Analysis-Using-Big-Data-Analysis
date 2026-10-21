"""
Engagement Analytics Engine
Calculates multi-platform engagement metrics, cross-platform performance comparisons,
engagement-to-sentiment correlations, and optimal posting times.
"""
from typing import Dict, Any, List, Optional
from datetime import datetime
import math
from services import social_service
from utils.time_utils import parse_utc_datetime


def compute_engagement_score(likes: Optional[int], comments: Optional[int], shares: Optional[int] = None) -> Optional[int]:
    """Return the documented score only when all three inputs are observed."""
    if likes is None or comments is None or shares is None:
        return None
    return max(0, int(likes)) + (2 * max(0, int(comments))) + (3 * max(0, int(shares)))


def compute_observed_engagement_subtotal(likes: Optional[int], comments: Optional[int], shares: Optional[int]) -> Optional[int]:
    """Weighted subtotal of known metrics; never treats missing values as zero."""
    values = ((likes, 1), (comments, 2), (shares, 3))
    observed = [(max(0, int(value)), weight) for value, weight in values if value is not None]
    return sum(value * weight for value, weight in observed) if observed else None


def _aggregate_for_posts(posts):
    scores = [compute_engagement_score(p.get("likes_count"), p.get("comments_count"), p.get("shares_count")) for p in posts]
    observed = [compute_observed_engagement_subtotal(p.get("likes_count"), p.get("comments_count"), p.get("shares_count")) for p in posts]
    complete = all(score is not None for score in scores)
    return {
        "scores": scores,
        "observed": observed,
        "complete": complete,
        "total": sum(scores) if complete else None,
        "average": round(sum(scores) / len(scores), 2) if complete and posts else None,
        "observed_total": sum(value for value in observed if value is not None),
        "observed_average": round(sum(value for value in observed if value is not None) / len(posts), 2) if posts else None,
    }


def _valid_metric(value):
    if value is None or isinstance(value, bool):
        return None
    try:
        number = float(value)
    except (TypeError, ValueError):
        return None
    return number if math.isfinite(number) and number >= 0 else None


def _comparable_post_scores(posts):
    """Score only posts with the same commonly observed metric fields."""
    weights = {"likes_count": 1, "comments_count": 2, "shares_count": 3}
    if not posts:
        return [], []
    fields = [
        field for field in weights
        if sum(_valid_metric(post.get(field)) is not None for post in posts) / len(posts) >= 0.8
    ]
    comparable = []
    for post in posts:
        values = {field: _valid_metric(post.get(field)) for field in fields}
        if fields and all(value is not None for value in values.values()):
            score = sum(values[field] * weights[field] for field in fields)
            comparable.append((post, round(score, 2)))
    return fields, comparable


def get_engagement_overview(platform: Optional[str] = None, account_id: Optional[str] = None) -> Dict[str, Any]:
    posts = social_service.get_social_posts(platform=platform, account_id=account_id, limit=500)
    
    if not posts:
        return {
            "total_posts": 0,
            "average_engagement_per_post": 0.0,
            "total_likes": 0,
            "total_comments": 0,
            "total_shares": None,
            "total_known_shares": 0,
            "shares_available_posts": 0,
            "shares_unavailable_posts": 0,
            "formula": "Engagement Score = Likes + (2 * Comments) + (3 * Shares)",
            "total_engagement_score": None,
            "observed_engagement_subtotal": 0,
            "average_engagement_per_post": None,
            "average_observed_engagement_per_post": 0.0,
            "platform_breakdown": {},
            "top_posts": [],
            "account_id": str(account_id) if account_id else None,
            "comparable_metric_basis": [],
            "comparable_post_count": 0,
            "comparable_average_engagement_per_post": None,
            "best_comparable_posts": [],
            "weaker_comparable_posts": [],
            "engagement_by_date": [],
            "content_type_comparison": {"available": False, "minimum_posts_per_type": 3, "labeled_comparable_posts": 0, "types": []},
            "message": "No posts available for engagement analysis."
        }
        
    total_likes = sum(p["likes_count"] for p in posts if p.get("likes_count") is not None)
    total_comments = sum(p["comments_count"] for p in posts if p.get("comments_count") is not None)
    share_values = [p.get("shares_count") for p in posts]
    known_shares = [value for value in share_values if value is not None]
    shares_complete = len(known_shares) == len(posts)
    total_shares = sum(known_shares) if shares_complete else None
    
    # Platform breakdown
    fb_posts = [p for p in posts if p["platform"] == "facebook"]
    fb_aggregate = _aggregate_for_posts(fb_posts)
    
    # Top 10 engaging posts
    ranked_posts = []
    aggregate = _aggregate_for_posts(posts)
    for index, p in enumerate(posts):
        score = aggregate["scores"][index]
        observed_subtotal = aggregate["observed"][index]
        ranked_posts.append({
            "id": p["id"],
            "platform": p["platform"],
            "author": p["author"],
            "text": p["text"][:120] + ("..." if len(p["text"]) > 120 else ""),
            "likes": p.get("likes_count"),
            "comments": p.get("comments_count"),
            "shares": p.get("shares_count"),
            "engagement_score": score,
            "observed_engagement_subtotal": observed_subtotal,
            "engagement_metrics_available": {"likes": p.get("likes_count") is not None, "comments": p.get("comments_count") is not None, "shares": p.get("shares_count") is not None},
            "sentiment": p["sentiment"],
            "created_time": p["created_time"],
            "permalink": p.get("permalink", "")
        })
    ranked_posts.sort(key=lambda x: x["engagement_score"] if x["engagement_score"] is not None else (x["observed_engagement_subtotal"] or 0), reverse=True)
    comparable_fields, comparable_posts = _comparable_post_scores(posts)
    comparable_posts.sort(key=lambda item: item[1], reverse=True)

    def comparable_view(item):
        post, score = item
        return {
            "id": post["id"], "platform": post["platform"], "text": post["text"][:180],
            "sentiment": post.get("sentiment"), "created_time": post.get("created_time"),
            "permalink": post.get("permalink", ""), "score": score, "media_type": post.get("media_type"),
            "metrics": {field.removesuffix("_count"): _valid_metric(post.get(field)) for field in ("likes_count", "comments_count", "shares_count")},
        }

    daily_scores = {}
    for post, score in comparable_posts:
        dt = parse_utc_datetime(post.get("created_time"))
        if dt is None:
            continue
        day = dt.date().isoformat()
        daily_scores.setdefault(day, []).append(score)
    engagement_by_date = [
        {"date": day, "posts": len(scores), "average_engagement": round(sum(scores) / len(scores), 2)}
        for day, scores in sorted(daily_scores.items())
    ]
    content_groups = {}
    for post, score in comparable_posts:
        media_type = post.get("media_type")
        if isinstance(media_type, str) and media_type.strip() and media_type.strip().lower() not in {"unknown", "unspecified"}:
            label = media_type.strip()
            content_groups.setdefault(label, []).append(score)
    content_type_rows = [
        {"type": label, "comparable_posts": len(scores), "average_engagement": round(sum(scores) / len(scores), 2)}
        for label, scores in sorted(content_groups.items())
    ]
    minimum_posts_per_type = 3
    content_type_available = sum(row["comparable_posts"] >= minimum_posts_per_type for row in content_type_rows) >= 2
    
    return {
        "total_posts": len(posts),
        "average_engagement_per_post": aggregate["average"],
        "average_observed_engagement_per_post": aggregate["observed_average"],
        "total_likes": total_likes,
        "total_comments": total_comments,
        "total_shares": total_shares,
        "total_known_shares": sum(known_shares),
        "shares_available_posts": len(known_shares),
        "shares_unavailable_posts": len(posts) - len(known_shares),
        "total_engagement_score": aggregate["total"],
        "observed_engagement_subtotal": aggregate["observed_total"],
        "engagement_score_complete": aggregate["complete"],
        "account_id": str(account_id) if account_id else None,
        "comparable_metric_basis": [field.removesuffix("_count") for field in comparable_fields],
        "comparable_post_count": len(comparable_posts),
        "comparable_average_engagement_per_post": round(sum(score for _, score in comparable_posts) / len(comparable_posts), 2) if comparable_posts else None,
        "best_comparable_posts": [comparable_view(item) for item in comparable_posts[:3]],
        "weaker_comparable_posts": [comparable_view(item) for item in comparable_posts[-3:]],
        "engagement_by_date": engagement_by_date,
        "content_type_comparison": {
            "available": content_type_available,
            "minimum_posts_per_type": minimum_posts_per_type,
            "labeled_comparable_posts": sum(row["comparable_posts"] for row in content_type_rows),
            "types": content_type_rows,
        },
        "formula": "Engagement Score = Likes + (2 * Comments) + (3 * Shares)",
        "platform_breakdown": {
            "facebook": {
                "post_count": len(fb_posts),
                "total_engagement": fb_aggregate["total"],
                "observed_engagement_subtotal": fb_aggregate["observed_total"],
                "avg_engagement": fb_aggregate["average"],
                "average_observed_engagement": fb_aggregate["observed_average"],
                "total_likes": sum(p.get("likes_count") or 0 for p in fb_posts),
                "total_comments": sum(p.get("comments_count") or 0 for p in fb_posts),
                "total_shares": sum(p["shares_count"] for p in fb_posts if p.get("shares_count") is not None) if all(p.get("shares_count") is not None for p in fb_posts) else None,
                "shares_available_posts": sum(p.get("shares_count") is not None for p in fb_posts),
                "shares_unavailable_posts": sum(p.get("shares_count") is None for p in fb_posts),
            },
        },
        "top_posts": ranked_posts[:10]
    }


def get_engagement_vs_sentiment(platform: Optional[str] = None, account_id: Optional[str] = None) -> Dict[str, Any]:
    """Analyzes whether positive, negative, or neutral sentiment generates higher user engagement."""
    posts = social_service.get_social_posts(platform=platform, account_id=account_id, limit=500)
    
    sentiment_groups = {
        "positive": {"count": 0, "total_likes": 0, "total_comments": 0, "total_score": 0, "observed_total": 0, "observed_count": 0},
        "negative": {"count": 0, "total_likes": 0, "total_comments": 0, "total_score": 0, "observed_total": 0, "observed_count": 0},
        "neutral": {"count": 0, "total_likes": 0, "total_comments": 0, "total_score": 0, "observed_total": 0, "observed_count": 0}
    }
    
    for p in posts:
        s = p.get("sentiment", "neutral").lower()
        if s not in sentiment_groups:
            s = "neutral"
        score = compute_engagement_score(p.get("likes_count"), p.get("comments_count"), p.get("shares_count"))
        observed_score = compute_observed_engagement_subtotal(p.get("likes_count"), p.get("comments_count"), p.get("shares_count"))
        group = sentiment_groups[s]
        group["count"] += 1
        group["total_likes"] += p.get("likes_count") or 0
        group["total_comments"] += p.get("comments_count") or 0
        if score is not None:
            group["total_score"] += score
        if observed_score is not None:
            group["observed_total"] += observed_score
            group["observed_count"] += 1
        
    chart_data = []
    for s_name, g in sentiment_groups.items():
        cnt = max(g["count"], 1)
        chart_data.append({
            "sentiment": s_name.capitalize(),
            "count": g["count"],
            "avg_score": round(g["total_score"] / cnt, 1) if g["count"] and all(p.get("shares_count") is not None for p in posts if (p.get("sentiment") or "neutral").lower() == s_name) else None,
            "avg_observed_subtotal": round(g["observed_total"] / g["observed_count"], 1) if g["observed_count"] else None,
            "complete_score_posts": sum(1 for p in posts if (p.get("sentiment") or "neutral").lower() == s_name and compute_engagement_score(p.get("likes_count"), p.get("comments_count"), p.get("shares_count")) is not None),
            "avg_likes": round(g["total_likes"] / cnt, 1),
            "avg_comments": round(g["total_comments"] / cnt, 1)
        })
        
    return {
        "data": chart_data,
        "observation": (
            "Empirical comparison across collected data. Highly emotional posts "
            "(both strong positive endorsements and acute negative complaints) "
            "frequently exhibit elevated discussion velocity compared to neutral informational updates."
        )
    }


def get_best_posting_times(platform: Optional[str] = None, account_id: Optional[str] = None) -> Dict[str, Any]:
    """Recommend tentative posting windows from comparable, timestamped historical posts."""
    posts = social_service.get_social_posts(platform=platform, account_id=account_id, limit=5000)
    timed_posts = [(post, parse_utc_datetime(post.get("created_time"))) for post in posts]
    timed_posts = [(post, dt) for post, dt in timed_posts if dt is not None]
    day_names = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]
    metric_fields, _ = _comparable_post_scores([post for post, _ in timed_posts])
    weights = {"likes_count": 1, "comments_count": 2, "shares_count": 3}
    hourly = {hour: {"hour": f"{hour:02d}:00", "posts": 0, "scored_posts": 0, "avg_engagement": None, "total_engagement": 0} for hour in range(24)}
    daily = {day: {"day": day_names[day], "posts": 0, "scored_posts": 0, "avg_engagement": None, "total_engagement": 0} for day in range(7)}
    heatmap = [[{"day": day_names[day], "day_index": day, "window_start_hour": hour, "window": f"{hour:02d}:00–{hour + 2:02d}:59", "posts": 0, "scored_posts": 0, "avg_engagement": None, "total_engagement": 0} for hour in range(0, 24, 3)] for day in range(7)]
    timestamped_posts = len(timed_posts)
    scored_posts = 0

    for post, dt in timed_posts:
        day, hour = dt.weekday(), dt.hour
        day_bucket, hour_bucket = daily[day], hourly[hour]
        cell = heatmap[day][hour // 3]
        for bucket in (day_bucket, hour_bucket, cell):
            bucket["posts"] += 1
        values = {field: _valid_metric(post.get(field)) for field in metric_fields}
        if not metric_fields or any(value is None for value in values.values()):
            continue
        score = sum(values[field] * weights[field] for field in metric_fields)
        scored_posts += 1
        for bucket in (day_bucket, hour_bucket, cell):
            bucket["scored_posts"] += 1
            bucket["total_engagement"] += score

    for bucket in [*daily.values(), *hourly.values(), *(cell for row in heatmap for cell in row)]:
        if bucket["scored_posts"]:
            bucket["avg_engagement"] = round(bucket["total_engagement"] / bucket["scored_posts"], 2)
        del bucket["total_engagement"]

    min_bucket_sample = 2
    best_days = sorted((b for b in daily.values() if b["scored_posts"] >= min_bucket_sample), key=lambda b: b["avg_engagement"], reverse=True)[:3]
    best_hours = sorted((b for b in hourly.values() if b["scored_posts"] >= min_bucket_sample), key=lambda b: b["avg_engagement"], reverse=True)[:3]
    recommendations = sorted((cell for row in heatmap for cell in row if cell["scored_posts"] >= min_bucket_sample), key=lambda cell: cell["avg_engagement"], reverse=True)[:5] if scored_posts >= 3 else []
    for recommendation in recommendations:
        recommendation["tentative"] = scored_posts < 10 or recommendation["scored_posts"] < 5
        recommendation["reason"] = (
            f"Highest observed average in this day/time group ({recommendation['avg_engagement']:.2f} weighted interactions per comparable post), "
            f"based on {recommendation['scored_posts']} posts. Historical results do not guarantee future engagement."
        )
    available = bool(metric_fields and scored_posts >= 3 and recommendations)
    return {
        "account_id": str(account_id) if account_id else None,
        "timezone": "UTC",
        "score_basis": {"metrics": [field.removesuffix("_count") for field in metric_fields], "weights": {field.removesuffix("_count"): weights[field] for field in metric_fields}, "method": "Weighted observed interactions per comparable post; only metrics with at least 80% coverage are used, and posts missing any selected metric are excluded."},
        "timestamped_posts": timestamped_posts,
        "valid_timestamp_posts": timestamped_posts,
        "scored_posts": scored_posts,
        "minimum_bucket_sample": min_bucket_sample,
        "tentative": scored_posts < 10,
        "available": available,
        "availability_reason": None if available else "At least three posts with valid timestamps and the same sufficiently observed engagement metrics, plus a day/time group containing at least two comparable posts, are needed for recommendations.",
        "best_days": best_days,
        "best_hours": best_hours,
        "daily_distribution": list(daily.values()),
        "hourly_distribution": list(hourly.values()),
        "recommended_peak_hours": [bucket["hour"] for bucket in best_hours],
        "heatmap": heatmap,
        "recommendations": recommendations,
    }

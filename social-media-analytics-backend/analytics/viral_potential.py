"""
Viral Post Potential Engine
Computes transparent multi-factor viral potential scores (0-100) for social media posts
based on interaction velocity, emotional intensity, optimal timing, and media format.
"""
from typing import Dict, Any, List, Optional
from services import social_service
from analytics import aspect_analysis
from analytics import trend_discovery
from utils.time_utils import parse_utc_datetime
from analytics.engagement_analytics import compute_observed_engagement_subtotal


def evaluate_post_viral_potential(post: Dict[str, Any], recommendation_history: Optional[List[Dict[str, Any]]] = None) -> Dict[str, Any]:
    """Calculates viral potential score and factor breakdown for a single post."""
    def metric(primary, alias):
        value = post.get(primary) if primary in post else post.get(alias)
        try:
            return (max(0, int(value)), value is not None)
        except (TypeError, ValueError):
            return (0, False)

    likes, has_likes = metric("likes_count", "likes")
    comments, has_comments = metric("comments_count", "comments")
    shares, has_shares = metric("shares_count", "shares")
    text = post.get("text") or post.get("message") or post.get("caption") or ""
    platform = str(post.get("platform") or "facebook").lower()
    platform_name = platform.title()
    created_time = post.get("created_time")
    sentiment = post.get("sentiment", "neutral").lower()
    confidence = float(post.get("sentiment_confidence") if post.get("sentiment_confidence") is not None else post.get("prediction") if post.get("prediction") is not None else 0.5)
    history = recommendation_history
    if history is None:
        history = social_service.get_social_posts(platform=platform, account_id=post.get("account_id"), limit=500)
    
    factors = []
    total_score = 0.0
    
    # 1. Volume Factor (Max 35 pts)
    # Log-linear scaling up to 500 likes/comments
    raw_volume = (likes if has_likes else 0) + (2 * comments if has_comments else 0) + (3 * shares if has_shares else 0)
    available_metrics = sum((has_likes, has_comments, has_shares))
    if raw_volume >= 400:
        vol_score = 35.0
        factors.append({"factor": "High Engagement Volume", "points": "+35", "detail": f"Substantial interaction base ({likes if has_likes else 'unavailable'} reactions, {comments if has_comments else 'unavailable'} comments, {shares if has_shares else 'unavailable'} shares)."})
    elif raw_volume >= 150:
        vol_score = 25.0
        factors.append({"factor": "Moderate Engagement Volume", "points": "+25", "detail": f"Healthy audience interaction ({likes if has_likes else 'unavailable'} reactions, {comments if has_comments else 'unavailable'} comments, {shares if has_shares else 'unavailable'} shares)."})
    elif raw_volume >= 40:
        vol_score = 15.0
        factors.append({"factor": "Growing Engagement Volume", "points": "+15", "detail": f"Observed interaction volume ({likes if has_likes else 'unavailable'} reactions, {comments if has_comments else 'unavailable'} comments, {shares if has_shares else 'unavailable'} shares)."})
    else:
        vol_score = min(15.0, round(raw_volume * 0.25, 1))
        detail = f"Observed engagement score is {raw_volume} (reactions + 2×comments + 3×shares)."
        if available_metrics < 3:
            detail += f" {3 - available_metrics} engagement metric(s) unavailable and excluded from the calculation."
        factors.append({"factor": "Early Stage Volume", "points": f"+{vol_score}", "detail": detail})
    total_score += vol_score
    
    # 2. Discussion Velocity / Comment Ratio (Max 25 pts)
    # Algorithms prioritize posts that spark discussions (high comment-to-like ratio)
    ratio_available = has_likes and has_comments and likes > 0
    ratio = (comments / likes) if ratio_available else 0
    if ratio >= 0.20:
        ratio_score = 25.0
        factors.append({"factor": "Intense Discussion Velocity", "points": "+25", "detail": f"Remarkable discussion ratio ({ratio:.2f} comments per like) sparks algorithmic boosting."})
    elif ratio >= 0.10:
        ratio_score = 18.0
        factors.append({"factor": "Active Conversation", "points": "+18", "detail": f"Strong discussion ratio ({ratio:.2f} comments per like)."})
    elif ratio >= 0.05:
        ratio_score = 10.0
        factors.append({"factor": "Moderate Discussion", "points": "+10", "detail": "Decent comment feedback relative to likes."})
    else:
        ratio_score = 4.0
        detail = "Audience interaction is not discussion-heavy." if ratio_available else "A comment-to-reaction ratio cannot be calculated because usable metrics are missing or reactions are zero."
        factors.append({"factor": "Discussion Ratio Unavailable" if not ratio_available else "Passive Consumption", "points": "+4", "detail": detail})
    total_score += ratio_score
    
    # 3. Emotional Polarity & Sentiment Intensity (Max 15 pts)
    if sentiment in ("positive", "negative") and confidence >= 0.85:
        emo_score = 15.0
        factors.append({"factor": "High Emotional Intensity", "points": "+15", "detail": f"Strong emotional polarity ({sentiment.capitalize()}, confidence {confidence:.2f}) triggers sharing psychology."})
    elif sentiment in ("positive", "negative"):
        emo_score = 10.0
        factors.append({"factor": "Moderate Polarity", "points": "+10", "detail": f"Clear {sentiment} orientation drives resonance."})
    else:
        emo_score = 5.0
        factors.append({"factor": "Neutral Tone", "points": "+5", "detail": "Informational/neutral tone generally produces steady rather than viral dissemination."})
    total_score += emo_score
    
    # 4. Compare the post's hour with observed same-platform engagement (Max 15 pts)
    timing_score = 8.0
    dt = parse_utc_datetime(created_time)
    if dt:
        try:
            hour = dt.hour
            hourly_history = {}
            for item in history:
                historical_time = item.get("created_time") or ""
                try:
                    parsed_history_time = parse_utc_datetime(historical_time)
                    if parsed_history_time is None:
                        continue
                    historical_hour = parsed_history_time.hour
                except (TypeError, ValueError):
                    continue
                bucket = hourly_history.setdefault(historical_hour, [])
                observed_score = compute_observed_engagement_subtotal(item.get("likes_count"), item.get("comments_count"), item.get("shares_count"))
                if observed_score is not None:
                    bucket.append(observed_score)
            observed = hourly_history.get(hour, [])
            if len(observed) >= 2:
                overall = sum(sum(values) for values in hourly_history.values()) / max(sum(len(values) for values in hourly_history.values()), 1)
                observed_average = sum(observed) / len(observed)
                if observed_average >= overall:
                    timing_score = 15.0
                    factors.append({"factor": f"Above-Average {platform_name} Posting Hour", "points": "+15", "detail": f"Posts at {hour:02d}:00 UTC averaged {observed_average:.1f} engagement points over {len(observed)} posts, versus {overall:.1f} overall."})
                else:
                    timing_score = 7.0
                    factors.append({"factor": f"Below-Average {platform_name} Posting Hour", "points": "+7", "detail": f"Posts at {hour:02d}:00 UTC averaged {observed_average:.1f} engagement points over {len(observed)} posts, versus {overall:.1f} overall."})
            else:
                factors.append({"factor": "Unbenchmarked Posting Hour", "points": "+8", "detail": f"Fewer than two historical {platform_name} posts are available for {hour:02d}:00 UTC; using a neutral timing score."})
        except Exception:
            factors.append({"factor": "Unbenchmarked Posting Hour", "points": "+8", "detail": "UTC posting-time comparison could not be calculated from available timestamps."})
    else:
        factors.append({"factor": "Unbenchmarked Posting Hour", "points": "+8", "detail": "No valid timestamp is available; neutral timing points are used."})
    total_score += timing_score
    
    # 5. Platform-specific sharing signals (Max 10 pts)
    fmt_score = 5.0
    if has_shares and shares >= 20:
        fmt_score = 10.0
        factors.append({"factor": "Strong Share Activity", "points": "+10", "detail": f"This post has {shares} shares, a direct {platform_name} distribution signal."})
    elif "#" in text:
        fmt_score = 8.0
        factors.append({"factor": "Topic Tags", "points": "+8", "detail": "The post includes hashtags that describe its topic."})
    elif has_shares:
        fmt_score = 5.0
        factors.append({"factor": "Standard Post Format", "points": "+5", "detail": "Text/Standard media format."})
    else:
        fmt_score = 0.0
        factors.append({"factor": "Share Metric Unavailable", "points": "+0", "detail": "Shares were not supplied; no share-based points were added."})
    total_score += fmt_score
    
    final_score = min(round(total_score, 1), 100.0)
    
    # Potential Tier
    if final_score >= 75:
        tier = "High Potential"
        tier_color = "var(--success)"
    elif final_score >= 50:
        tier = "Moderate Potential"
        tier_color = "var(--warning)"
    else:
        tier = "Standard Reach"
        tier_color = "var(--text-muted)"
        
    recommendations = get_facebook_recommendations(post, history, platform=platform)
    if not recommendations["recommendations"]:
        recommendations["recommendations"].append({
            "title": f"Collect more {platform_name} history",
            "action": f"Connect a {platform_name} Professional account and collect more posts before using performance recommendations.",
            "evidence": f"Only {recommendations['sample_size']} live {platform_name} posts are available; at least 3 are needed for a useful comparison."
        })

    return {
        "post_id": post.get("id"),
        "platform": platform,
        "author": post.get("author", "Page"),
        "text": text,
        "likes": likes if has_likes else None,
        "comments": comments if has_comments else None,
        "shares": shares if has_shares else None,
        "engagement_metrics_available": {"reactions": has_likes, "comments": has_comments, "shares": has_shares},
        "score_type": "heuristic",
        "growth_data_available": False,
        "viral_score": final_score,
        "tier": tier,
        "tier_color": tier_color,
        "contributing_factors": factors,
        "recommendations": [item["action"] for item in recommendations["recommendations"]],
        "recommendation_evidence": recommendations,
        "disclaimer": f"Experimental heuristic score from stored {platform_name} post metrics; it is not a trained or calibrated probability. The database has no engagement snapshots, so growth is not measured."
    }


def get_ranked_viral_posts(limit: int = 20, platform: str = "facebook", account_id: Optional[str] = None) -> List[Dict[str, Any]]:
    posts = social_service.get_social_posts(platform=platform, account_id=account_id, limit=100)
    scored = [evaluate_post_viral_potential(p, posts) for p in posts]
    scored.sort(key=lambda x: x["viral_score"], reverse=True)
    return scored[:limit]


def get_facebook_recommendations(post: Optional[Dict[str, Any]] = None, history: Optional[List[Dict[str, Any]]] = None, platform: str = "facebook", account_id: Optional[str] = None) -> Dict[str, Any]:
    """Backward-compatible name for explainable same-platform stored-post guidance."""
    return _facebook_recommendation_insights(post, history, platform=platform, account_id=account_id)


def _facebook_recommendation_insights(post: Optional[Dict[str, Any]] = None, history: Optional[List[Dict[str, Any]]] = None, platform: str = "facebook", account_id: Optional[str] = None) -> Dict[str, Any]:
    platform = (platform or "facebook").lower()
    platform_name = platform.title()
    if history is None:
        history = social_service.get_social_posts(platform=platform, account_id=account_id, limit=500)
    if not history:
        return {"platform": platform, "sample_size": 0, "source": f"stored live {platform_name} post history", "recommendations": [], "limitations": f"Not enough stored {platform_name} data is available to support recommendations."}

    score = lambda item: compute_observed_engagement_subtotal(item.get("likes_count"), item.get("comments_count"), item.get("shares_count"))
    insights = []
    if len(history) >= 3:
        hourly = {}
        for item in history:
            created = item.get("created_time") or ""
            try:
                parsed_time = parse_utc_datetime(created)
                if parsed_time is None:
                    continue
                hour = parsed_time.hour
            except (TypeError, ValueError):
                continue
            bucket = hourly.setdefault(hour, {"posts": 0, "score": 0})
            observed_score = score(item)
            if observed_score is None:
                continue
            bucket["posts"] += 1
            bucket["score"] += observed_score
        observed_hours = [
            (hour, values["score"] / values["posts"], values["posts"])
            for hour, values in hourly.items() if values["posts"] >= 2
        ]
        if observed_hours:
            best_hour, avg_score, count = max(observed_hours, key=lambda entry: entry[1])
            insights.append({
                "title": "Use your strongest observed posting hour",
                "action": f"Consider scheduling a {platform_name} post around {best_hour:02d}:00 UTC.",
                "evidence": f"Posts at {best_hour:02d}:00 averaged engagement score {avg_score:.1f} across {count} posts (score = likes + 2×comments + 3×shares)."
            })

        scored_history = [item for item in history if score(item) is not None]
        top = max(scored_history, key=score) if scored_history else None
        average = sum(score(item) for item in scored_history) / len(scored_history) if scored_history else None
        if top and score(top) > average:
            excerpt = (top.get("text") or "").strip().replace("\n", " ")[:100]
            insights.append({
                "title": f"Review a high-engagement {platform_name} post",
                "action": "Compare future post wording and topic with this above-average post.",
            "evidence": f"Top stored post's observed subtotal was {score(top)} vs. a {average:.1f} average across {len(scored_history)} posts; unavailable shares are excluded. Example: {excerpt}"
            })

        sentiment_scores = {}
        for item in history:
            sentiment = (item.get("sentiment") or "neutral").lower()
            group = sentiment_scores.setdefault(sentiment, [])
            observed_score = score(item)
            if observed_score is not None:
                group.append(observed_score)
        comparable = [(name, vals) for name, vals in sentiment_scores.items() if len(vals) >= 2]
        if len(comparable) >= 2:
            best_name, best_values = max(comparable, key=lambda entry: sum(entry[1]) / len(entry[1]))
            insights.append({
                "title": "Use sentiment engagement as a content signal",
                "action": f"Review the topics and framing of {best_name} {platform_name} posts when planning similar content.",
                "evidence": f"{best_name.capitalize()} posts averaged {sum(best_values) / len(best_values):.1f} engagement points across {len(best_values)} posts. This is an observed association, not proof that sentiment caused the difference."
            })

        # Use observed aspect mentions to make the next action specific and auditable.
        aspect_summary = aspect_analysis.get_aspect_analytics_summary(platform=platform, account_id=account_id or (post.get("account_id") if post else None)) if post is None else {"aspects": []}
        negative_aspects = [aspect for aspect in aspect_summary.get("aspects", []) if aspect.get("negative_count", 0) >= 2]
        if negative_aspects:
            aspect = max(negative_aspects, key=lambda row: row["negative_count"])
            example = (aspect.get("negative_evidence") or [{}])[0]
            insights.append({
                "title": f"Review negative {aspect['name'].lower()} feedback",
                "action": f"Inspect the {platform_name} feedback mentioning {aspect['name'].lower()} and assign a follow-up owner if the issue is actionable.",
                "evidence": f"{aspect['negative_count']} of {aspect['total_mentions']} detected {aspect['name'].lower()} mentions were negative in the stored {platform_name} posts/comments. Example: {(example.get('text') or '')[:120]}"
            })

        if post is None:
            trends = trend_discovery.get_trend_discovery(platform=platform, top_n=10, period_days=7, account_id=account_id)
            comparison = trends.get("period_comparison", {})
            if comparison.get("available") and (comparison.get("negative_change_percentage_points") or 0) > 0:
                current = comparison["current_period"]
                previous = comparison["previous_period"]
                insights.append({
                    "title": "Review the recent rise in negative feedback",
                    "action": f"Inspect recent negative {platform_name} posts and comments, then check whether the increase reflects a recurring topic before taking action.",
                    "evidence": f"Negative items rose from {previous['negative_percent']}% ({previous['negative']}/{previous['total']}) to {current['negative_percent']}% ({current['negative']}/{current['total']}) over consecutive 7-day windows ending at the latest stored {platform_name} timestamp."
                })
            if trends.get("emerging_topics"):
                topic = trends["emerging_topics"][0]
                insights.append({
                    "title": f"Monitor the emerging {platform_name} topic '{topic['keyword']}'",
                    "action": "Review the recent posts and comments containing this topic to decide whether it needs a response or further monitoring.",
                    "evidence": f"The topic appeared in {topic['recent_count']} items in the latest stored 7-day window versus {topic['prior_count']} in the preceding window ({topic['growth_velocity']}; minimum two recent mentions)."
                })

    if post is not None and int(post.get("likes_count") or post.get("likes") or 0) > 0:
        likes = int(post.get("likes_count") or post.get("likes") or 0)
        comments = int(post.get("comments_count") or post.get("comments") or 0)
        post_ratio = comments / likes
        historical_ratios = [
            int(item.get("comments_count") or 0) / max(int(item.get("likes_count") or 0), 1)
            for item in history if int(item.get("likes_count") or 0) > 0
        ]
        if historical_ratios:
            baseline_ratio = sum(historical_ratios) / len(historical_ratios)
            if post_ratio < baseline_ratio:
                insights.append({
                    "title": "Increase discussion on this post",
                    "action": f"Try a specific, easy-to-answer question in the next {platform_name} post.",
                    "evidence": f"This post has {post_ratio:.2f} comments per like; the stored {platform_name} average is {baseline_ratio:.2f} across {len(historical_ratios)} posts."
                })

    return {"platform": platform, "sample_size": len(history), "source": f"stored live {platform_name} post history and comments", "recommendations": insights, "limitations": "Recommendations describe observed associations and text signals; they do not establish causes or guarantee performance."}

"""
Viral Post Potential Engine
Computes transparent multi-factor viral potential scores (0-100) for social media posts
based on interaction velocity, emotional intensity, optimal timing, and media format.
"""
from datetime import datetime
from typing import Dict, Any, List, Optional
from services import social_service


def evaluate_post_viral_potential(post: Dict[str, Any]) -> Dict[str, Any]:
    """Calculates viral potential score and factor breakdown for a single post."""
    likes = int(post.get("likes_count") or post.get("likes") or 0)
    comments = int(post.get("comments_count") or post.get("comments") or 0)
    text = post.get("text") or post.get("message") or post.get("caption") or ""
    media_type = (post.get("media_type") or "post").upper()
    platform = post.get("platform", "facebook").lower()
    created_time = post.get("created_time")
    sentiment = post.get("sentiment", "neutral").lower()
    confidence = float(post.get("sentiment_confidence") or post.get("prediction") or 0.5)
    
    factors = []
    total_score = 0.0
    
    # 1. Volume Factor (Max 35 pts)
    # Log-linear scaling up to 500 likes/comments
    raw_volume = likes + (2 * comments)
    if raw_volume >= 400:
        vol_score = 35.0
        factors.append({"factor": "High Engagement Volume", "points": "+35", "detail": f"Substantial interaction base ({likes} likes, {comments} comments)."})
    elif raw_volume >= 150:
        vol_score = 25.0
        factors.append({"factor": "Moderate Engagement Volume", "points": "+25", "detail": f"Healthy audience interaction ({likes} likes, {comments} comments)."})
    elif raw_volume >= 40:
        vol_score = 15.0
        factors.append({"factor": "Growing Engagement Volume", "points": "+15", "detail": f"Active initial interaction ({likes} likes, {comments} comments)."})
    else:
        vol_score = max(5.0, round(raw_volume * 0.25, 1))
        factors.append({"factor": "Early Stage Volume", "points": f"+{vol_score}", "detail": "Developing engagement base."})
    total_score += vol_score
    
    # 2. Discussion Velocity / Comment Ratio (Max 25 pts)
    # Algorithms prioritize posts that spark discussions (high comment-to-like ratio)
    ratio = (comments / max(likes, 1)) if likes > 0 else 0
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
        factors.append({"factor": "Passive Consumption", "points": "+4", "detail": "Audience liking without active discussion."})
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
    
    # 4. Timing Optimization (Max 15 pts)
    timing_score = 8.0  # default
    if created_time:
        try:
            dt = datetime.fromisoformat(created_time.replace("Z", "+00:00"))
            hour = dt.hour
            # Peak social browsing hours: 11-14 or 18-21
            if 11 <= hour <= 14 or 18 <= hour <= 21:
                timing_score = 15.0
                factors.append({"factor": "Prime Audience Window", "points": "+15", "detail": f"Posted at {hour:02d}:00 UTC during peak global browsing hours."})
            else:
                timing_score = 7.0
                factors.append({"factor": "Off-Peak Posting", "points": "+7", "detail": f"Posted at {hour:02d}:00 UTC outside primary social browsing peaks."})
        except Exception:
            factors.append({"factor": "Standard Timing", "points": "+8", "detail": "Timestamp within typical baseline."})
    else:
        factors.append({"factor": "Standard Timing", "points": "+8", "detail": "Timestamp within typical baseline."})
    total_score += timing_score
    
    # 5. Media Format & Hashtags (Max 10 pts)
    fmt_score = 5.0
    if platform == "instagram" and media_type in ("VIDEO", "CAROUSEL_ALBUM"):
        fmt_score = 10.0
        factors.append({"factor": "High-Reach Media Format", "points": "+10", "detail": f"Instagram {media_type} format receives algorithm reach prioritization."})
    elif "#" in text:
        fmt_score = 8.0
        factors.append({"factor": "Topic Discovery Tags", "points": "+8", "detail": "Hashtags expand discoverability beyond immediate followers."})
    else:
        fmt_score = 5.0
        factors.append({"factor": "Standard Post Format", "points": "+5", "detail": "Text/Standard media format."})
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
        
    recommendations = []
    if ratio < 0.10:
        recommendations.append("Ask an open-ended question at the end of the post to invite replies and boost discussion velocity.")
    if timing_score < 10:
        recommendations.append("Schedule future updates between 11:00-14:00 or 18:00-21:00 UTC to capture maximum active feeds.")
    if "#" not in text and platform == "instagram":
        recommendations.append("Include 3-5 relevant hashtags to expand discoverability on Instagram explore channels.")
    if not recommendations:
        recommendations.append("Post exhibits optimal balance across volume, discussion, and timing factors.")

    return {
        "post_id": post.get("id"),
        "platform": platform,
        "author": post.get("author", "Page"),
        "text": text,
        "likes": likes,
        "comments": comments,
        "viral_score": final_score,
        "tier": tier,
        "tier_color": tier_color,
        "contributing_factors": factors,
        "recommendations": recommendations,
        "disclaimer": "Transparent heuristic estimate based on multi-platform engagement parameters — not a guaranteed outcome."
    }


def get_ranked_viral_posts(platform: Optional[str] = None, limit: int = 20) -> List[Dict[str, Any]]:
    posts = social_service.get_social_posts(platform=platform, limit=100)
    scored = [evaluate_post_viral_potential(p) for p in posts]
    scored.sort(key=lambda x: x["viral_score"], reverse=True)
    return scored[:limit]

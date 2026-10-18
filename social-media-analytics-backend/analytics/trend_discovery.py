"""
Trend & Keyword Discovery Engine
Extracts meaningful keyword frequencies, hashtag counts, emerging trends,
keyword-to-sentiment distributions, and cross-platform keyword comparisons.
"""
import re
from typing import Dict, Any, List, Optional
from services import social_service
from nlp.preprocessing import STOPWORDS


def _clean_tokens(text: str) -> List[str]:
    clean = re.sub(r"https?://\S+|www\.\S+", "", text.lower())
    words = re.findall(r"\b[a-zA-Z]{3,}\b", clean)
    return [w for w in words if w not in STOPWORDS]


def _extract_hashtags(text: str) -> List[str]:
    return [tag.lower() for tag in re.findall(r"#([a-zA-Z0-9_]{2,})", text)]


def get_trend_discovery(platform: Optional[str] = None, top_n: int = 25) -> Dict[str, Any]:
    posts = social_service.get_social_posts(platform=platform, limit=500)
    comments = social_service.get_social_comments(limit=500)
    
    if platform and platform.lower() != "all":
        comments = [c for c in comments if c.get("platform") == platform.lower()]
        
    combined = []
    for p in posts:
        combined.append({
            "text": p["text"],
            "sentiment": p.get("sentiment", "neutral").lower(),
            "platform": p["platform"],
            "created_time": p.get("created_time")
        })
    for c in comments:
        combined.append({
            "text": c["text"],
            "sentiment": c.get("sentiment", "neutral").lower(),
            "platform": c["platform"],
            "created_time": c.get("created_time")
        })
        
    if not combined:
        return {
            "top_keywords": [],
            "positive_keywords": [],
            "negative_keywords": [],
            "top_hashtags": [],
            "emerging_topics": [],
            "platform_comparison": {},
            "total_items": 0
        }
        
    word_freq: Dict[str, int] = {}
    word_sentiment: Dict[str, Dict[str, int]] = {}
    hashtag_freq: Dict[str, int] = {}
    
    # Split chronologically for emerging velocity
    half = len(combined) // 2
    first_half_words: Dict[str, int] = {}
    second_half_words: Dict[str, int] = {}
    
    # Platform counts
    fb_words: Dict[str, int] = {}
    ig_words: Dict[str, int] = {}
    
    for idx, item in enumerate(combined):
        text = item["text"]
        sent = item["sentiment"]
        plat = item["platform"]
        
        # Hashtags
        tags = _extract_hashtags(text)
        for t in tags:
            hashtag_freq[f"#{t}"] = hashtag_freq.get(f"#{t}", 0) + 1
            
        tokens = set(_clean_tokens(text))
        for w in tokens:
            word_freq[w] = word_freq.get(w, 0) + 1
            
            if w not in word_sentiment:
                word_sentiment[w] = {"positive": 0, "negative": 0, "neutral": 0}
            if sent in word_sentiment[w]:
                word_sentiment[w][sent] += 1
            else:
                word_sentiment[w]["neutral"] += 1
                
            if idx < half:
                first_half_words[w] = first_half_words.get(w, 0) + 1
            else:
                second_half_words[w] = second_half_words.get(w, 0) + 1
                
            if plat == "facebook":
                fb_words[w] = fb_words.get(w, 0) + 1
            elif plat == "instagram":
                ig_words[w] = ig_words.get(w, 0) + 1

    # Sorted overall keywords
    sorted_keywords = sorted(word_freq.items(), key=lambda x: x[1], reverse=True)[:top_n]
    top_kw_data = []
    for w, count in sorted_keywords:
        s_data = word_sentiment.get(w, {"positive": 0, "negative": 0, "neutral": 0})
        total_w = sum(s_data.values())
        top_kw_data.append({
            "keyword": w,
            "count": count,
            "positive": s_data.get("positive", 0),
            "negative": s_data.get("negative", 0),
            "neutral": s_data.get("neutral", 0),
            "dominant_sentiment": max(s_data.items(), key=lambda x: x[1])[0] if total_w > 0 else "neutral"
        })
        
    # Top Positive Keywords
    pos_sorted = sorted(
        [(w, s["positive"]) for w, s in word_sentiment.items() if s["positive"] > 0],
        key=lambda x: x[1], reverse=True
    )[:15]
    top_pos = [{"keyword": w, "count": cnt} for w, cnt in pos_sorted]
    
    # Top Negative Keywords
    neg_sorted = sorted(
        [(w, s["negative"]) for w, s in word_sentiment.items() if s["negative"] > 0],
        key=lambda x: x[1], reverse=True
    )[:15]
    top_neg = [{"keyword": w, "count": cnt} for w, cnt in neg_sorted]
    
    # Top Hashtags
    sorted_tags = sorted(hashtag_freq.items(), key=lambda x: x[1], reverse=True)[:15]
    top_tags = [{"hashtag": t, "count": cnt} for t, cnt in sorted_tags]
    
    # Emerging Topics: words with substantial acceleration in the second half
    emerging = []
    for w, recent_cnt in second_half_words.items():
        prior_cnt = first_half_words.get(w, 0)
        growth_ratio = round((recent_cnt - prior_cnt) / max(prior_cnt, 1), 2)
        if recent_cnt >= 2 and growth_ratio >= 0.5:
            emerging.append({
                "keyword": w,
                "recent_count": recent_cnt,
                "prior_count": prior_cnt,
                "growth_velocity": f"+{int(growth_ratio * 100)}%"
            })
    emerging.sort(key=lambda x: x["recent_count"], reverse=True)
    
    # Platform comparison
    top_fb = [{"keyword": k, "count": v} for k, v in sorted(fb_words.items(), key=lambda x: x[1], reverse=True)[:10]]
    top_ig = [{"keyword": k, "count": v} for k, v in sorted(ig_words.items(), key=lambda x: x[1], reverse=True)[:10]]
    
    return {
        "top_keywords": top_kw_data,
        "positive_keywords": top_pos,
        "negative_keywords": top_neg,
        "top_hashtags": top_tags,
        "emerging_topics": emerging[:10],
        "platform_comparison": {
            "facebook_top_keywords": top_fb,
            "instagram_top_keywords": top_ig
        },
        "total_items": len(combined)
    }

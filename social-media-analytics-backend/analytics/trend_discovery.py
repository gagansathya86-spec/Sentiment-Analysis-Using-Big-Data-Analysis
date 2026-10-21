"""Facebook keyword, hashtag and timestamp-based trend analysis."""
from collections import Counter, defaultdict
from datetime import timedelta
import re
from typing import Any, Dict, List, Optional

from services import social_service
from nlp.preprocessing import STOPWORDS
from utils.time_utils import parse_utc_datetime
from analytics.aspect_analysis import score_clause_sentiment

_EXTRA_STOPWORDS = {"really", "though", "like", "one", "whole", "also", "just", "very", "would", "could", "there", "here", "that", "this"}


def _parse_time(value):
    return parse_utc_datetime(value)


def _normalize_token(word: str) -> str:
    """Lightweight normalization for inflectional plurals without adding a dependency."""
    if len(word) > 4 and word.endswith("ies"):
        return word[:-3] + "y"
    if len(word) > 4 and word.endswith("s") and not word.endswith(("ss", "us", "is")):
        return word[:-1]
    return word


def _clean_tokens(text: str) -> List[str]:
    clean = re.sub(r"https?://\S+|www\.\S+", "", (text or "").lower())
    stopwords = set(STOPWORDS) | _EXTRA_STOPWORDS
    return [_normalize_token(word) for word in re.findall(r"\b[a-zA-Z]{3,}\b", clean) if word not in stopwords]


def _keyword_occurrences(text: str):
    """Return normalized terms and the sentence/clause sentiment at each occurrence."""
    occurrences = []
    for clause in re.split(r"[.!?;\n]+|\b(?:but|however|although|though)\b", text or "", flags=re.I):
        clause_label = score_clause_sentiment(clause)
        for token in _clean_tokens(clause):
            occurrences.append((token, clause_label))
    return occurrences


def _extract_hashtags(text: str) -> List[str]:
    return [tag.lower() for tag in re.findall(r"(?<!\w)#([a-zA-Z0-9_]{2,})", text or "")]


def compare_sentiment_periods(items: List[Dict[str, Any]], period_days: int = 7, min_items: int = 1) -> Dict[str, Any]:
    dated = [(item, _parse_time(item.get("created_time"))) for item in items]
    dated = [(item, stamp) for item, stamp in dated if stamp]
    if not dated:
        return {"available": False, "reason": "No valid Facebook timestamps are available.", "period_days": period_days}
    anchor = max(stamp for _, stamp in dated)
    current_start = anchor - timedelta(days=period_days)
    previous_start = current_start - timedelta(days=period_days)
    windows = {"current": [], "previous": []}
    for item, stamp in dated:
        if current_start < stamp <= anchor:
            windows["current"].append(item)
        elif previous_start < stamp <= current_start:
            windows["previous"].append(item)

    def summarize(rows):
        total = len(rows)
        sentiments = Counter((row.get("sentiment") or "neutral").lower() for row in rows)
        return {"total": total, "positive": sentiments["positive"], "negative": sentiments["negative"], "neutral": total - sentiments["positive"] - sentiments["negative"], "negative_percent": round(100 * sentiments["negative"] / total, 1) if total else None}

    current, previous = summarize(windows["current"]), summarize(windows["previous"])
    enough = current["total"] >= min_items and previous["total"] >= min_items
    return {"available": enough, "period_days": period_days, "anchor": anchor.isoformat(), "minimum_items_per_period": min_items, "current_period": {"start": current_start.isoformat(), "end": anchor.isoformat(), **current}, "previous_period": {"start": previous_start.isoformat(), "end": current_start.isoformat(), **previous}, "negative_change_percentage_points": round(current["negative_percent"] - previous["negative_percent"], 1) if enough else None, "reason": None if enough else f"Each consecutive period needs at least {min_items} timestamped records."}


def get_trend_discovery(platform: Optional[str] = "facebook", top_n: int = 25, period_days: int = 7, account_id: Optional[str] = None) -> Dict[str, Any]:
    selected_platform = (platform or "facebook").lower()
    posts = social_service.get_social_posts(platform=selected_platform, account_id=account_id, limit=1000)
    post_ids = {row.get("id") for row in posts}
    comments = [row for row in social_service.get_social_comments(limit=1000, platform=selected_platform) if row.get("post_id") in post_ids]
    combined = [{"id": row.get("id"), "text": row.get("text", ""), "sentiment": (row.get("sentiment") or "neutral").lower(), "platform": selected_platform, "created_time": row.get("created_time")} for row in posts]
    combined.extend({"id": row.get("id"), "text": row.get("text", ""), "sentiment": (row.get("sentiment") or "neutral").lower(), "platform": selected_platform, "created_time": row.get("created_time")} for row in comments)
    if not combined:
        return {"platform": selected_platform, "account_id": account_id, "top_keywords": [], "positive_keywords": [], "negative_keywords": [], "top_hashtags": [], "emerging_topics": [], "platform_comparison": {f"{selected_platform}_top_keywords": []}, "total_items": 0, "period_comparison": compare_sentiment_periods([], period_days), "sentiment_over_time": [], "methodology": "Keywords use occurrence-clause sentiment from a local lexicon, not contextual NLP."}

    word_freq, word_sentiment, tag_freq = Counter(), defaultdict(Counter), Counter()
    date_counts = defaultdict(Counter)
    parsed = [(item, _parse_time(item.get("created_time"))) for item in combined]
    valid = [(item, stamp) for item, stamp in parsed if stamp]
    anchor = max((stamp for _, stamp in valid), default=None)
    current_boundary = anchor - timedelta(days=period_days) if anchor else None
    previous_boundary = current_boundary - timedelta(days=period_days) if current_boundary else None
    current_items, previous_items = set(), set()
    current_words, previous_words = Counter(), Counter()
    for item, stamp in parsed:
        text = item["text"]
        tag_freq.update(f"#{tag}" for tag in _extract_hashtags(text))
        occurrences = _keyword_occurrences(text)
        for word, sentiment in occurrences:
            word_freq[word] += 1
            word_sentiment[word][sentiment] += 1
            if stamp and anchor and current_boundary < stamp <= anchor:
                current_words[word] += 1
            elif stamp and previous_boundary and previous_boundary < stamp <= current_boundary:
                previous_words[word] += 1
        if stamp:
            date_counts[stamp.date().isoformat()][item["sentiment"] if item["sentiment"] in ("positive", "negative", "neutral") else "neutral"] += 1
            if current_boundary < stamp <= anchor:
                current_items.add(item.get("id"))
            elif previous_boundary < stamp <= current_boundary:
                previous_items.add(item.get("id"))

    top_kw = []
    for word, count in word_freq.most_common(max(1, min(top_n, 100))):
        sentiments = word_sentiment[word]
        dominant = max(("positive", "negative", "neutral"), key=lambda label: sentiments[label])
        top_kw.append({"keyword": word, "count": count, "positive": sentiments["positive"], "negative": sentiments["negative"], "neutral": sentiments["neutral"], "dominant_sentiment": dominant})
    emerging = []
    min_period = 3
    if current_boundary and previous_boundary and len(current_items) >= min_period and len(previous_items) >= min_period:
        for word, recent_count in current_words.items():
            prior_count = previous_words[word]
            if recent_count >= 2 and recent_count > prior_count:
                growth = round((recent_count - prior_count) * 100 / prior_count) if prior_count else None
                emerging.append({"keyword": word, "recent_count": recent_count, "prior_count": prior_count, "growth_velocity": f"+{growth}%" if growth is not None else None, "period_days": period_days})
    emerging.sort(key=lambda row: (-row["recent_count"], row["keyword"]))
    sentiment_over_time = [{"date": day, "positive": counts["positive"], "negative": counts["negative"], "neutral": counts["neutral"], "total": sum(counts.values())} for day, counts in sorted(date_counts.items())]
    top_items = [{"keyword": word, "count": count} for word, count in word_freq.most_common(10)]
    return {"platform": selected_platform, "account_id": account_id, "top_keywords": top_kw, "positive_keywords": [{"keyword": word, "count": values["positive"]} for word, values in sorted(word_sentiment.items(), key=lambda pair: pair[1]["positive"], reverse=True) if values["positive"]][:15], "negative_keywords": [{"keyword": word, "count": values["negative"]} for word, values in sorted(word_sentiment.items(), key=lambda pair: pair[1]["negative"], reverse=True) if values["negative"]][:15], "top_hashtags": [{"hashtag": tag, "count": count} for tag, count in tag_freq.most_common(15)], "emerging_topics": emerging[:10], "emerging_topics_available": len(current_items) >= min_period and len(previous_items) >= min_period, "emerging_topics_reason": None if len(current_items) >= min_period and len(previous_items) >= min_period else f"Emerging-topic velocity needs at least {min_period} timestamped items in each period.", "platform_comparison": {f"{selected_platform}_top_keywords": top_items}, "total_items": len(combined), "period_comparison": compare_sentiment_periods(combined, period_days), "sentiment_over_time": sentiment_over_time, "methodology": "Keywords are counted per occurrence and labeled using local clause-level sentiment lexicon scoring, not contextual NLP. Hashtags come only from literal #tags. Periods use normalized UTC timestamps; velocity is withheld without at least three timestamped items in each window."}

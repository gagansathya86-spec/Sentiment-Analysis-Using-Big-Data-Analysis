"""Explainable clause-level aspect sentiment for Facebook text."""
import re
from typing import Any, Dict, List, Optional

from services import social_service

DEFAULT_ASPECTS: Dict[str, List[str]] = {
    "product_quality": ["quality", "material", "build", "hardware", "feature", "durable", "defect", "broken", "finish", "speed", "performance", "sound", "battery", "camera", "screen", "product", "device"],
    "price": ["price", "cost", "expensive", "cheap", "value", "discount", "offer", "sale", "subscription", "bill", "billing", "refund", "fee", "charge", "charged"],
    "customer_service": ["support", "customer service", "service", "staff", "agent", "team", "representative", "help", "chat", "call", "ticket", "response", "hold", "answer", "rude"],
    "delivery": ["delivery", "shipping", "courier", "package", "dispatch", "order", "arrival", "delayed", "delay", "late", "transit", "tracking", "arrived"],
    "location": ["location", "store", "branch", "parking", "nearby", "address", "venue", "neighborhood", "road", "roads", "journey", "travel", "trip", "destination", "route", "scenic", "landmark", "attraction", "place", "beach", "mountain", "waterfall", "trail", "transport", "traffic", "directions", "accessibility"],
    "usability": ["easy", "intuitive", "ui", "ux", "interface", "design", "layout", "complex", "confusing", "simple", "navigate", "minimal", "dark mode"],
    "reliability": ["crash", "freeze", "bug", "error", "issue", "failure", "outage", "downtime", "maintenance", "stable", "reliable", "offline", "broke"],
    "general_feedback": ["experience", "recommend", "love", "favorite", "worst", "best", "satisfied", "disappointed", "impressive", "terrible", "great", "awesome", "scam"],
}

POSITIVE_WORDS = {"good", "great", "excellent", "amazing", "wonderful", "fantastic", "love", "best", "fast", "speedy", "helpful", "clean", "smooth", "sleek", "intuitive", "awesome", "perfect", "reliable", "happy", "liked", "impressive", "proud", "comfortable", "beautiful", "answered", "lovely", "breathtaking", "stunning", "gorgeous", "heaven", "enjoy", "enjoyed", "enjoying", "favorite", "favourite", "delightful", "peaceful", "magical", "incredible", "wonderful", "adorable", "pleasant", "recommend", "recommendable", "satisfied", "grateful"}
NEGATIVE_WORDS = {"bad", "terrible", "horrible", "awful", "worst", "broken", "delayed", "late", "slow", "error", "bug", "crash", "outage", "scam", "disappointed", "confusing", "poor", "rude", "failed", "freeze", "unacceptable", "expensive", "hate", "ignored", "waiting", "waited", "unresponsive", "scary", "scared", "difficult", "hard", "dangerous", "frightening", "awful", "ugly", "sad", "angry", "disgusting", "horrifying", "stressful", "stress", "painful", "unpleasant", "disappointing", "boring", "annoying", "regret", "unsafe", "problem", "problems"}
NEGATORS = {"not", "no", "never", "hardly", "without", "isn't", "wasn't", "weren't", "doesn't", "didn't", "cannot", "can't", "couldn't", "won't", "wouldn't", "isnt", "wasnt", "werent", "doesnt", "didnt", "cant", "couldnt", "wont", "wouldnt"}
INTENSIFIERS = {"really", "very", "absolutely", "extremely", "so", "incredibly", "truly"}
CONTRAST_WORDS = re.compile(r"\b(?:but|however|although|though|yet|whereas|nevertheless)\b", re.IGNORECASE)
POSITIVE_EMOJIS = {"❤️", "❤", "😍", "🥰", "😊", "😁", "😄", "😃", "👍", "👏", "🙌", "✨", "💕", "💖", "🥳"}
NEGATIVE_EMOJIS = {"😡", "😢", "😭", "💔", "😠", "🤬", "😞", "😔", "🤢", "🤮", "😒", "😤"}
CONJUNCTIONS_REGEX = re.compile(r"\b(?:but|however|although|though|while|yet|except|whereas)\b|[,;.]+", re.IGNORECASE)


def extract_clauses(text: str) -> List[str]:
    clauses = [part.strip() for part in CONJUNCTIONS_REGEX.split(text or "") if part and len(part.strip()) > 2]
    return clauses or ([text.strip()] if text and text.strip() else [])


def score_clause_sentiment(clause: str, parent_sentiment: Optional[str] = None) -> str:
    """Return local lexicon polarity; parent sentiment is deliberately not inherited."""
    tokens = re.findall(r"\b[a-zA-Z']+\b", (clause or "").lower())
    positive = negative = 0
    for index, token in enumerate(tokens):
        polarity = 1 if token in POSITIVE_WORDS else -1 if token in NEGATIVE_WORDS else 0
        if not polarity:
            continue
        negated = any(word in NEGATORS for word in tokens[max(0, index - 3):index])
        if negated:
            polarity *= -1
        if polarity > 0:
            positive += 1
        else:
            negative += 1
    if positive > negative:
        return "positive"
    if negative > positive:
        return "negative"
    return "neutral"


def _clause_sentiment_score(clause: str) -> float:
    """Return an explainable lexical score, preserving local negation and emphasis."""
    tokens = re.findall(r"\b[a-zA-Z']+\b", (clause or "").lower())
    score = 0.0
    for index, token in enumerate(tokens):
        polarity = 1 if token in POSITIVE_WORDS else -1 if token in NEGATIVE_WORDS else 0
        if not polarity:
            continue
        if any(word in NEGATORS for word in tokens[max(0, index - 3):index]):
            polarity *= -1
        weight = 1.5 if any(word in INTENSIFIERS for word in tokens[max(0, index - 2):index]) else 1.0
        score += polarity * weight

    # Expressing a wish to spend time or stay somewhere is positive preference,
    # independent of the exact duration or venue named in a comment.
    if re.search(r"\b(?:could|would|can)\s+(?:easily\s+)?(?:spend|stay|live)\b.*\b(?:here|there)\b", clause, re.IGNORECASE):
        score += 1.5
    for emoji in POSITIVE_EMOJIS:
        score += clause.count(emoji)
    for emoji in NEGATIVE_EMOJIS:
        score -= clause.count(emoji)
    return score


def classify_comment_sentiment(text: str, fallback_sentiment: Optional[str] = None) -> str:
    """Add local, explainable context to the existing NB comment prediction.

    A contrast clause receives more weight after words such as “but”; polarity
    words are flipped by nearby negation. When the local lexicon has no evidence,
    retain the saved TF-IDF + Naive Bayes prediction as the fallback.
    """
    clauses = [part.strip() for part in re.split(r"[,;.!?]+", text or "") if part.strip()]
    if not clauses:
        return fallback_sentiment if fallback_sentiment in {"positive", "negative", "neutral"} else "unknown"
    score = 0.0
    contrast_seen = False
    cursor = 0
    for match in re.finditer(r"[,;.!?]+|\b(?:but|however|although|though|yet|whereas|nevertheless)\b", text or "", re.IGNORECASE):
        segment = (text or "")[cursor:match.start()]
        cue = match.group(0).lower()
        if segment.strip():
            score += _clause_sentiment_score(segment) * (1.5 if contrast_seen else 1.0)
        if cue.strip() and cue[0].isalpha():
            contrast_seen = True
        cursor = match.end()
    score += _clause_sentiment_score((text or "")[cursor:]) * (1.5 if contrast_seen else 1.0)
    if score > 0:
        return "positive"
    if score < 0:
        return "negative"
    return fallback_sentiment if fallback_sentiment in {"positive", "negative", "neutral"} else "neutral"


def analyze_text_aspects(text: str, parent_sentiment: Optional[str] = None, aspect_config: Optional[Dict[str, List[str]]] = None) -> Dict[str, Any]:
    """Return per-clause evidence and aspect-level positive/negative/mixed labels."""
    configured = aspect_config or DEFAULT_ASPECTS
    detected: Dict[str, Dict[str, Any]] = {}
    clauses = extract_clauses(text)
    # Split simple coordinated targets only when both sides name a configured aspect
    # and each side contains a local opinion cue; this avoids splitting ordinary lists.
    expanded = []
    for clause in clauses:
        pieces = re.split(r"\band\b", clause, flags=re.IGNORECASE)
        if len(pieces) == 2:
            normalized = [piece.lower() for piece in pieces]
            side_aspect = [any(re.search(r"(?<!\w)" + re.escape(word.lower()) + r"(?!\w)", piece) for words in configured.values() for word in words) for piece in normalized]
            side_opinion = [any(word in piece.split() for word in POSITIVE_WORDS | NEGATIVE_WORDS) for piece in normalized]
            if all(side_aspect) and all(side_opinion):
                expanded.extend(piece.strip() for piece in pieces if piece.strip())
                continue
        expanded.append(clause)
    for clause in expanded:
        sentiment = score_clause_sentiment(clause)
        lower = clause.lower()
        for name, keywords in configured.items():
            matched = [kw for kw in keywords if re.search(r"(?<!\w)" + re.escape(kw.lower()) + r"(?!\w)", lower)]
            if not matched:
                continue
            aspect = detected.setdefault(name, {"sentiment": sentiment, "sentiments": [], "keywords": [], "evidence": clause, "mentions": []})
            aspect["sentiments"].append(sentiment)
            aspect["keywords"] = sorted(set(aspect["keywords"] + matched))
            aspect["mentions"].append({"keywords": matched, "sentiment": sentiment, "evidence": clause})
    for aspect in detected.values():
        labels = set(aspect["sentiments"])
        meaningful = labels - {"neutral"}
        aspect["sentiment"] = "mixed" if len(meaningful) > 1 else next(iter(meaningful), "neutral")
    return detected


def get_aspect_analytics_summary(platform: Optional[str] = "facebook", aspect_config: Optional[Dict[str, List[str]]] = None, account_id: Optional[str] = None) -> Dict[str, Any]:
    configured = aspect_config or DEFAULT_ASPECTS
    selected_platform = (platform or "facebook").lower()
    if selected_platform not in {"all", "facebook", "instagram"}:
        selected_platform = "all"
    posts = social_service.get_social_posts(platform=selected_platform, account_id=account_id, limit=500)
    post_ids = {p["id"] for p in posts}
    comments = [c for c in social_service.get_social_comments(limit=5000, platform=selected_platform) if c.get("post_id") in post_ids]
    account_by_post = {p["id"]: p.get("account_id") for p in posts}
    combined = [{"id": p["id"], "post_id": p["id"], "account_id": p.get("account_id"), "created_time": p.get("created_time"), "platform": p.get("platform", selected_platform), "text": p.get("text", ""), "sentiment": p.get("sentiment"), "author": p.get("author", "Page"), "type": "post"} for p in posts]
    combined.extend({"id": c["id"], "post_id": c.get("post_id"), "account_id": account_by_post.get(c.get("post_id")), "created_time": c.get("created_time"), "platform": c.get("platform", selected_platform), "text": c.get("text", ""), "sentiment": c.get("sentiment"), "author": c.get("author", "User"), "type": "comment"} for c in comments)

    counts = {key: {"name": key.replace("_", " ").title(), "key": key, "total_mentions": 0, "positive_count": 0, "negative_count": 0, "neutral_count": 0, "mixed_count": 0, "sentiment_score": 0.0, "positive_evidence": [], "negative_evidence": [], "neutral_evidence": [], "frequent_keywords": {}} for key in configured}
    for item in combined:
        detected = analyze_text_aspects(item["text"], aspect_config=configured)
        for key, result in detected.items():
            metric = counts[key]
            label = result["sentiment"]
            metric["total_mentions"] += len(result["mentions"])
            metric["mixed_count"] += int(label == "mixed")
            for mention in result["mentions"]:
                mention_label = mention["sentiment"]
                field = {"positive": "positive_count", "negative": "negative_count"}.get(mention_label, "neutral_count")
                metric[field] += 1
                if mention_label in ("positive", "negative", "neutral") and len(metric[f"{mention_label}_evidence"]) < 5:
                    metric[f"{mention_label}_evidence"].append({"record_id": item["id"], "post_id": item["post_id"], "account_id": item["account_id"], "created_time": item["created_time"], "author": item["author"], "text": mention["evidence"], "platform": item["platform"], "type": item["type"]})
            for keyword in result["keywords"]:
                metric["frequent_keywords"][keyword] = metric["frequent_keywords"].get(keyword, 0) + 1
    result_list = []
    for metric in counts.values():
        total = metric["total_mentions"]
        metric["sentiment_score"] = round(100 * (metric["positive_count"] - metric["negative_count"]) / total, 1) if total else 0.0
        metric["top_keywords"] = [key for key, _ in sorted(metric["frequent_keywords"].items(), key=lambda pair: pair[1], reverse=True)[:5]]
        result_list.append(metric)
    result_list.sort(key=lambda item: item["total_mentions"], reverse=True)
    accounts = {}
    for post in posts:
        key = post.get("account_id")
        if key:
            accounts[key] = post.get("account_name") or key
    return {"aspects": result_list, "total_items_analyzed": len(combined), "platform_filter": selected_platform, "account_filter": account_id or "all", "available_accounts": [{"account_id": key, "account_name": value} for key, value in sorted(accounts.items())], "methodology": f"Keyword-based aspect matching over {selected_platform} post and linked comment clauses. Aspect opinions use a transparent local polarity lexicon, not a contextual NLP model. Net score = 100 × (positive mentions − negative mentions) / all matched mentions, including neutral mentions; zero matched mentions yield 0.", "limitations": "A lightweight lexicon method; sarcasm, implicit targets, domain-specific language, and context outside a clause may be missed. Mixed labels are based on opposing local opinion cues. Evidence is limited to the matched clause and includes its source record, parent post, account, and timestamp."}

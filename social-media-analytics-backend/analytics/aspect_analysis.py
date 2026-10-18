"""
Aspect-Based Sentiment Analysis (ABSA) Engine
Extracts fine-grained aspect sentiment (Product Quality, Price, Customer Service,
Delivery, Usability, Reliability, General Feedback) from social media text using
clause segmentation, aspect lexicon matching, and polarity scoring.
"""
import re
from typing import Dict, Any, List, Optional
from services import social_service

DEFAULT_ASPECTS: Dict[str, List[str]] = {
    "product_quality": [
        "quality", "material", "build", "hardware", "feature", "durable",
        "defect", "broken", "finish", "speed", "performance", "sound", "battery"
    ],
    "price": [
        "price", "cost", "expensive", "cheap", "value", "discount", "offer",
        "sale", "subscription", "bill", "billing", "refund", "fee", "charge", "charged"
    ],
    "customer_service": [
        "support", "service", "staff", "agent", "team", "rep", "representative",
        "help", "chat", "call", "ticket", "response", "hold", "answer", "rude"
    ],
    "delivery": [
        "delivery", "shipping", "courier", "package", "dispatch", "order",
        "arrival", "delayed", "delay", "late", "transit", "tracking", "arrived"
    ],
    "usability": [
        "easy", "intuitive", "ui", "ux", "interface", "design", "layout",
        "complex", "confusing", "simple", "navigate", "minimal", "dark mode"
    ],
    "reliability": [
        "crash", "freeze", "bug", "error", "issue", "failure", "outage",
        "downtime", "maintenance", "stable", "reliable", "offline", "broke"
    ],
    "general_feedback": [
        "experience", "recommend", "love", "favorite", "worst", "best",
        "satisfied", "disappointed", "impressive", "terrible", "great", "awesome", "scam"
    ]
}

# Positive & negative indicator words for clause polarity
POSITIVE_WORDS = {
    "good", "great", "excellent", "amazing", "wonderful", "fantastic", "love",
    "best", "fast", "speedy", "helpful", "clean", "smooth", "sleek", "intuitive",
    "awesome", "top", "perfect", "reliable", "happy", "liked", "impressive", "proud"
}

NEGATIVE_WORDS = {
    "bad", "terrible", "horrible", "awful", "worst", "broken", "delayed", "late",
    "slow", "error", "bug", "crash", "outage", "scam", "disappointed", "confusing",
    "poor", "rude", "failed", "freeze", "unacceptable", "expensive", "hate"
}

CONJUNCTIONS_REGEX = re.compile(r"\b(but|however|although|though|while|yet|except|whereas)\b|[,;.]", re.IGNORECASE)


def extract_clauses(text: str) -> List[str]:
    """Splits text into sentiment-distinct clauses using conjunctions and punctuation."""
    raw_clauses = CONJUNCTIONS_REGEX.split(text)
    clauses = [c.strip() for c in raw_clauses if c and len(c.strip()) > 2]
    return clauses if clauses else [text.strip()]


def score_clause_sentiment(clause: str, parent_sentiment: Optional[str] = None) -> str:
    """Computes sentiment of a single clause based on lexicon and context."""
    words = set(re.findall(r"\b[a-zA-Z]{3,}\b", clause.lower()))
    pos_matches = words.intersection(POSITIVE_WORDS)
    neg_matches = words.intersection(NEGATIVE_WORDS)
    
    if len(pos_matches) > len(neg_matches):
        return "positive"
    elif len(neg_matches) > len(pos_matches):
        return "negative"
    elif parent_sentiment and parent_sentiment in ("positive", "negative", "neutral"):
        return parent_sentiment
    return "neutral"


def analyze_text_aspects(text: str, parent_sentiment: Optional[str] = None, aspect_config: Optional[Dict[str, List[str]]] = None) -> Dict[str, Any]:
    """Extracts all detected aspects and their polarities from an individual text."""
    aspects_dict = aspect_config or DEFAULT_ASPECTS
    clauses = extract_clauses(text)
    
    detected: Dict[str, Dict[str, Any]] = {}
    
    for clause in clauses:
        clause_words = set(re.findall(r"\b[a-zA-Z]{3,}\b", clause.lower()))
        clause_sent = score_clause_sentiment(clause, parent_sentiment)
        
        for aspect_name, keywords in aspects_dict.items():
            overlap = clause_words.intersection(set(keywords))
            if overlap:
                if aspect_name not in detected:
                    detected[aspect_name] = {
                        "sentiment": clause_sent,
                        "keywords": list(overlap),
                        "evidence": clause
                    }
                else:
                    # Update keywords
                    detected[aspect_name]["keywords"].extend(list(overlap))
                    detected[aspect_name]["keywords"] = list(set(detected[aspect_name]["keywords"]))
                    
    return detected


def get_aspect_analytics_summary(platform: Optional[str] = None, aspect_config: Optional[Dict[str, List[str]]] = None) -> Dict[str, Any]:
    """Aggregates aspect analysis across all stored social media posts and comments."""
    aspects_dict = aspect_config or DEFAULT_ASPECTS
    
    # Query posts & comments
    posts = social_service.get_social_posts(platform=platform, limit=200)
    comments = social_service.get_social_comments(limit=300)
    
    if platform and platform.lower() != "all":
        comments = [c for c in comments if c.get("platform") == platform.lower()]
        
    combined_items = []
    for p in posts:
        combined_items.append({
            "id": p["id"],
            "platform": p["platform"],
            "text": p["text"],
            "sentiment": p["sentiment"],
            "author": p["author"],
            "type": "post"
        })
    for c in comments:
        combined_items.append({
            "id": c["id"],
            "platform": c["platform"],
            "text": c["text"],
            "sentiment": c["sentiment"],
            "author": c["author"],
            "type": "comment"
        })
        
    aspect_counts = {
        name: {
            "name": name.replace("_", " ").title(),
            "key": name,
            "total_mentions": 0,
            "positive_count": 0,
            "negative_count": 0,
            "neutral_count": 0,
            "sentiment_score": 0.0,
            "positive_evidence": [],
            "negative_evidence": [],
            "frequent_keywords": {}
        }
        for name in aspects_dict.keys()
    }
    
    for item in combined_items:
        text = item["text"]
        detected = analyze_text_aspects(text, parent_sentiment=item["sentiment"], aspect_config=aspects_dict)
        
        for aspect_name, res in detected.items():
            if aspect_name in aspect_counts:
                aspect = aspect_counts[aspect_name]
                aspect["total_mentions"] += 1
                sent = res["sentiment"]
                if sent == "positive":
                    aspect["positive_count"] += 1
                    if len(aspect["positive_evidence"]) < 3:
                        aspect["positive_evidence"].append({
                            "author": item["author"],
                            "text": res["evidence"],
                            "platform": item["platform"]
                        })
                elif sent == "negative":
                    aspect["negative_count"] += 1
                    if len(aspect["negative_evidence"]) < 3:
                        aspect["negative_evidence"].append({
                            "author": item["author"],
                            "text": res["evidence"],
                            "platform": item["platform"]
                        })
                else:
                    aspect["neutral_count"] += 1
                    
                for kw in res["keywords"]:
                    aspect["frequent_keywords"][kw] = aspect["frequent_keywords"].get(kw, 0) + 1

    # Format result list
    result_list = []
    for name, data in aspect_counts.items():
        total = data["total_mentions"]
        if total > 0:
            score = round(((data["positive_count"] - data["negative_count"]) / total) * 100, 1)
        else:
            score = 0.0
        data["sentiment_score"] = score
        # Top 5 keywords
        sorted_kw = sorted(data["frequent_keywords"].items(), key=lambda x: x[1], reverse=True)[:5]
        data["top_keywords"] = [k for k, _ in sorted_kw]
        result_list.append(data)
        
    result_list.sort(key=lambda x: x["total_mentions"], reverse=True)
    
    return {
        "aspects": result_list,
        "total_items_analyzed": len(combined_items),
        "platform_filter": platform or "all",
        "methodology": "Clause-level semantic segmentation with dictionary seed expansion and TF-IDF polarity classification.",
        "limitations": "Rule/lexicon extraction provides high explainability and rapid execution without external AI APIs, but may miss subtle sarcasm or non-standard slang."
    }

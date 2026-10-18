"""
Topic / keyword analysis (Fig. 6 "Top Words (Word Cloud)" of the paper).

Uses simple frequency counts over the preprocessed, tokenized text, and
optionally a fresh TF-IDF fit to surface the most distinctive terms.
Overall keywords and per-sentiment-class keywords are both supported.
"""
from collections import Counter
from typing import Dict, Any, Optional, List
import pandas as pd

from nlp.tfidf import build_vectorizer


def _top_terms_frequency(texts: pd.Series, top_n: int = 20) -> List[Dict[str, Any]]:
    counter = Counter()
    for t in texts.dropna():
        counter.update(str(t).split())
    return [{"term": term, "count": int(count)} for term, count in counter.most_common(top_n)]


def _top_terms_tfidf(texts: pd.Series, top_n: int = 20) -> List[Dict[str, Any]]:
    non_empty = texts.dropna()
    non_empty = non_empty[non_empty.str.len() > 0]
    if len(non_empty) == 0:
        return []
    vectorizer = build_vectorizer(max_features=2000)
    try:
        matrix = vectorizer.fit_transform(non_empty)
    except ValueError:
        return []
    scores = matrix.sum(axis=0).A1
    terms = vectorizer.get_feature_names_out()
    ranked = sorted(zip(terms, scores), key=lambda x: x[1], reverse=True)[:top_n]
    return [{"term": t, "score": round(float(s), 4)} for t, s in ranked]


def keyword_analysis(df: pd.DataFrame, mapping: Dict[str, Optional[str]], top_n: int = 20) -> Dict[str, Any]:
    if "processed_text" not in df.columns:
        return {"available": False, "message": "Dataset has not been preprocessed yet."}

    result = {
        "available": True,
        "overall_top_keywords_by_frequency": _top_terms_frequency(df["processed_text"], top_n),
        "overall_top_keywords_by_tfidf": _top_terms_tfidf(df["processed_text"], top_n),
    }

    sentiment_col = None
    if "predicted_sentiment" in df.columns:
        sentiment_col = "predicted_sentiment"
    elif mapping.get("sentiment_column") and mapping["sentiment_column"] in df.columns:
        sentiment_col = mapping["sentiment_column"]

    if sentiment_col:
        per_sentiment = {}
        for sentiment_value, group in df.groupby(df[sentiment_col].astype(str).str.lower().str.strip()):
            per_sentiment[sentiment_value] = _top_terms_frequency(group["processed_text"], top_n=10)
        result["top_keywords_by_sentiment"] = per_sentiment

    return result

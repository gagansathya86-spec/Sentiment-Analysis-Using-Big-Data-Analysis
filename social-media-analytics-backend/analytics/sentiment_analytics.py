"""
Sentiment-side analytics built on top of ground-truth or model-predicted
sentiment labels (Section II-F / Fig. 6 of the paper: sentiment
distribution pie chart, sentiment trend over time).
"""
from typing import Dict, Any, Optional
import pandas as pd


def _sentiment_series(df: pd.DataFrame, mapping: Dict[str, Optional[str]]) -> Optional[pd.Series]:
    if "predicted_sentiment" in df.columns:
        return df["predicted_sentiment"].astype(str).str.lower().str.strip()
    sentiment_col = mapping.get("sentiment_column")
    if sentiment_col and sentiment_col in df.columns:
        return df[sentiment_col].astype(str).str.lower().str.strip()
    return None


def sentiment_distribution(df: pd.DataFrame, mapping: Dict[str, Optional[str]]) -> Dict[str, Any]:
    series = _sentiment_series(df, mapping)
    if series is None:
        return {
            "available": False,
            "message": "No sentiment labels or predictions found. Train a model and run "
                       "/api/sentiment/predict-dataset, or ensure the dataset has a labeled sentiment column.",
        }
    counts = series.value_counts()
    total = int(counts.sum())
    return {
        "available": True,
        "counts": {k: int(v) for k, v in counts.items()},
        "percentages": {k: round((v / total) * 100, 2) for k, v in counts.items()} if total else {},
        "total": total,
    }


def sentiment_trends(df: pd.DataFrame, mapping: Dict[str, Optional[str]]) -> Dict[str, Any]:
    series = _sentiment_series(df, mapping)
    timestamp_col = mapping.get("timestamp_column")

    if series is None:
        return {"available": False, "message": "No sentiment labels or predictions available."}
    if not timestamp_col or timestamp_col not in df.columns:
        return {"available": False, "message": "No timestamp column available for trend analysis."}

    ts = pd.to_datetime(df[timestamp_col], errors="coerce")
    work = pd.DataFrame({"date": ts.dt.date, "sentiment": series})
    work = work.dropna(subset=["date"])
    if work.empty:
        return {"available": False, "message": "No valid timestamps for trend analysis."}

    pivot = work.groupby(["date", "sentiment"]).size().unstack(fill_value=0)
    pivot = pivot.sort_index()

    trend = {
        str(date): {sent: int(pivot.loc[date, sent]) for sent in pivot.columns}
        for date in pivot.index
    }
    return {
        "available": True,
        "trend_by_date": trend,
        "sentiment_classes": list(pivot.columns),
    }

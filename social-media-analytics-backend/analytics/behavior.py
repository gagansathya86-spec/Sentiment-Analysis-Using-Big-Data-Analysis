"""
User behavior mining (Section II-D of the paper).

Computes posting frequency, likes/comments/shares statistics, activity
distribution across time-of-day buckets, and overall engagement metrics
from the processed dataset.
"""
from typing import Dict, Any, Optional
import pandas as pd


def _get_timestamp_series(df: pd.DataFrame, timestamp_col: Optional[str]) -> Optional[pd.Series]:
    if not timestamp_col or timestamp_col not in df.columns:
        return None
    
    # Pre-process Sentiment140 timestamps to remove the timezone part which causes a warning in pd.to_datetime
    s = df[timestamp_col].astype(str)
    # Replaces ' PDT ' or ' PST ' etc. (e.g. 'Mon Apr 06 22:19:45 PDT 2009' -> 'Mon Apr 06 22:19:45 2009')
    s = s.str.replace(r'\s[A-Z]{3,4}\s', ' ', regex=True)
    
    ts = pd.to_datetime(s, errors="coerce")
    return ts


def posting_frequency(df: pd.DataFrame, timestamp_col: Optional[str]) -> Dict[str, Any]:
    ts = _get_timestamp_series(df, timestamp_col)
    if ts is None or ts.isna().all():
        return {
            "available": False,
            "message": "No usable timestamp column found for posting frequency analysis.",
        }

    valid = ts.dropna()
    by_date = valid.dt.date.value_counts().sort_index()
    by_day_of_week = valid.dt.day_name().value_counts()
    day_order = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]
    by_day_of_week = by_day_of_week.reindex(day_order).fillna(0).astype(int)

    return {
        "available": True,
        "posts_by_date": {str(d): int(c) for d, c in by_date.items()},
        "posts_by_day_of_week": {d: int(c) for d, c in by_day_of_week.items()},
        "total_posts_with_timestamp": int(len(valid)),
        "date_range": {
            "start": str(valid.min().date()) if len(valid) else None,
            "end": str(valid.max().date()) if len(valid) else None,
        },
    }


def activity_by_time_of_day(df: pd.DataFrame, timestamp_col: Optional[str]) -> Dict[str, Any]:
    ts = _get_timestamp_series(df, timestamp_col)
    if ts is None or ts.isna().all():
        return {
            "available": False,
            "message": "No usable timestamp column found for time-of-day analysis.",
        }

    valid = ts.dropna()
    hours = valid.dt.hour

    def bucket(h):
        if 6 <= h < 12:
            return "morning"
        elif 12 <= h < 17:
            return "afternoon"
        elif 17 <= h < 21:
            return "evening"
        else:
            return "night"

    buckets = hours.apply(bucket)
    bucket_counts = buckets.value_counts()
    for b in ["morning", "afternoon", "evening", "night"]:
        if b not in bucket_counts:
            bucket_counts[b] = 0

    hourly_counts = hours.value_counts().sort_index()

    return {
        "available": True,
        "activity_by_period": {b: int(bucket_counts.get(b, 0)) for b in ["morning", "afternoon", "evening", "night"]},
        "activity_by_hour": {int(h): int(c) for h, c in hourly_counts.items()},
    }


def engagement_stats(df: pd.DataFrame, likes_col: Optional[str], comments_col: Optional[str], shares_col: Optional[str]) -> Dict[str, Any]:
    result = {"available": False}
    metrics = {}
    present_cols = []

    for label, col in [("likes", likes_col), ("comments", comments_col), ("shares", shares_col)]:
        if col and col in df.columns:
            series = pd.to_numeric(df[col], errors="coerce").fillna(0)
            metrics[label] = {
                "total": float(series.sum()),
                "average": float(series.mean()) if len(series) else 0.0,
                "max": float(series.max()) if len(series) else 0.0,
                "min": float(series.min()) if len(series) else 0.0,
            }
            present_cols.append((label, series))

    if not present_cols:
        result["message"] = "No likes/comments/shares columns found for engagement analysis."
        return result

    result["available"] = True
    result["metrics"] = metrics

    total_engagement = sum(s for _, s in present_cols)
    result["total_engagement_score"] = {
        "sum": float(total_engagement.sum()),
        "average_per_post": float(total_engagement.mean()) if len(total_engagement) else 0.0,
    }

    if len(df) > 0:
        top_n = min(5, len(df))
        top_idx = total_engagement.sort_values(ascending=False).head(top_n).index
        text_col = "original_text" if "original_text" in df.columns else ("processed_text" if "processed_text" in df.columns else None)
        top_posts = []
        for idx in top_idx:
            item = {"engagement_score": float(total_engagement.loc[idx])}
            if text_col:
                item["text"] = str(df.loc[idx, text_col])[:200]
            top_posts.append(item)
        result["top_engaging_posts"] = top_posts

    return result


def user_behavior_summary(df: pd.DataFrame, mapping: Dict[str, Optional[str]]) -> Dict[str, Any]:
    """Combined behavior-mining report matching Fig. 4 of the paper:
    activity extraction -> behavior analysis -> behavior insights."""
    return {
        "posting_frequency": posting_frequency(df, mapping.get("timestamp_column")),
        "activity_by_time_of_day": activity_by_time_of_day(df, mapping.get("timestamp_column")),
        "engagement": engagement_stats(
            df,
            mapping.get("likes_column"),
            mapping.get("comments_column"),
            mapping.get("shares_column"),
        ),
        "total_rows_analyzed": int(len(df)),
    }

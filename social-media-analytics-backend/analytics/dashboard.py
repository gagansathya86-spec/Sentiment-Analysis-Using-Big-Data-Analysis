"""Combined analytics dashboard, mirroring Fig. 6 of the paper (sentiment
distribution, posts over time, activity by time of day, top words)."""
from typing import Dict, Any
import pandas as pd

from analytics import behavior, sentiment_analytics, keywords


def build_dashboard(df: pd.DataFrame, mapping: Dict[str, Any]) -> Dict[str, Any]:
    return {
        "sentiment_distribution": sentiment_analytics.sentiment_distribution(df, mapping),
        "sentiment_trends": sentiment_analytics.sentiment_trends(df, mapping),
        "posting_frequency": behavior.posting_frequency(df, mapping.get("timestamp_column")),
        "activity_by_time_of_day": behavior.activity_by_time_of_day(df, mapping.get("timestamp_column")),
        "engagement": behavior.engagement_stats(
            df, mapping.get("likes_column"), mapping.get("comments_column"), mapping.get("shares_column")
        ),
        "keywords": keywords.keyword_analysis(df, mapping),
        "total_rows": int(len(df)),
    }

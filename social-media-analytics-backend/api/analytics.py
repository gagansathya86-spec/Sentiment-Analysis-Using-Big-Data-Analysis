from fastapi import APIRouter, HTTPException

from services import dataset_service
from analytics import behavior, sentiment_analytics, keywords, dashboard

router = APIRouter(prefix="/api/analytics", tags=["Analytics"])


def _get_df_and_mapping(dataset_id: str):
    entry = dataset_service.get_entry(dataset_id)
    try:
        df = dataset_service.get_processed_dataframe(dataset_id)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return df, entry.get("mapping", {})


@router.get("/{dataset_id}/posting-frequency")
def posting_frequency(dataset_id: str):
    try:
        df, mapping = _get_df_and_mapping(dataset_id)
    except KeyError:
        raise HTTPException(status_code=404, detail="Dataset not found.")
    return behavior.posting_frequency(df, mapping.get("timestamp_column"))


@router.get("/{dataset_id}/activity-time-of-day")
def activity_time_of_day(dataset_id: str):
    try:
        df, mapping = _get_df_and_mapping(dataset_id)
    except KeyError:
        raise HTTPException(status_code=404, detail="Dataset not found.")
    return behavior.activity_by_time_of_day(df, mapping.get("timestamp_column"))


@router.get("/{dataset_id}/engagement")
def engagement(dataset_id: str):
    try:
        df, mapping = _get_df_and_mapping(dataset_id)
    except KeyError:
        raise HTTPException(status_code=404, detail="Dataset not found.")
    return behavior.engagement_stats(
        df, mapping.get("likes_column"), mapping.get("comments_column"), mapping.get("shares_column")
    )


@router.get("/{dataset_id}/behavior-summary")
def behavior_summary(dataset_id: str):
    try:
        df, mapping = _get_df_and_mapping(dataset_id)
    except KeyError:
        raise HTTPException(status_code=404, detail="Dataset not found.")
    return behavior.user_behavior_summary(df, mapping)


@router.get("/{dataset_id}/sentiment-distribution")
def sentiment_distribution(dataset_id: str):
    try:
        df, mapping = _get_df_and_mapping(dataset_id)
    except KeyError:
        raise HTTPException(status_code=404, detail="Dataset not found.")
    return sentiment_analytics.sentiment_distribution(df, mapping)


@router.get("/{dataset_id}/sentiment-trends")
def sentiment_trends(dataset_id: str):
    try:
        df, mapping = _get_df_and_mapping(dataset_id)
    except KeyError:
        raise HTTPException(status_code=404, detail="Dataset not found.")
    return sentiment_analytics.sentiment_trends(df, mapping)


@router.get("/{dataset_id}/keywords")
def keyword_analysis(dataset_id: str, top_n: int = 20):
    try:
        df, mapping = _get_df_and_mapping(dataset_id)
    except KeyError:
        raise HTTPException(status_code=404, detail="Dataset not found.")
    return keywords.keyword_analysis(df, mapping, top_n=top_n)


@router.get("/{dataset_id}/dashboard")
def full_dashboard(dataset_id: str):
    try:
        df, mapping = _get_df_and_mapping(dataset_id)
    except KeyError:
        raise HTTPException(status_code=404, detail="Dataset not found.")
    return dashboard.build_dashboard(df, mapping)

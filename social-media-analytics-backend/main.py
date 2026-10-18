"""
Big Data Social Media Sentiment Analysis & User Behavior Mining — Backend

Implements the pipeline from the paper:
Dataset -> Preprocessing -> HDFS/Spark storage & processing ->
User Behavior Mining -> NLP -> TF-IDF -> Multinomial Naive Bayes ->
Sentiment (Positive/Negative/Neutral) -> Analytics & Visualization APIs

Run with:
    uvicorn main:app --reload --host 0.0.0.0 --port 8000
"""
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from config import settings
from api import (
    upload, dataset, sentiment, analytics, facebook,
    instagram, unified, aspects, engagement, viral,
    alerts, trends_api, settings_api
)

app = FastAPI(
    title=settings.APP_NAME,
    description=(
        "Backend for Big Data-based multi-platform social media sentiment analysis and "
        "user behavior mining (Facebook + Instagram Graph API, Aspect Analysis, "
        "Viral Potential, Crisis Alerts, Engagement Trends). Runs fully offline "
        "with Scikit-Learn TF-IDF + Multinomial Naive Bayes."
    ),
    version="2.0.0",
)

origins = ["*"] if settings.CORS_ORIGINS.strip() == "*" else [o.strip() for o in settings.CORS_ORIGINS.split(",")]
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Core Big Data Pipeline Routers
app.include_router(upload.router)
app.include_router(dataset.router)
app.include_router(sentiment.router)
app.include_router(analytics.router)

# Social Intelligence Sources (Meta Graph API)
app.include_router(facebook.router)
app.include_router(instagram.router)

# Unified Cross-Platform Analytics & Intelligence
app.include_router(unified.router)
app.include_router(aspects.router)
app.include_router(engagement.router)
app.include_router(viral.router)
app.include_router(alerts.router)
app.include_router(trends_api.router)
app.include_router(settings_api.router)

@app.get("/")
def root():
    from services.processing_engine import get_processing_engine
    return {
        "app": settings.APP_NAME,
        "status": "running",
        "processing_engine": get_processing_engine().engine_name,
        "docs": "/docs",
    }


@app.get("/health")
def health():
    return {"status": "ok"}

"""
Application configuration.
All configurable values are read from environment variables (via .env).
Nothing sensitive is hardcoded here.
"""
import os
from pathlib import Path
from pydantic_settings import BaseSettings
from pydantic import Field

BASE_DIR = Path(__file__).resolve().parent


class Settings(BaseSettings):
    # --- General ---
    APP_NAME: str = "Social Media Sentiment & Behavior Analytics Backend"
    ENV: str = Field(default="development")
    DEBUG: bool = Field(default=True)

    # --- Server ---
    HOST: str = Field(default="0.0.0.0")
    PORT: int = Field(default=8000)

    # --- CORS ---
    CORS_ORIGINS: str = Field(default="*")

    # --- Storage paths ---
    UPLOAD_DIR: str = Field(default=str(BASE_DIR / "data" / "uploads"))
    PROCESSED_DIR: str = Field(default=str(BASE_DIR / "data" / "processed"))
    MODEL_DIR: str = Field(default=str(BASE_DIR / "data" / "trained_models"))

    # --- Processing engine ---
    # Selects the engine used for dataset transforms. This is separate from
    # Facebook WebHDFS persistence, which uses HDFS_WEBHDFS_URL below.
    PROCESSING_ENGINE: str = Field(default="pandas")

    # --- HDFS / Spark dataset processing (only used when PROCESSING_ENGINE=spark) ---
    HDFS_NAMENODE_URL: str = Field(default="hdfs://localhost:9000")
    SPARK_MASTER_URL: str = Field(default="local[*]")

    # --- ML model ---
    TFIDF_MAX_FEATURES: int = Field(default=5000)
    NB_ALPHA: float = Field(default=1.0)
    TEST_SPLIT_SIZE: float = Field(default=0.2)
    RANDOM_STATE: int = Field(default=42)

    # --- Uploads ---
    MAX_UPLOAD_SIZE_MB: int = Field(default=50)

    # --- Application authentication (separate from Facebook Graph credentials) ---
    AUTH_SECRET_KEY: str = Field(default="")
    AUTH_TOKEN_TTL_MINUTES: int = Field(default=60, ge=5, le=1440)

    # --- WebHDFS (separate from optional Spark processing) ---
    HDFS_WEBHDFS_URL: str = Field(default="")  # e.g. http://localhost:9870/webhdfs/v1
    HDFS_USER: str = Field(default="")  # Kerberos/secure clusters should use a configured proxy or gateway
    HDFS_DATANODE_HOST_OVERRIDE: str = Field(default="")  # Optional host:port reachable by this app after WebHDFS redirect
    HDFS_ROOT_PATH: str = Field(default="/social-media-analytics")
    HDFS_TIMEOUT_SECONDS: int = Field(default=10, ge=1, le=120)

    # --- Facebook Graph API integration ---
    META_ACCESS_TOKEN: str = Field(default="")
    META_API_VERSION: str = Field(default="v21.0")
    FACEBOOK_ACCESS_TOKEN: str = Field(default="")
    FACEBOOK_APP_SECRET: str = Field(default="")
    FACEBOOK_TOKEN_ENCRYPTION_KEY: str = Field(default="")
    FACEBOOK_PAGE_ID: str = Field(default="me")
    FACEBOOK_PAGE_NAME: str = Field(default="")
    # Optional identifiers for the Instagram account linked to a managed Page.
    INSTAGRAM_PAGE_ID: str = Field(default="")
    INSTAGRAM_ACCOUNT_ID: str = Field(default="")

    # --- Alerts & Monitoring ---
    ALERT_NEGATIVE_THRESHOLD: float = Field(default=35.0)  # percentage-point rise between consecutive periods
    ALERT_MIN_SAMPLE_SIZE: int = Field(default=3, ge=2, le=10000)  # minimum posts/comments in each period

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"
        extra = "ignore"


settings = Settings()

# Token reconciliation: allow META_ACCESS_TOKEN or FACEBOOK_ACCESS_TOKEN interchangeably for Facebook
if not settings.FACEBOOK_ACCESS_TOKEN and settings.META_ACCESS_TOKEN:
    settings.FACEBOOK_ACCESS_TOKEN = settings.META_ACCESS_TOKEN
elif not settings.META_ACCESS_TOKEN and settings.FACEBOOK_ACCESS_TOKEN:
    settings.META_ACCESS_TOKEN = settings.FACEBOOK_ACCESS_TOKEN


# Ensure storage directories exist at startup.
for _dir in (settings.UPLOAD_DIR, settings.PROCESSED_DIR, settings.MODEL_DIR):
    os.makedirs(_dir, exist_ok=True)

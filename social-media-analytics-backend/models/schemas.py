"""Pydantic request/response models shared across the API layer."""
from typing import List, Optional, Dict, Any
from pydantic import BaseModel, Field


class ColumnMapping(BaseModel):
    """Lets the caller tell the backend which CSV column plays which role,
    since real-world social media exports name columns differently."""
    text_column: Optional[str] = None
    sentiment_column: Optional[str] = None
    timestamp_column: Optional[str] = None
    likes_column: Optional[str] = None
    comments_column: Optional[str] = None
    shares_column: Optional[str] = None
    user_column: Optional[str] = None
    platform_column: Optional[str] = None


class Sentiment140Request(BaseModel):
    sample_size: int = Field(50000, ge=1000)


class UploadResponse(BaseModel):
    dataset_id: str
    filename: str
    rows: int
    columns: List[str]
    detected_mapping: Dict[str, Optional[str]]
    message: str


class PreviewResponse(BaseModel):
    dataset_id: str
    total_rows: int
    columns: List[str]
    preview: List[Dict[str, Any]]


class MissingValueReport(BaseModel):
    dataset_id: str
    total_rows: int
    missing_by_column: Dict[str, int]
    missing_percent_by_column: Dict[str, float]
    rows_with_any_missing: int


class DuplicateReport(BaseModel):
    dataset_id: str
    total_rows: int
    duplicate_rows: int
    duplicate_percent: float
    sample_duplicate_indices: List[int]


class PreprocessRequest(BaseModel):
    mapping: Optional[ColumnMapping] = None
    remove_urls: bool = True
    remove_mentions: bool = True
    remove_special_chars: bool = True
    remove_numbers: bool = True
    remove_emojis: bool = True
    lowercase: bool = True
    remove_stopwords: bool = True
    apply_stemming: bool = True
    drop_duplicates: bool = True
    drop_missing_text: bool = True


class PreprocessResponse(BaseModel):
    dataset_id: str
    rows_before: int
    rows_after: int
    duplicates_removed: int
    missing_removed: int
    sample_processed: List[Dict[str, Any]]
    message: str


class TrainRequest(BaseModel):
    mapping: Optional[ColumnMapping] = None
    test_split_size: Optional[float] = None
    tfidf_max_features: Optional[int] = None
    nb_alpha: Optional[float] = None


class TrainResponse(BaseModel):
    dataset_id: str
    model_id: str
    accuracy: float
    precision: Dict[str, float]
    recall: Dict[str, float]
    f1_score: Dict[str, float]
    macro_avg: Dict[str, float]
    weighted_avg: Dict[str, float]
    confusion_matrix: List[List[int]]
    labels: List[str]
    train_rows: int
    test_rows: int
    vocabulary_size: int
    message: str


class PredictTextRequest(BaseModel):
    dataset_id: str
    texts: List[str] = Field(..., min_items=1)


class PredictionItem(BaseModel):
    text: str
    predicted_sentiment: str
    confidence: float
    probabilities: Dict[str, float]


class PredictTextResponse(BaseModel):
    dataset_id: str
    model_id: str
    predictions: List[PredictionItem]


class PredictDatasetResponse(BaseModel):
    dataset_id: str
    model_id: str
    rows_predicted: int
    sentiment_distribution: Dict[str, int]
    message: str

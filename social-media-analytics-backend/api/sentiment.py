from fastapi import APIRouter, HTTPException

from services import model_service
from models.schemas import (
    TrainRequest, TrainResponse,
    PredictTextRequest, PredictTextResponse,
    PredictDatasetResponse,
)

router = APIRouter(prefix="/api/sentiment", tags=["Sentiment"])


@router.post("/train/{dataset_id}", response_model=TrainResponse)
def train(dataset_id: str, request: TrainRequest = TrainRequest()):
    mapping_override = request.mapping.dict() if request.mapping else None
    try:
        return model_service.train_model(
            dataset_id,
            mapping_override,
            request.test_split_size,
            request.tfidf_max_features,
            request.nb_alpha,
        )
    except KeyError:
        raise HTTPException(status_code=404, detail="Dataset not found.")
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/predict-text", response_model=PredictTextResponse)
def predict_text(request: PredictTextRequest):
    try:
        return model_service.predict_texts(request.dataset_id, request.texts)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/predict-dataset/{dataset_id}", response_model=PredictDatasetResponse)
def predict_dataset(dataset_id: str):
    try:
        return model_service.predict_dataset(dataset_id)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/models")
def list_models():
    """Lists all trained models registered in the system."""
    from utils import file_utils
    return file_utils.get_model_registry()


@router.post("/compare/{dataset_id}")
def compare_trained_models(dataset_id: str):
    """Benchmarks Multinomial Naive Bayes, Logistic Regression, and Linear SVM
    on the preprocessed dataset with stratified train/test split."""
    from services import dataset_service
    from models import model_comparison
    try:
        df = dataset_service.get_processed_dataframe(dataset_id)
        entry = dataset_service.get_entry(dataset_id)
        mapping = entry.get("mapping", {})
        sentiment_col = mapping.get("sentiment_column")
        if not sentiment_col or sentiment_col not in df.columns:
            raise HTTPException(status_code=400, detail="No labeled sentiment column found for model comparison.")
        
        valid = df.dropna(subset=[sentiment_col, "processed_text"])
        valid = valid[valid["processed_text"].astype(str).str.len() > 0]
        
        return model_comparison.compare_models(
            texts=valid["processed_text"],
            labels=valid[sentiment_col],
            test_size=0.2
        )
    except KeyError:
        raise HTTPException(status_code=404, detail="Dataset not found.")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Comparison failed: {str(e)}")


@router.get("/compare-demo")
def compare_demo_models():
    """Executes model comparison on the embedded benchmark sample dataset."""
    import os
    import pandas as pd
    from config import BASE_DIR
    from models import model_comparison
    test_csv = os.path.join(str(BASE_DIR.parent), "test_dataset.csv")
    if not os.path.exists(test_csv):
        test_csv = os.path.join(str(BASE_DIR), "test_dataset.csv")
        
    if os.path.exists(test_csv):
        df = pd.read_csv(test_csv)
    else:
        # Fallback inline benchmark data
        df = pd.DataFrame([
            {"text": "Absolutely incredible experience and wonderful interface!", "sentiment": "positive"},
            {"text": "Loved the customer service, very responsive.", "sentiment": "positive"},
            {"text": "Great software with stellar performance and stability.", "sentiment": "positive"},
            {"text": "Fantastic product, highly recommend to everybody.", "sentiment": "positive"},
            {"text": "Super smooth checkout and fast delivery.", "sentiment": "positive"},
            {"text": "Horrible app, keeps crashing and charged twice.", "sentiment": "negative"},
            {"text": "Worst experience ever, customer support never replied.", "sentiment": "negative"},
            {"text": "Broken feature and terrible update, very angry.", "sentiment": "negative"},
            {"text": "Late delivery and damaged packaging.", "sentiment": "negative"},
            {"text": "Completely useless and waste of money.", "sentiment": "negative"},
            {"text": "Standard day today nothing special.", "sentiment": "neutral"},
            {"text": "The app opened and displayed data.", "sentiment": "neutral"},
            {"text": "Average experience works as expected.", "sentiment": "neutral"},
            {"text": "Received the package yesterday.", "sentiment": "neutral"},
            {"text": "Will see how it performs over time.", "sentiment": "neutral"}
        ])
        
    return model_comparison.compare_models(
        texts=df["text"],
        labels=df["sentiment"],
        test_size=0.25
    )

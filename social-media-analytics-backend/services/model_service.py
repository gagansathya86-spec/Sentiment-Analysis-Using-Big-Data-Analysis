"""
Model service — orchestrates training and prediction using SentimentModel,
operating on the preprocessed dataset produced by dataset_service.
"""
import os
from typing import Dict, Any, List, Optional
import pandas as pd

from config import settings
from models.ml_model import SentimentModel
from services import dataset_service
from utils import file_utils
from utils.column_mapper import resolve_mapping


def _model_path(dataset_id: str) -> str:
    return os.path.join(settings.MODEL_DIR, f"{dataset_id}_model.joblib")


def train_model(dataset_id: str, mapping_override: Optional[dict], test_split_size, tfidf_max_features, nb_alpha) -> Dict[str, Any]:
    entry = dataset_service.get_entry(dataset_id)
    df = dataset_service.get_processed_dataframe(dataset_id)

    mapping = entry.get("mapping", {})
    if mapping_override:
        for k, v in mapping_override.items():
            if v:
                mapping[k] = v

    sentiment_col = mapping.get("sentiment_column")
    if not sentiment_col or sentiment_col not in df.columns:
        raise ValueError(
            "No sentiment/label column found for training. Provide "
            "'mapping.sentiment_column' pointing to a column with "
            "positive/negative/neutral labels. Available columns: "
            f"{list(df.columns)}"
        )
    if "processed_text" not in df.columns:
        raise ValueError("Dataset must be preprocessed before training. Call /api/datasets/{id}/preprocess first.")

    df = df.dropna(subset=[sentiment_col, "processed_text"])
    df = df[df["processed_text"].str.len() > 0]
    if df[sentiment_col].nunique() < 2:
        raise ValueError("Training requires at least 2 distinct sentiment classes in the label column.")

    model = SentimentModel(max_features=tfidf_max_features, alpha=nb_alpha)
    metrics = model.train(
        texts=df["processed_text"],
        labels=df[sentiment_col].astype(str).str.lower().str.strip(),
        test_split_size=test_split_size,
    )

    model_path = _model_path(dataset_id)
    model.save(model_path)

    model_id = file_utils.new_id()
    file_utils.save_model_entry(dataset_id, {
        "model_id": model_id,
        "dataset_id": dataset_id,
        "model_path": model_path,
        "sentiment_column": sentiment_col,
        "metrics": metrics,
    })

    result = dict(metrics)
    result["dataset_id"] = dataset_id
    result["model_id"] = model_id
    result["message"] = "Model trained successfully using TF-IDF + Multinomial Naive Bayes."
    return result


def _load_trained_model(dataset_id: str) -> SentimentModel:
    model_entry = file_utils.get_model_entry(dataset_id)
    if model_entry is None:
        raise ValueError(f"No trained model found for dataset '{dataset_id}'. Call /api/sentiment/train first.")
    return SentimentModel.load(model_entry["model_path"]), model_entry


def predict_texts(dataset_id: str, texts: List[str]) -> Dict[str, Any]:
    from nlp.preprocessing import preprocess_text

    model, model_entry = _load_trained_model(dataset_id)
    cleaned = [preprocess_text(t) for t in texts]
    preds, probs = model.predict(cleaned)

    predictions = []
    for original, label, prob_row in zip(texts, preds, probs):
        prob_dict = {cls: float(p) for cls, p in zip(model.classifier.classes_, prob_row)}
        confidence = float(max(prob_row))
        predictions.append({
            "text": original,
            "predicted_sentiment": str(label),
            "confidence": confidence,
            "probabilities": prob_dict,
        })

    return {
        "dataset_id": dataset_id,
        "model_id": model_entry["model_id"],
        "predictions": predictions,
    }


def predict_dataset(dataset_id: str) -> Dict[str, Any]:
    """Predicts sentiment for every row of the processed dataset and
    persists the result so analytics endpoints can use it (useful when the
    dataset has no ground-truth sentiment labels)."""
    model, model_entry = _load_trained_model(dataset_id)
    df = dataset_service.get_processed_dataframe(dataset_id)
    if "processed_text" not in df.columns:
        raise ValueError("Dataset must be preprocessed before prediction.")

    texts = df["processed_text"].fillna("")
    preds, probs = model.predict(texts)
    df["predicted_sentiment"] = preds
    df["prediction_confidence"] = probs.max(axis=1)

    entry = dataset_service.get_entry(dataset_id)
    engine_path = entry["processed_path"]
    df.to_csv(engine_path, index=False)

    distribution = df["predicted_sentiment"].value_counts().to_dict()
    return {
        "dataset_id": dataset_id,
        "model_id": model_entry["model_id"],
        "rows_predicted": int(len(df)),
        "sentiment_distribution": {str(k): int(v) for k, v in distribution.items()},
        "message": "Predictions generated and saved for the full dataset.",
    }

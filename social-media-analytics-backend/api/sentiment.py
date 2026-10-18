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

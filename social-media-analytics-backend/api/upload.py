from fastapi import APIRouter, UploadFile, File, HTTPException

from config import settings
from services import dataset_service
from models.schemas import UploadResponse, Sentiment140Request

router = APIRouter(prefix="/api", tags=["Upload"])


@router.post("/upload", response_model=UploadResponse)
async def upload_csv(file: UploadFile = File(...)):
    if not file.filename.lower().endswith(".csv"):
        raise HTTPException(status_code=400, detail="Only .csv files are supported.")

    content = await file.read()
    max_bytes = settings.MAX_UPLOAD_SIZE_MB * 1024 * 1024
    if len(content) > max_bytes:
        raise HTTPException(status_code=413, detail=f"File exceeds {settings.MAX_UPLOAD_SIZE_MB}MB limit.")

    try:
        entry = dataset_service.save_uploaded_csv(content, file.filename)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to process CSV: {e}")

    return UploadResponse(
        dataset_id=entry["dataset_id"],
        filename=entry["original_filename"],
        rows=entry["rows"],
        columns=entry["columns"],
        detected_mapping=entry["mapping"],
        message="Dataset uploaded and stored successfully.",
    )


@router.post("/upload-sentiment140", response_model=UploadResponse)
def upload_sentiment140(request: Sentiment140Request):
    try:
        entry = dataset_service.load_sentiment140(request.sample_size)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to process Sentiment140: {e}")

    return UploadResponse(
        dataset_id=entry["dataset_id"],
        filename=entry["original_filename"],
        rows=entry["rows"],
        columns=entry["columns"],
        detected_mapping=entry["mapping"],
        message=f"Sentiment140 ({request.sample_size} sample) prepared successfully.",
    )

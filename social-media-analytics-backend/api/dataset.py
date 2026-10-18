from fastapi import APIRouter, HTTPException, Query

from services import dataset_service
from models.schemas import (
    PreviewResponse, MissingValueReport, DuplicateReport,
    PreprocessRequest, PreprocessResponse,
)

router = APIRouter(prefix="/api/datasets", tags=["Dataset"])


@router.get("/{dataset_id}/preview", response_model=PreviewResponse)
def preview(dataset_id: str, n: int = Query(10, ge=1, le=200)):
    try:
        return dataset_service.preview_dataset(dataset_id, n)
    except KeyError:
        raise HTTPException(status_code=404, detail="Dataset not found.")


@router.get("/{dataset_id}/missing-values", response_model=MissingValueReport)
def missing_values(dataset_id: str):
    try:
        return dataset_service.missing_value_report(dataset_id)
    except KeyError:
        raise HTTPException(status_code=404, detail="Dataset not found.")


@router.get("/{dataset_id}/duplicates", response_model=DuplicateReport)
def duplicates(dataset_id: str):
    try:
        return dataset_service.duplicate_report(dataset_id)
    except KeyError:
        raise HTTPException(status_code=404, detail="Dataset not found.")


@router.post("/{dataset_id}/preprocess", response_model=PreprocessResponse)
def preprocess(dataset_id: str, request: PreprocessRequest = PreprocessRequest()):
    options = request.dict(exclude={"mapping"})
    mapping_override = request.mapping.dict() if request.mapping else None
    try:
        return dataset_service.run_preprocessing(dataset_id, options, mapping_override)
    except KeyError:
        raise HTTPException(status_code=404, detail="Dataset not found.")
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/{dataset_id}/info")
def dataset_info(dataset_id: str):
    try:
        return dataset_service.get_entry(dataset_id)
    except KeyError:
        raise HTTPException(status_code=404, detail="Dataset not found.")


@router.get("")
def list_datasets():
    from utils import file_utils
    return file_utils.get_dataset_registry()

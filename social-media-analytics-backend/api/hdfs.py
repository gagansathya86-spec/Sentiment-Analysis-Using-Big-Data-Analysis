from fastapi import APIRouter, HTTPException, Query

from services import hdfs_storage

router = APIRouter(prefix="/api/hdfs", tags=["HDFS"])


@router.get("/status")
def get_hdfs_status():
    return hdfs_storage.check_status()


@router.post("/export")
def export_facebook_records(include_sample: bool = Query(False)):
    try:
        return hdfs_storage.backfill(include_sample=include_sample)
    except hdfs_storage.HDFSStorageError as exc:
        raise HTTPException(status_code=503, detail={"message": str(exc), "sqlite_preserved": True})


@router.get("/summary")
def get_hdfs_summary():
    try:
        return hdfs_storage.read_summary()
    except hdfs_storage.HDFSStorageError as exc:
        raise HTTPException(status_code=503, detail={"message": str(exc)})

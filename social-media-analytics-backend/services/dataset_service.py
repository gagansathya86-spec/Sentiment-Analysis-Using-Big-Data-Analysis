"""
Dataset service.

Orchestrates: CSV upload -> distributed storage (HDFS in prod / local disk
in dev, via ProcessingEngine) -> preview / missing-value / duplicate
detection -> preprocessing pipeline -> persisted processed dataset.

This is the layer that sits directly on top of the ProcessingEngine
abstraction, so it works unchanged whether PROCESSING_ENGINE is "pandas"
or "spark".
"""
import os
from typing import Dict, Any, Optional
import pandas as pd

from config import settings
from services.processing_engine import get_processing_engine
from utils import file_utils
from utils.column_mapper import resolve_mapping
from nlp.preprocessing import preprocess_text


def save_uploaded_csv(file_bytes: bytes, original_filename: str) -> Dict[str, Any]:
    """Persists an uploaded CSV via the processing engine, registers it, and
    returns dataset metadata including an auto-detected column mapping."""
    dataset_id = file_utils.new_id()
    raw_path = os.path.join(settings.UPLOAD_DIR, f"{dataset_id}.csv")
    with open(raw_path, "wb") as f:
        f.write(file_bytes)

    engine = get_processing_engine()
    df = engine.read_csv(raw_path)

    if df.empty:
        raise ValueError("Uploaded CSV contains no rows.")

    mapping = resolve_mapping(df, None)

    entry = {
        "dataset_id": dataset_id,
        "original_filename": original_filename,
        "raw_path": raw_path,
        "processed_path": None,
        "rows": int(len(df)),
        "columns": list(df.columns),
        "mapping": mapping,
        "engine": engine.engine_name,
    }
    file_utils.save_dataset_entry(dataset_id, entry)
    return entry


def load_sentiment140(sample_size: int = 50000) -> Dict[str, Any]:
    import csv
    import random
    dataset_id = file_utils.new_id()
    raw_path = os.path.join(settings.UPLOAD_DIR, f"{dataset_id}.csv")
    
    # Sentinel values
    target_each = sample_size // 2
    pos_samples = []
    neg_samples = []
    
    source_path = r"c:\Users\gagan\Downloads\files\training.1600000.processed.noemoticon.csv\training.1600000.processed.noemoticon.csv"
    if not os.path.exists(source_path):
        raise ValueError("Sentiment140 dataset not found locally.")

    # Memory efficient chunking logic via csv reader and reservoir sampling or just taking first N.
    # The prompt asks for reproducible sampling with fixed seed.
    # Since dataset is ordered (usually all 0s then all 4s), we shouldn't just take first N.
    # Let's collect lines with a reservoir sampling, or given it's 1.6M, we can just read the whole thing, but prompt says "DO NOT load all 1.6 million rows into memory at once using pandas.read_csv()". We can use reservoir sampling or just take first N/2 of 0 and first N/2 of 4 (shuffled later).
    # Since it's ordered, just grabbing first N/2 0s and first N/2 4s might be biased to earliest dates. 
    # Let's use reservoir sampling per class to get a random uniform sample without loading all into memory.
    
    random.seed(42)
    pos_count = 0
    neg_count = 0
    
    with open(source_path, 'r', encoding='ISO-8859-1') as f:
        reader = csv.reader(f)
        for row in reader:
            if not row: continue
            lbl = row[0]
            if lbl == '0':
                if len(neg_samples) < target_each:
                    neg_samples.append(row)
                else:
                    j = random.randint(0, neg_count)
                    if j < target_each:
                        neg_samples[j] = row
                neg_count += 1
            elif lbl == '4':
                if len(pos_samples) < target_each:
                    pos_samples.append(row)
                else:
                    j = random.randint(0, pos_count)
                    if j < target_each:
                        pos_samples[j] = row
                pos_count += 1

    # Combine and shuffle
    combined = pos_samples + neg_samples
    random.shuffle(combined)
    
    # Save the sample
    with open(raw_path, 'w', encoding='utf-8', newline='') as f:
        writer = csv.writer(f)
        # Add header
        writer.writerow(['target', 'id', 'date', 'flag', 'user', 'text'])
        for row in combined:
            # Remap target 0 -> negative, 4 -> positive
            row[0] = 'negative' if row[0] == '0' else 'positive'
            writer.writerow(row)
            
    engine = get_processing_engine()
    df = engine.read_csv(raw_path)

    # Standard columns
    mapping = {
        "text_column": "text",
        "sentiment_column": "target",
        "timestamp_column": "date",
        "user_column": "user",
        "likes_column": None,
        "comments_column": None,
        "shares_column": None,
        "platform_column": None
    }

    entry = {
        "dataset_id": dataset_id,
        "original_filename": f"Sentiment140_Sample_{sample_size}.csv",
        "raw_path": raw_path,
        "processed_path": None,
        "rows": len(df),
        "columns": list(df.columns),
        "mapping": mapping,
        "engine": engine.engine_name,
    }
    file_utils.save_dataset_entry(dataset_id, entry)
    return entry


def _load_dataset(dataset_id: str, processed: bool = False) -> pd.DataFrame:
    entry = file_utils.get_dataset_entry(dataset_id)
    if entry is None:
        raise KeyError(f"Dataset '{dataset_id}' not found.")
    engine = get_processing_engine()
    path = entry["processed_path"] if (processed and entry.get("processed_path")) else entry["raw_path"]
    return engine.read_dataset(path)


def get_entry(dataset_id: str) -> Dict[str, Any]:
    entry = file_utils.get_dataset_entry(dataset_id)
    if entry is None:
        raise KeyError(f"Dataset '{dataset_id}' not found.")
    return entry


def preview_dataset(dataset_id: str, n: int = 10) -> Dict[str, Any]:
    entry = get_entry(dataset_id)
    df = _load_dataset(dataset_id, processed=bool(entry.get("processed_path")))
    preview_df = df.head(n).fillna("")
    return {
        "dataset_id": dataset_id,
        "total_rows": int(len(df)),
        "columns": list(df.columns),
        "preview": preview_df.to_dict(orient="records"),
    }


def missing_value_report(dataset_id: str) -> Dict[str, Any]:
    df = _load_dataset(dataset_id)
    missing_by_col = df.isna().sum().to_dict()
    total_rows = len(df)
    missing_pct = {
        col: round((count / total_rows) * 100, 2) if total_rows else 0.0
        for col, count in missing_by_col.items()
    }
    rows_with_any_missing = int(df.isna().any(axis=1).sum())
    return {
        "dataset_id": dataset_id,
        "total_rows": int(total_rows),
        "missing_by_column": {k: int(v) for k, v in missing_by_col.items()},
        "missing_percent_by_column": missing_pct,
        "rows_with_any_missing": rows_with_any_missing,
    }


def duplicate_report(dataset_id: str) -> Dict[str, Any]:
    df = _load_dataset(dataset_id)
    dup_mask = df.duplicated()
    dup_count = int(dup_mask.sum())
    total_rows = len(df)
    sample_indices = df.index[dup_mask].tolist()[:20]
    return {
        "dataset_id": dataset_id,
        "total_rows": int(total_rows),
        "duplicate_rows": dup_count,
        "duplicate_percent": round((dup_count / total_rows) * 100, 2) if total_rows else 0.0,
        "sample_duplicate_indices": [int(i) for i in sample_indices],
    }


def run_preprocessing(dataset_id: str, options: Dict[str, Any], mapping_override: Optional[dict]) -> Dict[str, Any]:
    """Runs the full text-preprocessing pipeline (cleaning, stopword
    removal, tokenization, stemming) plus missing/duplicate handling, then
    persists the processed dataset via the processing engine."""
    entry = get_entry(dataset_id)
    engine = get_processing_engine()
    df = engine.read_dataset(entry["raw_path"])

    mapping = resolve_mapping(df, mapping_override)
    text_col = mapping.get("text_column")
    if not text_col or text_col not in df.columns:
        raise ValueError(
            "Could not determine the text column. Pass 'mapping.text_column' "
            f"explicitly. Available columns: {list(df.columns)}"
        )

    rows_before = len(df)

    if options.get("drop_missing_text", True):
        df = engine.drop_missing(df, subset=[text_col])
    missing_removed = rows_before - len(df)

    rows_after_missing = len(df)
    if options.get("drop_duplicates", True):
        df = engine.drop_duplicates(df)
    duplicates_removed = rows_after_missing - len(df)

    def _clean(t):
        return preprocess_text(
            t,
            remove_urls=options.get("remove_urls", True),
            remove_mentions=options.get("remove_mentions", True),
            remove_special_chars=options.get("remove_special_chars", True),
            remove_numbers=options.get("remove_numbers", True),
            remove_emojis=options.get("remove_emojis", True),
            lowercase=options.get("lowercase", True),
            remove_stopwords_flag=options.get("remove_stopwords", True),
            apply_stemming=options.get("apply_stemming", True),
        )

    df = engine.apply_text_transform(df, text_col, _clean)
    df.rename(columns={text_col: "processed_text"}, inplace=True)
    # Keep the original raw text alongside the processed one for reference.
    raw_df = engine.read_dataset(entry["raw_path"])
    if text_col in raw_df.columns:
        df["original_text"] = raw_df.loc[df.index, text_col] if len(raw_df) == rows_before else df["processed_text"]

    df = df[df["processed_text"].str.len() > 0].reset_index(drop=True)

    processed_path = os.path.join(settings.PROCESSED_DIR, f"{dataset_id}_processed.csv")
    engine.write_dataset(df, processed_path)

    mapping["text_column"] = "processed_text"
    entry["processed_path"] = processed_path
    entry["processed_rows"] = int(len(df))
    entry["mapping"] = mapping
    file_utils.save_dataset_entry(dataset_id, entry)

    return {
        "dataset_id": dataset_id,
        "rows_before": int(rows_before),
        "rows_after": int(len(df)),
        "duplicates_removed": int(duplicates_removed),
        "missing_removed": int(missing_removed),
        "sample_processed": df.head(5).fillna("").to_dict(orient="records"),
        "message": "Preprocessing complete.",
    }


def get_processed_dataframe(dataset_id: str) -> pd.DataFrame:
    entry = get_entry(dataset_id)
    if not entry.get("processed_path"):
        raise ValueError("Dataset has not been preprocessed yet. Call /api/datasets/{id}/preprocess first.")
    engine = get_processing_engine()
    return engine.read_dataset(entry["processed_path"])


def get_raw_dataframe(dataset_id: str) -> pd.DataFrame:
    entry = get_entry(dataset_id)
    engine = get_processing_engine()
    return engine.read_dataset(entry["raw_path"])

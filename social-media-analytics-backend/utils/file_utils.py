"""Small filesystem + JSON registry helpers used by the services layer."""
import json
import os
import uuid
from typing import Any, Dict, Optional
from threading import Lock

from config import settings

_REGISTRY_PATH = os.path.join(settings.PROCESSED_DIR, "registry.json")
_MODEL_REGISTRY_PATH = os.path.join(settings.MODEL_DIR, "model_registry.json")
_lock = Lock()


def new_id() -> str:
    return uuid.uuid4().hex[:12]


def _load_json(path: str) -> Dict[str, Any]:
    if not os.path.exists(path):
        return {}
    with open(path, "r") as f:
        try:
            return json.load(f)
        except json.JSONDecodeError:
            return {}


def _save_json(path: str, data: Dict[str, Any]) -> None:
    tmp_path = path + ".tmp"
    with open(tmp_path, "w") as f:
        json.dump(data, f, indent=2, default=str)
    os.replace(tmp_path, path)


def get_dataset_registry() -> Dict[str, Any]:
    with _lock:
        return _load_json(_REGISTRY_PATH)


def save_dataset_entry(dataset_id: str, entry: Dict[str, Any]) -> None:
    with _lock:
        registry = _load_json(_REGISTRY_PATH)
        registry[dataset_id] = entry
        _save_json(_REGISTRY_PATH, registry)


def get_dataset_entry(dataset_id: str) -> Optional[Dict[str, Any]]:
    registry = get_dataset_registry()
    return registry.get(dataset_id)


def get_model_registry() -> Dict[str, Any]:
    with _lock:
        return _load_json(_MODEL_REGISTRY_PATH)


def save_model_entry(dataset_id: str, entry: Dict[str, Any]) -> None:
    with _lock:
        registry = _load_json(_MODEL_REGISTRY_PATH)
        registry[dataset_id] = entry
        _save_json(_MODEL_REGISTRY_PATH, registry)


def get_model_entry(dataset_id: str) -> Optional[Dict[str, Any]]:
    registry = get_model_registry()
    return registry.get(dataset_id)

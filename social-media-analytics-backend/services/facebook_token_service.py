"""Encrypted persistence for the Facebook user access token.

Page tokens are fetched from /me/accounts on demand and kept only in process
memory. The user token used to retrieve them is encrypted at rest in SQLite.
"""
from datetime import datetime, timezone
from typing import Optional

from cryptography.fernet import Fernet, InvalidToken

from config import settings
from services.social_service import get_db


class FacebookTokenStoreError(RuntimeError):
    pass


def _fernet() -> Fernet:
    key = settings.FACEBOOK_TOKEN_ENCRYPTION_KEY.strip()
    if not key:
        raise FacebookTokenStoreError(
            "Encrypted Facebook token storage is not configured. Set FACEBOOK_TOKEN_ENCRYPTION_KEY and restart the backend."
        )
    try:
        return Fernet(key.encode("ascii"))
    except (ValueError, UnicodeEncodeError) as exc:
        raise FacebookTokenStoreError("FACEBOOK_TOKEN_ENCRYPTION_KEY is invalid; generate a Fernet key and restart the backend.") from exc


def _init_table() -> None:
    with get_db() as conn:
        conn.execute("""CREATE TABLE IF NOT EXISTS facebook_token_store (
            id INTEGER PRIMARY KEY CHECK(id=1),
            encrypted_user_token TEXT NOT NULL,
            updated_at TEXT NOT NULL
        )""")


def store_user_token(token: str) -> None:
    if not token or token != token.strip() or any(char.isspace() for char in token):
        raise ValueError("The Facebook access token is blank or contains whitespace. Copy the token value exactly.")
    cipher = _fernet()
    encrypted = cipher.encrypt(token.encode("utf-8")).decode("ascii")
    _init_table()
    with get_db() as conn:
        conn.execute("""INSERT INTO facebook_token_store(id, encrypted_user_token, updated_at)
            VALUES(1, ?, ?) ON CONFLICT(id) DO UPDATE SET
            encrypted_user_token=excluded.encrypted_user_token, updated_at=excluded.updated_at""",
            (encrypted, datetime.now(timezone.utc).isoformat()))


def get_stored_user_token() -> Optional[str]:
    _init_table()
    with get_db() as conn:
        row = conn.execute("SELECT encrypted_user_token FROM facebook_token_store WHERE id=1").fetchone()
    if not row:
        return None
    try:
        return _fernet().decrypt(row[0].encode("ascii")).decode("utf-8")
    except InvalidToken as exc:
        raise FacebookTokenStoreError(
            "The saved Facebook token could not be decrypted. Check that FACEBOOK_TOKEN_ENCRYPTION_KEY has not changed."
        ) from exc


def get_user_token() -> str:
    """Prefer a safely persisted Settings update; fall back to legacy .env settings."""
    return get_stored_user_token() or settings.FACEBOOK_ACCESS_TOKEN or settings.META_ACCESS_TOKEN or ""


def has_stored_user_token() -> bool:
    _init_table()
    with get_db() as conn:
        return conn.execute("SELECT 1 FROM facebook_token_store WHERE id=1").fetchone() is not None


def stored_token_updated_at() -> Optional[str]:
    _init_table()
    with get_db() as conn:
        row = conn.execute("SELECT updated_at FROM facebook_token_store WHERE id=1").fetchone()
    return row[0] if row else None

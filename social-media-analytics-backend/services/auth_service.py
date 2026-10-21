"""SQLite-backed authentication using standard-library cryptography."""
import base64
import getpass
import hashlib
import hmac
import json
import os
import re
import secrets
import sqlite3
import sys
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, Optional

from config import BASE_DIR, settings
from services.social_service import DB_PATH

PASSWORD_ITERATIONS = 310_000
USERNAME_RE = re.compile(r"^[a-zA-Z0-9_.-]{3,64}$")
def _development_secret(path: Optional[Path] = None) -> str:
    """Load one local signing key shared by reload workers and dev servers."""
    key_path = path or (BASE_DIR / "data" / ".auth_secret_key")
    key_path.parent.mkdir(parents=True, exist_ok=True)

    for _ in range(200):
        try:
            descriptor = os.open(str(key_path), os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
        except FileExistsError:
            try:
                value = key_path.read_text(encoding="ascii").strip()
            except (OSError, UnicodeError):
                value = ""
            if len(value) >= 32:
                return value
            time.sleep(0.01)
            continue

        value = secrets.token_hex(32)
        with os.fdopen(descriptor, "w", encoding="ascii") as key_file:
            key_file.write(value)
            key_file.flush()
            os.fsync(key_file.fileno())
        return value

    raise RuntimeError(f"Could not load a stable development authentication key from {key_path}.")


if settings.AUTH_SECRET_KEY:
    if len(settings.AUTH_SECRET_KEY) < 32:
        raise RuntimeError("AUTH_SECRET_KEY must contain at least 32 characters.")
    AUTH_SECRET = settings.AUTH_SECRET_KEY
elif settings.ENV.lower() in ("production", "prod"):
    raise RuntimeError("Set AUTH_SECRET_KEY to a stable random value before production startup.")
else:
    AUTH_SECRET = _development_secret()


def _connect(db_path: Optional[str] = None):
    conn = sqlite3.connect(db_path or DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def init_auth_db(db_path: Optional[str] = None) -> None:
    """Add auth tables safely alongside the existing social analytics schema."""
    with _connect(db_path) as conn:
        conn.execute("""CREATE TABLE IF NOT EXISTS auth_users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT NOT NULL COLLATE NOCASE UNIQUE,
            password_hash TEXT NOT NULL,
            created_at TEXT NOT NULL
        )""")
        conn.execute("""CREATE TABLE IF NOT EXISTS auth_sessions (
            jti TEXT PRIMARY KEY,
            user_id INTEGER NOT NULL,
            expires_at INTEGER NOT NULL,
            revoked_at TEXT,
            FOREIGN KEY(user_id) REFERENCES auth_users(id)
        )""")
        conn.execute("CREATE INDEX IF NOT EXISTS idx_auth_sessions_user ON auth_sessions(user_id)")


def _hash_password(password: str, salt: Optional[bytes] = None) -> str:
    salt = salt or secrets.token_bytes(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, PASSWORD_ITERATIONS)
    return f"pbkdf2_sha256${PASSWORD_ITERATIONS}${base64.urlsafe_b64encode(salt).decode()}${base64.urlsafe_b64encode(digest).decode()}"


def _verify_password(password: str, encoded: str) -> bool:
    try:
        scheme, iterations, salt, expected = encoded.split("$", 3)
        iterations = int(iterations)
        if scheme != "pbkdf2_sha256" or iterations < 100_000 or iterations > 1_000_000:
            return False
        salt_bytes = base64.urlsafe_b64decode(salt.encode())
        expected_bytes = base64.urlsafe_b64decode(expected.encode())
        actual = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt_bytes, iterations, dklen=len(expected_bytes))
        return hmac.compare_digest(actual, expected_bytes)
    except (ValueError, TypeError):
        return False


def create_user(username: str, password: str, db_path: Optional[str] = None) -> Dict[str, Any]:
    username = username.strip()
    if not USERNAME_RE.fullmatch(username):
        raise ValueError("Username must be 3-64 characters and use letters, numbers, dot, underscore, or hyphen.")
    if len(password) < 12:
        raise ValueError("Password must be at least 12 characters long.")
    init_auth_db(db_path)
    with _connect(db_path) as conn:
        try:
            cursor = conn.execute("INSERT INTO auth_users(username, password_hash, created_at) VALUES (?, ?, ?)",
                                  (username, _hash_password(password), datetime.now(timezone.utc).isoformat()))
        except sqlite3.IntegrityError as exc:
            raise ValueError("An account with that username already exists.") from exc
        return {"id": cursor.lastrowid, "username": username}


def authenticate(username: str, password: str, db_path: Optional[str] = None) -> Optional[Dict[str, Any]]:
    init_auth_db(db_path)
    with _connect(db_path) as conn:
        user = conn.execute("SELECT id, username, password_hash FROM auth_users WHERE username = ? COLLATE NOCASE",
                            (username.strip(),)).fetchone()
    encoded_hash = user["password_hash"] if user else _DUMMY_HASH
    valid_password = _verify_password(password, encoded_hash)
    if not user or not valid_password:
        return None
    return {"id": user["id"], "username": user["username"]}


def _b64(value: bytes) -> str:
    return base64.urlsafe_b64encode(value).rstrip(b"=").decode("ascii")


def _unb64(value: str) -> bytes:
    return base64.urlsafe_b64decode(value + "=" * (-len(value) % 4))


def issue_token(user: Dict[str, Any], db_path: Optional[str] = None, now: Optional[int] = None) -> Dict[str, Any]:
    now = int(now if now is not None else time.time())
    expires = now + settings.AUTH_TOKEN_TTL_MINUTES * 60
    jti = secrets.token_urlsafe(24)
    header = _b64(json.dumps({"alg": "HS256", "typ": "JWT"}, separators=(",", ":")).encode())
    payload = _b64(json.dumps({"sub": str(user["id"]), "username": user["username"], "jti": jti, "iat": now, "exp": expires}, separators=(",", ":")).encode())
    signature = _b64(hmac.new(AUTH_SECRET.encode(), f"{header}.{payload}".encode(), hashlib.sha256).digest())
    token = f"{header}.{payload}.{signature}"
    init_auth_db(db_path)
    with _connect(db_path) as conn:
        conn.execute("DELETE FROM auth_sessions WHERE expires_at <= ? OR revoked_at IS NOT NULL", (now,))
        conn.execute("INSERT INTO auth_sessions(jti, user_id, expires_at) VALUES (?, ?, ?)", (jti, user["id"], expires))
    return {"access_token": token, "token_type": "bearer", "expires_in": expires - now, "user": {"id": user["id"], "username": user["username"]}}


def validate_token(token: str, db_path: Optional[str] = None, now: Optional[int] = None) -> Optional[Dict[str, Any]]:
    try:
        header, payload, signature = token.split(".", 2)
        expected = _b64(hmac.new(AUTH_SECRET.encode(), f"{header}.{payload}".encode(), hashlib.sha256).digest())
        if not hmac.compare_digest(signature, expected):
            return None
        claims = json.loads(_unb64(payload))
        if int(claims["exp"]) <= int(now if now is not None else time.time()):
            return None
        init_auth_db(db_path)
        with _connect(db_path) as conn:
            session = conn.execute("""SELECT u.id, u.username FROM auth_sessions s
                JOIN auth_users u ON u.id=s.user_id
                WHERE s.jti=? AND s.user_id=? AND s.expires_at>? AND s.revoked_at IS NULL""",
                                   (claims["jti"], int(claims["sub"]), int(now if now is not None else time.time()))).fetchone()
        return dict(session) if session else None
    except (ValueError, KeyError, TypeError, json.JSONDecodeError, sqlite3.Error):
        return None


def revoke_token(token: str, db_path: Optional[str] = None) -> None:
    try:
        _, payload, _ = token.split(".", 2)
        jti = json.loads(_unb64(payload))["jti"]
        with _connect(db_path) as conn:
            conn.execute("UPDATE auth_sessions SET revoked_at=? WHERE jti=? AND revoked_at IS NULL",
                         (datetime.now(timezone.utc).isoformat(), jti))
    except (ValueError, KeyError, TypeError, json.JSONDecodeError):
        return


_DUMMY_HASH = _hash_password("not-a-real-password", b"nexusintel-auth-dummy")
init_auth_db()


if __name__ == "__main__" and len(sys.argv) >= 2 and sys.argv[1] == "create-user":
    username = sys.argv[2] if len(sys.argv) > 2 else input("Username: ").strip()
    password = getpass.getpass("Password (minimum 12 characters): ")
    confirm = getpass.getpass("Confirm password: ")
    if password != confirm:
        raise SystemExit("Passwords do not match.")
    try:
        account = create_user(username, password)
    except ValueError as exc:
        raise SystemExit(str(exc))
    print(f"Created application account '{account['username']}'.")

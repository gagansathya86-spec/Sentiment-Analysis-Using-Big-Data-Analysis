"""
Heuristic auto-detection of dataset column roles.

Real-world social media CSV exports name columns differently
(e.g. "comment_text" vs "content" vs "post"). This module guesses the most
likely column for each semantic role so the API works out-of-the-box on a
typical export, while still allowing an explicit ColumnMapping override.

Detection is token-based (splitting on non-alphanumeric characters) rather
than naive substring matching, so e.g. a "posted_on" column (tokens:
"posted", "on") does not falsely match the text-column candidate "post".
Roles are resolved in a fixed priority order — more specific/unambiguous
roles first — and a column already claimed by one role is not reused by
another.
"""
import re
from typing import Dict, Optional, List
import pandas as pd

_CANDIDATES = {
    "sentiment_column": ["sentiment", "label", "class", "polarity"],
    "timestamp_column": ["timestamp", "date", "datetime", "createdat", "postedat", "postedon", "time"],
    "likes_column": ["likes", "likecount", "numlikes", "favorites", "favoritecount"],
    "comments_column": ["comments", "commentcount", "numcomments", "replies"],
    "shares_column": ["shares", "sharecount", "numshares", "retweets", "reposts"],
    "user_column": ["userid", "user", "username", "author"],
    "platform_column": ["platform", "source", "site"],
    # text_column resolved last: it's the most generic role, and this order
    # keeps a numeric "likes"-style or timestamp-style column from ever
    # being claimed as text just because it wasn't checked yet.
    "text_column": ["text", "content", "post", "comment", "tweet", "message", "msg", "body", "review", "caption"],
}

# Priority order for resolution (independent of dict iteration order, kept
# explicit for clarity).
_RESOLUTION_ORDER = [
    "sentiment_column", "timestamp_column", "likes_column", "comments_column",
    "shares_column", "user_column", "platform_column", "text_column",
]

_TOKEN_SPLIT_RE = re.compile(r"[^a-z0-9]+")


def _tokens(name: str) -> List[str]:
    return [t for t in _TOKEN_SPLIT_RE.split(name.lower()) if t]


def detect_mapping(columns: List[str]) -> Dict[str, Optional[str]]:
    claimed: Dict[str, str] = {}  # original_column_name -> role already assigned
    mapping: Dict[str, Optional[str]] = {}

    col_tokens = {c: _tokens(c) for c in columns}
    col_joined = {c: "".join(col_tokens[c]) for c in columns}

    for role in _RESOLUTION_ORDER:
        candidates = _CANDIDATES[role]
        found = None

        # Pass 1: exact match of the whole column name (joined, no separators)
        # against a candidate.
        for cand in candidates:
            for col, joined in col_joined.items():
                if col in claimed:
                    continue
                if joined == cand:
                    found = col
                    break
            if found:
                break

        # Pass 2: any individual token exactly equals a candidate
        # (e.g. "posted_at" -> tokens ["posted","at"] matches "postedat"? no —
        # use token-level exact match against single-word candidates too).
        if not found:
            for cand in candidates:
                for col, toks in col_tokens.items():
                    if col in claimed:
                        continue
                    if cand in toks:
                        found = col
                        break
                if found:
                    break

        # Pass 3 (text_column only, last resort): substring match, since
        # generic free-text columns are sometimes named unpredictably.
        if not found and role == "text_column":
            for cand in candidates:
                for col, joined in col_joined.items():
                    if col in claimed:
                        continue
                    if cand in joined:
                        found = col
                        break
                if found:
                    break

        mapping[role] = found
        if found:
            claimed[found] = role

    return mapping


def resolve_mapping(df: pd.DataFrame, override: Optional[dict]) -> Dict[str, Optional[str]]:
    """Combines auto-detected mapping with any explicit override fields."""
    detected = detect_mapping(list(df.columns))
    if override:
        for key, value in override.items():
            if value:
                detected[key] = value
    return detected

"""Shared ISO timestamp parsing for Facebook Graph API values."""
import re
from datetime import datetime, timezone
from typing import Optional, Union


def parse_utc_datetime(value: Union[str, datetime, None]) -> Optional[datetime]:
    """Parse ISO values with Z, ±HHMM, or ±HH:MM offsets into aware UTC.

    Naive timestamps are treated as UTC, matching Facebook Graph API semantics
    and avoiding host-local timezone dependence.
    """
    if value is None or value == "":
        return None
    if isinstance(value, datetime):
        parsed = value
    else:
        text = str(value).strip()
        if not text:
            return None
        if text.endswith(("Z", "z")):
            text = text[:-1] + "+00:00"
        text = re.sub(r"([+-]\d{2})(\d{2})$", r"\1:\2", text)
        try:
            parsed = datetime.fromisoformat(text)
        except (TypeError, ValueError):
            return None
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed.astimezone(timezone.utc)

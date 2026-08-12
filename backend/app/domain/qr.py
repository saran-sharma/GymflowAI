"""Branch check-in QR tokens.

The QR displayed at a branch desk encodes a token derived from that branch's
server-side secret and the current time window. It rotates every
``qr_window_seconds``, so a photographed code stops working almost immediately
and a trainer cannot check in to a branch they are not standing in.

The device never learns the secret and never supplies a timestamp — it hands
back the string it scanned and the server decides both *which branch* and
*when*.
"""

from __future__ import annotations

import hashlib
import hmac
from dataclasses import dataclass
from datetime import datetime

from app.core.clock import now_utc
from app.core.config import settings

TOKEN_PREFIX = "GFQ1"
_DIGEST_CHARS = 16


def _window_index(at: datetime, window_seconds: int) -> int:
    return int(at.timestamp()) // window_seconds


def _digest(secret: str, branch_id: int, window: int) -> str:
    message = f"{branch_id}:{window}".encode()
    return hmac.new(secret.encode(), message, hashlib.sha256).hexdigest()[:_DIGEST_CHARS]


def issue_token(branch_id: int, secret: str, at: datetime | None = None) -> str:
    moment = at or now_utc()
    window = _window_index(moment, settings.qr_window_seconds)
    return f"{TOKEN_PREFIX}.{branch_id}.{window}.{_digest(secret, branch_id, window)}"


@dataclass(frozen=True)
class QrToken:
    branch_id: int
    window: int
    raw: str


def parse_token(raw: str) -> QrToken | None:
    parts = (raw or "").strip().split(".")
    if len(parts) != 4 or parts[0] != TOKEN_PREFIX:
        return None
    try:
        return QrToken(branch_id=int(parts[1]), window=int(parts[2]), raw=raw.strip())
    except ValueError:
        return None


def verify_token(raw: str, branch_id: int, secret: str, at: datetime | None = None) -> bool:
    """True when the token is this branch's, and from the current or previous window.

    Accepting the previous window keeps a scan that straddles a rollover from
    failing, without widening the window a replay would have to land inside.
    """
    token = parse_token(raw)
    if token is None or token.branch_id != branch_id:
        return False

    moment = at or now_utc()
    current = _window_index(moment, settings.qr_window_seconds)
    if token.window not in (current, current - 1):
        return False

    expected = (
        f"{TOKEN_PREFIX}.{branch_id}.{token.window}.{_digest(secret, branch_id, token.window)}"
    )
    return hmac.compare_digest(expected, token.raw)


def seconds_until_rotation(at: datetime | None = None) -> int:
    moment = at or now_utc()
    window = settings.qr_window_seconds
    return window - int(moment.timestamp()) % window


__all__ = [
    "QrToken",
    "TOKEN_PREFIX",
    "issue_token",
    "parse_token",
    "seconds_until_rotation",
    "verify_token",
]

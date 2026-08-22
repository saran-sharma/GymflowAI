"""Rate limiting, as a FastAPI dependency.

Applied where abuse is cheap and damaging: login (credential stuffing) and
check-in (PIN guessing). Everything else is left alone so a flaky gym network
retrying a request cannot lock a trainer out mid-shift.

Implemented as a dependency rather than a decorator because a decorator that
wraps the endpoint hides its annotations from FastAPI, which then stops
resolving the request body.

The counters live in this process. That is correct for a single API instance
and for tests; running more than one instance in production needs a shared
store — see docs/DEPLOYMENT.md.
"""

from __future__ import annotations

import threading
import time
from collections import defaultdict, deque
from collections.abc import Callable

from fastapi import HTTPException, Request, status

from app.core.config import settings


def _parse(rule: str) -> tuple[int, int]:
    """Turn "10/minute" into (10, 60)."""
    units = {"second": 1, "minute": 60, "hour": 3600, "day": 86400}
    count, _, unit = rule.partition("/")
    return int(count), units[unit.strip().rstrip("s")]


class RateLimiter:
    """Sliding-window counter, keyed per scope and client."""

    def __init__(self) -> None:
        self._hits: dict[tuple[str, str], deque[float]] = defaultdict(deque)
        self._lock = threading.Lock()

    def reset(self) -> None:
        with self._lock:
            self._hits.clear()

    def hit(self, scope: str, key: str, limit: int, window: int) -> bool:
        now = time.monotonic()
        with self._lock:
            bucket = self._hits[(scope, key)]
            cutoff = now - window
            while bucket and bucket[0] <= cutoff:
                bucket.popleft()
            if len(bucket) >= limit:
                return False
            bucket.append(now)
            return True


limiter = RateLimiter()


def client_key(request: Request) -> str:
    """Bucket by client IP, and by session when there is one.

    Keying an authenticated request on its token as well stops one gym's shared
    NAT address from throttling every trainer standing in it.
    """
    forwarded = request.headers.get("x-forwarded-for")
    ip = (
        forwarded.split(",")[0].strip()
        if forwarded
        else (request.client.host if request.client else "unknown")
    )
    auth = request.headers.get("authorization", "")
    if auth.startswith("Bearer ") and len(auth) > 24:
        return f"{ip}:{auth[-16:]}"
    return ip


def rate_limit(scope: str, rule: str) -> Callable[[Request], None]:
    """Build a dependency that enforces ``rule`` (e.g. "10/minute") for ``scope``.

    A closure rather than a callable class: FastAPI resolves a dependency's
    annotations through its ``__globals__``, which a class instance does not
    have, so ``request: Request`` on a ``__call__`` would be mistaken for a
    request-body field.
    """
    limit, window = _parse(rule)

    def dependency(request: Request) -> None:
        if not settings.rate_limit_enabled:
            return
        if not limiter.hit(scope, client_key(request), limit, window):
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail={"code": "rate_limited", "message": "Too many requests. Slow down."},
                headers={"Retry-After": str(window)},
            )

    return dependency


login_rate_limit = rate_limit("auth", settings.rate_limit_login)
checkin_rate_limit = rate_limit("checkin", settings.rate_limit_checkin)
# Keyed by source IP only (no bearer token — the device push has none).
hardware_push_rate_limit = rate_limit("hardware_push", settings.rate_limit_hardware_push)

__all__ = [
    "RateLimiter",
    "checkin_rate_limit",
    "client_key",
    "hardware_push_rate_limit",
    "limiter",
    "login_rate_limit",
    "rate_limit",
]

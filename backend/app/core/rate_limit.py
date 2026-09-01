"""Rate limiting, as a FastAPI dependency.

Applied where abuse is cheap and damaging: login (credential stuffing) and
check-in (PIN guessing). Everything else is left alone so a flaky gym network
retrying a request cannot lock a trainer out mid-shift.

Implemented as a dependency rather than a decorator because a decorator that
wraps the endpoint hides its annotations from FastAPI, which then stops
resolving the request body.

## Storage

The counter store sits behind ``RateLimitStore``. The default
``InProcessRateLimitStore`` keeps counters in this process — correct for a
single API instance, for Codespaces, and for the test suite. Running more than
one API instance needs a shared store (Redis): implement ``RateLimitStore``
against it and assign ``rate_limit.store`` at startup. That decision is a
deployment-topology one — see ``docs/DEPLOYMENT.md`` — so no Redis client is
wired in here. When more than one instance runs with the in-process store the
effective limit is multiplied by the instance count; that is degraded, not
absent, and ``main.py`` logs a warning at boot if it detects the combination.

## Client identity / X-Forwarded-For

``X-Forwarded-For`` is only honoured when the *direct* peer
(``request.client.host``) is a configured trusted proxy
(``RATE_LIMIT_TRUSTED_PROXIES``). With no trusted proxy configured — the
default, and the Codespaces case — the header is ignored and the real socket
peer is used, so a client cannot spoof its own rate-limit bucket.
"""

from __future__ import annotations

import threading
import time
from collections import defaultdict, deque
from collections.abc import Callable
from typing import Protocol

from fastapi import HTTPException, Request, status

from app.core.config import settings


def _parse(rule: str) -> tuple[int, int]:
    """Turn "10/minute" into (10, 60)."""
    units = {"second": 1, "minute": 60, "hour": 3600, "day": 86400}
    count, _, unit = rule.partition("/")
    return int(count), units[unit.strip().rstrip("s")]


class RateLimitStore(Protocol):
    """The seam a shared (e.g. Redis) backend implements to replace the
    in-process counters without touching any call site."""

    def hit(self, scope: str, key: str, limit: int, window: int) -> bool:
        """Record one request; return False when the caller is over ``limit``
        in the trailing ``window`` seconds."""
        ...

    def reset(self) -> None:
        """Drop all counters (used between tests)."""
        ...


class InProcessRateLimiter:
    """Sliding-window counter, keyed per scope and client. Process-local."""

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


# Back-compat alias: the class used to be called ``RateLimiter``.
RateLimiter = InProcessRateLimiter

#: The active store. A deployment with >1 instance assigns a shared
#: implementation here at startup (see module docstring).
store: RateLimitStore = InProcessRateLimiter()

#: Historic name kept because tests and conftest import ``limiter`` directly.
limiter = store


def using_in_process_store() -> bool:
    return isinstance(store, InProcessRateLimiter)


def _trusted_proxies() -> set[str]:
    raw = getattr(settings, "rate_limit_trusted_proxies", "") or ""
    return {p.strip() for p in raw.split(",") if p.strip()}


def _client_ip(request: Request) -> str:
    """The real client IP.

    ``X-Forwarded-For`` is trusted only when the direct socket peer is a
    configured trusted proxy; otherwise it is ignored entirely.
    """
    peer = request.client.host if request.client else "unknown"
    trusted = _trusted_proxies()
    if peer in trusted:
        forwarded = request.headers.get("x-forwarded-for", "")
        # Right-most entry that is not itself one of our proxies is the client
        # as our edge saw it; fall back to the left-most if the chain is all
        # trusted (unusual).
        parts = [p.strip() for p in forwarded.split(",") if p.strip()]
        for candidate in reversed(parts):
            if candidate not in trusted:
                return candidate
        if parts:
            return parts[0]
    return peer


def client_key(request: Request) -> str:
    """Bucket by client IP, and by session when there is one.

    Keying an authenticated request on its token as well stops one gym's shared
    NAT address from throttling every trainer standing in it.
    """
    ip = _client_ip(request)
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
        if not store.hit(scope, client_key(request), limit, window):
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
    "InProcessRateLimiter",
    "RateLimitStore",
    "RateLimiter",
    "checkin_rate_limit",
    "client_key",
    "hardware_push_rate_limit",
    "limiter",
    "login_rate_limit",
    "rate_limit",
    "store",
    "using_in_process_store",
]

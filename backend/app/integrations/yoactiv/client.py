"""Yoactiv Data API transport.

The Data API is a set of GET-only ASMX operations under a configured base
(the ``backdata.asmx`` root, e.g.
``https://backstage.yoactiv.com/api/backdata.asmx``). Authentication is the
per-tenant ``API_Key`` request header. A live probe on 2026-08-30 also found
the host gated by IIS HTTP **Basic** auth *in front of* that header, so an
optional Basic credential pair is supported too (see
``docs/INTEGRATIONS.md``).

Only the five operations SLAM's Postman collection documents are callable:
``enquires``, ``followups``, ``checkins``, ``invoices``,
``ptTrialConversion``. Asking for anything else raises — this client never
invents an endpoint.

The network call goes through an injectable ``transport`` callable so the
sync layer and its tests never touch the network. The default transport is
stdlib ``urllib`` — enabling the connector adds no production dependency.
"""

from __future__ import annotations

import base64
import contextlib
import json
import random
import time
import urllib.error
import urllib.parse
import urllib.request
from collections import deque
from collections.abc import Callable
from dataclasses import dataclass
from typing import Any

#: The only operations this client will call. Kept in lockstep with the
#: Postman collection SLAM supplied; adding to it is a deliberate, reviewed
#: change, never an incidental one.
CONFIRMED_ENDPOINTS: frozenset[str] = frozenset(
    {"enquires", "followups", "checkins", "invoices", "ptTrialConversion"}
)

#: (status, body_text) — what a transport must return. A transport raises
#: ``YoactivTransportError`` for anything below the HTTP layer (DNS, TLS,
#: connection reset, timeout).
TransportResult = tuple[int, str]
Transport = Callable[[str, dict[str, str], float], TransportResult]


class YoactivError(RuntimeError):
    """Base for every failure surfaced by the client."""


class YoactivAuthError(YoactivError):
    """401/403 from Yoactiv. Never retried — the connector halts on this so a
    rotated key or a missing Basic credential is loud, not a silent stall."""


class YoactivRateLimited(YoactivError):
    """429 from Yoactiv, after the client's own retries were exhausted."""


class YoactivTransportError(YoactivError):
    """The request never got an HTTP response (DNS/TLS/connection/timeout)."""


class YoactivHTTPError(YoactivError):
    """A non-2xx HTTP status other than 401/403/429."""


class YoactivResponseError(YoactivError):
    """A 2xx response whose body was not the expected ``{"Results": [...]}``."""


def _urllib_transport(url: str, headers: dict[str, str], timeout: float) -> TransportResult:
    request = urllib.request.Request(url, headers=headers, method="GET")
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:  # noqa: S310 - fixed https base, GET only
            body = response.read().decode("utf-8", errors="replace")
            return response.status, body
    except urllib.error.HTTPError as exc:  # a real HTTP response, just not 2xx
        body = ""
        with contextlib.suppress(Exception):  # body is best-effort context only
            body = exc.read().decode("utf-8", errors="replace")
        return exc.code, body
    except (urllib.error.URLError, TimeoutError, OSError) as exc:
        raise YoactivTransportError(f"transport failure for {url.split('?', 1)[0]}: {exc}") from exc


@dataclass
class _Bucket:
    """Trivial sliding-window limiter over a monotonic clock."""

    per_minute: int
    _hits: deque[float]

    def wait(self, sleep: Callable[[float], None]) -> None:
        if self.per_minute <= 0:
            return
        now = time.monotonic()
        while self._hits and now - self._hits[0] >= 60.0:
            self._hits.popleft()
        if len(self._hits) >= self.per_minute:
            sleep(max(0.0, 60.0 - (now - self._hits[0])))
        self._hits.append(time.monotonic())


class YoactivClient:
    """Reads the Yoactiv Data API. One instance per (base_url, api_key)."""

    def __init__(
        self,
        base_url: str,
        api_key: str,
        *,
        basic_auth: tuple[str, str] | None = None,
        transport: Transport | None = None,
        rate_limit_per_min: int = 60,
        timeout: float = 30.0,
        max_retries: int = 5,
        sleep: Callable[[float], None] = time.sleep,
    ) -> None:
        if not base_url:
            raise YoactivError("Yoactiv base URL is not configured")
        if not api_key:
            raise YoactivError("Yoactiv API key is not configured")
        self.base_url = base_url.rstrip("/")
        self._api_key = api_key
        self._basic_auth = basic_auth
        self._transport = transport or _urllib_transport
        self._timeout = timeout
        self._max_retries = max_retries
        self._sleep = sleep
        self._bucket = _Bucket(per_minute=rate_limit_per_min, _hits=deque())

    # ------------------------------------------------------------------ api

    def get_results(self, endpoint: str, params: dict[str, str]) -> list[dict[str, Any]]:
        """Call one confirmed operation and return its ``Results`` list.

        Retries transport failures, 429 and 5xx with exponential backoff and
        full jitter. Raises ``YoactivAuthError`` immediately on 401/403.
        """
        if endpoint not in CONFIRMED_ENDPOINTS:
            raise YoactivError(
                f"{endpoint!r} is not a confirmed Yoactiv Data API operation "
                f"(known: {', '.join(sorted(CONFIRMED_ENDPOINTS))})"
            )
        query = "&".join(f"{k}={urllib.parse.quote(str(v))}" for k, v in params.items())
        url = f"{self.base_url}/{endpoint}?{query}" if query else f"{self.base_url}/{endpoint}"

        last_exc: Exception | None = None
        for attempt in range(1, self._max_retries + 1):
            self._bucket.wait(self._sleep)
            try:
                status, body = self._transport(url, self._headers(), self._timeout)
            except YoactivTransportError as exc:
                last_exc = exc
                self._backoff(attempt)
                continue

            if status in (401, 403):
                raise YoactivAuthError(
                    f"Yoactiv returned {status} for {endpoint}. The Data API host is behind "
                    "IIS Basic auth ahead of the API_Key check — set YOACTIV_BASIC_AUTH_USER / "
                    "YOACTIV_BASIC_AUTH_PASSWORD, and confirm the API_Key is current."
                )
            if status == 429:
                last_exc = YoactivRateLimited(f"429 from {endpoint}")
                self._backoff(attempt)
                continue
            if status >= 500:
                last_exc = YoactivHTTPError(f"{status} from {endpoint}")
                self._backoff(attempt)
                continue
            if status >= 300:
                raise YoactivHTTPError(f"{status} from {endpoint}: {body[:200]}")

            return _extract_results(body, endpoint)

        assert last_exc is not None
        raise last_exc

    def health(self) -> dict[str, Any]:
        return {
            "name": "yoactiv",
            "base_url_host": self.base_url.split("//", 1)[-1].split("/", 1)[0],
            "basic_auth_configured": self._basic_auth is not None,
            "confirmed_endpoints": sorted(CONFIRMED_ENDPOINTS),
        }

    # --------------------------------------------------------------- internals

    def _headers(self) -> dict[str, str]:
        headers = {"API_Key": self._api_key, "Accept": "application/json"}
        if self._basic_auth is not None:
            user, password = self._basic_auth
            token = base64.b64encode(f"{user}:{password}".encode()).decode("ascii")
            headers["Authorization"] = f"Basic {token}"
        return headers

    def _backoff(self, attempt: int) -> None:
        # 1, 4, 16, ... seconds, capped, with full jitter.
        ceiling = min(60.0, 4.0 ** (attempt - 1))
        self._sleep(random.uniform(0.0, ceiling))


def _extract_results(body: str, endpoint: str) -> list[dict[str, Any]]:
    try:
        payload = json.loads(body)
    except json.JSONDecodeError as exc:
        raise YoactivResponseError(f"{endpoint} returned a non-JSON body ({body[:120]!r})") from exc
    if isinstance(payload, list):
        return [row for row in payload if isinstance(row, dict)]
    if isinstance(payload, dict):
        results = payload.get("Results")
        if isinstance(results, list):
            return [row for row in results if isinstance(row, dict)]
    raise YoactivResponseError(
        f"{endpoint} response was not the expected {{'Results': [...]}} shape"
    )


__all__ = [
    "CONFIRMED_ENDPOINTS",
    "Transport",
    "YoactivAuthError",
    "YoactivClient",
    "YoactivError",
    "YoactivHTTPError",
    "YoactivRateLimited",
    "YoactivResponseError",
    "YoactivTransportError",
]

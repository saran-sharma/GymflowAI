"""A tiny in-process TTL cache for the aggregate intelligence reads.

The daily brief and the trainer attention queue each fan out across every
member in scope — a handful of signal queries per member — and both are read
on a dashboard load, sometimes twice in quick succession (mount + focus). They
are "what needs attention" surfaces, not real-time ones: a 45-second-stale
answer is fine, and the alternative (an event-sourced materialised summary) is
far more machinery than this needs.

Deterministic: the same inputs inside the TTL return the exact same object.
Process-local and unbounded-until-TTL — acceptable because the key space is
(branch scope × date × a small int), i.e. a few dozen entries at most for
SLAM's size. Nothing here is a correctness dependency; if the cache is cold or
disabled the callers simply recompute.
"""

from __future__ import annotations

import threading
import time
from collections.abc import Callable
from typing import Any

_TTL_SECONDS = 45.0
_lock = threading.Lock()
_store: dict[tuple, tuple[float, Any]] = {}


def get_or_compute(key: tuple, compute: Callable[[], Any]) -> Any:
    now = time.monotonic()
    with _lock:
        hit = _store.get(key)
        if hit is not None and now - hit[0] < _TTL_SECONDS:
            return hit[1]
    value = compute()
    with _lock:
        _store[key] = (now, value)
        # Opportunistic prune so a long-lived process does not accrete stale keys.
        if len(_store) > 256:
            for k, (stamp, _) in list(_store.items()):
                if now - stamp >= _TTL_SECONDS:
                    _store.pop(k, None)
    return value


def clear() -> None:
    """Test hook — drop everything."""
    with _lock:
        _store.clear()


__all__ = ["clear", "get_or_compute"]

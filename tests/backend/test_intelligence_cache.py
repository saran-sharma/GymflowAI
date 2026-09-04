"""The 45s TTL cache behind the aggregate intelligence reads."""

from __future__ import annotations

import time

from app.services.intelligence import _cache


def setup_function():
    _cache.clear()


def test_same_key_inside_the_ttl_computes_once():
    calls = []

    def compute():
        calls.append(1)
        return object()

    a = _cache.get_or_compute(("k", 1), compute)
    b = _cache.get_or_compute(("k", 1), compute)
    assert a is b
    assert len(calls) == 1


def test_a_different_key_computes_again():
    calls = []
    _cache.get_or_compute(("k", 1), lambda: calls.append(1))
    _cache.get_or_compute(("k", 2), lambda: calls.append(1))
    assert len(calls) == 2


def test_the_ttl_expires(monkeypatch):
    monkeypatch.setattr(_cache, "_TTL_SECONDS", 0.05)
    calls = []

    def compute():
        calls.append(1)
        return len(calls)

    assert _cache.get_or_compute(("k", 1), compute) == 1
    time.sleep(0.06)
    assert _cache.get_or_compute(("k", 1), compute) == 2


def test_clear_drops_everything():
    _cache.get_or_compute(("k", 1), lambda: "v")
    _cache.clear()
    calls = []
    _cache.get_or_compute(("k", 1), lambda: calls.append(1))
    assert len(calls) == 1


def test_trainer_attention_queue_is_served_from_cache(db, world):
    """A second call inside the TTL returns the identical object without
    re-fanning-out across the trainer's members."""
    from datetime import date, timedelta

    from intelligence_helpers import add_workout

    from app.services.intelligence.trainer import build_attention_queue

    for days_ago in (60, 55, 50, 45):
        add_workout(db, world["member_ngk"], on=date.today() - timedelta(days=days_ago))
    db.commit()

    first = build_attention_queue(db, world["trainer_ngk"])
    second = build_attention_queue(db, world["trainer_ngk"])
    assert first is second

"""Concurrency invariants — one valid business transition must not become two.

These fire real simultaneous HTTP requests through the TestClient against the
real (Postgres) test database, so unique constraints, row locks and
``IntegrityError`` handling are exercised, not mocked.

If Postgres is not reachable the suite falls back to in-memory SQLite, whose
locking model is not representative; these tests skip themselves there.
"""

from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor
from datetime import date, datetime
from zoneinfo import ZoneInfo

import pytest
from conftest import USING_SQLITE_FALLBACK
from sqlalchemy import func, select

from app.core import clock
from app.core.clock import UTC
from app.db.models import (
    Payment,
    PaymentKind,
    PaymentStatus,
    TrainerAttendance,
)

pytestmark = pytest.mark.skipif(
    USING_SQLITE_FALLBACK, reason="concurrency semantics require Postgres"
)

IST = ZoneInfo("Asia/Kolkata")
PIN = "135790"
API = "/api/v1"


def _parallel(fn, n):
    with ThreadPoolExecutor(max_workers=n) as pool:
        return [f.result() for f in [pool.submit(fn) for _ in range(n)]]


# --------------------------------------------------------------- payments


def test_a_pending_payment_settles_exactly_once_under_concurrency(client, world, auth, db):
    admin = auth(world["admin"])
    created = client.post(
        f"{API}/payments",
        headers=admin,
        json={
            "member_id": world["member_ngk"].id,
            "kind": "membership",
            "amount": 5000,
        },
    )
    assert created.status_code == 201, created.text
    pid = created.json()["id"]

    def settle():
        return client.post(
            f"{API}/payments/{pid}/settle", headers=admin, json={"method": "cash"}
        ).status_code

    codes = _parallel(settle, 8)

    assert codes.count(200) == 1, f"expected exactly one successful settle, got {codes}"
    assert all(c in (200, 409) for c in codes), codes

    db.expire_all()
    row = db.get(Payment, pid)
    assert row.status is PaymentStatus.PAID
    assert row.paid_at is not None
    assert row.collected_by_user_id is not None
    # exactly one PAID membership payment for this member
    paid = db.scalar(
        select(func.count())
        .select_from(Payment)
        .where(
            Payment.member_id == world["member_ngk"].id,
            Payment.kind == PaymentKind.MEMBERSHIP,
            Payment.status == PaymentStatus.PAID,
        )
    )
    assert paid == 1


# ---------------------------------------------------------- trainer check-in


def test_trainer_check_in_is_idempotent_under_concurrency(client, world, auth, db):
    headers = auth(world["trainer_ngk_user"])
    branch_id = world["branches"]["ngk"].id
    clock.freeze(datetime(2026, 8, 12, 18, 4, tzinfo=IST).astimezone(UTC))
    try:

        def check_in():
            return client.post(
                f"{API}/attendance/check-in",
                json={"branch_id": branch_id, "method": "pin", "pin": PIN},
                headers=headers,
            ).status_code

        codes = _parallel(check_in, 6)
    finally:
        clock.freeze(None)

    assert 200 in codes, codes
    # No request may 500: the loser of the get-or-create race must resolve
    # cleanly, not surface an IntegrityError.
    assert all(c < 500 for c in codes), f"a concurrent check-in 500'd: {codes}"

    db.expire_all()
    days = db.scalars(
        select(TrainerAttendance).where(
            TrainerAttendance.trainer_id == world["trainer_ngk"].id,
            TrainerAttendance.work_date == date(2026, 8, 12),
        )
    ).all()
    assert len(days) == 1, f"{len(days)} trainer_attendance rows from 6 concurrent check-ins"
    assert days[0].check_in_at is not None


# --------------------------------------------------------------- InBody


def test_concurrent_identical_inbody_uploads_write_one_reading(client, world, db, monkeypatch):
    """The (member_id, external_ref) unique constraint must collapse a burst of
    identical uploads (agent retry, double-send) to a single BodyComposition."""
    from conftest import make_member
    from test_inbody_ingest_endpoint import SECRET, _csv_bytes, _row, _upload

    from app.core.config import settings as app_settings
    from app.db.models import BodyComposition

    monkeypatch.setattr(app_settings, "inbody_ingest_enabled", True)
    monkeypatch.setattr(app_settings, "inbody_ingest_shared_secret", SECRET)

    branch = world["branches"]["ngk"]
    member, user = make_member(db, world["roles"], branch, "Concurrent Scan")
    user.phone = "9000000055"
    db.commit()

    payload = _csv_bytes([_row(mobile="9000000055", local_id="LB-CONC-1")])

    def upload():
        return _upload(client, branch.id, payload)

    results = _parallel(upload, 5)
    statuses = [r.status_code for r in results]
    assert all(s == 200 for s in statuses), [r.text for r in results]
    written = sum(r.json().get("written", 0) for r in results)
    assert written == 1, f"{written} readings written from 5 identical uploads"

    db.expire_all()
    rows = db.scalar(
        select(func.count())
        .select_from(BodyComposition)
        .where(BodyComposition.member_id == member.id)
    )
    assert rows == 1

"""Check-in and check-out through the API.

Time is frozen per test so the assertions are about the rules, not about when
the suite happened to run. The trainers in ``world`` are rostered 18:00–21:00
Asia/Kolkata with a 10-minute grace.
"""

from __future__ import annotations

from datetime import datetime
from zoneinfo import ZoneInfo

import pytest
from sqlalchemy import select

from app.core import clock
from app.core.clock import UTC
from app.db.models import AttendanceEvent, AuditLog, TrainerAttendance
from app.domain import qr as qr_domain
from app.services import audit

IST = ZoneInfo("Asia/Kolkata")
PIN = "135790"


def ist(hour: int, minute: int, day: int = 12) -> datetime:
    return datetime(2026, 8, day, hour, minute, tzinfo=IST).astimezone(UTC)


@pytest.fixture
def trainer_headers(client, world, auth):
    return auth(world["trainer_ngk_user"])


@pytest.fixture
def branch_id(world):
    return world["branches"]["ngk"].id


def check_in(client, headers, branch_id, **kwargs):
    body = {"branch_id": branch_id, "method": "pin", "pin": PIN}
    body.update(kwargs)
    return client.post("/api/v1/attendance/check-in", json=body, headers=headers)


def check_out(client, headers, branch_id, **kwargs):
    body = {"branch_id": branch_id, "method": "pin", "pin": PIN}
    body.update(kwargs)
    return client.post("/api/v1/attendance/check-out", json=body, headers=headers)


# --------------------------------------------------------------- happy path


def test_on_time_check_in(client, trainer_headers, branch_id):
    clock.freeze(ist(18, 4))
    response = check_in(client, trainer_headers, branch_id)

    assert response.status_code == 200, response.text
    body = response.json()
    assert body["status"] == "on_time"
    assert body["late_minutes"] == 0
    assert body["check_in_at"] is not None


def test_late_check_in_is_marked_late(client, trainer_headers, branch_id):
    clock.freeze(ist(18, 26))
    body = check_in(client, trainer_headers, branch_id).json()

    assert body["status"] == "late"
    assert body["late_minutes"] == 16
    assert "16 min late" in body["message"]


def test_the_last_minute_of_grace_is_still_on_time(client, trainer_headers, branch_id):
    clock.freeze(ist(18, 10))
    assert check_in(client, trainer_headers, branch_id).json()["status"] == "on_time"


def test_one_minute_past_grace_is_late(client, trainer_headers, branch_id):
    clock.freeze(ist(18, 11))
    body = check_in(client, trainer_headers, branch_id).json()
    assert body["status"] == "late"
    assert body["late_minutes"] == 1


def test_full_shift_completes(client, trainer_headers, branch_id):
    clock.freeze(ist(18, 2))
    check_in(client, trainer_headers, branch_id)

    clock.freeze(ist(21, 0))
    body = check_out(client, trainer_headers, branch_id).json()

    assert body["status"] == "completed"
    assert body["early_exit_minutes"] == 0
    assert body["worked_minutes"] == 178


def test_leaving_early_is_flagged(client, trainer_headers, branch_id):
    clock.freeze(ist(18, 3))
    check_in(client, trainer_headers, branch_id)

    clock.freeze(ist(20, 20))
    body = check_out(client, trainer_headers, branch_id).json()

    assert body["status"] == "early_exit"
    assert body["early_exit_minutes"] == 40


# ------------------------------------------------------------ rule guards


def test_duplicate_check_in_is_rejected(client, trainer_headers, branch_id):
    clock.freeze(ist(18, 2))
    assert check_in(client, trainer_headers, branch_id).status_code == 200

    clock.freeze(ist(18, 30))
    second = check_in(client, trainer_headers, branch_id)
    assert second.status_code == 409
    assert second.json()["detail"]["code"] == "already_checked_in"


def test_duplicate_check_out_is_rejected(client, trainer_headers, branch_id):
    clock.freeze(ist(18, 2))
    check_in(client, trainer_headers, branch_id)
    clock.freeze(ist(21, 0))
    assert check_out(client, trainer_headers, branch_id).status_code == 200

    second = check_out(client, trainer_headers, branch_id)
    assert second.status_code == 409
    assert second.json()["detail"]["code"] == "already_checked_out"


def test_check_out_without_check_in_is_rejected(client, trainer_headers, branch_id):
    clock.freeze(ist(20, 0))
    response = check_out(client, trainer_headers, branch_id)
    assert response.status_code == 409
    assert response.json()["detail"]["code"] == "not_checked_in"


def test_a_trainer_cannot_check_in_at_another_branch(client, world, trainer_headers):
    clock.freeze(ist(18, 2))
    foreign = world["branches"]["bgh"].id
    response = check_in(client, trainer_headers, foreign)
    assert response.status_code == 403
    assert response.json()["detail"]["code"] == "branch_mismatch"


def test_a_wrong_pin_is_rejected(client, trainer_headers, branch_id):
    clock.freeze(ist(18, 2))
    response = check_in(client, trainer_headers, branch_id, pin="000000")
    assert response.status_code == 401
    assert response.json()["detail"]["code"] == "invalid_pin"


def test_a_rejected_check_in_writes_no_attendance(client, trainer_headers, branch_id, db):
    clock.freeze(ist(18, 2))
    check_in(client, trainer_headers, branch_id, pin="000000")
    assert db.scalars(select(TrainerAttendance)).all() == []
    assert db.scalars(select(AttendanceEvent)).all() == []


def test_check_in_far_before_the_shift_is_refused(client, trainer_headers, branch_id):
    """Otherwise a 3 AM tap would bank an on-time mark for a 6 PM shift."""
    clock.freeze(ist(3, 0))
    response = check_in(client, trainer_headers, branch_id)
    assert response.status_code == 400
    assert response.json()["detail"]["code"] == "too_early"


def test_check_in_long_after_the_shift_is_refused(client, trainer_headers, branch_id):
    clock.freeze(ist(23, 59))
    response = check_in(client, trainer_headers, branch_id)
    assert response.status_code == 400
    assert response.json()["detail"]["code"] == "window_closed"


# ----------------------------------------------------- server-side timestamp


def test_the_client_cannot_supply_a_timestamp(client, trainer_headers, branch_id, db):
    """A body carrying its own time is ignored; the server clock decides."""
    clock.freeze(ist(18, 40))
    response = client.post(
        "/api/v1/attendance/check-in",
        json={
            "branch_id": branch_id,
            "method": "pin",
            "pin": PIN,
            "occurred_at": "2026-08-12T18:00:00+05:30",
            "check_in_at": "2026-08-12T18:00:00+05:30",
        },
        headers=trainer_headers,
    )
    assert response.status_code == 200

    body = response.json()
    assert body["status"] == "late", "the client's preferred time must not be honoured"
    assert body["late_minutes"] == 30

    stored = db.scalar(select(TrainerAttendance))
    assert stored.check_in_at == ist(18, 40)


# ------------------------------------------------------------- QR check-in


def test_qr_check_in_accepts_the_branchs_current_token(client, world, trainer_headers, branch_id):
    clock.freeze(ist(18, 2))
    branch = world["branches"]["ngk"]
    token = qr_domain.issue_token(branch.id, branch.qr_secret)

    response = check_in(client, trainer_headers, branch_id, method="qr", qr_token=token, pin=None)
    assert response.status_code == 200
    assert response.json()["status"] == "on_time"


def test_qr_from_another_branch_is_rejected(client, world, trainer_headers, branch_id):
    clock.freeze(ist(18, 2))
    other = world["branches"]["bgh"]
    token = qr_domain.issue_token(other.id, other.qr_secret)

    response = check_in(client, trainer_headers, branch_id, method="qr", qr_token=token, pin=None)
    assert response.status_code == 400
    assert response.json()["detail"]["code"] == "invalid_qr"


def test_a_stale_qr_token_stops_working(client, world, trainer_headers, branch_id):
    branch = world["branches"]["ngk"]
    clock.freeze(ist(18, 0))
    token = qr_domain.issue_token(branch.id, branch.qr_secret)

    clock.freeze(ist(18, 5))  # five minutes and many windows later
    response = check_in(client, trainer_headers, branch_id, method="qr", qr_token=token, pin=None)
    assert response.status_code == 400


def test_a_forged_qr_token_is_rejected(client, world, trainer_headers, branch_id):
    clock.freeze(ist(18, 2))
    branch = world["branches"]["ngk"]
    real = qr_domain.issue_token(branch.id, branch.qr_secret)
    forged = real[:-1] + ("0" if real[-1] != "0" else "1")

    response = check_in(client, trainer_headers, branch_id, method="qr", qr_token=forged, pin=None)
    assert response.status_code == 400


def test_hardware_methods_are_refused_in_v1(client, trainer_headers, branch_id):
    clock.freeze(ist(18, 2))
    response = client.post(
        "/api/v1/attendance/check-in",
        json={"branch_id": branch_id, "method": "fingerprint"},
        headers=trainer_headers,
    )
    assert response.status_code == 422


# ------------------------------------------------------------ absent / open


def test_a_no_show_becomes_absent_once_the_shift_has_passed(client, world, auth, db):
    clock.freeze(ist(22, 0))
    body = client.get("/api/v1/reports/dashboard", headers=auth(world["owner"])).json()

    ngk = next(b for b in body["branches"] if b["branch_code"] == "SLAM-NGK")
    assert ngk["scheduled"] == 1
    assert ngk["absent"] == 1
    assert ngk["present"] == 0


def test_a_trainer_mid_shift_is_not_yet_absent(client, world, auth):
    clock.freeze(ist(19, 0))
    body = client.get("/api/v1/reports/dashboard", headers=auth(world["owner"])).json()

    ngk = next(b for b in body["branches"] if b["branch_code"] == "SLAM-NGK")
    assert ngk["absent"] == 0


def test_no_checkout_after_the_shift_becomes_missing_checkout(
    client, world, auth, trainer_headers, branch_id
):
    clock.freeze(ist(18, 2))
    check_in(client, trainer_headers, branch_id)

    clock.freeze(ist(23, 30))
    body = client.get("/api/v1/reports/dashboard", headers=auth(world["owner"])).json()
    ngk = next(b for b in body["branches"] if b["branch_code"] == "SLAM-NGK")
    assert ngk["missing_checkout"] == 1


# ------------------------------------------------------------------ audit


def test_check_in_and_check_out_are_audited(client, trainer_headers, branch_id, db):
    clock.freeze(ist(18, 2))
    check_in(client, trainer_headers, branch_id)
    clock.freeze(ist(21, 0))
    check_out(client, trainer_headers, branch_id)

    actions = set(db.scalars(select(AuditLog.action)).all())
    assert audit.ACTION_CHECK_IN in actions
    assert audit.ACTION_CHECK_OUT in actions


def test_an_attendance_correction_records_who_and_why(
    client, world, auth, trainer_headers, branch_id, db
):
    clock.freeze(ist(18, 40))
    check_in(client, trainer_headers, branch_id)
    record_id = db.scalar(select(TrainerAttendance.id))

    response = client.post(
        f"/api/v1/attendance/{record_id}/correct",
        json={
            "check_in_at": ist(18, 5).isoformat(),
            "reason": "Turnstile was down; signed in at the desk at 18:05",
        },
        headers=auth(world["manager_ngk"]),
    )
    assert response.status_code == 200
    assert response.json()["status"] == "on_time"

    entry = db.scalar(select(AuditLog).where(AuditLog.action == audit.ACTION_ATTENDANCE_CORRECTION))
    assert entry is not None
    assert entry.actor_user_id == world["manager_ngk"].id
    assert entry.details["before"]["status"] == "late"
    assert entry.details["after"]["status"] == "on_time"
    assert "Turnstile" in entry.details["reason"]


def test_a_correction_cannot_put_checkout_before_check_in(
    client, world, auth, trainer_headers, branch_id, db
):
    clock.freeze(ist(18, 2))
    check_in(client, trainer_headers, branch_id)
    record_id = db.scalar(select(TrainerAttendance.id))

    response = client.post(
        f"/api/v1/attendance/{record_id}/correct",
        json={"check_out_at": ist(17, 0).isoformat(), "reason": "typo"},
        headers=auth(world["manager_ngk"]),
    )
    assert response.status_code == 400


# ------------------------------------------------------- trainer home screen


def test_the_trainer_home_screen_leads_with_the_action(client, trainer_headers):
    clock.freeze(ist(17, 50))
    body = client.get("/api/v1/attendance/me/today", headers=trainer_headers).json()

    assert body["has_shift"] is True
    assert body["shift_label"] == "18:00 – 21:00"
    assert body["grace_minutes"] == 10
    assert body["can_check_in"] is True
    assert body["can_check_out"] is False
    assert set(body["methods_enabled"]) == {"qr", "pin"}


def test_the_home_screen_flips_to_check_out_after_check_in(client, trainer_headers, branch_id):
    clock.freeze(ist(18, 2))
    check_in(client, trainer_headers, branch_id)

    body = client.get("/api/v1/attendance/me/today", headers=trainer_headers).json()
    assert body["can_check_in"] is False
    assert body["can_check_out"] is True
    assert body["status"] == "on_time"


def test_grace_is_read_from_settings_not_from_code(client, world, auth, trainer_headers, branch_id):
    client.put(
        "/api/v1/users/settings/shift.grace_minutes",
        json={"value": 30},
        headers=auth(world["admin"]),
    )

    clock.freeze(ist(18, 25))
    body = check_in(client, trainer_headers, branch_id).json()
    assert body["status"] == "on_time", "a 30-minute grace must make 18:25 on time"

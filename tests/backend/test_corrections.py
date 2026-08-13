"""Attendance exceptions.

The rule the whole workflow exists to enforce: a trainer may ask, but only a
manager may change an attendance record — and every outcome is auditable.
"""

from __future__ import annotations

from datetime import date, timedelta

import pytest
from sqlalchemy import select

from app.core.clock import now_utc
from app.db.models import (
    Alert,
    AttendanceStatus,
    AuditLog,
    CorrectionStatus,
    CorrectionType,
    TrainerAttendance,
)
from app.services import correction_service


def _open_day(db, world, *, checked_out: bool = False) -> TrainerAttendance:
    """A finished shift the trainer forgot to check out of."""
    trainer = world["trainer_ngk"]
    branch = world["branches"]["ngk"]
    work_date = date.today() - timedelta(days=1)
    start = now_utc() - timedelta(days=1, hours=6)
    row = TrainerAttendance(
        trainer_id=trainer.id,
        branch_id=branch.id,
        work_date=work_date,
        scheduled_start=start,
        scheduled_end=start + timedelta(hours=3),
        grace_minutes=10,
        early_exit_grace_minutes=0,
        check_in_at=start,
        check_out_at=start + timedelta(hours=3) if checked_out else None,
        status=AttendanceStatus.MISSING_CHECKOUT,
    )
    db.add(row)
    db.flush()
    return row


def test_a_request_leaves_the_attendance_record_untouched(db, world):
    row = _open_day(db, world)
    before = row.status

    correction_service.request_correction(
        db,
        attendance=row,
        trainer=world["trainer_ngk"],
        requested_by=world["trainer_ngk_user"],
        correction_type=CorrectionType.MISSING_CHECKOUT,
        reason="Phone died before I could scan out.",
        requested_check_out_at=row.scheduled_end,
    )

    assert row.status is before
    assert row.check_out_at is None, "nothing changes until a manager approves"


def test_a_reason_is_required(db, world):
    row = _open_day(db, world)
    with pytest.raises(correction_service.CorrectionError):
        correction_service.request_correction(
            db,
            attendance=row,
            trainer=world["trainer_ngk"],
            requested_by=world["trainer_ngk_user"],
            correction_type=CorrectionType.MISSING_CHECKOUT,
            reason="x",
        )


def test_only_one_request_can_be_pending_for_a_day(db, world):
    row = _open_day(db, world)
    kwargs = {
        "attendance": row,
        "trainer": world["trainer_ngk"],
        "requested_by": world["trainer_ngk_user"],
        "correction_type": CorrectionType.MISSING_CHECKOUT,
        "reason": "Phone died before I could scan out.",
    }
    correction_service.request_correction(db, **kwargs)
    with pytest.raises(correction_service.CorrectionError):
        correction_service.request_correction(db, **kwargs)


def test_approval_applies_the_requested_values_and_recomputes_the_day(db, world):
    row = _open_day(db, world)
    correction = correction_service.request_correction(
        db,
        attendance=row,
        trainer=world["trainer_ngk"],
        requested_by=world["trainer_ngk_user"],
        correction_type=CorrectionType.MISSING_CHECKOUT,
        reason="Phone died before I could scan out.",
        requested_check_out_at=row.scheduled_end,
    )

    correction_service.review(
        db, correction=correction, reviewer=world["manager_ngk"], approve=True, note="Confirmed."
    )

    assert correction.status is CorrectionStatus.APPROVED
    assert row.check_out_at == row.scheduled_end
    assert row.status is AttendanceStatus.COMPLETED
    assert row.corrected_by_user_id == world["manager_ngk"].id


def test_rejection_changes_nothing_on_the_attendance_record(db, world):
    row = _open_day(db, world)
    correction = correction_service.request_correction(
        db,
        attendance=row,
        trainer=world["trainer_ngk"],
        requested_by=world["trainer_ngk_user"],
        correction_type=CorrectionType.MISSING_CHECKOUT,
        reason="Phone died before I could scan out.",
        requested_check_out_at=row.scheduled_end,
    )

    correction_service.review(
        db, correction=correction, reviewer=world["manager_ngk"], approve=False, note="No evidence."
    )

    assert correction.status is CorrectionStatus.REJECTED
    assert row.check_out_at is None
    assert row.status is AttendanceStatus.MISSING_CHECKOUT


def test_a_reviewed_request_cannot_be_reviewed_again(db, world):
    row = _open_day(db, world)
    correction = correction_service.request_correction(
        db,
        attendance=row,
        trainer=world["trainer_ngk"],
        requested_by=world["trainer_ngk_user"],
        correction_type=CorrectionType.LATE_REASON,
        reason="Traffic on the ORR.",
    )
    correction_service.review(
        db, correction=correction, reviewer=world["manager_ngk"], approve=True
    )
    with pytest.raises(correction_service.CorrectionError):
        correction_service.review(db, correction=correction, reviewer=world["owner"], approve=False)


def test_the_audit_records_who_asked_who_decided_and_the_before_and_after(db, world):
    row = _open_day(db, world)
    correction = correction_service.request_correction(
        db,
        attendance=row,
        trainer=world["trainer_ngk"],
        requested_by=world["trainer_ngk_user"],
        correction_type=CorrectionType.MISSING_CHECKOUT,
        reason="Phone died before I could scan out.",
        requested_check_out_at=row.scheduled_end,
    )
    correction_service.review(
        db, correction=correction, reviewer=world["manager_ngk"], approve=True
    )

    entries = [
        e
        for e in db.scalars(select(AuditLog)).all()
        if e.action == "attendance.correction" and e.entity_id == str(correction.id)
    ]
    events = {e.details.get("event") for e in entries}
    assert events == {"requested", "approved"}

    requested = next(e for e in entries if e.details["event"] == "requested")
    approved = next(e for e in entries if e.details["event"] == "approved")
    assert requested.actor_user_id == world["trainer_ngk_user"].id
    assert approved.actor_user_id == world["manager_ngk"].id
    assert approved.details["original_status"] == AttendanceStatus.MISSING_CHECKOUT.value
    assert approved.details["new_status"] == AttendanceStatus.COMPLETED.value
    assert approved.details["original_check_out_at"] is None
    assert approved.details["new_check_out_at"] is not None
    assert approved.branch_id == world["branches"]["ngk"].id


def test_approving_clears_the_exception_alert(db, world):
    row = _open_day(db, world)
    correction = correction_service.request_correction(
        db,
        attendance=row,
        trainer=world["trainer_ngk"],
        requested_by=world["trainer_ngk_user"],
        correction_type=CorrectionType.MISSING_CHECKOUT,
        reason="Phone died before I could scan out.",
        requested_check_out_at=row.scheduled_end,
    )
    raised = db.scalar(select(Alert).where(Alert.dedupe_key == f"correction:{correction.id}"))
    assert raised is not None

    correction_service.review(
        db, correction=correction, reviewer=world["manager_ngk"], approve=True
    )
    db.refresh(raised)
    assert raised.status.value == "resolved"


def test_a_trainer_can_withdraw_their_own_pending_request(db, world):
    row = _open_day(db, world)
    correction = correction_service.request_correction(
        db,
        attendance=row,
        trainer=world["trainer_ngk"],
        requested_by=world["trainer_ngk_user"],
        correction_type=CorrectionType.WRONG_CHECK_IN,
        reason="I scanned the wrong branch code.",
    )
    correction_service.withdraw(db, correction=correction, user=world["trainer_ngk_user"])
    assert correction.status is CorrectionStatus.WITHDRAWN


def test_pending_requests_are_listed_only_for_branches_in_scope(db, world):
    row = _open_day(db, world)
    correction_service.request_correction(
        db,
        attendance=row,
        trainer=world["trainer_ngk"],
        requested_by=world["trainer_ngk_user"],
        correction_type=CorrectionType.MISSING_CHECKOUT,
        reason="Phone died before I could scan out.",
    )

    assert len(correction_service.pending_for_branches(db, [world["branches"]["ngk"].id])) == 1
    assert correction_service.pending_for_branches(db, [world["branches"]["bgh"].id]) == []
    assert len(correction_service.pending_for_branches(db, None)) == 1

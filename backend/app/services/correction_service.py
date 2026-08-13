"""Attendance exceptions.

A trainer can *ask* for a record to be fixed; only a manager or owner can
change one. The trainer never writes a timestamp into their own attendance —
the requested values sit on the correction row until somebody with authority
approves them, and the before/after pair is written to the audit log either
way.
"""

from __future__ import annotations

from datetime import date, datetime

from fastapi import HTTPException, Request, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.clock import now_utc
from app.db.models import (
    AlertSeverity,
    AttendanceCorrection,
    AttendanceStatus,
    CorrectionStatus,
    CorrectionType,
    Trainer,
    TrainerAttendance,
    User,
)
from app.services import alert_service, attendance_service, audit


class CorrectionError(HTTPException):
    def __init__(self, detail: str, code: str, status_code: int = status.HTTP_409_CONFLICT):
        super().__init__(status_code=status_code, detail={"code": code, "message": detail})


def request_correction(
    db: Session,
    *,
    attendance: TrainerAttendance,
    trainer: Trainer,
    requested_by: User,
    correction_type: CorrectionType,
    reason: str,
    requested_check_in_at: datetime | None = None,
    requested_check_out_at: datetime | None = None,
    request: Request | None = None,
) -> AttendanceCorrection:
    reason = (reason or "").strip()
    if len(reason) < 5:
        raise CorrectionError(
            "Tell your manager what happened, in a sentence.",
            "reason_required",
            status.HTTP_400_BAD_REQUEST,
        )

    pending = db.scalar(
        select(AttendanceCorrection).where(
            AttendanceCorrection.trainer_attendance_id == attendance.id,
            AttendanceCorrection.status == CorrectionStatus.PENDING,
        )
    )
    if pending is not None:
        raise CorrectionError(
            "A correction for this day is already waiting for review.",
            "already_pending",
        )

    correction = AttendanceCorrection(
        trainer_attendance_id=attendance.id,
        trainer_id=trainer.id,
        branch_id=attendance.branch_id,
        work_date=attendance.work_date,
        correction_type=correction_type,
        status=CorrectionStatus.PENDING,
        reason=reason,
        requested_check_in_at=requested_check_in_at,
        requested_check_out_at=requested_check_out_at,
        # Snapshot the current values so the audit can answer "before what?"
        # without replaying the event log.
        original_check_in_at=attendance.check_in_at,
        original_check_out_at=attendance.check_out_at,
        original_status=attendance.status,
        requested_by_user_id=requested_by.id,
    )
    db.add(correction)
    db.flush()

    audit.record(
        db,
        action=audit.ACTION_ATTENDANCE_CORRECTION,
        actor=requested_by,
        entity_type="attendance_correction",
        entity_id=correction.id,
        branch_id=attendance.branch_id,
        request=request,
        details={
            "event": "requested",
            "work_date": attendance.work_date.isoformat(),
            "type": correction_type.value,
            "original_status": attendance.status.value,
            "original_check_in_at": _iso(attendance.check_in_at),
            "original_check_out_at": _iso(attendance.check_out_at),
            "requested_check_in_at": _iso(requested_check_in_at),
            "requested_check_out_at": _iso(requested_check_out_at),
            "reason": reason,
        },
    )

    trainer_name = trainer.user.full_name if trainer.user else f"Trainer {trainer.id}"
    alert_service.raise_alert(
        db,
        key=alert_service.ATTENDANCE_EXCEPTION,
        dedupe_key=f"correction:{correction.id}",
        title=f"Attendance correction — {trainer_name}",
        body=f"{correction_type.value.replace('_', ' ').capitalize()} on "
        f"{attendance.work_date.isoformat()}: {reason}",
        severity=AlertSeverity.WARNING,
        branch_id=attendance.branch_id,
        entity_type="attendance_correction",
        entity_id=correction.id,
        action_route="/owner/corrections",
    )
    return correction


def review(
    db: Session,
    *,
    correction: AttendanceCorrection,
    reviewer: User,
    approve: bool,
    note: str | None = None,
    request: Request | None = None,
) -> AttendanceCorrection:
    """Approve or reject. Approval is the only path that edits attendance."""
    if correction.status is not CorrectionStatus.PENDING:
        raise CorrectionError("This request has already been reviewed.", "already_reviewed")

    attendance = db.get(TrainerAttendance, correction.trainer_attendance_id)
    if attendance is None:
        raise CorrectionError(
            "The attendance record no longer exists.",
            "attendance_missing",
            status.HTTP_404_NOT_FOUND,
        )

    correction.status = CorrectionStatus.APPROVED if approve else CorrectionStatus.REJECTED
    correction.reviewed_by_user_id = reviewer.id
    correction.review_note = note
    correction.reviewed_at = now_utc()

    if approve:
        if correction.requested_check_in_at is not None:
            attendance.check_in_at = correction.requested_check_in_at
        if correction.requested_check_out_at is not None:
            attendance.check_out_at = correction.requested_check_out_at
        attendance.corrected_by_user_id = reviewer.id
        attendance.correction_reason = correction.reason
        attendance_service.recompute(attendance)
        correction.new_status = attendance.status
        # The alert that flagged the exception is now dealt with.
        alert_service.resolve_alert(db, f"correction:{correction.id}")
        if attendance.check_out_at is not None:
            alert_service.resolve_alert(db, f"attendance:{attendance.id}:missing-checkout")
    db.flush()

    audit.record(
        db,
        action=audit.ACTION_ATTENDANCE_CORRECTION,
        actor=reviewer,
        entity_type="attendance_correction",
        entity_id=correction.id,
        branch_id=correction.branch_id,
        request=request,
        details={
            "event": "approved" if approve else "rejected",
            "work_date": correction.work_date.isoformat(),
            "type": correction.correction_type.value,
            "requested_by_user_id": correction.requested_by_user_id,
            "original_status": correction.original_status.value
            if correction.original_status
            else None,
            "new_status": attendance.status.value,
            "original_check_in_at": _iso(correction.original_check_in_at),
            "original_check_out_at": _iso(correction.original_check_out_at),
            "new_check_in_at": _iso(attendance.check_in_at),
            "new_check_out_at": _iso(attendance.check_out_at),
            "review_note": note,
        },
    )

    trainer_user_id = correction.trainer.user_id if correction.trainer else None
    if trainer_user_id:
        alert_service.raise_alert(
            db,
            key=alert_service.ATTENDANCE_EXCEPTION,
            dedupe_key=f"correction:{correction.id}:outcome",
            title="Attendance correction " + ("approved" if approve else "rejected"),
            body=(
                f"Your request for {correction.work_date.isoformat()} was "
                f"{'approved' if approve else 'rejected'}." + (f" {note}" if note else "")
            ),
            severity=AlertSeverity.INFO if approve else AlertSeverity.WARNING,
            branch_id=correction.branch_id,
            target_role=None,
            target_user_id=trainer_user_id,
            entity_type="attendance_correction",
            entity_id=correction.id,
            action_route="/trainer/attendance",
        )
    return correction


def withdraw(db: Session, *, correction: AttendanceCorrection, user: User) -> AttendanceCorrection:
    if correction.status is not CorrectionStatus.PENDING:
        raise CorrectionError("This request has already been reviewed.", "already_reviewed")
    correction.status = CorrectionStatus.WITHDRAWN
    correction.reviewed_at = now_utc()
    alert_service.resolve_alert(db, f"correction:{correction.id}")
    db.flush()
    return correction


def pending_for_branches(
    db: Session, branch_ids: list[int] | None, *, limit: int = 50, offset: int = 0
) -> list[AttendanceCorrection]:
    stmt = (
        select(AttendanceCorrection)
        .where(AttendanceCorrection.status == CorrectionStatus.PENDING)
        .order_by(AttendanceCorrection.created_at.desc())
        .offset(offset)
        .limit(limit)
    )
    if branch_ids is not None:
        stmt = stmt.where(AttendanceCorrection.branch_id.in_(branch_ids))
    return list(db.scalars(stmt).all())


def history_for_trainer(
    db: Session, trainer_id: int, *, limit: int = 30, offset: int = 0
) -> list[AttendanceCorrection]:
    return list(
        db.scalars(
            select(AttendanceCorrection)
            .where(AttendanceCorrection.trainer_id == trainer_id)
            .order_by(AttendanceCorrection.created_at.desc())
            .offset(offset)
            .limit(limit)
        ).all()
    )


def _iso(value: datetime | date | None) -> str | None:
    return value.isoformat() if value is not None else None


def correctable_statuses() -> set[AttendanceStatus]:
    """Days worth appealing. A clean shift has nothing to correct."""
    return {
        AttendanceStatus.LATE,
        AttendanceStatus.EARLY_EXIT,
        AttendanceStatus.LATE_AND_EARLY_EXIT,
        AttendanceStatus.ABSENT,
        AttendanceStatus.MISSING_CHECKOUT,
    }


__all__ = [
    "CorrectionError",
    "correctable_statuses",
    "history_for_trainer",
    "pending_for_branches",
    "request_correction",
    "review",
    "withdraw",
]

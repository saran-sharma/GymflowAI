"""Check-in, check-out and the trainer's home screen.

The trainer's whole V1 job lives here: open the app, see the shift, press one
button.
"""

from __future__ import annotations

from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy import select
from sqlalchemy.orm import Session, joinedload

from app.core.clock import branch_today, now_utc
from app.core.deps import (
    assert_branch_access,
    get_current_user,
    require_management,
    resolve_branch,
    scoped_branch_filter,
)
from app.core.rate_limit import checkin_rate_limit
from app.db.models import (
    AttendanceStatus,
    Branch,
    CaptureMethod,
    RoleKey,
    Trainer,
    TrainerAttendance,
    User,
)
from app.db.session import get_db
from app.schemas.common import (
    AttendanceCorrectionRequest,
    AttendanceDayOut,
    CheckRequest,
    CheckResponse,
    MemberInsideOut,
    MessageOut,
    TrainerTodayOut,
    WhoIsInsideOut,
)
from app.services import attendance_service, audit, settings_service

from .trainers import shift_label, trainer_out

router = APIRouter(prefix="/attendance", tags=["attendance"])


def _current_trainer(db: Session, user: User) -> Trainer:
    trainer = db.scalar(
        select(Trainer)
        .options(joinedload(Trainer.user), joinedload(Trainer.branch))
        .where(Trainer.user_id == user.id)
    )
    if trainer is None:
        raise HTTPException(status_code=403, detail="This account is not a trainer")
    return trainer


def _branch(db: Session, branch_id: int) -> Branch:
    branch = db.get(Branch, branch_id)
    if branch is None or not branch.is_active:
        raise HTTPException(status_code=404, detail="Branch not found")
    return branch


def _check_response(branch: Branch, result) -> CheckResponse:
    record = result.record
    return CheckResponse(
        message=result.message,
        server_time=now_utc(),
        branch_id=branch.id,
        branch_name=branch.name,
        status=record.status,
        shift_start=record.scheduled_start,
        shift_end=record.scheduled_end,
        check_in_at=record.check_in_at,
        check_out_at=record.check_out_at,
        late_minutes=record.late_minutes,
        early_exit_minutes=record.early_exit_minutes,
        worked_minutes=record.worked_minutes,
    )


@router.get("/me/today", response_model=TrainerTodayOut)
def my_today(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> TrainerTodayOut:
    trainer = _current_trainer(db, user)
    branch = trainer.branch
    work_date = branch_today(branch.timezone)

    scheduled = attendance_service.scheduled_shift_for(db, trainer, branch, work_date)
    record = db.scalar(
        select(TrainerAttendance).where(
            TrainerAttendance.trainer_id == trainer.id,
            TrainerAttendance.work_date == work_date,
        )
    )
    if record is None and scheduled is not None:
        record = attendance_service.get_or_create_day(db, trainer, branch, work_date)
    if record is not None:
        attendance_service.recompute(record)

    shift = attendance_service.find_shift(db, trainer, work_date)
    methods = settings_service.get_setting(db, "attendance.methods_enabled", branch.id) or []

    return TrainerTodayOut(
        trainer=trainer_out(trainer),
        work_date=work_date,
        server_time=now_utc(),
        has_shift=scheduled is not None,
        shift_start=scheduled.start_at if scheduled else None,
        shift_end=scheduled.end_at if scheduled else None,
        shift_label=shift_label(shift, branch),
        grace_minutes=(
            scheduled.rules.grace_minutes
            if scheduled
            else settings_service.get_int(db, "shift.grace_minutes", branch.id)
        ),
        status=record.status if record else AttendanceStatus.SCHEDULED,
        check_in_at=record.check_in_at if record else None,
        check_out_at=record.check_out_at if record else None,
        late_minutes=record.late_minutes if record else 0,
        early_exit_minutes=record.early_exit_minutes if record else 0,
        can_check_in=bool(record is None or record.check_in_at is None),
        can_check_out=bool(record and record.check_in_at and not record.check_out_at),
        methods_enabled=list(methods),
    )


@router.post("/check-in", response_model=CheckResponse, dependencies=[Depends(checkin_rate_limit)])
def check_in(
    request: Request,
    payload: CheckRequest,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> CheckResponse:
    trainer = _current_trainer(db, user)
    branch = _branch(db, payload.branch_id)
    result = attendance_service.trainer_check_in(
        db,
        user=user,
        trainer=trainer,
        branch=branch,
        method=CaptureMethod(payload.method),
        qr_token=payload.qr_token,
        pin=payload.pin,
        device_info=payload.device_info,
        request=request,
    )
    return _check_response(branch, result)


@router.post("/check-out", response_model=CheckResponse, dependencies=[Depends(checkin_rate_limit)])
def check_out(
    request: Request,
    payload: CheckRequest,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> CheckResponse:
    trainer = _current_trainer(db, user)
    branch = _branch(db, payload.branch_id)
    result = attendance_service.trainer_check_out(
        db,
        user=user,
        trainer=trainer,
        branch=branch,
        method=CaptureMethod(payload.method),
        qr_token=payload.qr_token,
        pin=payload.pin,
        device_info=payload.device_info,
        request=request,
    )
    return _check_response(branch, result)


@router.get("/me/history", response_model=list[AttendanceDayOut])
def my_history(
    start: date | None = Query(default=None),
    end: date | None = Query(default=None),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> list[TrainerAttendance]:
    trainer = _current_trainer(db, user)
    today = branch_today(trainer.branch.timezone)
    from app.services.incentive_service import month_bounds

    period_start, period_end = month_bounds(today)
    rows = list(
        db.scalars(
            select(TrainerAttendance)
            .where(
                TrainerAttendance.trainer_id == trainer.id,
                TrainerAttendance.work_date >= (start or period_start),
                TrainerAttendance.work_date <= (end or period_end),
            )
            .order_by(TrainerAttendance.work_date.desc())
        ).all()
    )
    for row in rows:
        attendance_service.recompute(row)
    return rows


@router.get("/day", response_model=list[AttendanceDayOut])
def attendance_for_day(
    on: date | None = Query(default=None, description="Defaults to today at the branch"),
    branch_id: int | None = Query(default=None),
    db: Session = Depends(get_db),
    user: User = Depends(require_management),
) -> list[TrainerAttendance]:
    """Every rostered trainer's state for one day, for the manager view."""
    allowed = scoped_branch_filter(user, branch_id)
    stmt = select(Branch).where(Branch.is_active.is_(True))
    if allowed is not None:
        stmt = stmt.where(Branch.id.in_(allowed))

    rows: list[TrainerAttendance] = []
    for branch in db.scalars(stmt).all():
        work_date = on or branch_today(branch.timezone)
        rows.extend(attendance_service.ensure_days_exist(db, branch, work_date))
    return rows


@router.post("/{attendance_id}/correct", response_model=AttendanceDayOut)
def correct_attendance(
    attendance_id: int,
    payload: AttendanceCorrectionRequest,
    request: Request,
    db: Session = Depends(get_db),
    user: User = Depends(require_management),
) -> TrainerAttendance:
    """Manual correction.

    Recorded with the corrector, the reason and the before/after values — a
    correction that could not be traced would make the whole accountability
    record worthless.
    """
    record = db.get(TrainerAttendance, attendance_id)
    if record is None:
        raise HTTPException(status_code=404, detail="Attendance record not found")
    assert_branch_access(user, record.branch_id)

    before = {
        "check_in_at": record.check_in_at.isoformat() if record.check_in_at else None,
        "check_out_at": record.check_out_at.isoformat() if record.check_out_at else None,
        "status": record.status.value,
    }
    if payload.check_in_at is not None:
        record.check_in_at = payload.check_in_at
        record.check_in_method = CaptureMethod.MANUAL
    if payload.check_out_at is not None:
        record.check_out_at = payload.check_out_at
        record.check_out_method = CaptureMethod.MANUAL
    if record.check_in_at and record.check_out_at and record.check_out_at < record.check_in_at:
        raise HTTPException(status_code=400, detail="Check-out cannot precede check-in")

    record.corrected_by_user_id = user.id
    record.correction_reason = payload.reason
    attendance_service.recompute(record)

    audit.record(
        db,
        action=audit.ACTION_ATTENDANCE_CORRECTION,
        actor=user,
        entity_type="trainer_attendance",
        entity_id=record.id,
        branch_id=record.branch_id,
        request=request,
        details={
            "before": before,
            "after": {
                "check_in_at": record.check_in_at.isoformat() if record.check_in_at else None,
                "check_out_at": record.check_out_at.isoformat() if record.check_out_at else None,
                "status": record.status.value,
            },
            "reason": payload.reason,
        },
    )
    return record


@router.post("/settle", response_model=MessageOut)
def settle_days(
    request: Request,
    branch_id: int | None = Query(default=None),
    db: Session = Depends(get_db),
    user: User = Depends(require_management),
) -> MessageOut:
    """Close out finished days: no-shows become ABSENT, open shifts MISSING CHECKOUT."""
    allowed = scoped_branch_filter(user, branch_id)
    stmt = select(Branch).where(Branch.is_active.is_(True))
    if allowed is not None:
        stmt = stmt.where(Branch.id.in_(allowed))

    changed = 0
    for branch in db.scalars(stmt).all():
        attendance_service.ensure_days_exist(db, branch, branch_today(branch.timezone))
        changed += attendance_service.close_stale_days(db, branch)

    audit.record(
        db,
        action=audit.ACTION_ADMIN_ACTION,
        actor=user,
        request=request,
        details={"action": "settle_attendance", "records_changed": changed},
    )
    return MessageOut(message=f"{changed} record(s) updated")


__all__ = ["router"]


@router.get("/inside", response_model=WhoIsInsideOut)
def who_is_inside(
    branch_id: int | None = Query(default=None),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> WhoIsInsideOut:
    """Who is in the gym right now.

    Open to staff — an owner and a trainer both need it, for different reasons
    — and closed to members: the roster of who is in the building is not a
    member's business. The branch is resolved server-side from the caller's
    own scope, so asking for someone else's branch is refused rather than
    filtered.
    """
    if user.role.key == RoleKey.MEMBER.value:
        raise HTTPException(status_code=403, detail="Only staff can see who is in the gym")

    # A single-branch user gets their own; someone who sees every branch has to
    # say which one, because "the gym" is not a question with one answer for
    # them and quietly picking the first would be worse than asking.
    target = branch_id if branch_id is not None else user.branch_id
    if target is None:
        raise HTTPException(
            status_code=400, detail="Choose a branch to see who is currently in the gym"
        )

    branch = resolve_branch(db, user, target)
    members = attendance_service.who_is_inside(db, branch)
    return WhoIsInsideOut(
        branch_id=branch.id,
        branch_name=branch.name,
        count=len(members),
        capacity=branch.capacity,
        members=[MemberInsideOut(**row) for row in members],
    )

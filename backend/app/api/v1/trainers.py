"""Trainer roster, shifts and the trainer detail screen."""

from __future__ import annotations

from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy import select
from sqlalchemy.orm import Session, joinedload

from app.core.clock import branch_today
from app.core.deps import (
    assert_branch_access,
    get_current_user,
    require_management,
    scoped_branch_filter,
)
from app.db.models import (
    AttendanceStatus,
    Branch,
    Shift,
    Trainer,
    TrainerAttendance,
    User,
)
from app.db.session import get_db
from app.schemas.common import (
    AttendanceDayOut,
    ShiftOut,
    ShiftUpsert,
    TrainerDetailOut,
    TrainerOut,
)
from app.services import attendance_service, audit, incentive_service

router = APIRouter(prefix="/trainers", tags=["trainers"])

WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]


def trainer_out(trainer: Trainer) -> TrainerOut:
    return TrainerOut(
        id=trainer.id,
        user_id=trainer.user_id,
        full_name=trainer.user.full_name,
        email=trainer.user.email,
        phone=trainer.user.phone,
        employee_code=trainer.employee_code,
        designation=trainer.designation,
        specialty=trainer.specialty,
        branch_id=trainer.branch_id,
        branch_name=trainer.branch.name,
        is_active=trainer.is_active,
    )


def load_trainer(db: Session, trainer_id: int) -> Trainer:
    trainer = db.scalar(
        select(Trainer)
        .options(joinedload(Trainer.user), joinedload(Trainer.branch))
        .where(Trainer.id == trainer_id)
    )
    if trainer is None:
        raise HTTPException(status_code=404, detail="Trainer not found")
    return trainer


def shift_label(shift: Shift | None, branch: Branch) -> str | None:
    if shift is None:
        return None
    return f"{shift.start_time.strftime('%H:%M')} – {shift.end_time.strftime('%H:%M')}"


@router.get("", response_model=list[TrainerOut])
def list_trainers(
    branch_id: int | None = Query(default=None),
    include_inactive: bool = Query(default=False),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> list[TrainerOut]:
    """Visible roster.

    A trainer sees only their own row; anyone else sees the branches their role
    grants. Both are the same query with a different filter, so there is no
    endpoint that forgets to scope.
    """
    stmt = (
        select(Trainer)
        .options(joinedload(Trainer.user), joinedload(Trainer.branch))
        .order_by(Trainer.employee_code)
    )
    if not include_inactive:
        stmt = stmt.where(Trainer.is_active.is_(True))

    if user.role.key == "trainer":
        stmt = stmt.where(Trainer.user_id == user.id)
    else:
        allowed = scoped_branch_filter(user, branch_id)
        if allowed is not None:
            stmt = stmt.where(Trainer.branch_id.in_(allowed))

    return [trainer_out(t) for t in db.scalars(stmt).all()]


@router.get("/{trainer_id}", response_model=TrainerDetailOut)
def trainer_detail(
    trainer_id: int,
    month: date | None = Query(default=None, description="Any day in the month to summarise"),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> TrainerDetailOut:
    trainer = load_trainer(db, trainer_id)
    if user.role.key == "trainer" and trainer.user_id != user.id:
        raise HTTPException(status_code=403, detail="You can only view your own record")
    assert_branch_access(user, trainer.branch_id)

    work_date = branch_today(trainer.branch.timezone)
    period = month or work_date
    period_start, period_end = incentive_service.month_bounds(period)

    today = db.scalar(
        select(TrainerAttendance).where(
            TrainerAttendance.trainer_id == trainer.id,
            TrainerAttendance.work_date == work_date,
        )
    )
    if today is None:
        scheduled = attendance_service.scheduled_shift_for(db, trainer, trainer.branch, work_date)
        if scheduled is not None:
            today = attendance_service.get_or_create_day(db, trainer, trainer.branch, work_date)
    if today is not None:
        attendance_service.recompute(today)

    summary, outcome, _rule = incentive_service.evaluate_trainer(
        db, trainer, period_start, period_end
    )
    shift = attendance_service.find_shift(db, trainer, work_date)

    return TrainerDetailOut(
        trainer=trainer_out(trainer),
        current_status=today.status if today else AttendanceStatus.SCHEDULED,
        today=AttendanceDayOut.model_validate(today) if today else None,
        shift_label=shift_label(shift, trainer.branch),
        month_punctuality_pct=summary.punctuality_pct,
        month_attendance_pct=summary.attendance_pct,
        late_count=summary.late_count,
        early_exit_count=summary.early_exit_count,
        absent_count=summary.absent_count,
        missing_checkout_count=summary.missing_checkout_count,
        completed_shifts=summary.completed_shifts,
        scheduled_shifts=summary.scheduled_shifts,
        incentive_status=outcome.status,
        incentive_checks=outcome.as_dict()["checks"],
        incentive_disclaimer=outcome.disclaimer,
    )


@router.get("/{trainer_id}/shifts", response_model=list[ShiftOut])
def list_shifts(
    trainer_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> list[Shift]:
    trainer = load_trainer(db, trainer_id)
    if user.role.key == "trainer" and trainer.user_id != user.id:
        raise HTTPException(status_code=403, detail="You can only view your own shifts")
    assert_branch_access(user, trainer.branch_id)
    return list(
        db.scalars(
            select(Shift)
            .where(Shift.trainer_id == trainer.id)
            .order_by(Shift.weekday, Shift.start_time)
        ).all()
    )


@router.put("/{trainer_id}/shifts", response_model=list[ShiftOut])
def replace_shifts(
    trainer_id: int,
    payload: list[ShiftUpsert],
    request: Request,
    db: Session = Depends(get_db),
    user: User = Depends(require_management),
) -> list[Shift]:
    """Replace a trainer's weekly roster.

    Existing rows are deactivated rather than deleted so historical attendance
    keeps pointing at the shift it was actually judged against.
    """
    trainer = load_trainer(db, trainer_id)
    assert_branch_access(user, trainer.branch_id)

    today = branch_today(trainer.branch.timezone)
    for existing in db.scalars(
        select(Shift).where(Shift.trainer_id == trainer.id, Shift.is_active.is_(True))
    ).all():
        existing.is_active = False
        existing.effective_to = existing.effective_to or today

    created: list[Shift] = []
    for item in payload:
        shift = Shift(
            trainer_id=trainer.id,
            branch_id=trainer.branch_id,
            weekday=item.weekday,
            start_time=item.start_time,
            end_time=item.end_time,
            grace_minutes=item.grace_minutes,
            early_exit_grace_minutes=item.early_exit_grace_minutes,
            effective_from=today,
            is_active=item.is_active,
        )
        db.add(shift)
        created.append(shift)
    db.flush()

    audit.record(
        db,
        action=audit.ACTION_SHIFT_CHANGE,
        actor=user,
        entity_type="trainer",
        entity_id=trainer.id,
        branch_id=trainer.branch_id,
        request=request,
        details={"shifts": len(created)},
    )
    return created


@router.get("/{trainer_id}/attendance", response_model=list[AttendanceDayOut])
def trainer_attendance_history(
    trainer_id: int,
    start: date | None = Query(default=None),
    end: date | None = Query(default=None),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> list[TrainerAttendance]:
    trainer = load_trainer(db, trainer_id)
    if user.role.key == "trainer" and trainer.user_id != user.id:
        raise HTTPException(status_code=403, detail="You can only view your own attendance")
    assert_branch_access(user, trainer.branch_id)

    today = branch_today(trainer.branch.timezone)
    period_start, period_end = incentive_service.month_bounds(today)
    stmt = (
        select(TrainerAttendance)
        .where(
            TrainerAttendance.trainer_id == trainer.id,
            TrainerAttendance.work_date >= (start or period_start),
            TrainerAttendance.work_date <= (end or period_end),
        )
        .order_by(TrainerAttendance.work_date.desc())
    )
    rows = list(db.scalars(stmt).all())
    for row in rows:
        attendance_service.recompute(row)
    return rows


__all__ = ["WEEKDAYS", "load_trainer", "router", "shift_label", "trainer_out"]

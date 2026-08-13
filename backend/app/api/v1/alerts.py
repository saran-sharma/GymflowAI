"""The in-app alert centre, follow-up tasks and the attendance exception queue.

No push, no WhatsApp: these endpoints are the whole notification story in V1,
and the product is required to work that way.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.deps import (
    assert_branch_access,
    get_current_user,
    require_management,
    scoped_branch_filter,
    visible_branch_ids,
)
from app.db.models import (
    Alert,
    AlertStatus,
    AttendanceCorrection,
    CorrectionStatus,
    RoleKey,
    Task,
    Trainer,
    TrainerAttendance,
    User,
)
from app.db.session import get_db
from app.schemas.common import MessageOut
from app.schemas.operations import (
    AlertActionRequest,
    AlertOut,
    CorrectionOut,
    CorrectionRequestIn,
    CorrectionReviewIn,
    TaskOut,
)
from app.services import alert_service, correction_service

router = APIRouter(tags=["alerts"])


# ----------------------------------------------------------------- alerts


@router.get("/alerts", response_model=list[AlertOut])
def list_alerts(
    status_filter: AlertStatus | None = Query(default=AlertStatus.OPEN, alias="status"),
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> list[Alert]:
    return alert_service.visible_alerts(
        db,
        user,
        branch_ids=visible_branch_ids(db, user),
        status=status_filter,
        limit=limit,
        offset=offset,
    )


@router.get("/alerts/unread-count")
def unread_count(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> dict:
    """A cheap badge count, so the app does not fetch the whole feed to draw a dot."""
    alerts = alert_service.visible_alerts(
        db, user, branch_ids=visible_branch_ids(db, user), status=AlertStatus.OPEN, limit=200
    )
    return {"count": len(alerts)}


def _load_alert(db: Session, alert_id: int, user: User) -> Alert:
    alert = db.get(Alert, alert_id)
    if alert is None:
        raise HTTPException(status_code=404, detail="Alert not found")
    if user.role.key in (RoleKey.MEMBER.value, RoleKey.TRAINER.value):
        if alert.target_user_id != user.id:
            raise HTTPException(status_code=403, detail="Not your alert")
    elif alert.branch_id is not None:
        assert_branch_access(user, alert.branch_id)
    return alert


@router.post("/alerts/{alert_id}/ack", response_model=AlertOut)
def acknowledge_alert(
    alert_id: int,
    payload: AlertActionRequest,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> Alert:
    alert = _load_alert(db, alert_id, user)
    return alert_service.acknowledge(db, alert, user, dismiss=payload.dismiss)


# ------------------------------------------------------------------ tasks


@router.get("/tasks", response_model=list[TaskOut])
def list_tasks(
    branch_id: int | None = Query(default=None),
    open_only: bool = Query(default=True),
    limit: int = Query(default=50, ge=1, le=200),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> list[Task]:
    """Follow-up work. A trainer sees their own; management sees the branch."""
    stmt = select(Task).order_by(Task.due_on.nullslast(), Task.id.desc()).limit(limit)
    if open_only:
        stmt = stmt.where(Task.status == "open")

    if user.role.key == RoleKey.TRAINER.value:
        trainer = db.scalar(select(Trainer).where(Trainer.user_id == user.id))
        if trainer is None:
            return []
        stmt = stmt.where(Task.assigned_trainer_id == trainer.id)
    elif user.role.key == RoleKey.MEMBER.value:
        raise HTTPException(status_code=403, detail="Not permitted")
    else:
        allowed = scoped_branch_filter(user, branch_id)
        if allowed is not None:
            stmt = stmt.where(Task.branch_id.in_(allowed))
    return list(db.scalars(stmt).all())


@router.post("/tasks/{task_id}/complete", response_model=TaskOut)
def complete_task(
    task_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> Task:
    task = db.get(Task, task_id)
    if task is None:
        raise HTTPException(status_code=404, detail="Task not found")
    if user.role.key == RoleKey.MEMBER.value:
        raise HTTPException(status_code=403, detail="Not permitted")
    if user.role.key == RoleKey.TRAINER.value:
        trainer = db.scalar(select(Trainer).where(Trainer.user_id == user.id))
        if trainer is None or task.assigned_trainer_id != trainer.id:
            raise HTTPException(status_code=403, detail="Not your task")
    else:
        assert_branch_access(user, task.branch_id)
    return alert_service.complete_task(db, task, user)


# --------------------------------------------------- attendance exceptions


def correction_out(db: Session, row: AttendanceCorrection) -> CorrectionOut:
    trainer = db.get(Trainer, row.trainer_id)
    payload = CorrectionOut.model_validate(row)
    payload.trainer_name = trainer.user.full_name if trainer and trainer.user else None
    return payload


@router.post("/attendance/corrections", response_model=CorrectionOut, status_code=201)
def request_correction(
    payload: CorrectionRequestIn,
    request: Request,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> CorrectionOut:
    """A trainer asks for a day to be fixed. It changes nothing until approved."""
    attendance = db.get(TrainerAttendance, payload.attendance_id)
    if attendance is None:
        raise HTTPException(status_code=404, detail="Attendance record not found")

    trainer = db.get(Trainer, attendance.trainer_id)
    if trainer is None:
        raise HTTPException(status_code=404, detail="Trainer not found")

    if user.role.key == RoleKey.TRAINER.value:
        if trainer.user_id != user.id:
            raise HTTPException(status_code=403, detail="You can only appeal your own attendance")
    elif user.role.key == RoleKey.MEMBER.value:
        raise HTTPException(status_code=403, detail="Not permitted")
    else:
        assert_branch_access(user, attendance.branch_id)

    row = correction_service.request_correction(
        db,
        attendance=attendance,
        trainer=trainer,
        requested_by=user,
        correction_type=payload.correction_type,
        reason=payload.reason,
        requested_check_in_at=payload.requested_check_in_at,
        requested_check_out_at=payload.requested_check_out_at,
        request=request,
    )
    return correction_out(db, row)


@router.get("/attendance/corrections", response_model=list[CorrectionOut])
def list_corrections(
    branch_id: int | None = Query(default=None),
    status_filter: CorrectionStatus | None = Query(default=None, alias="status"),
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> list[CorrectionOut]:
    if user.role.key == RoleKey.TRAINER.value:
        trainer = db.scalar(select(Trainer).where(Trainer.user_id == user.id))
        if trainer is None:
            return []
        rows = correction_service.history_for_trainer(db, trainer.id, limit=limit, offset=offset)
        return [correction_out(db, r) for r in rows]
    if user.role.key == RoleKey.MEMBER.value:
        raise HTTPException(status_code=403, detail="Not permitted")

    allowed = scoped_branch_filter(user, branch_id)
    stmt = (
        select(AttendanceCorrection)
        .order_by(AttendanceCorrection.created_at.desc())
        .offset(offset)
        .limit(limit)
    )
    if allowed is not None:
        stmt = stmt.where(AttendanceCorrection.branch_id.in_(allowed))
    if status_filter is not None:
        stmt = stmt.where(AttendanceCorrection.status == status_filter)
    return [correction_out(db, r) for r in db.scalars(stmt).all()]


@router.post("/attendance/corrections/{correction_id}/review", response_model=CorrectionOut)
def review_correction(
    correction_id: int,
    payload: CorrectionReviewIn,
    request: Request,
    db: Session = Depends(get_db),
    user: User = Depends(require_management),
) -> CorrectionOut:
    """Approve or reject. Only this path may edit an attendance record."""
    row = db.get(AttendanceCorrection, correction_id)
    if row is None:
        raise HTTPException(status_code=404, detail="Correction not found")
    assert_branch_access(user, row.branch_id)

    correction_service.review(
        db,
        correction=row,
        reviewer=user,
        approve=payload.approve,
        note=payload.note,
        request=request,
    )
    return correction_out(db, row)


@router.post("/attendance/corrections/{correction_id}/withdraw", response_model=MessageOut)
def withdraw_correction(
    correction_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> MessageOut:
    row = db.get(AttendanceCorrection, correction_id)
    if row is None:
        raise HTTPException(status_code=404, detail="Correction not found")
    if row.requested_by_user_id != user.id:
        raise HTTPException(status_code=403, detail="You can only withdraw your own request")
    correction_service.withdraw(db, correction=row, user=user)
    return MessageOut(message="Request withdrawn.")


__all__ = ["correction_out", "router"]

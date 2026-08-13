"""The trainer's day.

Composed from PT sessions, group classes and supervised own-workouts rather
than stored as a fourth copy of the same facts — see
``services/schedule_service``.
"""

from __future__ import annotations

from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.clock import branch_today
from app.core.deps import assert_branch_access, get_current_user
from app.db.models import (
    Member,
    RoleKey,
    SessionStatus,
    Trainer,
    User,
    WorkoutSession,
)
from app.db.session import get_db
from app.schemas.operations import ScheduleItemOut
from app.schemas.training import WorkoutSessionOut
from app.services import audit, journey_service, schedule_service

router = APIRouter(prefix="/sessions", tags=["sessions"])


def _trainer_of(db: Session, user: User) -> Trainer:
    trainer = db.scalar(select(Trainer).where(Trainer.user_id == user.id))
    if trainer is None:
        raise HTTPException(status_code=403, detail="This account is not a trainer")
    return trainer


@router.get("/me/today", response_model=list[ScheduleItemOut])
def my_schedule(
    on: date | None = Query(default=None),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> list[ScheduleItemOut]:
    trainer = _trainer_of(db, user)
    work_date = on or branch_today(trainer.branch.timezone if trainer.branch else None)
    return [
        ScheduleItemOut(**item.__dict__)
        for item in schedule_service.trainer_day(db, trainer.id, work_date)
    ]


@router.get("/trainers/{trainer_id}", response_model=list[ScheduleItemOut])
def trainer_schedule(
    trainer_id: int,
    on: date | None = Query(default=None),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> list[ScheduleItemOut]:
    trainer = db.get(Trainer, trainer_id)
    if trainer is None:
        raise HTTPException(status_code=404, detail="Trainer not found")
    if user.role.key == RoleKey.TRAINER.value and trainer.user_id != user.id:
        raise HTTPException(status_code=403, detail="You can only view your own schedule")
    if user.role.key == RoleKey.MEMBER.value:
        raise HTTPException(status_code=403, detail="Not permitted")
    assert_branch_access(user, trainer.branch_id)

    work_date = on or branch_today(trainer.branch.timezone if trainer.branch else None)
    return [
        ScheduleItemOut(**item.__dict__)
        for item in schedule_service.trainer_day(db, trainer.id, work_date)
    ]


@router.post("/support", response_model=WorkoutSessionOut, status_code=201)
def start_supervised_workout(
    member_id: int,
    request: Request,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> WorkoutSessionOut:
    """Open an own-workout support slot for a member at the trainer's branch."""
    from .journeys import workout_out

    trainer = _trainer_of(db, user)
    member = db.get(Member, member_id)
    if member is None:
        raise HTTPException(status_code=404, detail="Member not found")
    if member.branch_id != trainer.branch_id:
        raise HTTPException(status_code=403, detail="This member is at another branch")

    journey = journey_service.active_journey(db, member.id)
    session = journey_service.start_workout(
        db, member=member, journey=journey, supervising_trainer_id=trainer.id
    )
    # An existing session for today keeps its own record; attach the trainer so
    # it shows on their schedule rather than creating a duplicate workout.
    if session.supervising_trainer_id is None:
        session.supervising_trainer_id = trainer.id
        db.flush()

    audit.record(
        db,
        action="workout.support_start",
        actor=user,
        entity_type="workout_session",
        entity_id=session.id,
        branch_id=member.branch_id,
        request=request,
        details={"member_id": member.id},
    )
    return workout_out(db, session)


@router.post("/support/{session_id}/complete", response_model=WorkoutSessionOut)
def complete_supervised_workout(
    session_id: int,
    request: Request,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> WorkoutSessionOut:
    from .journeys import workout_out

    trainer = _trainer_of(db, user)
    session = db.get(WorkoutSession, session_id)
    if session is None:
        raise HTTPException(status_code=404, detail="Workout not found")
    if session.supervising_trainer_id != trainer.id:
        raise HTTPException(status_code=403, detail="This is not your session")
    if session.status is SessionStatus.COMPLETED:
        return workout_out(db, session)

    journey_service.complete_workout(db, session)
    audit.record(
        db,
        action="workout.support_complete",
        actor=user,
        entity_type="workout_session",
        entity_id=session.id,
        branch_id=session.branch_id,
        request=request,
    )
    return workout_out(db, session)


__all__ = ["router"]

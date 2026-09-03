"""Shared builders for the intelligence tests.

Sessions are created directly rather than through ``journey_service.start_workout``
so they can be dated in the past, the same technique ``test_workout_sets.py``
uses for exercise-history fixtures.
"""

from __future__ import annotations

from datetime import date

from sqlalchemy.orm import Session

from app.db.models import (
    AttendanceStatus,
    Member,
    SessionStatus,
    TrainerAttendance,
    WorkoutSession,
    WorkoutSessionItem,
    WorkoutSet,
    WorkoutSplit,
)


def add_workout(
    db: Session,
    member: Member,
    *,
    on: date,
    exercise: str = "Barbell Bench Press",
    sets: list[tuple[float, int]] | None = None,
    split: WorkoutSplit = WorkoutSplit.PUSH,
    status: SessionStatus = SessionStatus.COMPLETED,
) -> WorkoutSession:
    """A workout on ``on`` with one exercise and its logged sets.

    ``sets`` is a list of ``(weight_kg, reps)``; ``None`` means a single
    60 kg × 8 set. Pass ``[]`` for a completed session with nothing logged.
    """
    if sets is None:
        sets = [(60.0, 8)]
    session = WorkoutSession(
        member_id=member.id,
        branch_id=member.branch_id,
        split=split,
        session_date=on,
        status=status,
    )
    db.add(session)
    db.flush()
    item = WorkoutSessionItem(
        session_id=session.id, order_index=0, exercise=exercise, sets=max(len(sets), 1), reps="8"
    )
    db.add(item)
    db.flush()
    for number, (weight, reps) in enumerate(sets, start=1):
        db.add(
            WorkoutSet(
                session_item_id=item.id,
                set_number=number,
                weight_kg=weight,
                reps=reps,
            )
        )
    db.flush()
    return session


def add_weekly_workouts(
    db: Session,
    member: Member,
    *,
    ending: date,
    weeks: int,
    per_week: int,
    exercise: str = "Barbell Bench Press",
    weight_kg: float = 60.0,
) -> None:
    """``per_week`` workouts a week for ``weeks`` weeks, none later than ``ending``.

    Week ``w``'s sessions sit on ``ending - w weeks`` and the days just before
    it, so every session lands on or before ``ending`` and inside a
    ``weeks``-long trailing window.
    """
    from datetime import timedelta

    for w in range(weeks):
        anchor = ending - timedelta(weeks=w)
        for d in range(per_week):
            add_workout(
                db,
                member,
                on=anchor - timedelta(days=d * 2),
                exercise=exercise,
                sets=[(weight_kg, 8)],
            )


def add_attendance(
    db: Session,
    trainer_id: int,
    branch_id: int,
    *,
    on: date,
    status: AttendanceStatus,
    n: int = 1,
) -> None:
    """``n`` TrainerAttendance rows on consecutive days back from ``on``."""
    from datetime import timedelta

    for i in range(n):
        db.add(
            TrainerAttendance(
                trainer_id=trainer_id,
                branch_id=branch_id,
                work_date=on - timedelta(days=i),
                status=status,
            )
        )
    db.flush()

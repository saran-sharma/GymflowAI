"""The trainer's day, composed from the records that already exist.

There is no separate "trainer session" table: a trainer's schedule is their PT
sessions, the group classes they lead, and the members' own workouts they are
supervising. Composing the view instead of copying rows keeps the four kinds
of activity distinguishable (§13) and stops the schedule drifting from the
records it summarises.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.clock import now_utc
from app.db.models import (
    ClassStatus,
    GroupClass,
    GroupClassRsvp,
    Member,
    MemberWorkoutProgramDay,
    PTSession,
    RsvpResponse,
    SessionStatus,
    WorkoutSession,
)

#: Session kinds shown on the trainer's schedule.
KIND_PT = "pt"
KIND_GROUP_CLASS = "group_class"
KIND_OWN_WORKOUT_SUPPORT = "own_workout_support"


@dataclass
class ScheduleItem:
    kind: str
    reference_id: int
    title: str
    subtitle: str | None
    starts_at: datetime | None
    ends_at: datetime | None
    status: str
    member_id: int | None = None
    member_name: str | None = None
    branch_id: int | None = None
    session_number: int | None = None
    package_size: int | None = None
    attendees: int | None = None
    can_complete: bool = False


def _derive_status(status: SessionStatus, starts_at: datetime | None) -> str:
    """Show "missed" for a scheduled session whose slot has passed.

    Derived rather than stored: a session only becomes truly MISSED when
    somebody closes it, but the trainer needs to see it standing out now.
    """
    if status is SessionStatus.SCHEDULED and starts_at is not None and starts_at < now_utc():
        return SessionStatus.MISSED.value
    return status.value


def trainer_day(db: Session, trainer_id: int, on: date) -> list[ScheduleItem]:
    items: list[ScheduleItem] = []

    for session in db.scalars(
        select(PTSession)
        .where(PTSession.trainer_id == trainer_id, PTSession.session_date == on)
        .order_by(PTSession.scheduled_start)
    ).all():
        member = db.get(Member, session.member_id)
        name = member.user.full_name if member and member.user else "Member"
        items.append(
            ScheduleItem(
                kind=KIND_PT,
                reference_id=session.id,
                title=name,
                subtitle=f"PT session {session.session_number} of {session.package.sessions_total}"
                if session.package
                else "PT session",
                starts_at=session.scheduled_start,
                ends_at=session.scheduled_end,
                status=_derive_status(session.status, session.scheduled_start),
                member_id=session.member_id,
                member_name=name,
                branch_id=session.branch_id,
                session_number=session.session_number,
                package_size=session.package.sessions_total if session.package else None,
                can_complete=session.status
                not in (SessionStatus.COMPLETED, SessionStatus.CANCELLED, SessionStatus.NO_SHOW),
            )
        )

    for group_class in db.scalars(
        select(GroupClass)
        .where(GroupClass.trainer_id == trainer_id, GroupClass.class_date == on)
        .order_by(GroupClass.starts_at)
    ).all():
        yes_count = len(
            list(
                db.scalars(
                    select(GroupClassRsvp).where(
                        GroupClassRsvp.class_id == group_class.id,
                        GroupClassRsvp.response == RsvpResponse.YES,
                    )
                ).all()
            )
        )
        items.append(
            ScheduleItem(
                kind=KIND_GROUP_CLASS,
                reference_id=group_class.id,
                title=group_class.name,
                subtitle=f"{yes_count} of {group_class.capacity} confirmed",
                starts_at=group_class.starts_at,
                ends_at=group_class.ends_at,
                status=(
                    SessionStatus.CANCELLED.value
                    if group_class.status is ClassStatus.CANCELLED
                    else SessionStatus.COMPLETED.value
                    if group_class.status is ClassStatus.COMPLETED
                    else _derive_status(SessionStatus.SCHEDULED, group_class.starts_at)
                ),
                branch_id=group_class.branch_id,
                attendees=yes_count,
                can_complete=group_class.status is ClassStatus.SCHEDULED,
            )
        )

    for workout in db.scalars(
        select(WorkoutSession)
        .where(
            WorkoutSession.supervising_trainer_id == trainer_id,
            WorkoutSession.session_date == on,
        )
        .order_by(WorkoutSession.id)
    ).all():
        member = db.get(Member, workout.member_id)
        name = member.user.full_name if member and member.user else "Member"
        if workout.split is not None:
            what = workout.split.value.capitalize()
        elif workout.member_program_day_id is not None:
            program_day = db.get(MemberWorkoutProgramDay, workout.member_program_day_id)
            what = program_day.name if program_day else "workout"
        else:
            what = "workout"
        items.append(
            ScheduleItem(
                kind=KIND_OWN_WORKOUT_SUPPORT,
                reference_id=workout.id,
                title=name,
                subtitle=f"Own workout support — {what}",
                starts_at=workout.started_at,
                ends_at=workout.completed_at,
                status=workout.status.value,
                member_id=workout.member_id,
                member_name=name,
                branch_id=workout.branch_id,
                can_complete=workout.status in (SessionStatus.SCHEDULED, SessionStatus.IN_PROGRESS),
            )
        )

    # Items without a time (an own-workout not started yet) sort to the end.
    return sorted(items, key=lambda i: (i.starts_at is None, i.starts_at or now_utc()))


def completion_stats(db: Session, trainer_id: int, start: date, end: date) -> dict:
    """Session delivery over a window — the performance half of the trainer view."""
    pt_rows = db.scalars(
        select(PTSession).where(
            PTSession.trainer_id == trainer_id,
            PTSession.session_date >= start,
            PTSession.session_date <= end,
        )
    ).all()
    pt_total = len(pt_rows)
    pt_done = sum(1 for r in pt_rows if r.status is SessionStatus.COMPLETED)

    class_rows = db.scalars(
        select(GroupClass).where(
            GroupClass.trainer_id == trainer_id,
            GroupClass.class_date >= start,
            GroupClass.class_date <= end,
        )
    ).all()
    class_total = len(class_rows)
    class_done = sum(1 for r in class_rows if r.status is ClassStatus.COMPLETED)

    support_rows = db.scalars(
        select(WorkoutSession).where(
            WorkoutSession.supervising_trainer_id == trainer_id,
            WorkoutSession.session_date >= start,
            WorkoutSession.session_date <= end,
        )
    ).all()
    support_total = len(support_rows)
    support_done = sum(1 for r in support_rows if r.status is SessionStatus.COMPLETED)

    total = pt_total + class_total + support_total
    done = pt_done + class_done + support_done

    return {
        "sessions_scheduled": total,
        "sessions_completed": done,
        "completion_pct": round(done * 100 / total, 1) if total else 0.0,
        "pt_scheduled": pt_total,
        "pt_completed": pt_done,
        "class_scheduled": class_total,
        "class_completed": class_done,
        "support_scheduled": support_total,
        "support_completed": support_done,
    }


__all__ = [
    "KIND_GROUP_CLASS",
    "KIND_OWN_WORKOUT_SUPPORT",
    "KIND_PT",
    "ScheduleItem",
    "completion_stats",
    "trainer_day",
]

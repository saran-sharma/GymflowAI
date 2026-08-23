"""The member's activity timeline.

Four kinds of activity, kept apart on purpose (§13):

    GYM VISIT      an attendance event — they came to the branch
    OWN WORKOUT    a WorkoutSession — they trained to their own plan
    PT SESSION     a PTSession — a trainer coached them
    GROUP CLASS    a GroupClassAttendance — they attended a class

Merging these into one "attendance" number would answer none of the questions
SLAM actually asks, so the timeline composes them and labels each entry.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, date, datetime, timedelta

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.db.models import (
    AttendanceEvent,
    EventType,
    GroupClass,
    GroupClassAttendance,
    Member,
    MemberWorkoutProgramDay,
    PersonType,
    PTSession,
    SessionStatus,
    Trainer,
    WorkoutSession,
)

KIND_GYM_VISIT = "gym_visit"
KIND_OWN_WORKOUT = "own_workout"
KIND_PT_SESSION = "pt_session"
KIND_GROUP_CLASS = "group_class"


@dataclass
class ActivityEntry:
    kind: str
    on: date
    at: datetime | None
    title: str
    detail: str | None
    reference_id: int | None
    branch_id: int | None


def timeline(
    db: Session,
    member: Member,
    *,
    start: date | None = None,
    end: date | None = None,
    limit: int = 60,
    offset: int = 0,
) -> list[ActivityEntry]:
    """Recent activity, newest first.

    Bounded by ``limit`` at every source before merging, so a member with two
    years of history does not pull the lot into memory to show ten rows.
    """
    window = limit + offset
    entries: list[ActivityEntry] = []

    visit_stmt = (
        select(AttendanceEvent)
        .where(
            AttendanceEvent.user_id == member.user_id,
            AttendanceEvent.person_type == PersonType.MEMBER,
            AttendanceEvent.event_type == EventType.CHECK_IN,
        )
        .order_by(AttendanceEvent.occurred_at.desc())
        .limit(window)
    )
    if start is not None:
        visit_stmt = visit_stmt.where(AttendanceEvent.work_date >= start)
    if end is not None:
        visit_stmt = visit_stmt.where(AttendanceEvent.work_date <= end)
    for event in db.scalars(visit_stmt).all():
        entries.append(
            ActivityEntry(
                kind=KIND_GYM_VISIT,
                on=event.work_date,
                at=event.occurred_at,
                title="Gym visit",
                detail=None,
                reference_id=event.id,
                branch_id=event.branch_id,
            )
        )

    workout_stmt = (
        select(WorkoutSession)
        .where(
            WorkoutSession.member_id == member.id,
            WorkoutSession.status == SessionStatus.COMPLETED,
        )
        .order_by(WorkoutSession.session_date.desc())
        .limit(window)
    )
    if start is not None:
        workout_stmt = workout_stmt.where(WorkoutSession.session_date >= start)
    if end is not None:
        workout_stmt = workout_stmt.where(WorkoutSession.session_date <= end)
    for workout in db.scalars(workout_stmt).all():
        if workout.split is not None:
            detail = workout.split.value.replace("_", " ").upper()
        elif workout.member_program_day_id is not None:
            program_day = db.get(MemberWorkoutProgramDay, workout.member_program_day_id)
            detail = program_day.name if program_day else None
        else:
            detail = None
        entries.append(
            ActivityEntry(
                kind=KIND_OWN_WORKOUT,
                on=workout.session_date,
                at=workout.completed_at,
                title="Own workout",
                detail=detail,
                reference_id=workout.id,
                branch_id=workout.branch_id,
            )
        )

    pt_stmt = (
        select(PTSession)
        .where(PTSession.member_id == member.id, PTSession.status == SessionStatus.COMPLETED)
        .order_by(PTSession.session_date.desc())
        .limit(window)
    )
    if start is not None:
        pt_stmt = pt_stmt.where(PTSession.session_date >= start)
    if end is not None:
        pt_stmt = pt_stmt.where(PTSession.session_date <= end)
    for session in db.scalars(pt_stmt).all():
        trainer = db.get(Trainer, session.trainer_id)
        trainer_name = trainer.user.full_name if trainer and trainer.user else "Trainer"
        entries.append(
            ActivityEntry(
                kind=KIND_PT_SESSION,
                on=session.session_date,
                at=session.completed_at or session.scheduled_start,
                title="PT session",
                detail=trainer_name,
                reference_id=session.id,
                branch_id=session.branch_id,
            )
        )

    class_stmt = (
        select(GroupClassAttendance)
        .where(
            GroupClassAttendance.member_id == member.id,
            GroupClassAttendance.attended.is_(True),
        )
        .order_by(GroupClassAttendance.recorded_at.desc())
        .limit(window)
    )
    for row in db.scalars(class_stmt).all():
        group_class = db.get(GroupClass, row.class_id)
        if group_class is None:
            continue
        if start is not None and group_class.class_date < start:
            continue
        if end is not None and group_class.class_date > end:
            continue
        entries.append(
            ActivityEntry(
                kind=KIND_GROUP_CLASS,
                on=group_class.class_date,
                at=group_class.starts_at,
                title="Group class",
                detail=group_class.name,
                reference_id=group_class.id,
                branch_id=row.branch_id,
            )
        )

    # SQLite hands back naive datetimes from timezone-aware columns, so the
    # secondary key is normalised rather than compared as-is — otherwise the
    # sort raises on a mixed-awareness comparison.
    entries.sort(key=lambda e: (e.on, _sort_instant(e.at)), reverse=True)
    return entries[offset : offset + limit]


def _sort_instant(value: datetime | None) -> datetime:
    if value is None:
        return datetime.min.replace(tzinfo=UTC)
    return value if value.tzinfo is not None else value.replace(tzinfo=UTC)


def counts(
    db: Session, member: Member, *, start: date | None = None, end: date | None = None
) -> dict:
    """How much of each kind of activity, over a window."""

    def _count(stmt):
        return int(db.scalar(stmt) or 0)

    visit_stmt = select(func.count(func.distinct(AttendanceEvent.work_date))).where(
        AttendanceEvent.user_id == member.user_id,
        AttendanceEvent.person_type == PersonType.MEMBER,
        AttendanceEvent.event_type == EventType.CHECK_IN,
    )
    workout_stmt = (
        select(func.count())
        .select_from(WorkoutSession)
        .where(
            WorkoutSession.member_id == member.id,
            WorkoutSession.status == SessionStatus.COMPLETED,
        )
    )
    pt_stmt = (
        select(func.count())
        .select_from(PTSession)
        .where(PTSession.member_id == member.id, PTSession.status == SessionStatus.COMPLETED)
    )
    class_stmt = (
        select(func.count())
        .select_from(GroupClassAttendance)
        .where(GroupClassAttendance.member_id == member.id, GroupClassAttendance.attended.is_(True))
    )

    if start is not None:
        visit_stmt = visit_stmt.where(AttendanceEvent.work_date >= start)
        workout_stmt = workout_stmt.where(WorkoutSession.session_date >= start)
        pt_stmt = pt_stmt.where(PTSession.session_date >= start)
    if end is not None:
        visit_stmt = visit_stmt.where(AttendanceEvent.work_date <= end)
        workout_stmt = workout_stmt.where(WorkoutSession.session_date <= end)
        pt_stmt = pt_stmt.where(PTSession.session_date <= end)

    return {
        "gym_visits": _count(visit_stmt),
        "own_workouts": _count(workout_stmt),
        "pt_sessions": _count(pt_stmt),
        "group_classes": _count(class_stmt),
    }


def weekly_activity(db: Session, member: Member, *, weeks: int = 8, today: date) -> list[dict]:
    """A simple bar-chart series: activity per week, by kind.

    Only weeks that have already started are returned, so the chart never shows
    an empty future bar that reads as a missed week.
    """
    out = []
    week_start = today - timedelta(days=today.weekday())
    for index in range(weeks - 1, -1, -1):
        start = week_start - timedelta(weeks=index)
        end = start + timedelta(days=6)
        tally = counts(db, member, start=start, end=min(end, today))
        out.append(
            {
                "week_start": start,
                "week_end": end,
                **tally,
                "total": sum(tally.values()),
            }
        )
    return out


__all__ = [
    "KIND_GROUP_CLASS",
    "KIND_GYM_VISIT",
    "KIND_OWN_WORKOUT",
    "KIND_PT_SESSION",
    "ActivityEntry",
    "counts",
    "timeline",
    "weekly_activity",
]

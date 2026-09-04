"""Weekly summaries — member and owner.

One reusable shape (:class:`WeeklySummary`), two sets of metrics. Every number
is computed here from stored rows and compared against the week before; the
narrator only rephrases the headline, and the template headline always works.

"Last week" means the most recent *completed* Monday–Sunday week unless a
``week_ending`` Sunday is passed.
"""

from __future__ import annotations

from datetime import date, timedelta

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.clock import branch_today
from app.db.models import (
    AttendanceEvent,
    Branch,
    EventType,
    Member,
    PersonType,
    TrainerAttendance,
)
from app.domain.shift_engine import ON_TIME_STATUSES, PRESENT_STATUSES
from app.services import activity_service
from app.services.intelligence import signals as sig
from app.services.intelligence.narrator import NarrationRequest, TemplateNarrator, safe_narrate
from app.services.intelligence.schemas import (
    WeeklyMetric,
    WeeklySummary,
)
from app.services.intelligence.thresholds import THRESHOLDS as T


def _last_complete_week(today: date) -> tuple[date, date]:
    """The Monday–Sunday of the week before the one ``today`` is in."""
    this_monday = today - timedelta(days=today.weekday())
    start = this_monday - timedelta(days=7)
    return start, start + timedelta(days=6)


def _resolve_week(week_ending: date | None, today: date) -> tuple[date, date]:
    if week_ending is None:
        return _last_complete_week(today)
    # Treat the given date as a Sunday (or snap back to the containing week).
    start = week_ending - timedelta(days=week_ending.weekday())
    return start, start + timedelta(days=6)


def _direction(current: float, previous: float) -> str | None:
    if previous <= 0:
        return "up" if current > 0 else None
    change = (current - previous) * 100 / previous
    if change >= T.weekly_movement_pct:
        return "up"
    if change <= -T.weekly_movement_pct:
        return "down"
    return "flat"


def _movement_from(direction: str | None, *, more_is_better: bool = True) -> str:
    if direction in (None, "flat"):
        return "steady"
    good = direction == "up"
    if not more_is_better:
        good = not good
    return "ahead" if good else "behind"


# --------------------------------------------------------------- member


def member_weekly_summary(
    db: Session,
    member: Member,
    *,
    week_ending: date | None = None,
    narrator=None,
) -> WeeklySummary:
    narrator = narrator or TemplateNarrator()
    branch = db.get(Branch, member.branch_id)
    today = branch_today(branch.timezone if branch else None)
    start, end = _resolve_week(week_ending, today)
    prev_start, prev_end = start - timedelta(days=7), start - timedelta(days=1)

    this_counts = activity_service.counts(db, member, start=start, end=end)
    prev_counts = activity_service.counts(db, member, start=prev_start, end=prev_end)
    this_sessions = this_counts["own_workouts"] + this_counts["pt_sessions"]
    prev_sessions = prev_counts["own_workouts"] + prev_counts["pt_sessions"]

    this_volume = sig._window_volume_kg(db, member.id, start, end)
    prev_volume = sig._window_volume_kg(db, member.id, prev_start, prev_end)

    prs = [
        r
        for r in sig.recent_records(db, member.id, today=end).records
        if start <= r.achieved_on <= end
    ]

    sessions_dir = _direction(this_sessions, prev_sessions)
    volume_dir = _direction(this_volume, prev_volume)

    metrics = [
        WeeklyMetric(
            label="Training sessions",
            value=str(this_sessions),
            previous=str(prev_sessions),
            direction=sessions_dir,
        ),
        WeeklyMetric(
            label="Total load",
            value=_load(this_volume),
            previous=_load(prev_volume),
            direction=volume_dir,
        ),
        WeeklyMetric(label="Gym visits", value=str(this_counts["gym_visits"])),
        WeeklyMetric(label="Personal records", value=str(len(prs))),
    ]

    # Movement follows sessions first, then volume — turning up matters more
    # than how heavy the week was.
    movement = _movement_from(sessions_dir if this_sessions != prev_sessions else volume_dir)

    if this_sessions == 0:
        fallback = "No sessions logged last week — a short one this week restarts the habit."
        movement = "behind"
    elif movement == "ahead":
        fallback = f"Strong week — {this_sessions} sessions" + (
            f" and {len(prs)} personal record{'s' if len(prs) != 1 else ''}." if prs else "."
        )
    elif movement == "behind":
        fallback = f"Quieter week — {this_sessions} sessions, down from {prev_sessions}."
    else:
        fallback = f"Steady week — {this_sessions} sessions, in line with the week before."

    narration = safe_narrate(
        narrator,
        NarrationRequest(
            audience="member",
            fallback_headline=fallback,
            context={
                "sessions": this_sessions,
                "sessions_prev": prev_sessions,
                "volume_direction": volume_dir,
                "prs": len(prs),
                "movement": movement,
            },
        ),
    )

    return WeeklySummary(
        audience="member",
        week_start=start,
        week_end=end,
        headline=narration.headline,
        movement=movement,
        metrics=metrics,
        narration_source=narration.source,
    )


# --------------------------------------------------------------- owner


def _punctuality(
    db: Session, branch_ids: list[int] | None, start: date, end: date
) -> tuple[int, int]:
    stmt = select(TrainerAttendance.status).where(
        TrainerAttendance.work_date >= start, TrainerAttendance.work_date <= end
    )
    if branch_ids is not None:
        stmt = stmt.where(TrainerAttendance.branch_id.in_(branch_ids))
    rows = list(db.scalars(stmt).all())
    present = sum(1 for s in rows if s in PRESENT_STATUSES)
    on_time = sum(1 for s in rows if s in ON_TIME_STATUSES)
    return on_time, present


def owner_weekly_summary(
    db: Session,
    *,
    branch_ids: list[int] | None,
    scope_label: str = "All branches",
    week_ending: date | None = None,
    narrator=None,
) -> WeeklySummary:
    narrator = narrator or TemplateNarrator()
    today = branch_today(None)
    start, end = _resolve_week(week_ending, today)
    prev_start, prev_end = start - timedelta(days=7), start - timedelta(days=1)

    on_time, present = _punctuality(db, branch_ids, start, end)
    p_on, p_present = _punctuality(db, branch_ids, prev_start, prev_end)
    pct = round(on_time * 100 / present, 1) if present else 0.0
    prev_pct = round(p_on * 100 / p_present, 1) if p_present else 0.0
    pct_dir = _direction(pct, prev_pct) if present and p_present else None

    def _new_members(a: date, b: date) -> int:
        stmt = (
            select(func.count())
            .select_from(Member)
            .where(
                Member.registered_on.is_not(None),
                Member.registered_on >= a,
                Member.registered_on <= b,
            )
        )
        if branch_ids is not None:
            stmt = stmt.where(Member.branch_id.in_(branch_ids))
        return int(db.scalar(stmt) or 0)

    new_this = _new_members(start, end)
    new_prev = _new_members(prev_start, prev_end)

    def _visit_days(a: date, b: date) -> int:
        """Distinct member check-in days across the window and branch scope —
        the closest honest proxy for 'how busy was the floor'."""
        stmt = select(
            func.count(
                func.distinct(func.concat(AttendanceEvent.user_id, AttendanceEvent.work_date))
            )
        ).where(
            AttendanceEvent.person_type == PersonType.MEMBER,
            AttendanceEvent.event_type == EventType.CHECK_IN,
            AttendanceEvent.work_date >= a,
            AttendanceEvent.work_date <= b,
        )
        if branch_ids is not None:
            stmt = stmt.where(AttendanceEvent.branch_id.in_(branch_ids))
        return int(db.scalar(stmt) or 0)

    visits_this = _visit_days(start, end)
    visits_prev = _visit_days(prev_start, prev_end)

    absent_this = _absences(db, branch_ids, start, end)
    absent_prev = _absences(db, branch_ids, prev_start, prev_end)

    metrics = [
        WeeklyMetric(
            label="Trainer punctuality",
            value=f"{pct:g}%" if present else "—",
            previous=f"{prev_pct:g}%" if p_present else None,
            direction=pct_dir,
        ),
        WeeklyMetric(
            label="Member visits",
            value=str(visits_this),
            previous=str(visits_prev),
            direction=_direction(visits_this, visits_prev),
        ),
        WeeklyMetric(
            label="Unworked shifts",
            value=str(absent_this),
            previous=str(absent_prev),
            # Fewer unworked shifts is better, so invert the arrow's meaning.
            direction=_direction(absent_this, absent_prev),
        ),
        WeeklyMetric(
            label="New members",
            value=str(new_this),
            previous=str(new_prev),
            direction=_direction(new_this, new_prev),
        ),
    ]

    movement = _movement_from(pct_dir) if pct_dir is not None else "steady"
    if absent_this > 2 and movement != "behind":
        movement = "behind"

    if present == 0:
        fallback = "No shifts recorded last week."
    elif movement == "ahead":
        fallback = f"Good week on the floor — {pct:g}% of shifts on time."
    elif movement == "behind":
        fallback = f"Punctuality slipped to {pct:g}%" + (
            f" with {absent_this} unworked shifts." if absent_this else "."
        )
    else:
        fallback = f"Steady week — {pct:g}% on time, {new_this} new members."

    narration = safe_narrate(
        narrator,
        NarrationRequest(
            audience="owner",
            fallback_headline=fallback,
            context={
                "punctuality": pct,
                "punctuality_prev": prev_pct,
                "absences": absent_this,
                "new_members": new_this,
                "movement": movement,
            },
        ),
    )

    return WeeklySummary(
        audience="owner",
        week_start=start,
        week_end=end,
        scope=scope_label,
        headline=narration.headline,
        movement=movement,
        metrics=metrics,
        narration_source=narration.source,
    )


def _absences(db: Session, branch_ids: list[int] | None, start: date, end: date) -> int:
    from app.db.models import AttendanceStatus

    stmt = (
        select(func.count())
        .select_from(TrainerAttendance)
        .where(
            TrainerAttendance.work_date >= start,
            TrainerAttendance.work_date <= end,
            TrainerAttendance.status == AttendanceStatus.ABSENT,
        )
    )
    if branch_ids is not None:
        stmt = stmt.where(TrainerAttendance.branch_id.in_(branch_ids))
    return int(db.scalar(stmt) or 0)


def _load(value: float) -> str:
    if value >= 10_000:
        return f"{round(value / 1000, 1):g} t"
    return f"{value:,.0f} kg"


__all__ = ["member_weekly_summary", "owner_weekly_summary"]

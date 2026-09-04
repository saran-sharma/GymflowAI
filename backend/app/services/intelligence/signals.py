"""Deterministic member signals.

Every function here turns rows the member logged into a small frozen dataclass
of numbers plus one classification string. No language model, no prediction, no
stored state — call it twice on an unchanged database and it returns the same
thing. :mod:`app.services.intelligence.member` is what assembles these into
insights; keeping the arithmetic here means it can be tested without an API.

The classification strings (``"strong"``, ``"declining"``, …) are the layer's
vocabulary; the thresholds that produce them all live in
:mod:`app.services.intelligence.thresholds`.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date, timedelta

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.db.models import (
    AttendanceEvent,
    DayStatus,
    EventType,
    JourneyDay,
    JourneyStatus,
    Member,
    Membership,
    MembershipStatus,
    PersonType,
    PTSession,
    SessionStatus,
    WorkoutSession,
    WorkoutSessionItem,
    WorkoutSet,
)
from app.services import journey_service
from app.services.intelligence.thresholds import THRESHOLDS as T

# --------------------------------------------------------------- sub-signals


@dataclass(frozen=True)
class ConsistencySignal:
    window_weeks: int
    sessions_in_window: int
    per_week: float
    target_per_week: float
    ratio: float
    level: str  # "strong" | "steady" | "low" | "insufficient_data"


@dataclass(frozen=True)
class InactivitySignal:
    last_training_on: date | None
    days_since_training: int | None
    last_visit_on: date | None
    days_since_visit: int | None
    level: str  # "active" | "slipping" | "inactive" | "no_history"


@dataclass(frozen=True)
class RecentRecord:
    exercise: str
    weight_kg: float
    reps: int
    achieved_on: date


@dataclass(frozen=True)
class RecordsSignal:
    window_days: int
    records: list[RecentRecord] = field(default_factory=list)

    @property
    def count(self) -> int:
        return len(self.records)


@dataclass(frozen=True)
class TrendSignal:
    window_days: int
    current_volume_kg: float
    previous_volume_kg: float
    current_sessions: int
    previous_sessions: int
    volume_change_pct: float | None
    direction: str  # "improving" | "steady" | "declining" | "insufficient_data"


@dataclass(frozen=True)
class PlateauSignal:
    exercise: str | None
    sessions_considered: int
    span_days: int
    top_weight_kg: float
    weight_range_kg: float
    detected: bool
    #: Plain-language statement of what the heuristic checked, always set so a
    #: "no plateau" answer is as explainable as a positive one.
    reason: str


@dataclass(frozen=True)
class JourneySignal:
    status: str | None
    phase: str | None
    current_day: int | None
    duration_days: int | None
    days_remaining: int | None
    completion_pct: float | None
    missed_days: int
    pt_converted: bool | None


@dataclass(frozen=True)
class MembershipSignal:
    status: str | None
    ends_on: date | None
    days_remaining: int | None
    expiring_soon: bool


@dataclass(frozen=True)
class MemberSignals:
    member_id: int
    generated_for: date
    completed_sessions: int
    weeks_of_history: int
    has_minimum_data: bool
    consistency: ConsistencySignal
    inactivity: InactivitySignal
    records: RecordsSignal
    trend: TrendSignal
    plateau: PlateauSignal
    journey: JourneySignal
    membership: MembershipSignal


# --------------------------------------------------------------- helpers


def _completed_session_dates(db: Session, member_id: int, start: date, end: date) -> list[date]:
    """Dates on which the member completed a training session — their own
    workout or a coached PT session. A gym visit with no logged session does
    not count as training here (it is the inactivity signal's concern)."""
    own = (
        db.execute(
            select(WorkoutSession.session_date).where(
                WorkoutSession.member_id == member_id,
                WorkoutSession.status == SessionStatus.COMPLETED,
                WorkoutSession.session_date >= start,
                WorkoutSession.session_date <= end,
            )
        )
        .scalars()
        .all()
    )
    pt = (
        db.execute(
            select(PTSession.session_date).where(
                PTSession.member_id == member_id,
                PTSession.status == SessionStatus.COMPLETED,
                PTSession.session_date >= start,
                PTSession.session_date <= end,
            )
        )
        .scalars()
        .all()
    )
    return sorted({*own, *pt})


def _window_volume_kg(db: Session, member_id: int, start: date, end: date) -> float:
    """Kilograms moved in completed own-workout sessions over a window.

    Bodyweight sets (weight 0) contribute nothing, the same honest zero
    :func:`app.domain.records.volume_of` uses."""
    total = db.scalar(
        select(func.coalesce(func.sum(WorkoutSet.weight_kg * WorkoutSet.reps), 0.0))
        .select_from(WorkoutSet)
        .join(WorkoutSessionItem, WorkoutSet.session_item_id == WorkoutSessionItem.id)
        .join(WorkoutSession, WorkoutSessionItem.session_id == WorkoutSession.id)
        .where(
            WorkoutSession.member_id == member_id,
            WorkoutSession.status == SessionStatus.COMPLETED,
            WorkoutSession.session_date >= start,
            WorkoutSession.session_date <= end,
        )
    )
    return round(float(total or 0.0), 1)


def _pct_change(current: float, previous: float) -> float | None:
    if previous <= 0:
        return None
    return round((current - previous) * 100.0 / previous, 1)


# --------------------------------------------------------------- calculators


def consistency(db: Session, member_id: int, *, today: date) -> ConsistencySignal:
    weeks = T.consistency_window_weeks
    start = today - timedelta(weeks=weeks) + timedelta(days=1)
    dates = _completed_session_dates(db, member_id, start, today)
    count = len(dates)
    per_week = round(count / weeks, 2)
    target = T.consistency_target_per_week
    ratio = round(per_week / target, 2) if target else 0.0

    if count < T.min_sessions_for_insights:
        level = "insufficient_data"
    elif ratio >= T.consistency_strong_ratio:
        level = "strong"
    elif ratio < T.consistency_low_ratio:
        level = "low"
    else:
        level = "steady"

    return ConsistencySignal(
        window_weeks=weeks,
        sessions_in_window=count,
        per_week=per_week,
        target_per_week=target,
        ratio=ratio,
        level=level,
    )


def inactivity(db: Session, member: Member, *, today: date) -> InactivitySignal:
    last_training = db.scalar(
        select(func.max(WorkoutSession.session_date)).where(
            WorkoutSession.member_id == member.id,
            WorkoutSession.status == SessionStatus.COMPLETED,
        )
    )
    last_pt = db.scalar(
        select(func.max(PTSession.session_date)).where(
            PTSession.member_id == member.id,
            PTSession.status == SessionStatus.COMPLETED,
        )
    )
    training_dates = [d for d in (last_training, last_pt) if d is not None]
    last_train = max(training_dates) if training_dates else None

    last_visit = db.scalar(
        select(func.max(AttendanceEvent.work_date)).where(
            AttendanceEvent.user_id == member.user_id,
            AttendanceEvent.person_type == PersonType.MEMBER,
            AttendanceEvent.event_type == EventType.CHECK_IN,
        )
    )

    days_since_training = (today - last_train).days if last_train else None
    days_since_visit = (today - last_visit).days if last_visit else None

    if last_train is None:
        level = "no_history"
    elif days_since_training is not None and days_since_training >= T.inactivity_critical_days:
        level = "inactive"
    elif days_since_training is not None and days_since_training >= T.inactivity_attention_days:
        level = "slipping"
    else:
        level = "active"

    return InactivitySignal(
        last_training_on=last_train,
        days_since_training=days_since_training,
        last_visit_on=last_visit,
        days_since_visit=days_since_visit,
        level=level,
    )


def recent_records(db: Session, member_id: int, *, today: date) -> RecordsSignal:
    """Genuine heaviest-weight PRs achieved inside the recent window.

    For each lift the member has trained, every set is replayed in
    chronological order; a set is a record only when its weight *strictly
    exceeds* every set of that lift before it. A first session sets none (there
    is nothing prior to beat), a repeat of the same top weight sets none (a tie
    is not a record), and only the most recent such event per lift is kept —
    and only if it happened in the window. This mirrors
    :mod:`app.domain.records`: a "PR" always means something was beaten.
    """
    window_start = today - timedelta(days=T.recent_pr_window_days)
    exercises = journey_service.trained_exercises(db, member_id=member_id, limit=12)
    out: list[RecentRecord] = []
    for exercise in exercises:
        rows = db.execute(
            select(WorkoutSet.weight_kg, WorkoutSet.reps, WorkoutSession.session_date)
            .join(WorkoutSessionItem, WorkoutSet.session_item_id == WorkoutSessionItem.id)
            .join(WorkoutSession, WorkoutSessionItem.session_id == WorkoutSession.id)
            .where(
                WorkoutSession.member_id == member_id,
                WorkoutSession.status == SessionStatus.COMPLETED,
                WorkoutSessionItem.exercise == exercise,
                WorkoutSet.weight_kg > 0,
            )
            .order_by(WorkoutSession.session_date, WorkoutSet.set_number)
        ).all()
        if len(rows) < 2:
            continue
        best_before = 0.0
        pr: RecentRecord | None = None
        for weight, reps, on in rows:
            w = float(weight)
            if best_before > 0.0 and w > best_before:
                pr = RecentRecord(exercise=exercise, weight_kg=w, reps=int(reps), achieved_on=on)
            best_before = max(best_before, w)
        if pr is None or pr.achieved_on < window_start:
            continue
        out.append(pr)
    out.sort(key=lambda r: (r.achieved_on, r.weight_kg), reverse=True)
    return RecordsSignal(window_days=T.recent_pr_window_days, records=out)


def training_trend(db: Session, member_id: int, *, today: date) -> TrendSignal:
    span = T.trend_window_days
    cur_start = today - timedelta(days=span - 1)
    prev_start = cur_start - timedelta(days=span)
    prev_end = cur_start - timedelta(days=1)

    cur_sessions = len(_completed_session_dates(db, member_id, cur_start, today))
    prev_sessions = len(_completed_session_dates(db, member_id, prev_start, prev_end))
    cur_volume = _window_volume_kg(db, member_id, cur_start, today)
    prev_volume = _window_volume_kg(db, member_id, prev_start, prev_end)
    change = _pct_change(cur_volume, prev_volume)

    minimum = T.min_sessions_per_trend_window
    if cur_sessions < minimum or prev_sessions < minimum or change is None:
        direction = "insufficient_data"
    elif change >= T.trend_meaningful_change_pct:
        direction = "improving"
    elif change <= -T.trend_meaningful_change_pct:
        direction = "declining"
    else:
        direction = "steady"

    return TrendSignal(
        window_days=span,
        current_volume_kg=cur_volume,
        previous_volume_kg=prev_volume,
        current_sessions=cur_sessions,
        previous_sessions=prev_sessions,
        volume_change_pct=change,
        direction=direction,
    )


def plateau(
    db: Session,
    member_id: int,
    *,
    today: date,
    records: RecordsSignal | None = None,
) -> PlateauSignal:
    """One lift, one conservative call.

    Picks the exercise the member trains most, looks at its recent top-set
    weights, and only reports a plateau when those weights have genuinely not
    moved *and* have had long enough to. Anything short of that returns
    ``detected=False`` with the reason it fell short.

    ``records`` may be passed in when the caller has already computed the
    recent-PR signal (``member_signals`` does) — a plateau yields to a recent
    PR on the same lift, and recomputing that scan here is pure waste.
    """
    none = PlateauSignal(
        exercise=None,
        sessions_considered=0,
        span_days=0,
        top_weight_kg=0.0,
        weight_range_kg=0.0,
        detected=False,
        reason="No lift has enough logged history to judge a plateau.",
    )

    ranked = db.execute(
        select(WorkoutSessionItem.exercise, func.count(func.distinct(WorkoutSession.id)))
        .join(WorkoutSession, WorkoutSessionItem.session_id == WorkoutSession.id)
        .join(WorkoutSet, WorkoutSet.session_item_id == WorkoutSessionItem.id)
        .where(
            WorkoutSession.member_id == member_id,
            WorkoutSession.status == SessionStatus.COMPLETED,
            WorkoutSet.weight_kg > 0,
        )
        .group_by(WorkoutSessionItem.exercise)
        .order_by(func.count(func.distinct(WorkoutSession.id)).desc())
    ).all()
    if not ranked:
        return none
    exercise, session_count = ranked[0]
    if session_count < T.plateau_min_sessions:
        return PlateauSignal(
            exercise=exercise,
            sessions_considered=int(session_count),
            span_days=0,
            top_weight_kg=0.0,
            weight_range_kg=0.0,
            detected=False,
            reason=(
                f"{exercise} has {int(session_count)} logged sessions; a plateau "
                f"call needs at least {T.plateau_min_sessions}."
            ),
        )

    history = journey_service.exercise_history(
        db, member_id=member_id, exercise=exercise, limit=T.plateau_lookback_sessions
    )
    sessions = history.sessions  # most recent first
    tops = [entry.top_weight_kg for entry in sessions if entry.top_weight_kg > 0]
    if len(tops) < T.plateau_min_sessions:
        return PlateauSignal(
            exercise=exercise,
            sessions_considered=len(tops),
            span_days=0,
            top_weight_kg=tops[0] if tops else 0.0,
            weight_range_kg=0.0,
            detected=False,
            reason=f"Not enough recent weighted sessions of {exercise} to judge.",
        )

    span_days = (sessions[0].session.session_date - sessions[-1].session.session_date).days
    weight_range = round(max(tops) - min(tops), 1)
    pr_records = records if records is not None else recent_records(db, member_id, today=today)
    recent_pr = any(r.exercise == exercise for r in pr_records.records)
    detected = (
        span_days >= T.plateau_min_span_days
        and weight_range <= T.plateau_weight_tolerance_kg
        and not recent_pr
    )
    if detected:
        reason = (
            f"Top set on {exercise} has stayed within {weight_range:g} kg across "
            f"{len(tops)} sessions over {span_days} days, with no personal record "
            f"in that time."
        )
    elif recent_pr:
        reason = f"{exercise} set a personal record recently — not a plateau."
    elif weight_range > T.plateau_weight_tolerance_kg:
        reason = (
            f"Top set on {exercise} has moved {weight_range:g} kg recently — still progressing."
        )
    else:
        reason = (
            f"Top set on {exercise} is flat but only over {span_days} days; too soon to "
            f"call a plateau."
        )

    return PlateauSignal(
        exercise=exercise,
        sessions_considered=len(tops),
        span_days=span_days,
        top_weight_kg=round(tops[0], 1),
        weight_range_kg=weight_range,
        detected=detected,
        reason=reason,
    )


def journey_status(db: Session, member: Member, *, today: date) -> JourneySignal:
    journey = journey_service.latest_journey(db, member.id)
    if journey is None:
        return JourneySignal(
            status=None,
            phase=None,
            current_day=None,
            duration_days=None,
            days_remaining=None,
            completion_pct=None,
            missed_days=0,
            pt_converted=None,
        )

    progress = journey_service.progress(db, journey, today)
    days_remaining = None
    if journey.end_date is not None:
        days_remaining = max((journey.end_date - today).days, 0)

    missed = (
        db.scalar(
            select(func.count())
            .select_from(JourneyDay)
            .where(
                JourneyDay.journey_id == journey.id,
                JourneyDay.status == DayStatus.MISSED,
            )
        )
        or 0
    )

    return JourneySignal(
        status=journey.status.value
        if isinstance(journey.status, JourneyStatus)
        else str(journey.status),
        phase=progress.phase,
        current_day=progress.current_day,
        duration_days=journey.duration_days,
        days_remaining=days_remaining,
        completion_pct=round(progress.completion_pct, 1),
        missed_days=int(missed),
        pt_converted=bool(journey.pt_converted),
    )


def membership_status(db: Session, member: Member, *, today: date) -> MembershipSignal:
    membership = db.scalar(
        select(Membership)
        .where(Membership.member_id == member.id)
        .order_by(Membership.ends_on.desc())
    )
    if membership is None:
        return MembershipSignal(status=None, ends_on=None, days_remaining=None, expiring_soon=False)
    days_remaining = (membership.ends_on - today).days if membership.ends_on else None
    expiring_soon = (
        membership.status == MembershipStatus.ACTIVE
        and days_remaining is not None
        and 0 <= days_remaining <= T.membership_expiry_attention_days
    )
    return MembershipSignal(
        status=membership.status.value
        if isinstance(membership.status, MembershipStatus)
        else str(membership.status),
        ends_on=membership.ends_on,
        days_remaining=days_remaining,
        expiring_soon=expiring_soon,
    )


def member_signals(db: Session, member: Member, *, today: date) -> MemberSignals:
    """Every signal for one member, plus the coverage numbers the UI needs to
    decide between the real section and the empty state."""
    completed = (
        db.scalar(
            select(func.count())
            .select_from(WorkoutSession)
            .where(
                WorkoutSession.member_id == member.id,
                WorkoutSession.status == SessionStatus.COMPLETED,
            )
        )
        or 0
    )
    first_session = db.scalar(
        select(func.min(WorkoutSession.session_date)).where(
            WorkoutSession.member_id == member.id,
            WorkoutSession.status == SessionStatus.COMPLETED,
        )
    )
    weeks_of_history = ((today - first_session).days // 7) if first_session else 0

    records = recent_records(db, member.id, today=today)
    return MemberSignals(
        member_id=member.id,
        generated_for=today,
        completed_sessions=int(completed),
        weeks_of_history=int(weeks_of_history),
        has_minimum_data=int(completed) >= T.min_sessions_for_insights,
        consistency=consistency(db, member.id, today=today),
        inactivity=inactivity(db, member, today=today),
        records=records,
        trend=training_trend(db, member.id, today=today),
        plateau=plateau(db, member.id, today=today, records=records),
        journey=journey_status(db, member, today=today),
        membership=membership_status(db, member, today=today),
    )


__all__ = [
    "ConsistencySignal",
    "InactivitySignal",
    "JourneySignal",
    "MemberSignals",
    "MembershipSignal",
    "PlateauSignal",
    "RecentRecord",
    "RecordsSignal",
    "TrendSignal",
    "consistency",
    "inactivity",
    "journey_status",
    "member_signals",
    "membership_status",
    "plateau",
    "recent_records",
    "training_trend",
]

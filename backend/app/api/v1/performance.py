"""Branch performance comparison, trainer performance and occupancy forecast.

The rule that shapes this module: **do not invent a trend**. A comparison is
returned only when the comparison window actually holds data, and the busy-hour
forecast is withheld entirely until there is enough history to be honest about
it. The app renders the absence, rather than a zero that reads as a fact.
"""

from __future__ import annotations

from datetime import date, timedelta

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.clock import branch_today, to_branch_time
from app.core.deps import (
    assert_branch_access,
    get_current_user,
    require_management,
    scoped_branch_filter,
)
from app.db.models import (
    AttendanceEvent,
    AttendanceStatus,
    Branch,
    EventType,
    Member,
    PersonType,
    RoleKey,
    Trainer,
    TrainerAttendance,
    User,
)
from app.db.session import get_db
from app.domain.shift_engine import (
    EARLY_EXIT_STATUSES,
    LATE_STATUSES,
    ON_TIME_STATUSES,
    PRESENT_STATUSES,
)
from app.schemas.operations import (
    BranchPerformanceOut,
    BranchPerformanceResponse,
    OccupancyForecastOut,
    TrainerPerformanceOut,
    TrendPoint,
)
from app.services import (
    activity_service,
    attendance_service,
    incentive_service,
    marketing_service,
    pt_service,
    schedule_service,
    settings_service,
)

router = APIRouter(prefix="/performance", tags=["performance"])

#: Comparison windows the owner can ask for.
PERIODS = {"today": 1, "week": 7, "month": 30}


def _window(period: str, today: date) -> tuple[date, date, date | None, date | None]:
    """Current window plus the one before it, for a like-for-like comparison."""
    if period == "today":
        return today, today, today - timedelta(days=1), today - timedelta(days=1)
    if period == "week":
        start = today - timedelta(days=today.weekday())
        return start, today, start - timedelta(days=7), start - timedelta(days=1)
    # month: calendar month to date, against the same span last month
    start = today.replace(day=1)
    previous_end = start - timedelta(days=1)
    previous_start = previous_end.replace(day=1)
    return start, today, previous_start, previous_end


def _trend(current: float, previous: float | None, has_comparison: bool) -> TrendPoint:
    if not has_comparison or previous is None:
        return TrendPoint(value=current, previous=None, delta=None, has_comparison=False)
    return TrendPoint(
        value=current,
        previous=previous,
        delta=round(current - previous, 1),
        has_comparison=True,
    )


def _attendance_metrics(db: Session, branch_id: int, start: date, end: date) -> dict:
    rows = db.scalars(
        select(TrainerAttendance).where(
            TrainerAttendance.branch_id == branch_id,
            TrainerAttendance.work_date >= start,
            TrainerAttendance.work_date <= end,
        )
    ).all()
    scheduled = len(rows)
    present = sum(1 for r in rows if r.status in PRESENT_STATUSES)
    on_time = sum(1 for r in rows if r.status in ON_TIME_STATUSES)
    late = sum(1 for r in rows if r.status in LATE_STATUSES)
    early = sum(1 for r in rows if r.status in EARLY_EXIT_STATUSES)
    absent = sum(1 for r in rows if r.status is AttendanceStatus.ABSENT)
    return {
        "rows": scheduled,
        "punctuality_pct": round(on_time * 100 / present, 1) if present else 0.0,
        "attendance_pct": round(present * 100 / scheduled, 1) if scheduled else 0.0,
        "late": float(late),
        "early_exit": float(early),
        "absent": float(absent),
    }


def _session_metrics(db: Session, branch_id: int, start: date, end: date) -> dict:
    trainers = db.scalars(select(Trainer.id).where(Trainer.branch_id == branch_id)).all()
    scheduled = completed = 0
    for trainer_id in trainers:
        stats = schedule_service.completion_stats(db, trainer_id, start, end)
        scheduled += stats["sessions_scheduled"]
        completed += stats["sessions_completed"]
    pt = pt_service.utilisation(db, [branch_id], start, end)
    return {
        "sessions": scheduled,
        "session_completion_pct": round(completed * 100 / scheduled, 1) if scheduled else 0.0,
        "pt_utilisation_pct": pt["utilisation_pct"],
        "pt_booked": pt["booked"],
    }


def _member_activity(db: Session, branch_id: int, start: date, end: date) -> dict:
    """Distinct members who did anything at this branch in the window."""
    visits = int(
        db.scalar(
            select(func.count(func.distinct(AttendanceEvent.user_id))).where(
                AttendanceEvent.branch_id == branch_id,
                AttendanceEvent.person_type == PersonType.MEMBER,
                AttendanceEvent.event_type == EventType.CHECK_IN,
                AttendanceEvent.work_date >= start,
                AttendanceEvent.work_date <= end,
            )
        )
        or 0
    )
    total = int(
        db.scalar(
            select(func.count())
            .select_from(Member)
            .where(Member.branch_id == branch_id, Member.is_active.is_(True))
        )
        or 0
    )
    return {
        "active_members": visits,
        "total_members": total,
        "activity_pct": round(visits * 100 / total, 1) if total else 0.0,
    }


def _marketing_conversion(db: Session, branch_id: int, start: date, end: date) -> float:
    funnels = marketing_service.funnel(db, [branch_id], start=start, end=end)
    joined = sum(f.joined for f in funnels)
    converted = sum(f.pt_conversions for f in funnels)
    return round(converted * 100 / joined, 1) if joined else 0.0


@router.get("/branches", response_model=BranchPerformanceResponse)
def branch_performance(
    period: str = Query(default="week", pattern="^(today|week|month)$"),
    db: Session = Depends(get_db),
    user: User = Depends(require_management),
) -> BranchPerformanceResponse:
    """Compare the three SLAM branches across the metrics the owner runs on."""
    allowed = scoped_branch_filter(user, None)
    stmt = select(Branch).where(Branch.is_active.is_(True)).order_by(Branch.name)
    if allowed is not None:
        stmt = stmt.where(Branch.id.in_(allowed))
    branches = list(db.scalars(stmt).all())
    if not branches:
        today = branch_today(None)
        return BranchPerformanceResponse(
            period=period,
            period_start=today,
            period_end=today,
            has_comparison=False,
            branches=[],
            note="No branches in scope.",
        )

    today = branch_today(branches[0].timezone)
    start, end, prev_start, prev_end = _window(period, today)

    # A comparison is only shown when the earlier window actually holds rows —
    # otherwise every metric would appear to have doubled from zero.
    comparison_rows = 0
    if prev_start and prev_end:
        comparison_rows = int(
            db.scalar(
                select(func.count())
                .select_from(TrainerAttendance)
                .where(
                    TrainerAttendance.branch_id.in_([b.id for b in branches]),
                    TrainerAttendance.work_date >= prev_start,
                    TrainerAttendance.work_date <= prev_end,
                )
            )
            or 0
        )
    has_comparison = comparison_rows > 0

    out: list[BranchPerformanceOut] = []
    for branch in branches:
        attendance_service.ensure_days_exist(db, branch, today)
        now_metrics = _attendance_metrics(db, branch.id, start, end)
        now_sessions = _session_metrics(db, branch.id, start, end)
        now_activity = _member_activity(db, branch.id, start, end)
        now_marketing = _marketing_conversion(db, branch.id, start, end)

        was_metrics = was_sessions = was_activity = None
        was_marketing = None
        if has_comparison and prev_start and prev_end:
            was_metrics = _attendance_metrics(db, branch.id, prev_start, prev_end)
            was_sessions = _session_metrics(db, branch.id, prev_start, prev_end)
            was_activity = _member_activity(db, branch.id, prev_start, prev_end)
            was_marketing = _marketing_conversion(db, branch.id, prev_start, prev_end)

        occupancy = attendance_service.branch_occupancy(db, branch)
        out.append(
            BranchPerformanceOut(
                branch_id=branch.id,
                branch_code=branch.code,
                branch_name=branch.name,
                punctuality=_trend(
                    now_metrics["punctuality_pct"],
                    was_metrics["punctuality_pct"] if was_metrics else None,
                    has_comparison,
                ),
                attendance=_trend(
                    now_metrics["attendance_pct"],
                    was_metrics["attendance_pct"] if was_metrics else None,
                    has_comparison,
                ),
                late_marks=_trend(
                    now_metrics["late"],
                    was_metrics["late"] if was_metrics else None,
                    has_comparison,
                ),
                early_exits=_trend(
                    now_metrics["early_exit"],
                    was_metrics["early_exit"] if was_metrics else None,
                    has_comparison,
                ),
                session_completion=_trend(
                    now_sessions["session_completion_pct"],
                    was_sessions["session_completion_pct"] if was_sessions else None,
                    has_comparison,
                ),
                pt_utilisation=_trend(
                    now_sessions["pt_utilisation_pct"],
                    was_sessions["pt_utilisation_pct"] if was_sessions else None,
                    has_comparison,
                ),
                member_activity=_trend(
                    now_activity["activity_pct"],
                    was_activity["activity_pct"] if was_activity else None,
                    has_comparison,
                ),
                marketing_conversion=_trend(now_marketing, was_marketing, has_comparison),
                members_inside=occupancy["inside"],
                is_demo=branch.is_demo,
            )
        )

    return BranchPerformanceResponse(
        period=period,
        period_start=start,
        period_end=end,
        comparison_start=prev_start if has_comparison else None,
        comparison_end=prev_end if has_comparison else None,
        has_comparison=has_comparison,
        branches=out,
        note=None
        if has_comparison
        else "Not enough history yet to compare against the previous period.",
    )


@router.get("/trainers/{trainer_id}", response_model=TrainerPerformanceOut)
def trainer_performance(
    trainer_id: int,
    month: date | None = Query(default=None),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> TrainerPerformanceOut:
    """Discipline and delivery for one trainer, kept as separate numbers.

    No single blended score: the brief is explicit that a trainer must not be
    judged on one metric, and a composite would do exactly that.
    """
    trainer = db.get(Trainer, trainer_id)
    if trainer is None:
        raise HTTPException(status_code=404, detail="Trainer not found")
    if user.role.key == RoleKey.TRAINER.value and trainer.user_id != user.id:
        raise HTTPException(status_code=403, detail="You can only view your own performance")
    if user.role.key == RoleKey.MEMBER.value:
        raise HTTPException(status_code=403, detail="Not permitted")
    assert_branch_access(user, trainer.branch_id)

    today = branch_today(trainer.branch.timezone if trainer.branch else None)
    period_start, period_end = incentive_service.month_bounds(month or today)

    summary, outcome, _rule = incentive_service.evaluate_trainer(
        db, trainer, period_start, period_end
    )
    stats = schedule_service.completion_stats(db, trainer.id, period_start, period_end)

    return TrainerPerformanceOut(
        trainer_id=trainer.id,
        trainer_name=trainer.user.full_name if trainer.user else "Trainer",
        branch_id=trainer.branch_id,
        period_start=period_start,
        period_end=period_end,
        punctuality_pct=summary.punctuality_pct,
        attendance_pct=summary.attendance_pct,
        late_count=summary.late_count,
        early_exit_count=summary.early_exit_count,
        absent_count=summary.absent_count,
        missing_checkout_count=summary.missing_checkout_count,
        sessions_scheduled=stats["sessions_scheduled"],
        sessions_completed=stats["sessions_completed"],
        session_completion_pct=stats["completion_pct"],
        pt_scheduled=stats["pt_scheduled"],
        pt_completed=stats["pt_completed"],
        class_scheduled=stats["class_scheduled"],
        class_completed=stats["class_completed"],
        # Client feedback is not collected in V1. The slot is declared so the
        # screen has somewhere to put it, and stays null until it is real.
        client_feedback=None,
        incentive_status=outcome.status.value,
        incentive_checks=outcome.as_dict()["checks"],
        incentive_disclaimer=outcome.disclaimer,
    )


@router.get("/occupancy/{branch_id}/forecast", response_model=OccupancyForecastOut)
def occupancy_forecast(
    branch_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> OccupancyForecastOut:
    """Busy periods from history — or an honest "not yet".

    Nothing is modelled or extrapolated. With fewer than the configured number
    of days of check-in history, this returns no hours at all rather than a
    prediction dressed up as intelligence.
    """
    branch = db.get(Branch, branch_id)
    if branch is None:
        raise HTTPException(status_code=404, detail="Branch not found")
    if user.role.key == RoleKey.MEMBER.value:
        member = db.scalar(select(Member).where(Member.user_id == user.id))
        if member is None or member.branch_id != branch_id:
            raise HTTPException(status_code=403, detail="Not your branch")
    elif user.role.key != RoleKey.TRAINER.value:
        assert_branch_access(user, branch_id)

    required = settings_service.get_int(db, "occupancy.busy_period_min_days", branch_id)
    distinct_days = int(
        db.scalar(
            select(func.count(func.distinct(AttendanceEvent.work_date))).where(
                AttendanceEvent.branch_id == branch_id,
                AttendanceEvent.person_type == PersonType.MEMBER,
                AttendanceEvent.event_type == EventType.CHECK_IN,
            )
        )
        or 0
    )

    if distinct_days < required:
        return OccupancyForecastOut(
            branch_id=branch_id,
            has_enough_history=False,
            days_of_history=distinct_days,
            days_required=required,
            busiest_hours=[],
            note=(
                f"{distinct_days} of {required} days of check-in history. "
                "Busy periods appear once there is enough data."
            ),
        )

    events = db.scalars(
        select(AttendanceEvent).where(
            AttendanceEvent.branch_id == branch_id,
            AttendanceEvent.person_type == PersonType.MEMBER,
            AttendanceEvent.event_type == EventType.CHECK_IN,
        )
    ).all()

    by_hour: dict[int, int] = {}
    for event in events:
        hour = to_branch_time(event.occurred_at, branch.timezone).hour
        by_hour[hour] = by_hour.get(hour, 0) + 1

    ranked = sorted(by_hour.items(), key=lambda kv: kv[1], reverse=True)[:4]
    total = sum(by_hour.values()) or 1
    return OccupancyForecastOut(
        branch_id=branch_id,
        has_enough_history=True,
        days_of_history=distinct_days,
        days_required=required,
        busiest_hours=[
            {
                "hour": hour,
                "label": f"{hour:02d}:00 – {(hour + 1) % 24:02d}:00",
                "check_ins": count,
                "share_pct": round(count * 100 / total, 1),
            }
            for hour, count in ranked
        ],
        note=None,
    )


@router.get("/members/{member_id}/activity")
def member_activity(
    member_id: int,
    weeks: int = Query(default=8, ge=1, le=26),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> dict:
    """Weekly activity by kind — gym visits, own workouts, PT and classes."""
    from .journeys import assert_can_read_member

    member = db.get(Member, member_id)
    if member is None:
        raise HTTPException(status_code=404, detail="Member not found")
    assert_can_read_member(db, user, member)

    today = branch_today(member.branch.timezone if member.branch else None)
    return {
        "member_id": member.id,
        "totals": activity_service.counts(db, member),
        "weekly": activity_service.weekly_activity(db, member, weeks=weeks, today=today),
    }


__all__ = ["router"]

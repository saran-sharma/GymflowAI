"""The owner's daily brief.

"What needs my attention today?", answered from aggregate counts GymFlow
already holds — trainer punctuality and absence month-to-date, members who have
gone quiet, renewals due, Day-45 members waiting on a PT offer, and (across more
than one branch) the branch lagging the group. No revenue or billing figure
appears: GymFlow has no money model, so an owner "insight" about it would be
invented.

Every issue is emitted only when it clears a threshold in
:mod:`.thresholds`, carries the evidence it was judged on, and — where a
comparable prior period exists — a direction. The one narrated field is the
headline sentence.
"""

from __future__ import annotations

from datetime import date, timedelta

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.clock import branch_today, now_utc
from app.db.models import (
    AttendanceEvent,
    AttendanceStatus,
    Branch,
    EventType,
    Member,
    Membership,
    MembershipStatus,
    PersonType,
    PTSession,
    SessionStatus,
    TrainerAttendance,
    WorkoutSession,
)
from app.domain.shift_engine import ON_TIME_STATUSES, PRESENT_STATUSES
from app.services import automation_service
from app.services.incentive_service import month_bounds
from app.services.intelligence.narrator import NarrationRequest, TemplateNarrator
from app.services.intelligence.schemas import (
    InsightAction,
    InsightEvidence,
    OwnerDailyBrief,
    OwnerIssue,
)
from app.services.intelligence.thresholds import THRESHOLDS as T

_SEVERITY_ORDER = {"critical": 0, "attention": 1, "positive": 2, "info": 3}


def _punctuality(
    db: Session, branch_ids: list[int] | None, start: date, end: date
) -> tuple[int, int]:
    """``(on_time, present)`` across a window and branch scope."""
    stmt = select(TrainerAttendance.status).where(
        TrainerAttendance.work_date >= start, TrainerAttendance.work_date <= end
    )
    if branch_ids is not None:
        stmt = stmt.where(TrainerAttendance.branch_id.in_(branch_ids))
    rows = list(db.scalars(stmt).all())
    present = sum(1 for s in rows if s in PRESENT_STATUSES)
    on_time = sum(1 for s in rows if s in ON_TIME_STATUSES)
    return on_time, present


def _direction(current: float, previous: float, *, flat_band: float = 2.0) -> str:
    if current - previous > flat_band:
        return "up"
    if previous - current > flat_band:
        return "down"
    return "flat"


def _punctuality_issue(db: Session, branch_ids, today: date) -> OwnerIssue | None:
    start, end = month_bounds(today)
    on_time, present = _punctuality(db, branch_ids, start, end)
    if present == 0:
        return None
    pct = round(on_time * 100 / present, 1)
    if pct >= T.owner_punctuality_floor_pct:
        return None

    prev_start, prev_end = month_bounds(start - timedelta(days=1))
    p_on, p_present = _punctuality(db, branch_ids, prev_start, prev_end)
    prev_pct = round(p_on * 100 / p_present, 1) if p_present else pct
    direction = _direction(pct, prev_pct)

    return OwnerIssue(
        id="trainer_punctuality",
        severity="attention",
        title="Trainer punctuality is below target",
        summary=(
            f"{on_time} of {present} shifts this month started on time ({pct:g}%), "
            f"under the {T.owner_punctuality_floor_pct:g}% target."
        ),
        evidence=[
            InsightEvidence(label="On time (MTD)", value=f"{pct:g}%"),
            InsightEvidence(label="Last month", value=f"{prev_pct:g}%"),
            InsightEvidence(label="Shifts", value=str(present)),
        ],
        direction=direction,
        action=InsightAction(label="Open trainers", route="/(owner)/trainers"),
    )


def _absence_issue(db: Session, branch_ids, today: date) -> OwnerIssue | None:
    start, end = month_bounds(today)
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
    absent = int(db.scalar(stmt) or 0)
    if absent == 0:
        return None
    return OwnerIssue(
        id="trainer_absence",
        severity="critical" if absent > 2 else "attention",
        title=f"{absent} unworked shift{'s' if absent != 1 else ''} this month",
        summary="Rostered shifts with no check-in at all — a trainer did not show and did not call in.",
        evidence=[InsightEvidence(label="Unworked shifts (MTD)", value=str(absent))],
        action=InsightAction(label="Open trainers", route="/(owner)/trainers"),
    )


def _inactive_members_issue(db: Session, branch_ids, today: date) -> OwnerIssue | None:
    cutoff = today - timedelta(days=T.owner_inactive_member_days)

    active_stmt = select(func.count()).select_from(Member).where(Member.is_active.is_(True))
    if branch_ids is not None:
        active_stmt = active_stmt.where(Member.branch_id.in_(branch_ids))
    active = int(db.scalar(active_stmt) or 0)
    if active == 0:
        return None

    recent_workout = (
        select(WorkoutSession.member_id)
        .where(
            WorkoutSession.status == SessionStatus.COMPLETED,
            WorkoutSession.session_date >= cutoff,
        )
        .distinct()
    )
    recent_pt = (
        select(PTSession.member_id)
        .where(PTSession.status == SessionStatus.COMPLETED, PTSession.session_date >= cutoff)
        .distinct()
    )
    recent_visit = (
        select(Member.id)
        .join(AttendanceEvent, AttendanceEvent.user_id == Member.user_id)
        .where(
            AttendanceEvent.person_type == PersonType.MEMBER,
            AttendanceEvent.event_type == EventType.CHECK_IN,
            AttendanceEvent.work_date >= cutoff,
        )
        .distinct()
    )

    inactive_stmt = (
        select(func.count())
        .select_from(Member)
        .where(
            Member.is_active.is_(True),
            Member.id.not_in(recent_workout),
            Member.id.not_in(recent_pt),
            Member.id.not_in(recent_visit),
        )
    )
    if branch_ids is not None:
        inactive_stmt = inactive_stmt.where(Member.branch_id.in_(branch_ids))
    inactive = int(db.scalar(inactive_stmt) or 0)
    if inactive == 0:
        return None

    share = inactive / active
    if share < T.owner_inactive_share_attention:
        return None
    severity = "critical" if share >= T.owner_inactive_share_critical else "attention"
    return OwnerIssue(
        id="member_inactivity",
        severity=severity,
        title=f"{inactive} members have gone quiet",
        summary=(
            f"{inactive} of {active} active members ({round(share * 100)}%) have no workout, "
            f"PT session or visit in the last {T.owner_inactive_member_days} days."
        ),
        evidence=[
            InsightEvidence(label="Quiet members", value=str(inactive)),
            InsightEvidence(label="Active roster", value=str(active)),
            InsightEvidence(label="Share", value=f"{round(share * 100)}%"),
        ],
        action=InsightAction(label="Open members", route="/(owner)/members"),
    )


def _renewals_issue(db: Session, branch_ids, today: date) -> OwnerIssue | None:
    horizon = today + timedelta(days=T.owner_renewal_horizon_days)
    stmt = select(func.count(), func.min(Membership.ends_on)).where(
        Membership.status == MembershipStatus.ACTIVE,
        Membership.ends_on >= today,
        Membership.ends_on <= horizon,
    )
    if branch_ids is not None:
        stmt = stmt.where(Membership.branch_id.in_(branch_ids))
    count, soonest = db.execute(stmt).one()
    count = int(count or 0)
    if count == 0:
        return None
    return OwnerIssue(
        id="renewals_due",
        severity="attention" if count >= 5 else "info",
        title=f"{count} membership{'s' if count != 1 else ''} due to renew",
        summary=(
            f"{count} active membership{'s' if count != 1 else ''} end within "
            f"{T.owner_renewal_horizon_days} days. No amount is attached — GymFlow has no "
            f"billing model."
        ),
        evidence=[
            InsightEvidence(label="Due in 14 days", value=str(count)),
            InsightEvidence(label="Soonest", value=soonest.isoformat() if soonest else "—"),
        ],
        action=InsightAction(label="Open renewals", route="/(owner)/renewals"),
    )


def _pt_ready_issue(db: Session, branch_ids, today: date) -> OwnerIssue | None:
    del today  # signature parity with the other builders
    summary = automation_service.opportunity_summary(db, branch_ids)
    count = summary.get("pt_ready_count", 0)
    if not count:
        return None
    return OwnerIssue(
        id="pt_ready",
        severity="info",
        title=f"{count} member{'s' if count != 1 else ''} finished the journey and have no PT",
        summary=(
            "Day-45 members with no PT package yet — the point at which a personal-training "
            "offer is most likely to land."
        ),
        evidence=[InsightEvidence(label="Awaiting an offer", value=str(count))],
        action=InsightAction(label="Open opportunities", route="/(owner)/opportunities"),
    )


def _branch_lag_issue(db: Session, branch_ids, today: date) -> OwnerIssue | None:
    stmt = select(Branch).where(Branch.is_active.is_(True))
    if branch_ids is not None:
        stmt = stmt.where(Branch.id.in_(branch_ids))
    branches = list(db.scalars(stmt).all())
    if len(branches) < 2:
        return None

    start, end = month_bounds(today)
    per_branch: list[tuple[Branch, float, int]] = []
    total_on, total_present = 0, 0
    for branch in branches:
        on_time, present = _punctuality(db, [branch.id], start, end)
        if present == 0:
            continue
        per_branch.append((branch, round(on_time * 100 / present, 1), present))
        total_on += on_time
        total_present += present
    if not per_branch or total_present == 0:
        return None

    group_avg = round(total_on * 100 / total_present, 1)
    worst_branch, worst_pct, worst_n = min(per_branch, key=lambda row: row[1])
    if group_avg - worst_pct < T.owner_branch_lag_points:
        return None

    return OwnerIssue(
        id="branch_lag",
        severity="attention",
        title=f"{worst_branch.name} is behind the group on punctuality",
        summary=(
            f"{worst_branch.name} is at {worst_pct:g}% on-time this month against a "
            f"{group_avg:g}% average across your branches."
        ),
        evidence=[
            InsightEvidence(label=worst_branch.name, value=f"{worst_pct:g}%"),
            InsightEvidence(label="Group average", value=f"{group_avg:g}%"),
            InsightEvidence(label="Shifts", value=str(worst_n)),
        ],
        direction="down",
        action=InsightAction(
            label=f"Open {worst_branch.name}", route=f"/(owner)/branch/{worst_branch.id}"
        ),
    )


_BUILDERS = (
    _punctuality_issue,
    _absence_issue,
    _inactive_members_issue,
    _renewals_issue,
    _pt_ready_issue,
    _branch_lag_issue,
)


def build_owner_daily_brief(
    db: Session,
    *,
    branch_ids: list[int] | None,
    scope_label: str = "All branches",
    today: date | None = None,
    narrator=None,
) -> OwnerDailyBrief:
    narrator = narrator or TemplateNarrator()
    if today is None:
        today = branch_today(None)

    issues: list[OwnerIssue] = []
    for builder in _BUILDERS:
        issue = builder(db, branch_ids, today)
        if issue is not None:
            issues.append(issue)

    issues.sort(key=lambda i: _SEVERITY_ORDER.get(i.severity, 9))

    if not issues:
        headline = "Nothing needs your attention this morning."
        return OwnerDailyBrief(
            generated_at=now_utc(),
            scope=scope_label,
            headline=headline,
            issues=[],
            narration_source="deterministic",
        )

    top = issues[0]
    fallback = (
        f"{len(issues)} thing{'s' if len(issues) != 1 else ''} to look at — "
        f"{top.title[0].lower()}{top.title[1:]}."
    )
    narration = narrator.narrate(
        NarrationRequest(
            audience="owner",
            fallback_headline=fallback,
            context={
                "issue_count": len(issues),
                "top_issue": top.id,
                "severities": [i.severity for i in issues],
            },
        )
    )
    return OwnerDailyBrief(
        generated_at=now_utc(),
        scope=scope_label,
        headline=narration.headline,
        issues=issues,
        narration_source=narration.source,
    )


__all__ = ["build_owner_daily_brief"]

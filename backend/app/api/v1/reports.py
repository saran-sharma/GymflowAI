"""Owner dashboard, branch comparison and the audit trail."""

from __future__ import annotations

from datetime import date, timedelta

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, select
from sqlalchemy.orm import Session, joinedload

from app.core.clock import branch_today, now_utc
from app.core.deps import (
    require_admin,
    require_management,
    scoped_branch_filter,
)
from app.db.models import (
    AttendanceStatus,
    AuditLog,
    Branch,
    Member,
    Membership,
    MembershipStatus,
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
from app.schemas.common import AuditLogOut, BranchSummaryOut, DashboardOut, OccupancyOut
from app.schemas.operations import NeedsAttentionOut, RenewalItemOut, RenewalsOut
from app.services import attendance_service, automation_service, correction_service

router = APIRouter(prefix="/reports", tags=["reports"])


def _summarise_branch(
    db: Session, branch: Branch, on: date | None, include_occupancy: bool
) -> BranchSummaryOut:
    work_date = on or branch_today(branch.timezone)
    # Materialising the day first is what makes an absence visible: a trainer
    # who never opened the app has no rows of their own to count.
    rows = attendance_service.ensure_days_exist(db, branch, work_date)

    scheduled = len(rows)
    present = sum(1 for r in rows if r.status in PRESENT_STATUSES)
    on_time = sum(1 for r in rows if r.status in ON_TIME_STATUSES)
    late = sum(1 for r in rows if r.status in LATE_STATUSES)
    early = sum(1 for r in rows if r.status in EARLY_EXIT_STATUSES)
    absent = sum(1 for r in rows if r.status is AttendanceStatus.ABSENT)
    missing = sum(1 for r in rows if r.status is AttendanceStatus.MISSING_CHECKOUT)

    return BranchSummaryOut(
        branch_id=branch.id,
        branch_code=branch.code,
        branch_name=branch.name,
        scheduled=scheduled,
        present=present,
        on_time=on_time,
        late=late,
        absent=absent,
        early_exit=early,
        missing_checkout=missing,
        punctuality_pct=round(on_time * 100 / present, 1) if present else 0.0,
        occupancy=(
            OccupancyOut(**attendance_service.branch_occupancy(db, branch))
            if include_occupancy
            else None
        ),
    )


@router.get("/dashboard", response_model=DashboardOut)
def dashboard(
    on: date | None = Query(default=None),
    branch_id: int | None = Query(default=None),
    db: Session = Depends(get_db),
    user: User = Depends(require_management),
) -> DashboardOut:
    """The owner's home screen: chain totals plus one card per branch."""
    stmt = select(Branch).where(Branch.is_active.is_(True)).order_by(Branch.name)
    allowed = scoped_branch_filter(user, branch_id)
    if allowed is not None:
        stmt = stmt.where(Branch.id.in_(allowed))
    branches = list(db.scalars(stmt).all())

    summaries = [_summarise_branch(db, b, on, include_occupancy=True) for b in branches]

    trainer_stmt = select(func.count()).select_from(Trainer).where(Trainer.is_active.is_(True))
    if allowed is not None:
        trainer_stmt = trainer_stmt.where(Trainer.branch_id.in_(allowed))
    total_trainers = db.scalar(trainer_stmt) or 0

    scheduled = sum(s.scheduled for s in summaries)
    present = sum(s.present for s in summaries)
    on_time = sum(s.on_time for s in summaries)

    reference = branches[0].timezone if branches else None
    return DashboardOut(
        work_date=on or branch_today(reference),
        server_time=now_utc(),
        total_trainers=int(total_trainers),
        scheduled=scheduled,
        present=present,
        late=sum(s.late for s in summaries),
        absent=sum(s.absent for s in summaries),
        early_exit=sum(s.early_exit for s in summaries),
        missing_checkout=sum(s.missing_checkout for s in summaries),
        punctuality_pct=round(on_time * 100 / present, 1) if present else 0.0,
        branches=summaries,
    )


@router.get("/branches", response_model=list[BranchSummaryOut])
def branch_comparison(
    on: date | None = Query(default=None),
    db: Session = Depends(get_db),
    user: User = Depends(require_management),
) -> list[BranchSummaryOut]:
    stmt = select(Branch).where(Branch.is_active.is_(True)).order_by(Branch.name)
    allowed = scoped_branch_filter(user, None)
    if allowed is not None:
        stmt = stmt.where(Branch.id.in_(allowed))
    return [
        _summarise_branch(db, branch, on, include_occupancy=True)
        for branch in db.scalars(stmt).all()
    ]


@router.get("/attendance-trend")
def attendance_trend(
    start: date,
    end: date,
    branch_id: int | None = Query(default=None),
    db: Session = Depends(get_db),
    user: User = Depends(require_management),
) -> list[dict]:
    """Daily punctuality over a range, for the owner's trend chart."""
    allowed = scoped_branch_filter(user, branch_id)
    stmt = (
        select(
            TrainerAttendance.work_date,
            TrainerAttendance.status,
            func.count().label("n"),
        )
        .where(TrainerAttendance.work_date >= start, TrainerAttendance.work_date <= end)
        .group_by(TrainerAttendance.work_date, TrainerAttendance.status)
        .order_by(TrainerAttendance.work_date)
    )
    if allowed is not None:
        stmt = stmt.where(TrainerAttendance.branch_id.in_(allowed))

    buckets: dict[date, dict[str, int]] = {}
    for work_date, status, count in db.execute(stmt).all():
        bucket = buckets.setdefault(
            work_date, {"present": 0, "on_time": 0, "late": 0, "absent": 0, "early_exit": 0}
        )
        if status in PRESENT_STATUSES:
            bucket["present"] += count
        if status in ON_TIME_STATUSES:
            bucket["on_time"] += count
        if status in LATE_STATUSES:
            bucket["late"] += count
        if status in EARLY_EXIT_STATUSES:
            bucket["early_exit"] += count
        if status is AttendanceStatus.ABSENT:
            bucket["absent"] += count

    return [
        {
            "work_date": day.isoformat(),
            **counts,
            "punctuality_pct": (
                round(counts["on_time"] * 100 / counts["present"], 1) if counts["present"] else 0.0
            ),
        }
        for day, counts in sorted(buckets.items())
    ]


@router.get("/needs-attention", response_model=NeedsAttentionOut)
def needs_attention(
    limit: int = Query(default=20, ge=1, le=100),
    db: Session = Depends(get_db),
    user: User = Depends(require_management),
) -> NeedsAttentionOut:
    """The owner's actionable list.

    The automations are run first so the list reflects the current state
    rather than whatever the last sweep happened to leave behind. Each item
    carries the route to open, so an alert leads to the person or member it is
    about instead of a generic screen.
    """
    allowed = scoped_branch_filter(user, None)
    automation_service.run_all(db, allowed)

    opportunities = automation_service.opportunity_summary(db, allowed)
    pending = len(correction_service.pending_for_branches(db, allowed))
    return NeedsAttentionOut(
        items=automation_service.needs_attention(db, allowed, limit=limit),
        pt_ready_count=opportunities["pt_ready_count"],
        pending_corrections=pending,
    )


@router.get("/opportunities")
def opportunities(
    db: Session = Depends(get_db),
    user: User = Depends(require_management),
) -> dict:
    """Members who finished the 45-day journey and have no PT package yet."""
    allowed = scoped_branch_filter(user, None)
    return automation_service.opportunity_summary(db, allowed)


@router.get("/audit", response_model=list[AuditLogOut])
def audit_trail(
    action: str | None = Query(default=None),
    branch_id: int | None = Query(default=None),
    limit: int = Query(default=100, ge=1, le=500),
    db: Session = Depends(get_db),
    user: User = Depends(require_admin),
) -> list[AuditLog]:
    stmt = select(AuditLog).order_by(AuditLog.created_at.desc()).limit(limit)
    if action:
        stmt = stmt.where(AuditLog.action == action)
    allowed = scoped_branch_filter(user, branch_id)
    if allowed is not None:
        stmt = stmt.where(AuditLog.branch_id.in_(allowed))
    return list(db.scalars(stmt).all())


@router.get("/insights")
def insights(
    branch_id: int | None = Query(default=None),
    db: Session = Depends(get_db),
    user: User = Depends(require_management),
) -> list[dict]:
    """Deterministic observations from the intelligence provider.

    With every integration disabled this is the rule-based provider, which only
    restates counts the dashboard already shows — no model is involved and no
    V1 feature depends on it.
    """
    from app.integrations.registry import intelligence_provider

    branch_code = None
    if branch_id is not None:
        branch = db.get(Branch, branch_id)
        branch_code = branch.code if branch else None
    allowed = scoped_branch_filter(user, branch_id)

    provider = intelligence_provider()
    out = []
    for insight in provider.insights(branch_code):
        code = insight.data.get("branch_code")
        if allowed is not None and code:
            branch = db.scalar(select(Branch).where(Branch.code == code))
            if branch is None or branch.id not in allowed:
                continue
        out.append(
            {
                "key": insight.key,
                "title": insight.title,
                "detail": insight.detail,
                "severity": insight.severity,
                "data": insight.data,
            }
        )
    return out


__all__ = ["router"]


@router.get("/renewals", response_model=RenewalsOut)
def renewals_due(
    days: int = Query(default=30, ge=1, le=180),
    branch_id: int | None = Query(default=None),
    db: Session = Depends(get_db),
    user: User = Depends(require_management),
) -> RenewalsOut:
    """Memberships expiring inside the window, and who they belong to.

    The expiry *alert* already existed — `automation_service` raises one per
    member — but there was no way to ask how many there are, which is what a
    dashboard tile needs. This counts the same rows the alerts are raised
    from, so the tile and the alert list can never disagree.

    No money is attached. GymFlow has no billing model, so what a renewal is
    worth is not something this can answer.
    """
    allowed = scoped_branch_filter(user, branch_id)
    today = branch_today(None)
    horizon = today + timedelta(days=days)

    stmt = (
        select(Membership)
        .options(joinedload(Membership.member).joinedload(Member.user))
        .where(
            Membership.status == MembershipStatus.ACTIVE,
            Membership.ends_on >= today,
            Membership.ends_on <= horizon,
        )
        .order_by(Membership.ends_on)
    )
    if allowed is not None:
        stmt = stmt.where(Membership.branch_id.in_(allowed))

    rows = db.scalars(stmt).all()
    return RenewalsOut(
        window_days=days,
        count=len(rows),
        items=[
            RenewalItemOut(
                member_id=row.member_id,
                member_name=row.member.user.full_name,
                branch_id=row.branch_id,
                plan_name=row.plan_name,
                ends_on=row.ends_on,
                days_remaining=(row.ends_on - today).days,
            )
            for row in rows
        ],
    )

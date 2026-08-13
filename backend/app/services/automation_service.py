"""Server-side business automations.

Everything correctness depends on happens here, not in the app: Day-45
completion, attendance settlement, PT package status and the alerts SLAM acts
on. The sweep is idempotent — it is called from the scheduled run, from the
owner dashboard and from the member's own screen, and running it three times
in a minute produces the same state as running it once.
"""

from __future__ import annotations

from datetime import date, timedelta

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.clock import branch_today, now_utc
from app.db.models import (
    AlertSeverity,
    AttendanceStatus,
    Branch,
    ClassStatus,
    GroupClass,
    Member,
    Membership,
    MembershipStatus,
    Trainer,
    TrainerAttendance,
)
from app.services import (
    alert_service,
    attendance_service,
    journey_service,
    pt_service,
    settings_service,
)


def run_for_branch(db: Session, branch: Branch, on: date | None = None) -> dict:
    """Every automation for one branch. Returns what it changed, for the audit."""
    work_date = on or branch_today(branch.timezone)

    materialised = attendance_service.ensure_days_exist(db, branch, work_date)
    settled_days = attendance_service.close_stale_days(db, branch, work_date)
    attendance_alerts = _attendance_alerts(db, branch, work_date)
    journeys = journey_service.settle_all(db, branch.id)
    packages = pt_service.settle_all_packages(db, branch.id)
    memberships = _membership_alerts(db, branch, work_date)
    classes = _close_finished_classes(db, branch, work_date)

    return {
        "branch_id": branch.id,
        "work_date": work_date.isoformat(),
        "attendance_days": len(materialised),
        "attendance_settled": settled_days,
        "attendance_alerts": attendance_alerts,
        "journeys_completed": journeys,
        "packages_settled": packages,
        "membership_alerts": memberships,
        "classes_closed": classes,
    }


def run_all(db: Session, branch_ids: list[int] | None = None) -> list[dict]:
    stmt = select(Branch).where(Branch.is_active.is_(True)).order_by(Branch.id)
    if branch_ids is not None:
        stmt = stmt.where(Branch.id.in_(branch_ids))
    return [run_for_branch(db, branch) for branch in db.scalars(stmt).all()]


# ------------------------------------------------------------- attendance


def _attendance_alerts(db: Session, branch: Branch, work_date: date) -> int:
    """Raise (and clear) the trainer-accountability alerts for a day.

    Yesterday is included: a forgotten check-out only becomes a fact once the
    shift has closed, so alerting on today alone would never surface one.
    """
    if not settings_service.get_bool(db, "alerts.late_trainer", branch.id):
        return 0

    rows = db.scalars(
        select(TrainerAttendance).where(
            TrainerAttendance.branch_id == branch.id,
            TrainerAttendance.work_date >= work_date - timedelta(days=1),
            TrainerAttendance.work_date <= work_date,
        )
    ).all()

    raised = 0
    for row in rows:
        trainer = db.get(Trainer, row.trainer_id)
        name = trainer.user.full_name if trainer and trainer.user else f"Trainer {row.trainer_id}"

        late_key = f"attendance:{row.id}:late"
        if row.status in (AttendanceStatus.LATE, AttendanceStatus.LATE_AND_EARLY_EXIT):
            alert_service.raise_alert(
                db,
                key=alert_service.LATE_TRAINER,
                dedupe_key=late_key,
                title=f"{name} was late",
                body=f"{row.late_minutes} min late at {branch.name} on {row.work_date.isoformat()}.",
                severity=AlertSeverity.WARNING,
                branch_id=branch.id,
                entity_type="trainer",
                entity_id=row.trainer_id,
                action_route=f"/owner/trainer/{row.trainer_id}",
                payload={"late_minutes": row.late_minutes, "work_date": row.work_date.isoformat()},
            )
            raised += 1

        checkout_key = f"attendance:{row.id}:missing-checkout"
        if row.status is AttendanceStatus.MISSING_CHECKOUT:
            alert_service.raise_alert(
                db,
                key=alert_service.MISSING_CHECKOUT,
                dedupe_key=checkout_key,
                title=f"{name} did not check out",
                body=f"No check-out recorded for {row.work_date.isoformat()} at {branch.name}.",
                severity=AlertSeverity.WARNING,
                branch_id=branch.id,
                entity_type="trainer",
                entity_id=row.trainer_id,
                action_route=f"/owner/trainer/{row.trainer_id}",
                payload={"work_date": row.work_date.isoformat()},
            )
            raised += 1
        elif row.check_out_at is not None:
            # The trainer checked out after the alert fired — clear it rather
            # than leaving the owner to dismiss a problem that fixed itself.
            alert_service.resolve_alert(db, checkout_key)

        if row.status is AttendanceStatus.ABSENT:
            alert_service.raise_alert(
                db,
                key=alert_service.UNWORKED_SHIFT,
                dedupe_key=f"attendance:{row.id}:absent",
                title=f"{name} did not work a rostered shift",
                body=f"Rostered at {branch.name} on {row.work_date.isoformat()} with no check-in.",
                severity=AlertSeverity.CRITICAL,
                branch_id=branch.id,
                entity_type="trainer",
                entity_id=row.trainer_id,
                action_route=f"/owner/trainer/{row.trainer_id}",
                payload={"work_date": row.work_date.isoformat()},
            )
            raised += 1
    return raised


# ------------------------------------------------------------ memberships


def _membership_alerts(db: Session, branch: Branch, work_date: date) -> int:
    window = settings_service.get_int(db, "alerts.membership_expiry_days", branch.id)
    horizon = work_date + timedelta(days=window)

    rows = db.scalars(
        select(Membership).where(
            Membership.branch_id == branch.id,
            Membership.status == MembershipStatus.ACTIVE,
            Membership.ends_on <= horizon,
        )
    ).all()

    raised = 0
    for membership in rows:
        if membership.ends_on < work_date:
            membership.status = MembershipStatus.EXPIRED
            db.flush()
            continue
        member = db.get(Member, membership.member_id)
        if member is None:
            continue
        days_left = (membership.ends_on - work_date).days
        name = member.user.full_name if member.user else f"Member {member.id}"
        alert_service.raise_alert(
            db,
            key=alert_service.MEMBERSHIP_EXPIRING,
            dedupe_key=f"membership:{membership.id}:expiring",
            title=f"Membership expiring — {name}",
            body=f"{membership.plan_name} ends on {membership.ends_on.isoformat()} ({days_left} days).",
            severity=AlertSeverity.WARNING,
            branch_id=branch.id,
            entity_type="membership",
            entity_id=membership.id,
            action_route=f"/owner/member/{member.id}",
            payload={"days_left": days_left},
        )
        alert_service.raise_alert(
            db,
            key=alert_service.MEMBERSHIP_EXPIRING,
            dedupe_key=f"membership:{membership.id}:member-expiring",
            title="Your membership is ending soon",
            body=f"{membership.plan_name} ends on {membership.ends_on.isoformat()}.",
            severity=AlertSeverity.WARNING,
            branch_id=branch.id,
            target_role=None,
            target_user_id=member.user_id,
            entity_type="membership",
            entity_id=membership.id,
            action_route="/member",
        )
        raised += 1
    return raised


# ---------------------------------------------------------------- classes


def _close_finished_classes(db: Session, branch: Branch, work_date: date) -> int:
    """Complete classes whose slot has passed, so turnout gets evaluated."""
    from app.services import class_service

    rows = db.scalars(
        select(GroupClass).where(
            GroupClass.branch_id == branch.id,
            GroupClass.status == ClassStatus.SCHEDULED,
            GroupClass.class_date < work_date,
        )
    ).all()
    for group_class in rows:
        class_service.close_class(db, group_class)
    return len(rows)


# --------------------------------------------------------- needs attention


def needs_attention(db: Session, branch_ids: list[int] | None, limit: int = 20) -> list[dict]:
    """The owner's actionable list.

    Every entry carries the route the app should open, so tapping an alert
    lands on the person, session or member it is about rather than a generic
    screen.
    """
    from app.db.models import Alert, AlertStatus

    stmt = (
        select(Alert)
        .where(
            Alert.status == AlertStatus.OPEN, Alert.target_role == alert_service.MANAGEMENT_TARGET
        )
        .order_by(Alert.severity.desc(), Alert.created_at.desc())
        .limit(limit)
    )
    if branch_ids is not None:
        stmt = stmt.where(Alert.branch_id.in_(branch_ids) | Alert.branch_id.is_(None))

    out = []
    for alert in db.scalars(stmt).all():
        out.append(
            {
                "id": alert.id,
                "key": alert.key,
                "severity": alert.severity.value,
                "title": alert.title,
                "body": alert.body,
                "branch_id": alert.branch_id,
                "entity_type": alert.entity_type,
                "entity_id": alert.entity_id,
                "action_route": alert.action_route,
                "created_at": alert.created_at,
            }
        )
    return out


def opportunity_summary(db: Session, branch_ids: list[int] | None) -> dict:
    """Day-45 members ready for PT, and how many are still unconverted."""
    ready = journey_service.pt_ready_members(db, branch_ids)
    return {
        "pt_ready_count": len(ready),
        "members": [
            {
                "journey_id": j.id,
                "member_id": j.member_id,
                "member_name": (
                    j.member.user.full_name
                    if j.member and j.member.user
                    else f"Member {j.member_id}"
                ),
                "branch_id": j.branch_id,
                "completed_on": j.completed_on,
            }
            for j in ready[:20]
        ],
        "as_of": now_utc(),
    }


__all__ = ["needs_attention", "opportunity_summary", "run_all", "run_for_branch"]

"""In-app alerts and follow-up tasks.

V1 has no push and no WhatsApp, so this is the only channel the product
depends on. Every automation writes through :func:`raise_alert`, which is
idempotent on ``dedupe_key`` — a nightly job, a manager refresh and a member
opening the app can all run the same rule without the owner's list filling up
with copies of one fact.
"""

from __future__ import annotations

import uuid
from datetime import date
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session, joinedload

from app.core.clock import now_utc
from app.db.models import (
    Alert,
    AlertSeverity,
    AlertStatus,
    Member,
    PackageStatus,
    PTPackage,
    RoleKey,
    Task,
    Trainer,
    User,
)

# Alert keys. Strings rather than an enum so an integration can add its own
# without a migration, matching how audit actions are handled.
LATE_TRAINER = "trainer.late"
MISSING_CHECKOUT = "trainer.missing_checkout"
UNWORKED_SHIFT = "trainer.unworked_shift"
ATTENDANCE_EXCEPTION = "attendance.correction_pending"
JOURNEY_DAY45 = "journey.day45_complete"
JOURNEY_PT_READY = "journey.pt_ready"
#: Sent to the member's own trainer, who decides whether to convert them.
JOURNEY_PT_REVIEW = "journey.pt_review"
#: Sent to management after a trainer has converted somebody.
PT_CONVERTED = "pt.converted"
PT_LOW_BALANCE = "pt.low_balance"
PT_PACKAGE_COMPLETE = "pt.package_complete"
CLASS_ANNOUNCED = "class.announced"
CLASS_LOW_ATTENDANCE = "class.low_attendance"
MEMBERSHIP_EXPIRING = "membership.expiring"
MARKETING_MILESTONE = "marketing.milestone"
OWNER_BROADCAST = "owner.broadcast"

#: Roles that read a branch-wide alert feed.
MANAGEMENT_TARGET = "management"

#: broadcast_type → severity. Everything but "urgent" reads as a normal
#: in-app alert; a member or trainer should not learn to ignore this channel
#: because most of what arrives on it is dressed as critical.
_BROADCAST_SEVERITY = {"urgent": AlertSeverity.CRITICAL}


def raise_alert(
    db: Session,
    *,
    key: str,
    dedupe_key: str,
    title: str,
    body: str,
    severity: AlertSeverity = AlertSeverity.INFO,
    branch_id: int | None = None,
    target_role: str | None = MANAGEMENT_TARGET,
    target_user_id: int | None = None,
    entity_type: str | None = None,
    entity_id: str | int | None = None,
    action_route: str | None = None,
    payload: dict[str, Any] | None = None,
) -> Alert:
    """Create the alert, or refresh the one already standing for this fact.

    A resolved alert is *not* reopened: once the owner has dealt with a late
    arrival, re-running the rule for the same day should not put it back.
    """
    existing = db.scalar(select(Alert).where(Alert.dedupe_key == dedupe_key))
    if existing is not None:
        if existing.status is AlertStatus.OPEN:
            existing.title = title
            existing.body = body
            existing.severity = severity
            existing.payload = payload or existing.payload
            existing.action_route = action_route or existing.action_route
            db.flush()
        return existing

    alert = Alert(
        branch_id=branch_id,
        target_role=target_role,
        target_user_id=target_user_id,
        key=key,
        severity=severity,
        status=AlertStatus.OPEN,
        title=title,
        body=body,
        entity_type=entity_type,
        entity_id=str(entity_id) if entity_id is not None else None,
        action_route=action_route,
        dedupe_key=dedupe_key,
        payload=payload or {},
    )
    db.add(alert)
    db.flush()
    return alert


def resolve_alert(db: Session, dedupe_key: str) -> Alert | None:
    """Close an alert because the underlying fact went away.

    Used when, for example, a trainer finally checks out — the alert should
    disappear on its own rather than waiting for someone to dismiss it.
    """
    alert = db.scalar(select(Alert).where(Alert.dedupe_key == dedupe_key))
    if alert is None or alert.status in (AlertStatus.RESOLVED, AlertStatus.DISMISSED):
        return alert
    alert.status = AlertStatus.RESOLVED
    alert.resolved_at = now_utc()
    db.flush()
    return alert


def visible_alerts(
    db: Session,
    user: User,
    *,
    branch_ids: list[int] | None,
    status: AlertStatus | None = AlertStatus.OPEN,
    limit: int = 50,
    offset: int = 0,
) -> list[Alert]:
    """Alerts this user may see.

    Members and trainers only ever see alerts addressed to them personally;
    management sees the branch feed for the branches their role covers.
    """
    stmt = select(Alert).order_by(Alert.created_at.desc())
    if status is not None:
        stmt = stmt.where(Alert.status == status)

    if user.role.key in (RoleKey.MEMBER.value, RoleKey.TRAINER.value):
        stmt = stmt.where(Alert.target_user_id == user.id)
    else:
        stmt = stmt.where(
            (Alert.target_role == MANAGEMENT_TARGET) | (Alert.target_user_id == user.id)
        )
        if branch_ids is not None:
            stmt = stmt.where(Alert.branch_id.in_(branch_ids) | Alert.branch_id.is_(None))

    return list(db.scalars(stmt.offset(offset).limit(limit)).all())


def send_broadcast(
    db: Session,
    *,
    sender: User,
    audience: str,
    branch_id: int | None,
    broadcast_type: str,
    title: str,
    body: str,
    member_id: int | None = None,
) -> int:
    """Send one message to a whole audience, as individual alerts.

    ``visible_alerts`` only ever shows a member or trainer alerts addressed to
    *them* — there is no "everyone at this branch" row it will surface for
    those roles. So a broadcast is not one alert; it is one alert per
    recipient, each real enough to show up in that person's own inbox the
    next time they open it. The shared ``broadcast_id`` in every dedupe_key
    is what stops a retried request from paging the same person twice.
    """
    recipients: list[User] = []
    if audience in ("everyone", "members"):
        stmt = select(Member).options(joinedload(Member.user)).where(Member.is_active.is_(True))
        if branch_id is not None:
            stmt = stmt.where(Member.branch_id == branch_id)
        recipients += [m.user for m in db.scalars(stmt).all() if m.user is not None]
    if audience in ("everyone", "trainers"):
        stmt = select(Trainer).options(joinedload(Trainer.user)).where(Trainer.is_active.is_(True))
        if branch_id is not None:
            stmt = stmt.where(Trainer.branch_id == branch_id)
        recipients += [t.user for t in db.scalars(stmt).all() if t.user is not None]
    if audience == "pt_members":
        stmt = (
            select(Member)
            .join(PTPackage, PTPackage.member_id == Member.id)
            .options(joinedload(Member.user))
            .where(Member.is_active.is_(True), PTPackage.status == PackageStatus.ACTIVE)
            .distinct()
        )
        if branch_id is not None:
            stmt = stmt.where(Member.branch_id == branch_id)
        recipients += [m.user for m in db.scalars(stmt).all() if m.user is not None]
    if audience == "member" and member_id is not None:
        member = db.get(Member, member_id)
        if member is not None and member.user is not None:
            recipients.append(member.user)

    broadcast_id = uuid.uuid4().hex
    severity = _BROADCAST_SEVERITY.get(broadcast_type, AlertSeverity.INFO)
    for user in recipients:
        raise_alert(
            db,
            key=OWNER_BROADCAST,
            dedupe_key=f"broadcast:{broadcast_id}:{user.id}",
            title=title,
            body=body,
            severity=severity,
            branch_id=branch_id,
            target_role=None,
            target_user_id=user.id,
            payload={
                "broadcast_type": broadcast_type,
                "sent_by": sender.full_name,
                "audience": audience,
            },
        )
    return len(recipients)


def acknowledge(db: Session, alert: Alert, user: User, *, dismiss: bool = False) -> Alert:
    alert.status = AlertStatus.DISMISSED if dismiss else AlertStatus.ACKNOWLEDGED
    alert.acknowledged_by_user_id = user.id
    if dismiss:
        alert.resolved_at = now_utc()
    db.flush()
    return alert


# ------------------------------------------------------------------- tasks


def create_task(
    db: Session,
    *,
    key: str,
    dedupe_key: str,
    title: str,
    branch_id: int,
    detail: str | None = None,
    member_id: int | None = None,
    assigned_trainer_id: int | None = None,
    due_on: date | None = None,
) -> Task:
    """Follow-up work, idempotent on ``dedupe_key`` like alerts."""
    existing = db.scalar(select(Task).where(Task.dedupe_key == dedupe_key))
    if existing is not None:
        return existing
    task = Task(
        branch_id=branch_id,
        member_id=member_id,
        assigned_trainer_id=assigned_trainer_id,
        key=key,
        title=title,
        detail=detail,
        due_on=due_on,
        dedupe_key=dedupe_key,
    )
    db.add(task)
    db.flush()
    return task


def complete_task(db: Session, task: Task, user: User) -> Task:
    task.status = "completed"
    task.completed_at = now_utc()
    task.completed_by_user_id = user.id
    db.flush()
    return task


__all__ = [
    "ATTENDANCE_EXCEPTION",
    "CLASS_ANNOUNCED",
    "CLASS_LOW_ATTENDANCE",
    "JOURNEY_DAY45",
    "JOURNEY_PT_READY",
    "LATE_TRAINER",
    "MANAGEMENT_TARGET",
    "MARKETING_MILESTONE",
    "MEMBERSHIP_EXPIRING",
    "MISSING_CHECKOUT",
    "OWNER_BROADCAST",
    "PT_LOW_BALANCE",
    "PT_PACKAGE_COMPLETE",
    "UNWORKED_SHIFT",
    "acknowledge",
    "complete_task",
    "create_task",
    "raise_alert",
    "resolve_alert",
    "send_broadcast",
    "visible_alerts",
]

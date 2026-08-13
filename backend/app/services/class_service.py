"""Group classes: announcement, RSVP and attendance.

RSVP and attendance are deliberately two tables. "16 said yes, 11 turned up"
is the number SLAM needs; collapsing them into one column would hide it.
"""

from __future__ import annotations

from datetime import date, datetime, timedelta

from fastapi import HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.clock import branch_today, now_utc
from app.db.models import (
    AlertSeverity,
    Branch,
    ClassStatus,
    GroupClass,
    GroupClassAttendance,
    GroupClassRsvp,
    Member,
    RsvpResponse,
    Trainer,
)
from app.services import alert_service, settings_service


class ClassError(HTTPException):
    def __init__(self, detail: str, code: str, status_code: int = status.HTTP_409_CONFLICT):
        super().__init__(status_code=status_code, detail={"code": code, "message": detail})


def create_class(
    db: Session,
    *,
    branch: Branch,
    name: str,
    starts_at: datetime,
    ends_at: datetime | None = None,
    trainer_id: int | None = None,
    capacity: int | None = None,
    description: str | None = None,
    announcement: str | None = None,
    created_by_user_id: int | None = None,
) -> GroupClass:
    if trainer_id is not None:
        trainer = db.get(Trainer, trainer_id)
        if trainer is None or trainer.branch_id != branch.id:
            raise ClassError(
                "That trainer is not at this branch.",
                "trainer_branch_mismatch",
                status.HTTP_400_BAD_REQUEST,
            )

    group_class = GroupClass(
        branch_id=branch.id,
        trainer_id=trainer_id,
        name=name.strip(),
        description=description,
        starts_at=starts_at,
        ends_at=ends_at or (starts_at + timedelta(hours=1)),
        class_date=starts_at.date(),
        capacity=capacity or settings_service.get_int(db, "classes.default_capacity", branch.id),
        status=ClassStatus.SCHEDULED,
        announcement=announcement,
        created_by_user_id=created_by_user_id,
    )
    db.add(group_class)
    db.flush()
    announce(db, group_class)
    return group_class


def announce(db: Session, group_class: GroupClass) -> int:
    """Put the class in every active member's alert feed at that branch.

    In-app only. Push and WhatsApp are future channels and nothing here waits
    on them.
    """
    branch = db.get(Branch, group_class.branch_id)
    local = group_class.starts_at
    if branch is not None:
        from app.core.clock import to_branch_time

        local = to_branch_time(group_class.starts_at, branch.timezone)

    members = db.scalars(
        select(Member).where(Member.branch_id == group_class.branch_id, Member.is_active.is_(True))
    ).all()

    body = group_class.announcement or (
        f"{group_class.name} on {local.strftime('%A')} at {local.strftime('%I:%M %p').lstrip('0')}."
    )
    for member in members:
        alert_service.raise_alert(
            db,
            key=alert_service.CLASS_ANNOUNCED,
            dedupe_key=f"class:{group_class.id}:member:{member.id}",
            title=f"{group_class.name} — {local.strftime('%d %b')}",
            body=body,
            branch_id=group_class.branch_id,
            target_role=None,
            target_user_id=member.user_id,
            entity_type="group_class",
            entity_id=group_class.id,
            action_route=f"/member/classes/{group_class.id}",
        )
    db.flush()
    return len(members)


def cancel_class(db: Session, group_class: GroupClass, reason: str | None = None) -> GroupClass:
    group_class.status = ClassStatus.CANCELLED
    db.flush()
    for rsvp in db.scalars(
        select(GroupClassRsvp).where(
            GroupClassRsvp.class_id == group_class.id,
            GroupClassRsvp.response == RsvpResponse.YES,
        )
    ).all():
        member = db.get(Member, rsvp.member_id)
        if member is None:
            continue
        alert_service.raise_alert(
            db,
            key=alert_service.CLASS_ANNOUNCED,
            dedupe_key=f"class:{group_class.id}:cancelled:member:{member.id}",
            title=f"{group_class.name} is cancelled",
            body=reason or "This class will not run. Sorry for the change.",
            severity=AlertSeverity.WARNING,
            branch_id=group_class.branch_id,
            target_role=None,
            target_user_id=member.user_id,
            entity_type="group_class",
            entity_id=group_class.id,
        )
    return group_class


# -------------------------------------------------------------------- RSVP


def set_rsvp(
    db: Session, *, group_class: GroupClass, member: Member, answer: RsvpResponse
) -> GroupClassRsvp:
    if group_class.status is ClassStatus.CANCELLED:
        raise ClassError("This class has been cancelled.", "class_cancelled")
    if member.branch_id != group_class.branch_id:
        raise ClassError(
            "This class is at another branch.", "branch_mismatch", status.HTTP_403_FORBIDDEN
        )

    row = db.scalar(
        select(GroupClassRsvp).where(
            GroupClassRsvp.class_id == group_class.id, GroupClassRsvp.member_id == member.id
        )
    )
    if row is None:
        row = GroupClassRsvp(class_id=group_class.id, member_id=member.id)
        db.add(row)

    taking_a_place = answer is RsvpResponse.YES and row.response is not RsvpResponse.YES
    if taking_a_place and counts(db, group_class)["yes"] >= group_class.capacity:
        raise ClassError("This class is full.", "class_full")

    row.response = answer
    row.responded_at = now_utc()
    db.flush()
    return row


def counts(db: Session, group_class: GroupClass) -> dict:
    """Yes / no / pending, plus what attendance actually looked like."""
    rows = db.execute(
        select(GroupClassRsvp.response, func.count())
        .where(GroupClassRsvp.class_id == group_class.id)
        .group_by(GroupClassRsvp.response)
    ).all()
    tally = {response: int(count) for response, count in rows}

    yes = tally.get(RsvpResponse.YES, 0)
    no = tally.get(RsvpResponse.NO, 0)
    explicit_pending = tally.get(RsvpResponse.PENDING, 0)

    attended = (
        db.scalar(
            select(func.count())
            .select_from(GroupClassAttendance)
            .where(
                GroupClassAttendance.class_id == group_class.id,
                GroupClassAttendance.attended.is_(True),
            )
        )
        or 0
    )
    recorded = (
        db.scalar(
            select(func.count())
            .select_from(GroupClassAttendance)
            .where(GroupClassAttendance.class_id == group_class.id)
        )
        or 0
    )

    return {
        "yes": yes,
        "no": no,
        "pending": explicit_pending,
        "registered": yes,
        "attended": int(attended),
        "absent": max(0, int(recorded) - int(attended)),
        "capacity": group_class.capacity,
        "available": max(0, group_class.capacity - yes),
        "show_up_pct": round(int(attended) * 100 / yes, 1) if yes else 0.0,
    }


# -------------------------------------------------------------- attendance


def record_attendance(
    db: Session,
    *,
    group_class: GroupClass,
    member_ids: list[int],
    attended: bool,
    recorded_by_user_id: int | None,
) -> int:
    """Mark who actually turned up. Separate from the RSVP they gave."""
    changed = 0
    for member_id in member_ids:
        member = db.get(Member, member_id)
        if member is None or member.branch_id != group_class.branch_id:
            continue
        row = db.scalar(
            select(GroupClassAttendance).where(
                GroupClassAttendance.class_id == group_class.id,
                GroupClassAttendance.member_id == member_id,
            )
        )
        if row is None:
            row = GroupClassAttendance(
                class_id=group_class.id,
                member_id=member_id,
                branch_id=group_class.branch_id,
                recorded_at=now_utc(),
            )
            db.add(row)
        row.attended = attended
        row.recorded_by_user_id = recorded_by_user_id
        row.recorded_at = now_utc()
        changed += 1
    db.flush()
    return changed


def close_class(db: Session, group_class: GroupClass) -> GroupClass:
    """Complete the class and flag a poor turnout for the owner."""
    if group_class.status is ClassStatus.CANCELLED:
        return group_class
    group_class.status = ClassStatus.COMPLETED
    db.flush()

    tally = counts(db, group_class)
    threshold = settings_service.get_int(
        db, "alerts.low_class_attendance_pct", group_class.branch_id
    )
    if tally["yes"] >= 3 and tally["show_up_pct"] < threshold:
        alert_service.raise_alert(
            db,
            key=alert_service.CLASS_LOW_ATTENDANCE,
            dedupe_key=f"class:{group_class.id}:low-attendance",
            title=f"Low turnout — {group_class.name}",
            body=(
                f"{tally['attended']} of {tally['yes']} who said yes attended "
                f"({tally['show_up_pct']}%)."
            ),
            severity=AlertSeverity.WARNING,
            branch_id=group_class.branch_id,
            entity_type="group_class",
            entity_id=group_class.id,
            action_route=f"/owner/classes/{group_class.id}",
            payload=tally,
        )
    return group_class


def upcoming(
    db: Session, branch_ids: list[int] | None, *, on_or_after: date | None = None, limit: int = 30
) -> list[GroupClass]:
    start = on_or_after or branch_today(None)
    stmt = (
        select(GroupClass)
        .where(GroupClass.class_date >= start, GroupClass.status != ClassStatus.CANCELLED)
        .order_by(GroupClass.starts_at)
        .limit(limit)
    )
    if branch_ids is not None:
        stmt = stmt.where(GroupClass.branch_id.in_(branch_ids))
    return list(db.scalars(stmt).all())


__all__ = [
    "ClassError",
    "announce",
    "cancel_class",
    "close_class",
    "counts",
    "create_class",
    "record_attendance",
    "set_rsvp",
    "upcoming",
]

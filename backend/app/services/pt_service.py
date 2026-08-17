"""Personal training: packages, sessions and the split attendance view.

A PT session is not a gym visit and not an own workout. It has two people who
each have to turn up, and it consumes a session from a finite package — which
is why completion is the only thing that increments ``sessions_used``, and why
it does so exactly once per session.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime, timedelta

from fastapi import HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.clock import branch_today, now_utc, to_branch_time
from app.db.models import (
    AlertSeverity,
    Branch,
    Journey,
    Member,
    PackageStatus,
    PTPackage,
    PTSession,
    SessionStatus,
    Trainer,
    User,
)
from app.services import alert_service, audit, settings_service

#: Statuses a session can no longer move out of.
TERMINAL = {SessionStatus.COMPLETED, SessionStatus.CANCELLED, SessionStatus.NO_SHOW}


class PTError(HTTPException):
    def __init__(self, detail: str, code: str, status_code: int = status.HTTP_409_CONFLICT):
        super().__init__(status_code=status_code, detail={"code": code, "message": detail})


def package_options(db: Session, branch_id: int | None = None) -> list[int]:
    """The PT package sizes on offer. Configurable, never hardcoded in the app."""
    raw = settings_service.get_list(db, "pt.package_options", branch_id)
    sizes = []
    for item in raw:
        try:
            size = int(item)
        except (TypeError, ValueError):
            continue
        if size > 0:
            sizes.append(size)
    return sorted(set(sizes))


# --------------------------------------------------------------- packages


def create_package(
    db: Session,
    *,
    member: Member,
    sessions_total: int,
    trainer_id: int | None = None,
    start_date: date | None = None,
    expiry_date: date | None = None,
    journey_id: int | None = None,
    origin: str = "direct",
    price_amount: float | None = None,
    currency: str | None = None,
    created_by_user_id: int | None = None,
) -> PTPackage:
    branch = db.get(Branch, member.branch_id)
    today = start_date or branch_today(branch.timezone if branch else None)

    allowed = package_options(db, member.branch_id)
    if allowed and sessions_total not in allowed:
        raise PTError(
            f"PT packages at this branch are {', '.join(str(a) for a in allowed)} sessions.",
            "invalid_package_size",
            status.HTTP_400_BAD_REQUEST,
        )

    open_package = db.scalar(
        select(PTPackage).where(
            PTPackage.member_id == member.id, PTPackage.status == PackageStatus.ACTIVE
        )
    )
    if open_package is not None:
        raise PTError(
            "This member already has an active PT package.",
            "package_active",
        )

    validity = settings_service.get_int(db, "pt.default_validity_days", member.branch_id)
    package = PTPackage(
        member_id=member.id,
        branch_id=member.branch_id,
        trainer_id=trainer_id or member.assigned_trainer_id,
        journey_id=journey_id,
        sessions_total=sessions_total,
        sessions_used=0,
        status=PackageStatus.ACTIVE,
        start_date=today,
        expiry_date=expiry_date or (today + timedelta(days=validity)),
        price_amount=price_amount,
        currency=currency,
        origin=origin,
        created_by_user_id=created_by_user_id,
        is_demo=member.is_demo,
    )
    db.add(package)
    db.flush()

    if journey_id:
        journey = db.get(Journey, journey_id)
        if journey is not None:
            journey.pt_converted = True
            # The trainer's review alert asked a question this package answers.
            # Withdrawn here rather than in the conversion endpoint, so every
            # path that creates a package clears it — including the seeder and
            # a manager creating one directly.
            alert_service.resolve_alert(db, f"journey:{journey.id}:pt-review")
            db.flush()
    return package


def convert_to_pt(
    db: Session,
    *,
    member: Member,
    trainer: Trainer,
    actor: User,
    sessions_total: int,
    note: str | None = None,
) -> PTPackage:
    """Move a General Training member onto personal training.

    This is the one place the transition happens, and it only happens because a
    trainer asked for it. Nothing in GymFlow converts a member automatically:
    the 45-day mark raises an alert and stops there, because the decision is a
    conversation between a trainer and a member and the system does not have
    the half of it that happened on the gym floor.

    Idempotent by refusal rather than by silence — a member who already has an
    active package is a conflict, not a no-op, because two callers converting
    the same person means one of them is working from a stale screen.
    """
    existing = active_package(db, member.id)
    if existing is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={
                "code": "already_pt",
                "message": f"{member.user.full_name} is already on a personal-training package.",
            },
        )

    journey = db.scalar(
        select(Journey)
        .where(Journey.member_id == member.id)
        .order_by(Journey.start_date.desc(), Journey.id.desc())
    )

    package = create_package(
        db,
        member=member,
        sessions_total=sessions_total,
        trainer_id=trainer.id,
        journey_id=journey.id if journey else None,
        origin="trainer_conversion",
        created_by_user_id=actor.id,
    )

    member_name = member.user.full_name
    trainer_name = trainer.user.full_name

    # The owner is told what changed, by whom, and when — enough to answer
    # "who moved this member and on what basis" without opening the app.
    alert_service.raise_alert(
        db,
        key=alert_service.PT_CONVERTED,
        dedupe_key=f"member:{member.id}:pt-converted:{package.id}",
        title=f"{member_name} converted to PT",
        body=(
            f"{member_name} was converted from General Training to personal training by "
            f"{trainer_name}. {sessions_total} sessions." + (f" Note: {note}" if note else "")
        ),
        severity=AlertSeverity.INFO,
        branch_id=member.branch_id,
        entity_type="member",
        entity_id=member.id,
        action_route=f"/owner/member/{member.id}",
        payload={
            "member_id": member.id,
            "member_name": member_name,
            "trainer_id": trainer.id,
            "trainer_name": trainer_name,
            "from_training_type": "general_training",
            "to_training_type": "pt",
            "package_id": package.id,
            "sessions_total": sessions_total,
            "converted_at": now_utc().isoformat(),
            "note": note,
        },
    )

    audit.record(
        db,
        actor=actor,
        action="pt.convert",
        entity_type="member",
        entity_id=member.id,
        branch_id=member.branch_id,
        details={
            "from": "general_training",
            "to": "pt",
            "package_id": package.id,
            "trainer_id": trainer.id,
            "sessions_total": sessions_total,
        },
    )
    db.flush()
    return package


def active_package(db: Session, member_id: int) -> PTPackage | None:
    return db.scalar(
        select(PTPackage)
        .where(PTPackage.member_id == member_id, PTPackage.status == PackageStatus.ACTIVE)
        .order_by(PTPackage.start_date.desc())
    )


def latest_package(db: Session, member_id: int) -> PTPackage | None:
    return db.scalar(
        select(PTPackage)
        .where(PTPackage.member_id == member_id)
        .order_by(PTPackage.start_date.desc(), PTPackage.id.desc())
    )


def settle_package(db: Session, package: PTPackage, on: date | None = None) -> PTPackage:
    """Keep a package's status honest, and raise the balance alerts.

    Idempotent: alerts dedupe on the package, so calling this from a read is
    safe and means a member never has to open a screen for the owner to learn
    the package is running out.
    """
    if package.status is not PackageStatus.ACTIVE:
        return package

    branch = db.get(Branch, package.branch_id)
    today = on or branch_today(branch.timezone if branch else None)
    member = db.get(Member, package.member_id)
    member_name = member.user.full_name if member and member.user else f"Member {package.member_id}"

    if package.sessions_used >= package.sessions_total:
        package.status = PackageStatus.COMPLETED
        db.flush()
        alert_service.raise_alert(
            db,
            key=alert_service.PT_PACKAGE_COMPLETE,
            dedupe_key=f"pt-package:{package.id}:complete",
            title=f"PT package completed — {member_name}",
            body=(
                f"{member_name} has finished all {package.sessions_total} sessions. "
                "Renewal conversation is due."
            ),
            severity=AlertSeverity.INFO,
            branch_id=package.branch_id,
            entity_type="pt_package",
            entity_id=package.id,
            action_route=f"/owner/member/{package.member_id}",
        )
        if member is not None:
            alert_service.raise_alert(
                db,
                key=alert_service.PT_PACKAGE_COMPLETE,
                dedupe_key=f"pt-package:{package.id}:member-complete",
                title="PT package completed",
                body=f"You have completed all {package.sessions_total} PT sessions. Well done.",
                branch_id=package.branch_id,
                target_role=None,
                target_user_id=member.user_id,
                entity_type="pt_package",
                entity_id=package.id,
                action_route="/member/pt",
            )
        return package

    if package.expiry_date and package.expiry_date < today:
        package.status = PackageStatus.EXPIRED
        db.flush()
        return package

    threshold = settings_service.get_int(db, "pt.low_balance_threshold", package.branch_id)
    if 0 < package.sessions_remaining <= threshold:
        alert_service.raise_alert(
            db,
            key=alert_service.PT_LOW_BALANCE,
            dedupe_key=f"pt-package:{package.id}:low-balance",
            title=f"PT sessions running low — {member_name}",
            body=(
                f"{package.sessions_remaining} of {package.sessions_total} sessions remain. "
                "Plan the renewal conversation."
            ),
            severity=AlertSeverity.WARNING,
            branch_id=package.branch_id,
            entity_type="pt_package",
            entity_id=package.id,
            action_route=f"/owner/member/{package.member_id}",
            payload={"remaining": package.sessions_remaining},
        )
        if member is not None:
            alert_service.raise_alert(
                db,
                key=alert_service.PT_LOW_BALANCE,
                dedupe_key=f"pt-package:{package.id}:member-low-balance",
                title="PT sessions running low",
                body=f"You have {package.sessions_remaining} PT sessions left.",
                severity=AlertSeverity.WARNING,
                branch_id=package.branch_id,
                target_role=None,
                target_user_id=member.user_id,
                entity_type="pt_package",
                entity_id=package.id,
                action_route="/member/pt",
            )
    return package


def settle_all_packages(db: Session, branch_id: int | None = None) -> int:
    stmt = select(PTPackage).where(PTPackage.status == PackageStatus.ACTIVE)
    if branch_id is not None:
        stmt = stmt.where(PTPackage.branch_id == branch_id)
    changed = 0
    for package in db.scalars(stmt).all():
        before = package.status
        settle_package(db, package)
        if package.status is not before:
            changed += 1
    return changed


# --------------------------------------------------------------- sessions


def next_session_number(db: Session, package: PTPackage) -> int:
    """The position the next booking takes in the package.

    Derived from the highest number already booked rather than from
    ``sessions_used``, so a cancelled session does not hand its slot number to
    the next one and make two sessions both "7 / 20".
    """
    highest = (
        db.scalar(
            select(func.max(PTSession.session_number)).where(PTSession.package_id == package.id)
        )
        or 0
    )
    return int(highest) + 1


def schedule_session(
    db: Session,
    *,
    package: PTPackage,
    trainer_id: int,
    scheduled_start: datetime,
    scheduled_end: datetime | None = None,
    session_date: date | None = None,
) -> PTSession:
    if package.status is not PackageStatus.ACTIVE:
        raise PTError("This PT package is not active.", "package_inactive")

    number = next_session_number(db, package)
    if number > package.sessions_total:
        raise PTError(
            f"All {package.sessions_total} sessions in this package are booked.",
            "package_exhausted",
        )

    trainer = db.get(Trainer, trainer_id)
    if trainer is None or trainer.branch_id != package.branch_id:
        raise PTError(
            "That trainer is not at this member's branch.",
            "trainer_branch_mismatch",
            status.HTTP_400_BAD_REQUEST,
        )

    branch = db.get(Branch, package.branch_id)
    # The session belongs to the *branch's* day, not to UTC's. A 07:00 IST
    # session is 01:30 UTC, so taking `scheduled_start.date()` would file an
    # early-morning session under the previous day and hide it from the
    # trainer's schedule.
    session = PTSession(
        package_id=package.id,
        member_id=package.member_id,
        trainer_id=trainer_id,
        branch_id=package.branch_id,
        session_date=session_date
        or to_branch_time(scheduled_start, branch.timezone if branch else None).date(),
        scheduled_start=scheduled_start,
        scheduled_end=scheduled_end or (scheduled_start + timedelta(hours=1)),
        session_number=number,
        status=SessionStatus.SCHEDULED,
        is_demo=package.is_demo,
    )
    db.add(session)
    db.flush()
    return session


def mark_arrival(
    db: Session, *, session: PTSession, who: str, at: datetime | None = None
) -> PTSession:
    """Record that the member or the trainer has arrived.

    Server clock only — ``at`` exists for the seeder and tests, and no API
    path passes it.
    """
    if session.status in TERMINAL:
        raise PTError("This session is already closed.", "session_closed")

    moment = at or now_utc()
    if who == "member":
        session.member_checked_in_at = session.member_checked_in_at or moment
    elif who == "trainer":
        session.trainer_checked_in_at = session.trainer_checked_in_at or moment
    else:  # pragma: no cover - guarded by the schema
        raise PTError("Unknown participant.", "unknown_party", status.HTTP_400_BAD_REQUEST)

    if session.member_checked_in_at and session.trainer_checked_in_at:
        session.status = SessionStatus.IN_PROGRESS
        session.started_at = session.started_at or moment
    db.flush()
    return session


def complete_session(
    db: Session, *, session: PTSession, completed_by_user_id: int | None, notes: str | None = None
) -> PTSession:
    """Close the session and consume one from the package.

    The guard on ``COMPLETED`` is what keeps ``sessions_used`` truthful — a
    double tap on "complete session" must not burn two of the member's
    sessions.
    """
    if session.status is SessionStatus.COMPLETED:
        return session
    if session.status in (SessionStatus.CANCELLED, SessionStatus.NO_SHOW):
        raise PTError("This session was already closed as not delivered.", "session_closed")

    session.status = SessionStatus.COMPLETED
    session.completed_at = now_utc()
    session.completed_by_user_id = completed_by_user_id
    session.notes = notes or session.notes

    package = db.get(PTPackage, session.package_id)
    if package is not None:
        package.sessions_used = min(package.sessions_total, package.sessions_used + 1)
        db.flush()
        settle_package(db, package)
    db.flush()
    return session


def close_session(
    db: Session, *, session: PTSession, outcome: SessionStatus, notes: str | None = None
) -> PTSession:
    """Cancel or no-show a session. Neither consumes a session from the package."""
    if outcome not in (SessionStatus.CANCELLED, SessionStatus.NO_SHOW, SessionStatus.MISSED):
        raise PTError("Unsupported outcome.", "bad_outcome", status.HTTP_400_BAD_REQUEST)
    if session.status is SessionStatus.COMPLETED:
        raise PTError("This session is already completed.", "session_closed")
    session.status = outcome
    session.notes = notes or session.notes
    db.flush()
    return session


@dataclass
class SplitAttendance:
    """The dual-person PT attendance view: member on one side, trainer on the other."""

    session: PTSession
    member_name: str
    trainer_name: str
    member_checked_in: bool
    trainer_checked_in: bool
    can_complete: bool


def split_view(db: Session, session: PTSession) -> SplitAttendance:
    member = db.get(Member, session.member_id)
    trainer = db.get(Trainer, session.trainer_id)
    return SplitAttendance(
        session=session,
        member_name=member.user.full_name if member and member.user else "Member",
        trainer_name=trainer.user.full_name if trainer and trainer.user else "Trainer",
        member_checked_in=session.member_checked_in_at is not None,
        trainer_checked_in=session.trainer_checked_in_at is not None,
        # Both parties must be recorded present before the session can be
        # closed as delivered — that is the whole point of the split view.
        can_complete=(
            session.member_checked_in_at is not None
            and session.trainer_checked_in_at is not None
            and session.status not in TERMINAL
        ),
    )


def sessions_for_trainer(
    db: Session, trainer_id: int, on: date, limit: int = 50
) -> list[PTSession]:
    return list(
        db.scalars(
            select(PTSession)
            .where(PTSession.trainer_id == trainer_id, PTSession.session_date == on)
            .order_by(PTSession.scheduled_start)
            .limit(limit)
        ).all()
    )


def sessions_for_member(
    db: Session, member_id: int, *, limit: int = 30, offset: int = 0
) -> list[PTSession]:
    return list(
        db.scalars(
            select(PTSession)
            .where(PTSession.member_id == member_id)
            .order_by(PTSession.scheduled_start.desc())
            .offset(offset)
            .limit(limit)
        ).all()
    )


def next_session(db: Session, member_id: int) -> PTSession | None:
    return db.scalar(
        select(PTSession)
        .where(
            PTSession.member_id == member_id,
            PTSession.status.in_([SessionStatus.SCHEDULED, SessionStatus.IN_PROGRESS]),
            PTSession.scheduled_start >= now_utc() - timedelta(hours=3),
        )
        .order_by(PTSession.scheduled_start)
    )


def utilisation(db: Session, branch_ids: list[int] | None, start: date, end: date) -> dict:
    """PT delivery over a window — booked versus actually delivered."""
    stmt = select(PTSession.status, func.count()).where(
        PTSession.session_date >= start, PTSession.session_date <= end
    )
    if branch_ids is not None:
        stmt = stmt.where(PTSession.branch_id.in_(branch_ids))
    counts = {row[0]: int(row[1]) for row in db.execute(stmt.group_by(PTSession.status)).all()}

    booked = sum(counts.values())
    completed = counts.get(SessionStatus.COMPLETED, 0)
    return {
        "booked": booked,
        "completed": completed,
        "cancelled": counts.get(SessionStatus.CANCELLED, 0),
        "no_show": counts.get(SessionStatus.NO_SHOW, 0),
        "utilisation_pct": round(completed * 100 / booked, 1) if booked else 0.0,
    }


__all__ = [
    "PTError",
    "SplitAttendance",
    "active_package",
    "close_session",
    "complete_session",
    "create_package",
    "latest_package",
    "mark_arrival",
    "next_session",
    "next_session_number",
    "package_options",
    "schedule_session",
    "sessions_for_member",
    "sessions_for_trainer",
    "settle_all_packages",
    "settle_package",
    "split_view",
    "utilisation",
]

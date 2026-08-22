"""Check-in / check-out.

Every decision in here uses the server clock. The request body carries *what*
happened (which branch, which method, which credential) and never *when* — a
phone with a wound-forward clock changes nothing.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from datetime import date, timedelta

from fastapi import HTTPException, Request, status
from sqlalchemy import and_, func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, joinedload

from app.core.clock import branch_today, now_utc, to_branch_time
from app.core.config import settings
from app.core.security import verify_pin
from app.db.models import (
    AttendanceEvent,
    AttendanceStatus,
    Branch,
    CaptureMethod,
    EventType,
    Member,
    Membership,
    MembershipStatus,
    PersonType,
    Shift,
    Trainer,
    TrainerAttendance,
    User,
)
from app.domain import pt_eligibility
from app.domain import qr as qr_domain
from app.domain.shift_engine import (
    DEFAULT_EARLY_EXIT_GRACE_MINUTES,
    DEFAULT_GRACE_MINUTES,
    ScheduledShift,
    ShiftRules,
    classify,
    resolve_shift,
    worked_minutes,
)
from app.services import audit, settings_service

logger = logging.getLogger("gymflow.attendance")


class AttendanceError(HTTPException):
    """A rule violation the trainer can act on, rendered as a clear message."""

    def __init__(self, detail: str, code: str, status_code: int = status.HTTP_409_CONFLICT):
        super().__init__(status_code=status_code, detail={"code": code, "message": detail})


# ------------------------------------------------------------ credentials


def verify_branch_credential(
    db: Session,
    *,
    branch: Branch,
    user: User,
    method: CaptureMethod,
    qr_token: str | None,
    pin: str | None,
) -> None:
    """Prove the person is at this branch and is who they claim to be.

    QR proves *location* (the code only exists on the branch's screen and
    rotates), PIN proves *identity*. Both are checked against server state.
    """
    enabled = settings_service.get_setting(db, "attendance.methods_enabled", branch.id) or []
    if method.value not in enabled:
        raise AttendanceError(
            f"{method.value.upper()} check-in is not enabled for this branch",
            "method_disabled",
            status.HTTP_400_BAD_REQUEST,
        )

    if method is CaptureMethod.QR:
        if not qr_token or not qr_domain.verify_token(qr_token, branch.id, branch.qr_secret):
            raise AttendanceError(
                "That QR code is not valid for this branch right now. Scan the code on the branch screen again.",
                "invalid_qr",
                status.HTTP_400_BAD_REQUEST,
            )
        return

    if method is CaptureMethod.PIN:
        if not pin or not verify_pin(pin, user.pin_hash):
            raise AttendanceError("Incorrect PIN.", "invalid_pin", status.HTTP_401_UNAUTHORIZED)
        return

    if method is CaptureMethod.FINGERPRINT:
        if not settings.access_control_enabled:
            raise AttendanceError(
                f"{method.value} capture is not available in this version",
                "method_unsupported",
                status.HTTP_400_BAD_REQUEST,
            )
        # Nothing left to check here: identity (which member scanned) and
        # device authenticity (which terminal, with what secret) are both
        # already established upstream, before this function is ever
        # reached — see app/api/v1/hardware.py and
        # app/integrations/access_control/x2008.py. This function only
        # confirms the branch has opted the method into
        # attendance.methods_enabled, which the check above already did.
        return

    raise AttendanceError(
        f"{method.value} capture is not available in this version",
        "method_unsupported",
        status.HTTP_400_BAD_REQUEST,
    )


# ----------------------------------------------------------------- shifts


def shift_rules_for(db: Session, branch_id: int, shift: Shift | None) -> ShiftRules:
    """Per-shift override → branch setting → global setting → code default."""
    grace = shift.grace_minutes if shift and shift.grace_minutes is not None else None
    if grace is None:
        grace = settings_service.get_setting(db, "shift.grace_minutes", branch_id)
    early = (
        shift.early_exit_grace_minutes
        if shift and shift.early_exit_grace_minutes is not None
        else None
    )
    if early is None:
        early = settings_service.get_setting(db, "shift.early_exit_grace_minutes", branch_id)
    return ShiftRules(
        grace_minutes=int(grace if grace is not None else DEFAULT_GRACE_MINUTES),
        early_exit_grace_minutes=int(
            early if early is not None else DEFAULT_EARLY_EXIT_GRACE_MINUTES
        ),
    )


def find_shift(db: Session, trainer: Trainer, work_date: date) -> Shift | None:
    stmt = (
        select(Shift)
        .where(
            Shift.trainer_id == trainer.id,
            Shift.weekday == work_date.weekday(),
            Shift.is_active.is_(True),
            (Shift.effective_from.is_(None)) | (Shift.effective_from <= work_date),
            (Shift.effective_to.is_(None)) | (Shift.effective_to >= work_date),
        )
        .order_by(Shift.start_time)
    )
    return db.scalars(stmt).first()


def scheduled_shift_for(
    db: Session, trainer: Trainer, branch: Branch, work_date: date
) -> ScheduledShift | None:
    shift = find_shift(db, trainer, work_date)
    if shift is None:
        return None
    return resolve_shift(
        work_date=work_date,
        start_time=shift.start_time,
        end_time=shift.end_time,
        timezone_name=branch.timezone,
        rules=shift_rules_for(db, branch.id, shift),
        shift_id=shift.id,
    )


# ------------------------------------------------------------ daily record


def get_or_create_day(
    db: Session, trainer: Trainer, branch: Branch, work_date: date
) -> TrainerAttendance:
    record = db.scalar(
        select(TrainerAttendance).where(
            TrainerAttendance.trainer_id == trainer.id,
            TrainerAttendance.work_date == work_date,
        )
    )
    if record is not None:
        return record

    scheduled = scheduled_shift_for(db, trainer, branch, work_date)
    record = TrainerAttendance(
        trainer_id=trainer.id,
        branch_id=branch.id,
        work_date=work_date,
        shift_id=scheduled.shift_id if scheduled else None,
        scheduled_start=scheduled.start_at if scheduled else None,
        scheduled_end=scheduled.end_at if scheduled else None,
        grace_minutes=scheduled.rules.grace_minutes if scheduled else DEFAULT_GRACE_MINUTES,
        early_exit_grace_minutes=(
            scheduled.rules.early_exit_grace_minutes
            if scheduled
            else DEFAULT_EARLY_EXIT_GRACE_MINUTES
        ),
        status=AttendanceStatus.SCHEDULED,
    )
    db.add(record)
    db.flush()
    return record


def _shift_from_record(record: TrainerAttendance) -> ScheduledShift | None:
    if record.scheduled_start is None or record.scheduled_end is None:
        return None
    return ScheduledShift(
        work_date=record.work_date,
        start_at=record.scheduled_start,
        end_at=record.scheduled_end,
        rules=ShiftRules(
            grace_minutes=record.grace_minutes,
            early_exit_grace_minutes=record.early_exit_grace_minutes,
        ),
        shift_id=record.shift_id,
    )


def recompute(record: TrainerAttendance) -> TrainerAttendance:
    """Re-derive status from the stored facts. Safe to call repeatedly."""
    shift = _shift_from_record(record)
    day_is_over = shift is not None and now_utc() >= shift.end_at
    if shift is None:
        # Without a roster, "over" means the branch day has rolled past.
        day_is_over = now_utc().date() > record.work_date

    status_value, late, early = classify(
        shift=shift,
        check_in_at=record.check_in_at,
        check_out_at=record.check_out_at,
        day_is_over=day_is_over,
    )
    record.status = status_value
    record.late_minutes = late
    record.early_exit_minutes = early
    record.worked_minutes = worked_minutes(record.check_in_at, record.check_out_at)
    return record


# ---------------------------------------------------------------- actions


@dataclass
class CheckResult:
    record: TrainerAttendance
    event: AttendanceEvent
    server_time: str
    message: str


def _window_guard(db: Session, branch: Branch, shift: ScheduledShift | None) -> None:
    """Reject check-ins wildly outside the rostered window.

    Without this a trainer could open the app at 3 AM and bank an on-time mark
    for an 18:00 shift.
    """
    if shift is None:
        return
    before = int(
        settings_service.get_setting(db, "attendance.allow_checkin_before_shift_minutes", branch.id)
    )
    after = int(
        settings_service.get_setting(db, "attendance.allow_checkin_after_shift_minutes", branch.id)
    )
    now = now_utc()
    if now < shift.start_at - timedelta(minutes=before):
        raise AttendanceError(
            "Too early to check in for this shift.", "too_early", status.HTTP_400_BAD_REQUEST
        )
    if now > shift.end_at + timedelta(minutes=after):
        raise AttendanceError(
            "This shift has already closed. Ask your manager to record it.",
            "window_closed",
            status.HTTP_400_BAD_REQUEST,
        )


def trainer_check_in(
    db: Session,
    *,
    user: User,
    trainer: Trainer,
    branch: Branch,
    method: CaptureMethod,
    qr_token: str | None = None,
    pin: str | None = None,
    device_info: str | None = None,
    request: Request | None = None,
) -> CheckResult:
    if trainer.branch_id != branch.id:
        raise AttendanceError(
            "You are not assigned to this branch.",
            "branch_mismatch",
            status.HTTP_403_FORBIDDEN,
        )
    if not trainer.is_active:
        raise AttendanceError(
            "This trainer account is inactive.", "inactive", status.HTTP_403_FORBIDDEN
        )

    verify_branch_credential(
        db, branch=branch, user=user, method=method, qr_token=qr_token, pin=pin
    )

    work_date = branch_today(branch.timezone)
    record = get_or_create_day(db, trainer, branch, work_date)

    if record.check_in_at is not None:
        raise AttendanceError("You are already checked in for today's shift.", "already_checked_in")

    _window_guard(db, branch, _shift_from_record(record))

    moment = now_utc()
    record.check_in_at = moment
    record.check_in_method = method
    recompute(record)

    event = AttendanceEvent(
        branch_id=branch.id,
        person_type=PersonType.TRAINER,
        user_id=user.id,
        event_type=EventType.CHECK_IN,
        method=method,
        occurred_at=moment,
        work_date=work_date,
        source_ip=audit.client_ip(request),
        device_info=(device_info or "")[:255] or None,
    )
    db.add(event)
    db.flush()

    audit.record(
        db,
        action=audit.ACTION_CHECK_IN,
        actor=user,
        entity_type="trainer_attendance",
        entity_id=record.id,
        branch_id=branch.id,
        request=request,
        details={
            "method": method.value,
            "status": record.status.value,
            "late_minutes": record.late_minutes,
            "work_date": work_date.isoformat(),
        },
    )

    local = to_branch_time(moment, branch.timezone)
    if record.status is AttendanceStatus.LATE:
        message = f"Checked in {record.late_minutes} min late."
    else:
        message = "Checked in on time."
    return CheckResult(record=record, event=event, server_time=local.isoformat(), message=message)


def trainer_check_out(
    db: Session,
    *,
    user: User,
    trainer: Trainer,
    branch: Branch,
    method: CaptureMethod,
    qr_token: str | None = None,
    pin: str | None = None,
    device_info: str | None = None,
    request: Request | None = None,
) -> CheckResult:
    if trainer.branch_id != branch.id:
        raise AttendanceError(
            "You are not assigned to this branch.",
            "branch_mismatch",
            status.HTTP_403_FORBIDDEN,
        )

    verify_branch_credential(
        db, branch=branch, user=user, method=method, qr_token=qr_token, pin=pin
    )

    work_date = branch_today(branch.timezone)
    record = db.scalar(
        select(TrainerAttendance).where(
            TrainerAttendance.trainer_id == trainer.id,
            TrainerAttendance.work_date == work_date,
        )
    )

    # An overnight shift is checked out on the *next* calendar day, so fall back
    # to yesterday's still-open record before declaring there was no check-in.
    if record is None or record.check_in_at is None:
        previous = db.scalar(
            select(TrainerAttendance).where(
                TrainerAttendance.trainer_id == trainer.id,
                TrainerAttendance.work_date == work_date - timedelta(days=1),
                TrainerAttendance.check_in_at.isnot(None),
                TrainerAttendance.check_out_at.is_(None),
            )
        )
        if (
            previous is not None
            and previous.scheduled_end
            and now_utc() <= previous.scheduled_end + timedelta(hours=6)
        ):
            record = previous

    if record is None or record.check_in_at is None:
        raise AttendanceError(
            "You have not checked in yet, so there is nothing to check out of.",
            "not_checked_in",
        )
    if record.check_out_at is not None:
        raise AttendanceError("You have already checked out today.", "already_checked_out")

    moment = now_utc()
    record.check_out_at = moment
    record.check_out_method = method
    recompute(record)

    event = AttendanceEvent(
        branch_id=branch.id,
        person_type=PersonType.TRAINER,
        user_id=user.id,
        event_type=EventType.CHECK_OUT,
        method=method,
        occurred_at=moment,
        work_date=record.work_date,
        source_ip=audit.client_ip(request),
        device_info=(device_info or "")[:255] or None,
    )
    db.add(event)
    db.flush()

    audit.record(
        db,
        action=audit.ACTION_CHECK_OUT,
        actor=user,
        entity_type="trainer_attendance",
        entity_id=record.id,
        branch_id=branch.id,
        request=request,
        details={
            "method": method.value,
            "status": record.status.value,
            "early_exit_minutes": record.early_exit_minutes,
            "worked_minutes": record.worked_minutes,
        },
    )

    local = to_branch_time(moment, branch.timezone)
    if record.early_exit_minutes:
        message = f"Checked out {record.early_exit_minutes} min before shift end."
    else:
        message = "Shift completed."
    return CheckResult(record=record, event=event, server_time=local.isoformat(), message=message)


# --------------------------------------------------------- member presence


def _write_member_event(
    db: Session,
    *,
    user: User,
    member: Member,
    branch: Branch,
    event_type: EventType,
    method: CaptureMethod,
    request: Request | None = None,
    device_info: str | None = None,
    external_event_id: str | None = None,
) -> AttendanceEvent:
    """The one place a member `AttendanceEvent` row is actually constructed.

    Both the interactive app path (`member_event`, below) and the hardware
    push path (`record_fingerprint_scan`) call this after they have each done
    their own, different, credential/identity check — so there is exactly one
    write path for a member attendance event, not two that could drift apart.
    """
    moment = now_utc()
    work_date = branch_today(branch.timezone)
    event = AttendanceEvent(
        branch_id=branch.id,
        person_type=PersonType.MEMBER,
        user_id=user.id,
        event_type=event_type,
        method=method,
        occurred_at=moment,
        work_date=work_date,
        source_ip=audit.client_ip(request),
        device_info=(device_info or "")[:255] or None,
        external_event_id=external_event_id,
    )
    db.add(event)
    db.flush()
    audit.record(
        db,
        action=(
            audit.ACTION_CHECK_IN if event_type is EventType.CHECK_IN else audit.ACTION_CHECK_OUT
        ),
        actor=user,
        entity_type="member",
        entity_id=member.id,
        branch_id=branch.id,
        request=request,
        details={"method": method.value},
    )
    return event


def member_event(
    db: Session,
    *,
    user: User,
    member: Member,
    branch: Branch,
    event_type: EventType,
    method: CaptureMethod,
    qr_token: str | None = None,
    pin: str | None = None,
    request: Request | None = None,
    device_info: str | None = None,
) -> AttendanceEvent:
    """Interactive path: the member's own phone (or a staff-witnessed
    action) tells us what happened, so a second check-in while already
    inside is a mistake worth rejecting with a clear message.
    """
    if member.branch_id != branch.id:
        raise AttendanceError(
            "You are not registered at this branch.",
            "branch_mismatch",
            status.HTTP_403_FORBIDDEN,
        )
    verify_branch_credential(
        db, branch=branch, user=user, method=method, qr_token=qr_token, pin=pin
    )

    work_date = branch_today(branch.timezone)
    inside = is_inside(db, user.id, branch.id, work_date)
    if event_type is EventType.CHECK_IN and inside:
        raise AttendanceError("You are already checked in.", "already_checked_in")
    if event_type is EventType.CHECK_OUT and not inside:
        raise AttendanceError("You are not checked in.", "not_checked_in")

    return _write_member_event(
        db,
        user=user,
        member=member,
        branch=branch,
        event_type=event_type,
        method=method,
        request=request,
        device_info=device_info,
    )


def record_fingerprint_scan(
    db: Session,
    *,
    member: Member,
    branch: Branch,
    device_info: str | None,
    external_event_id: str,
    request: Request | None = None,
) -> AttendanceEvent:
    """Write one attendance event from an already-authenticated,
    already-identity-resolved fingerprint scan.

    Called only by the ADMS push receiver (``app/api/v1/hardware.py``), after
    it has (a) authenticated the terminal via the shared secret / device
    registry and (b) resolved the scan's enrolled-id to a GymFlow member
    through ``FingerprintEnrollment`` — this function never sees a
    fingerprint template, only the member that identifier already resolved
    to.

    Two things differ deliberately from ``member_event``:

    * **Idempotent by `external_event_id`.** ADMS terminals routinely resend
      their attendance backlog (a dropped connection, a retried batch); a
      duplicate delivery must return the same row rather than a second visit.
      Guarded with a nested transaction so a duplicate found by one record in
      a batch cannot roll back the records already written earlier in the
      same batch/request.
    * **Direction is inferred, not asserted.** A passive terminal has no
      screen to show "you are already checked in" to, so instead of
      `member_event`'s reject-on-mismatch behaviour, the event type toggles
      off whichever state the member is currently in — the same "latest
      event wins" definition `is_inside`/`branch_occupancy` already use to
      read occupancy back out.

    **Membership-gated, not PT-package-gated.** A fingerprint scan records a
    gym visit, which is a membership question, not a PT question — a member
    whose PT package is exhausted or paused can still walk in on an active
    membership. This reuses the same effective-membership computation
    ``app.domain.pt_eligibility`` already established for PT eligibility
    rather than re-deriving "is this membership active" a second way here.
    """
    if not settings.access_control_enabled:
        raise AttendanceError(
            "fingerprint capture is not available in this version",
            "method_unsupported",
            status.HTTP_400_BAD_REQUEST,
        )
    if member.branch_id != branch.id:
        raise AttendanceError(
            "Member is not registered at this branch.",
            "branch_mismatch",
            status.HTTP_403_FORBIDDEN,
        )

    work_date = branch_today(branch.timezone)
    membership = db.scalar(
        select(Membership)
        .where(Membership.member_id == member.id)
        .order_by(Membership.ends_on.desc())
    )
    effective_status = (
        pt_eligibility.effective_membership_status(membership.status, membership.ends_on, work_date)
        if membership is not None
        else None
    )
    if effective_status is not MembershipStatus.ACTIVE:
        logger.warning(
            "fingerprint_scan_denied reason=membership_expired member_id=%s branch_id=%s "
            "external_event_id=%s",
            member.id,
            branch.id,
            external_event_id,
        )
        raise AttendanceError(
            "Membership is not active. Access denied.",
            "membership_expired",
            status.HTTP_403_FORBIDDEN,
        )

    verify_branch_credential(
        db,
        branch=branch,
        user=member.user,
        method=CaptureMethod.FINGERPRINT,
        qr_token=None,
        pin=None,
    )

    existing = db.scalar(
        select(AttendanceEvent).where(AttendanceEvent.external_event_id == external_event_id)
    )
    if existing is not None:
        logger.info(
            "fingerprint_scan_duplicate member_id=%s branch_id=%s external_event_id=%s "
            "existing_event_id=%s",
            member.id,
            branch.id,
            external_event_id,
            existing.id,
        )
        return existing
    inside = is_inside(db, member.user_id, branch.id, work_date)
    event_type = EventType.CHECK_OUT if inside else EventType.CHECK_IN

    try:
        with db.begin_nested():
            event = _write_member_event(
                db,
                user=member.user,
                member=member,
                branch=branch,
                event_type=event_type,
                method=CaptureMethod.FINGERPRINT,
                request=request,
                device_info=device_info,
                external_event_id=external_event_id,
            )
    except IntegrityError:
        # A concurrent request (or an earlier record in the same batch,
        # already committed to this savepoint) won the race on the same
        # external_event_id — resolve to that row instead of erroring.
        existing = db.scalar(
            select(AttendanceEvent).where(AttendanceEvent.external_event_id == external_event_id)
        )
        if existing is not None:
            logger.info(
                "fingerprint_scan_duplicate_race member_id=%s branch_id=%s "
                "external_event_id=%s existing_event_id=%s",
                member.id,
                branch.id,
                external_event_id,
                existing.id,
            )
            return existing
        raise
    logger.info(
        "fingerprint_scan_recorded member_id=%s branch_id=%s event_type=%s "
        "external_event_id=%s attendance_event_id=%s",
        member.id,
        branch.id,
        event_type.value,
        external_event_id,
        event.id,
    )
    return event


def is_inside(db: Session, user_id: int, branch_id: int, work_date: date) -> bool:
    last = db.scalar(
        select(AttendanceEvent)
        .where(
            AttendanceEvent.user_id == user_id,
            AttendanceEvent.branch_id == branch_id,
            AttendanceEvent.work_date == work_date,
        )
        .order_by(AttendanceEvent.occurred_at.desc(), AttendanceEvent.id.desc())
        .limit(1)
    )
    return last is not None and last.event_type is EventType.CHECK_IN


def branch_occupancy(db: Session, branch: Branch) -> dict:
    """Members currently inside, derived from the raw event log.

    "Inside" is defined per person as: their most recent event today is a
    check-in. That keeps occupancy correct without a separate presence table
    that could drift from the events it is meant to summarise.
    """
    work_date = branch_today(branch.timezone)
    latest = (
        select(
            AttendanceEvent.user_id.label("user_id"),
            func.max(AttendanceEvent.occurred_at).label("last_at"),
        )
        .where(
            AttendanceEvent.branch_id == branch.id,
            AttendanceEvent.work_date == work_date,
            AttendanceEvent.person_type == PersonType.MEMBER,
        )
        .group_by(AttendanceEvent.user_id)
        .subquery()
    )
    inside = (
        db.scalar(
            select(func.count())
            .select_from(AttendanceEvent)
            .join(
                latest,
                and_(
                    AttendanceEvent.user_id == latest.c.user_id,
                    AttendanceEvent.occurred_at == latest.c.last_at,
                ),
            )
            .where(
                AttendanceEvent.branch_id == branch.id,
                AttendanceEvent.work_date == work_date,
                AttendanceEvent.person_type == PersonType.MEMBER,
                AttendanceEvent.event_type == EventType.CHECK_IN,
            )
        )
        or 0
    )

    entries = (
        db.scalar(
            select(func.count())
            .select_from(AttendanceEvent)
            .where(
                AttendanceEvent.branch_id == branch.id,
                AttendanceEvent.work_date == work_date,
                AttendanceEvent.person_type == PersonType.MEMBER,
                AttendanceEvent.event_type == EventType.CHECK_IN,
            )
        )
        or 0
    )
    exits = (
        db.scalar(
            select(func.count())
            .select_from(AttendanceEvent)
            .where(
                AttendanceEvent.branch_id == branch.id,
                AttendanceEvent.work_date == work_date,
                AttendanceEvent.person_type == PersonType.MEMBER,
                AttendanceEvent.event_type == EventType.CHECK_OUT,
            )
        )
        or 0
    )

    capacity = branch.capacity or 0
    pct = round(inside * 100 / capacity, 1) if capacity else 0.0
    if pct >= 75:
        level = "High"
    elif pct >= 40:
        level = "Medium"
    else:
        level = "Low"

    return {
        "branch_id": branch.id,
        "branch_name": branch.name,
        "inside": int(inside),
        "capacity": capacity,
        "occupancy_pct": pct,
        "crowd_level": level,
        "entries_today": int(entries),
        "exits_today": int(exits),
        "as_of": now_utc().isoformat(),
    }


def close_stale_days(db: Session, branch: Branch, up_to: date | None = None) -> int:
    """Settle finished days: mark no-shows ABSENT and open shifts MISSING CHECKOUT.

    Idempotent, so it can be run from a scheduler, a manager action or a test
    without special-casing which one is calling.
    """
    cutoff = up_to or branch_today(branch.timezone)
    rows = db.scalars(
        select(TrainerAttendance).where(
            TrainerAttendance.branch_id == branch.id,
            TrainerAttendance.work_date <= cutoff,
            TrainerAttendance.status.in_(
                [AttendanceStatus.SCHEDULED, AttendanceStatus.ON_TIME, AttendanceStatus.LATE]
            ),
        )
    ).all()
    changed = 0
    for row in rows:
        before = row.status
        recompute(row)
        if row.status is not before:
            changed += 1
    db.flush()
    return changed


def ensure_days_exist(db: Session, branch: Branch, work_date: date) -> list[TrainerAttendance]:
    """Materialise a row for every trainer rostered at this branch that day.

    Absence only becomes visible once the expected day exists, so the owner
    dashboard depends on this having been run for the date it is showing.
    """
    trainers = db.scalars(
        select(Trainer).where(Trainer.branch_id == branch.id, Trainer.is_active.is_(True))
    ).all()
    rows: list[TrainerAttendance] = []
    for trainer in trainers:
        if find_shift(db, trainer, work_date) is None:
            continue
        row = get_or_create_day(db, trainer, branch, work_date)
        recompute(row)
        rows.append(row)
    db.flush()
    return rows


__all__ = [
    "AttendanceError",
    "CheckResult",
    "branch_occupancy",
    "close_stale_days",
    "ensure_days_exist",
    "find_shift",
    "get_or_create_day",
    "is_inside",
    "member_event",
    "record_fingerprint_scan",
    "recompute",
    "scheduled_shift_for",
    "shift_rules_for",
    "trainer_check_in",
    "trainer_check_out",
    "verify_branch_credential",
]


def who_is_inside(db: Session, branch: Branch) -> list[dict]:
    """The members currently in the building, and since when.

    Uses the same definition as `branch_occupancy` — a person is inside when
    their most recent event today is a check-in — so the list and the count can
    never disagree. Deriving both from the event log rather than a presence
    table is also what makes a duplicate scan harmless: the latest event wins,
    and two check-ins in a row still mean one person inside.

    The integration point for eSSL is upstream of this. Whatever writes
    `AttendanceEvent` — QR, PIN, or a turnstile sync — this reads the same rows.
    """
    work_date = branch_today(branch.timezone)
    latest = (
        select(
            AttendanceEvent.user_id.label("user_id"),
            func.max(AttendanceEvent.occurred_at).label("last_at"),
        )
        .where(
            AttendanceEvent.branch_id == branch.id,
            AttendanceEvent.work_date == work_date,
            AttendanceEvent.person_type == PersonType.MEMBER,
        )
        .group_by(AttendanceEvent.user_id)
        .subquery()
    )

    rows = db.execute(
        select(AttendanceEvent, Member)
        .join(
            latest,
            and_(
                AttendanceEvent.user_id == latest.c.user_id,
                AttendanceEvent.occurred_at == latest.c.last_at,
            ),
        )
        .join(Member, Member.user_id == AttendanceEvent.user_id)
        .options(joinedload(Member.user))
        .where(
            AttendanceEvent.branch_id == branch.id,
            AttendanceEvent.work_date == work_date,
            AttendanceEvent.person_type == PersonType.MEMBER,
            AttendanceEvent.event_type == EventType.CHECK_IN,
        )
        .order_by(AttendanceEvent.occurred_at)
    ).all()

    now = now_utc()
    out = []
    for event, member in rows:
        minutes = max(0, int((now - event.occurred_at).total_seconds() // 60))
        out.append(
            {
                "member_id": member.id,
                "member_code": member.member_code,
                "full_name": member.user.full_name,
                "branch_id": branch.id,
                "checked_in_at": event.occurred_at,
                "minutes_inside": minutes,
                "method": event.method,
            }
        )
    return out

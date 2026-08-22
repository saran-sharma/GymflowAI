"""Trainer roster, shifts and the trainer detail screen."""

from __future__ import annotations

from datetime import date, timedelta

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy import select
from sqlalchemy.orm import Session, joinedload

from app.core.clock import branch_today, now_utc
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
    Journey,
    Member,
    Membership,
    PersonType,
    PTPackage,
    PTSession,
    SessionStatus,
    Shift,
    Trainer,
    TrainerAttendance,
    TrainerAvailability,
    User,
    WorkoutSession,
)
from app.db.session import get_db
from app.domain import pt_eligibility
from app.schemas.common import (
    AttendanceDayOut,
    MessageOut,
    ShiftOut,
    ShiftUpsert,
    TrainerDetailOut,
    TrainerOut,
)
from app.schemas.training import (
    ActivityEntryOut,
    AvailabilitySlotOut,
    PublishAvailabilityRequest,
    TrainerClientDetailOut,
    TrainerClientOut,
)
from app.services import (
    activity_service,
    attendance_service,
    audit,
    incentive_service,
    journey_service,
    pt_service,
)

from .journeys import journey_out, workout_out
from .pt import package_out, session_out

router = APIRouter(prefix="/trainers", tags=["trainers"])

WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]


def trainer_out(trainer: Trainer) -> TrainerOut:
    return TrainerOut(
        id=trainer.id,
        user_id=trainer.user_id,
        full_name=trainer.user.full_name,
        email=trainer.user.email,
        phone=trainer.user.phone,
        employee_code=trainer.employee_code,
        designation=trainer.designation,
        specialty=trainer.specialty,
        branch_id=trainer.branch_id,
        branch_name=trainer.branch.name,
        is_active=trainer.is_active,
    )


def load_trainer(db: Session, trainer_id: int) -> Trainer:
    trainer = db.scalar(
        select(Trainer)
        .options(joinedload(Trainer.user), joinedload(Trainer.branch))
        .where(Trainer.id == trainer_id)
    )
    if trainer is None:
        raise HTTPException(status_code=404, detail="Trainer not found")
    return trainer


def shift_label(shift: Shift | None, branch: Branch) -> str | None:
    if shift is None:
        return None
    return f"{shift.start_time.strftime('%H:%M')} – {shift.end_time.strftime('%H:%M')}"


@router.get("", response_model=list[TrainerOut])
def list_trainers(
    branch_id: int | None = Query(default=None),
    include_inactive: bool = Query(default=False),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> list[TrainerOut]:
    """Visible roster.

    A trainer sees only their own row; anyone else sees the branches their role
    grants. Both are the same query with a different filter, so there is no
    endpoint that forgets to scope.
    """
    stmt = (
        select(Trainer)
        .options(joinedload(Trainer.user), joinedload(Trainer.branch))
        .order_by(Trainer.employee_code)
    )
    if not include_inactive:
        stmt = stmt.where(Trainer.is_active.is_(True))

    if user.role.key == "trainer":
        stmt = stmt.where(Trainer.user_id == user.id)
    else:
        allowed = scoped_branch_filter(user, branch_id)
        if allowed is not None:
            stmt = stmt.where(Trainer.branch_id.in_(allowed))

    return [trainer_out(t) for t in db.scalars(stmt).all()]


@router.get("/{trainer_id}", response_model=TrainerDetailOut)
def trainer_detail(
    trainer_id: int,
    month: date | None = Query(default=None, description="Any day in the month to summarise"),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> TrainerDetailOut:
    trainer = load_trainer(db, trainer_id)
    if user.role.key == "trainer" and trainer.user_id != user.id:
        raise HTTPException(status_code=403, detail="You can only view your own record")
    assert_branch_access(user, trainer.branch_id)

    work_date = branch_today(trainer.branch.timezone)
    period = month or work_date
    period_start, period_end = incentive_service.month_bounds(period)

    today = db.scalar(
        select(TrainerAttendance).where(
            TrainerAttendance.trainer_id == trainer.id,
            TrainerAttendance.work_date == work_date,
        )
    )
    if today is None:
        scheduled = attendance_service.scheduled_shift_for(db, trainer, trainer.branch, work_date)
        if scheduled is not None:
            today = attendance_service.get_or_create_day(db, trainer, trainer.branch, work_date)
    if today is not None:
        attendance_service.recompute(today)

    summary, outcome, _rule = incentive_service.evaluate_trainer(
        db, trainer, period_start, period_end
    )
    shift = attendance_service.find_shift(db, trainer, work_date)

    return TrainerDetailOut(
        trainer=trainer_out(trainer),
        current_status=today.status if today else AttendanceStatus.SCHEDULED,
        today=AttendanceDayOut.model_validate(today) if today else None,
        shift_label=shift_label(shift, trainer.branch),
        month_punctuality_pct=summary.punctuality_pct,
        month_attendance_pct=summary.attendance_pct,
        late_count=summary.late_count,
        early_exit_count=summary.early_exit_count,
        absent_count=summary.absent_count,
        missing_checkout_count=summary.missing_checkout_count,
        completed_shifts=summary.completed_shifts,
        scheduled_shifts=summary.scheduled_shifts,
        incentive_status=outcome.status,
        incentive_checks=outcome.as_dict()["checks"],
        incentive_disclaimer=outcome.disclaimer,
    )


@router.get("/{trainer_id}/shifts", response_model=list[ShiftOut])
def list_shifts(
    trainer_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> list[Shift]:
    trainer = load_trainer(db, trainer_id)
    if user.role.key == "trainer" and trainer.user_id != user.id:
        raise HTTPException(status_code=403, detail="You can only view your own shifts")
    assert_branch_access(user, trainer.branch_id)
    return list(
        db.scalars(
            select(Shift)
            .where(Shift.trainer_id == trainer.id)
            .order_by(Shift.weekday, Shift.start_time)
        ).all()
    )


@router.put("/{trainer_id}/shifts", response_model=list[ShiftOut])
def replace_shifts(
    trainer_id: int,
    payload: list[ShiftUpsert],
    request: Request,
    db: Session = Depends(get_db),
    user: User = Depends(require_management),
) -> list[Shift]:
    """Replace a trainer's weekly roster.

    Existing rows are deactivated rather than deleted so historical attendance
    keeps pointing at the shift it was actually judged against.
    """
    trainer = load_trainer(db, trainer_id)
    assert_branch_access(user, trainer.branch_id)

    today = branch_today(trainer.branch.timezone)
    for existing in db.scalars(
        select(Shift).where(Shift.trainer_id == trainer.id, Shift.is_active.is_(True))
    ).all():
        existing.is_active = False
        existing.effective_to = existing.effective_to or today

    created: list[Shift] = []
    for item in payload:
        shift = Shift(
            trainer_id=trainer.id,
            branch_id=trainer.branch_id,
            weekday=item.weekday,
            start_time=item.start_time,
            end_time=item.end_time,
            grace_minutes=item.grace_minutes,
            early_exit_grace_minutes=item.early_exit_grace_minutes,
            effective_from=today,
            is_active=item.is_active,
        )
        db.add(shift)
        created.append(shift)
    db.flush()

    audit.record(
        db,
        action=audit.ACTION_SHIFT_CHANGE,
        actor=user,
        entity_type="trainer",
        entity_id=trainer.id,
        branch_id=trainer.branch_id,
        request=request,
        details={"shifts": len(created)},
    )
    return created


@router.get("/{trainer_id}/attendance", response_model=list[AttendanceDayOut])
def trainer_attendance_history(
    trainer_id: int,
    start: date | None = Query(default=None),
    end: date | None = Query(default=None),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> list[TrainerAttendance]:
    trainer = load_trainer(db, trainer_id)
    if user.role.key == "trainer" and trainer.user_id != user.id:
        raise HTTPException(status_code=403, detail="You can only view your own attendance")
    assert_branch_access(user, trainer.branch_id)

    today = branch_today(trainer.branch.timezone)
    period_start, period_end = incentive_service.month_bounds(today)
    stmt = (
        select(TrainerAttendance)
        .where(
            TrainerAttendance.trainer_id == trainer.id,
            TrainerAttendance.work_date >= (start or period_start),
            TrainerAttendance.work_date <= (end or period_end),
        )
        .order_by(TrainerAttendance.work_date.desc())
    )
    rows = list(db.scalars(stmt).all())
    for row in rows:
        attendance_service.recompute(row)
    return rows


__all__ = ["WEEKDAYS", "load_trainer", "router", "shift_label", "trainer_out"]


# ------------------------------------------------------------------ clients


def _my_trainer(db: Session, user: User) -> Trainer:
    """The Trainer row behind the signed-in user, or a 403.

    Management roles have no trainer row, so this is deliberately not a
    fallback to "some trainer" — a desk belongs to one person.
    """
    trainer = db.scalar(
        select(Trainer)
        .options(joinedload(Trainer.user), joinedload(Trainer.branch))
        .where(Trainer.user_id == user.id)
    )
    if trainer is None:
        raise HTTPException(status_code=403, detail="This account is not a trainer")
    return trainer


def client_out(db: Session, member: Member, trainer: Trainer | None = None) -> TrainerClientOut:
    """Assemble one client row from records that already exist.

    Nothing is computed here that a service already computes. The journey, the
    package and the next session all come back through the same builders the
    member's own screens use, so a trainer and their client are never looking
    at two different truths.

    ``trainer`` scopes "next session" to one coach's calendar — the trainer
    desk's own use. Owner/management screens pass no trainer and get the
    member's next PT session with whoever it is with, the same answer
    ``member_home`` already gives the member.
    """
    membership = (
        db.scalar(
            select(Membership)
            .where(Membership.member_id == member.id)
            .order_by(Membership.ends_on.desc())
            .limit(1)
        )
        if member.id
        else None
    )

    journey = db.scalar(
        select(Journey)
        .where(Journey.member_id == member.id)
        .order_by(Journey.start_date.desc())
        .limit(1)
    )
    if journey is not None:
        journey_service.settle_journey(db, journey)

    package = db.scalar(
        select(PTPackage)
        .where(PTPackage.member_id == member.id)
        .order_by(PTPackage.start_date.desc())
        .limit(1)
    )
    if package is not None:
        pt_service.settle_package(db, package)

    if trainer is not None:
        # Mirrors pt_service.next_session's window: without the lower bound,
        # a session that was never transitioned out of SCHEDULED (a missed
        # no-show, stale demo data) sorts first forever, and "next session"
        # quietly becomes "earliest scheduled session ever", however far in
        # the past. The 3-hour grace keeps a session already under way from
        # disappearing the moment its start time ticks past.
        next_session = db.scalar(
            select(PTSession)
            .where(
                PTSession.member_id == member.id,
                PTSession.trainer_id == trainer.id,
                PTSession.status.in_([SessionStatus.SCHEDULED, SessionStatus.IN_PROGRESS]),
                PTSession.scheduled_start >= now_utc() - timedelta(hours=3),
            )
            .order_by(PTSession.scheduled_start)
            .limit(1)
        )
    else:
        next_session = pt_service.next_session(db, member.id)

    today = branch_today(member.branch.timezone if member.branch else None)
    since = today - timedelta(days=30)
    visit_dates = set(
        db.scalars(
            select(AttendanceEvent.work_date).where(
                AttendanceEvent.user_id == member.user_id,
                AttendanceEvent.person_type == PersonType.MEMBER,
                AttendanceEvent.event_type == EventType.CHECK_IN,
                AttendanceEvent.work_date >= since,
            )
        ).all()
    )

    days_remaining = None
    membership_status = None
    if membership is not None and membership.ends_on is not None:
        days_remaining = (membership.ends_on - today).days
        # Keep the stored status honest without needing a nightly job — same
        # self-heal as GET /members/me, so the roster and a member's own
        # screen never disagree about whether their membership has lapsed.
        membership_status = pt_eligibility.effective_membership_status(
            membership.status, membership.ends_on, today
        )
    elif membership is not None:
        membership_status = membership.status

    effective_pt = pt_service.effective_status_for_package(db, package)

    return TrainerClientOut(
        member_id=member.id,
        member_code=member.member_code,
        full_name=member.user.full_name,
        branch_id=member.branch_id,
        joined_on=member.joined_on,
        membership_plan=membership.plan_name if membership else None,
        membership_status=membership_status,
        days_remaining=days_remaining,
        journey=journey_out(db, journey) if journey else None,
        pt_package=package_out(db, package) if package else None,
        effective_pt_status=effective_pt.value,
        effective_pt_status_label=pt_eligibility.EFFECTIVE_PT_STATUS_LABELS[effective_pt],
        next_pt_session=session_out(db, next_session) if next_session else None,
        last_seen_on=max(visit_dates) if visit_dates else None,
        visits_last_30=len(visit_dates),
    )


@router.get("/me/clients", response_model=list[TrainerClientOut])
def my_clients(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> list[TrainerClientOut]:
    """The members assigned to the signed-in trainer.

    There was no way for a trainer to see their own client list: `/journeys`
    and `/pt/packages` are both management-only, and a trainer is not
    management. This is that list, scoped to the assignment rather than to the
    branch — a trainer sees the people they coach, not everyone in the gym.
    """
    trainer = _my_trainer(db, user)
    members = db.scalars(
        select(Member)
        .options(joinedload(Member.user), joinedload(Member.branch))
        .where(Member.assigned_trainer_id == trainer.id, Member.is_active.is_(True))
        .order_by(Member.member_code)
    ).all()
    return [client_out(db, member, trainer) for member in members]


def client_detail_out(
    db: Session, member: Member, trainer: Trainer | None = None
) -> TrainerClientDetailOut:
    """The client-detail payload: one client row plus their recent history.

    ``trainer`` scopes PT session history to one coach, as the trainer desk
    needs; owner/management screens (which pass no trainer) get every PT
    session the member has had, with whichever trainer ran it.
    """
    if trainer is not None:
        sessions = db.scalars(
            select(PTSession)
            .where(PTSession.member_id == member.id, PTSession.trainer_id == trainer.id)
            .order_by(PTSession.scheduled_start.desc())
            .limit(10)
        ).all()
    else:
        sessions = pt_service.sessions_for_member(db, member.id, limit=10)

    workouts = db.scalars(
        select(WorkoutSession)
        .where(WorkoutSession.member_id == member.id)
        .order_by(WorkoutSession.session_date.desc())
        .limit(10)
    ).all()

    return TrainerClientDetailOut(
        client=client_out(db, member, trainer),
        recent_sessions=[session_out(db, s) for s in sessions],
        recent_workouts=[workout_out(db, w) for w in workouts],
        activity=[
            ActivityEntryOut(**entry.__dict__)
            for entry in activity_service.timeline(db, member, limit=30)
        ],
    )


@router.get("/me/clients/{member_id}", response_model=TrainerClientDetailOut)
def my_client_detail(
    member_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> TrainerClientDetailOut:
    """One client, with the history a trainer needs before a session.

    A trainer may only open a member assigned to them. Branch membership is not
    enough: sharing a building is not a coaching relationship, and the medical
    and progress detail on this screen is not for everyone who works there.
    """
    trainer = _my_trainer(db, user)
    member = db.scalar(
        select(Member)
        .options(joinedload(Member.user), joinedload(Member.branch))
        .where(Member.id == member_id)
    )
    if member is None:
        raise HTTPException(status_code=404, detail="Client not found")
    if member.assigned_trainer_id != trainer.id:
        raise HTTPException(status_code=403, detail="This member is not one of your clients")

    return client_detail_out(db, member, trainer)


# ------------------------------------------------------------- availability


@router.get("/me/availability", response_model=list[AvailabilitySlotOut])
def my_availability(
    days: int = Query(default=14, ge=1, le=60),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> list[AvailabilitySlotOut]:
    """The slots this trainer has published, from today forward."""
    trainer = _my_trainer(db, user)
    today = branch_today(trainer.branch.timezone if trainer.branch else None)
    rows = db.scalars(
        select(TrainerAvailability)
        .where(
            TrainerAvailability.trainer_id == trainer.id,
            TrainerAvailability.slot_date >= today,
            TrainerAvailability.slot_date <= today + timedelta(days=days),
        )
        .order_by(TrainerAvailability.slot_date, TrainerAvailability.start_time)
    ).all()
    return [AvailabilitySlotOut.model_validate(row) for row in rows]


@router.post("/me/availability", response_model=list[AvailabilitySlotOut])
def publish_availability(
    payload: PublishAvailabilityRequest,
    request: Request,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> list[AvailabilitySlotOut]:
    """Publish one day's slots, replacing whatever that day held before.

    A slot that has already been booked is kept whatever the trainer sends:
    unpublishing an hour someone is booked into would leave the member holding
    a session the trainer no longer believes exists.
    """
    trainer = _my_trainer(db, user)

    existing = db.scalars(
        select(TrainerAvailability).where(
            TrainerAvailability.trainer_id == trainer.id,
            TrainerAvailability.slot_date == payload.slot_date,
        )
    ).all()
    booked = {row.start_time for row in existing if row.booked_session_id is not None}
    for row in existing:
        if row.booked_session_id is None:
            db.delete(row)
    db.flush()

    for slot in payload.slots:
        if slot.start_time in booked:
            continue
        if slot.end_time <= slot.start_time:
            raise HTTPException(status_code=422, detail="A slot must end after it starts")
        db.add(
            TrainerAvailability(
                trainer_id=trainer.id,
                branch_id=trainer.branch_id,
                slot_date=payload.slot_date,
                start_time=slot.start_time,
                end_time=slot.end_time,
                note=slot.note,
            )
        )

    db.commit()
    audit.record(
        db,
        action="trainer.availability_published",
        actor=user,
        entity_type="trainer",
        entity_id=trainer.id,
        branch_id=trainer.branch_id,
        request=request,
        details={"slot_date": payload.slot_date.isoformat(), "slots": len(payload.slots)},
    )

    rows = db.scalars(
        select(TrainerAvailability)
        .where(
            TrainerAvailability.trainer_id == trainer.id,
            TrainerAvailability.slot_date == payload.slot_date,
        )
        .order_by(TrainerAvailability.start_time)
    ).all()
    return [AvailabilitySlotOut.model_validate(row) for row in rows]


@router.delete("/me/availability/{slot_id}", response_model=MessageOut)
def remove_availability(
    slot_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> MessageOut:
    """Withdraw a single published slot, unless it is already booked."""
    trainer = _my_trainer(db, user)
    slot = db.get(TrainerAvailability, slot_id)
    if slot is None or slot.trainer_id != trainer.id:
        raise HTTPException(status_code=404, detail="Slot not found")
    if slot.booked_session_id is not None:
        raise HTTPException(
            status_code=409,
            detail="That slot is booked. Cancel the session before removing the slot.",
        )
    db.delete(slot)
    db.commit()
    return MessageOut(message="Slot removed")

"""Member V1 — deliberately small.

Membership status, own attendance, live occupancy at their branch, and who
their trainer is. Nothing else: no CRM, no diet platform, no PT booking.

Registration (`POST ""`) is the one staff-facing exception: creating a member
is not something the member does to themselves, so it lives here rather than
being invented as a self-registration flow the gym doesn't have.
"""

from __future__ import annotations

from datetime import timedelta

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy import select
from sqlalchemy.orm import Session, joinedload

from app.core.clock import branch_today
from app.core.deps import assert_branch_access, get_current_user, require_management
from app.core.rate_limit import checkin_rate_limit
from app.core.security import hash_password
from app.db.models import (
    AlertStatus,
    AttendanceEvent,
    Branch,
    CaptureMethod,
    EventType,
    Member,
    MemberCheckIn,
    MemberIntake,
    Membership,
    MembershipStatus,
    PersonType,
    Role,
    RoleKey,
    Trainer,
    User,
)
from app.db.session import get_db
from app.domain import pt_eligibility
from app.schemas.common import (
    BranchBrief,
    MemberCreateOut,
    MemberCreateRequest,
    MemberEventRequest,
    MemberIntakeOut,
    MemberMeOut,
    MembershipOut,
    MemberVisitOut,
    MessageOut,
    OccupancyOut,
)
from app.schemas.training import (
    ActivityEntryOut,
    MemberCheckInOut,
    MemberCheckInRequest,
    MemberHomeOut,
    TrainerClientDetailOut,
)
from app.services import (
    activity_service,
    alert_service,
    attendance_service,
    audit,
    class_service,
    incentive_service,
    journey_service,
    pt_service,
    wellness_service,
)

from .journeys import assert_can_read_member
from .trainers import client_detail_out, trainer_out

router = APIRouter(prefix="/members", tags=["members"])

#: The only plans registration will create a membership against — each one
#: a (duration in days, PT sessions included) pair. Not user-supplied: a
#: caller sends the plan's name, never its duration or session count, so a
#: staff member can never register a "Monthly" plan that quietly runs for a
#: year. Matches the vocabulary the seed data and every existing screen
#: already filter/display on; adding a plan means adding it here.
PLAN_CATALOG: dict[str, tuple[int, int]] = {
    "Monthly": (30, 0),
    "Quarterly": (90, 0),
    "Annual": (365, 0),
    "Elite Annual + PT": (365, 12),
}


def _current_member(db: Session, user: User) -> Member:
    member = db.scalar(
        select(Member)
        .options(
            joinedload(Member.user),
            joinedload(Member.branch),
            joinedload(Member.assigned_trainer).joinedload(Trainer.user),
        )
        .where(Member.user_id == user.id)
    )
    if member is None:
        raise HTTPException(status_code=403, detail="This account is not a member")
    return member


@router.get("/me", response_model=MemberMeOut)
def my_membership(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> MemberMeOut:
    member = _current_member(db, user)
    today = branch_today(member.branch.timezone)

    membership = db.scalar(
        select(Membership)
        .where(Membership.member_id == member.id)
        .order_by(Membership.ends_on.desc())
    )
    days_remaining = None
    if membership is not None:
        days_remaining = (membership.ends_on - today).days
        # Keep the stored status honest without needing a nightly job.
        membership.status = pt_eligibility.effective_membership_status(
            membership.status, membership.ends_on, today
        )

    period_start, period_end = incentive_service.month_bounds(today)
    visits = db.scalars(
        select(AttendanceEvent.work_date)
        .where(
            AttendanceEvent.user_id == user.id,
            AttendanceEvent.person_type == PersonType.MEMBER,
            AttendanceEvent.event_type == EventType.CHECK_IN,
            AttendanceEvent.work_date >= period_start,
            AttendanceEvent.work_date <= period_end,
        )
        .distinct()
    ).all()

    trainer = member.assigned_trainer
    return MemberMeOut(
        member_id=member.id,
        member_code=member.member_code,
        full_name=member.user.full_name,
        branch=BranchBrief.model_validate(member.branch),
        joined_on=member.joined_on,
        membership=MembershipOut.model_validate(membership) if membership else None,
        days_remaining=days_remaining,
        assigned_trainer=trainer_out(trainer) if trainer else None,
        visits_this_month=len(visits),
        is_inside=attendance_service.is_inside(db, user.id, member.branch_id, today),
    )


@router.get("/me/visits", response_model=list[MemberVisitOut])
def my_visits(
    limit: int = Query(default=30, ge=1, le=180),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> list[MemberVisitOut]:
    member = _current_member(db, user)
    events = db.scalars(
        select(AttendanceEvent)
        .where(
            AttendanceEvent.user_id == user.id,
            AttendanceEvent.branch_id == member.branch_id,
            AttendanceEvent.person_type == PersonType.MEMBER,
        )
        .order_by(AttendanceEvent.occurred_at.desc())
        .limit(limit * 2)
    ).all()

    by_day: dict = {}
    for event in sorted(events, key=lambda e: e.occurred_at):
        day = by_day.setdefault(event.work_date, {"in": None, "out": None})
        if event.event_type is EventType.CHECK_IN and day["in"] is None:
            day["in"] = event.occurred_at
        elif event.event_type is EventType.CHECK_OUT:
            day["out"] = event.occurred_at

    out = []
    for work_date, pair in sorted(by_day.items(), reverse=True)[:limit]:
        minutes = None
        if pair["in"] and pair["out"]:
            minutes = max(0, int((pair["out"] - pair["in"]).total_seconds() // 60))
        out.append(
            MemberVisitOut(
                work_date=work_date,
                check_in_at=pair["in"],
                check_out_at=pair["out"],
                minutes=minutes,
            )
        )
    return out


@router.get("/me/home", response_model=MemberHomeOut)
def member_home(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> MemberHomeOut:
    """One request for the whole home screen.

    Everything the member sees on opening the app — membership, today's
    workout, their next PT session, the gym's crowd level and the next class —
    comes back together rather than as six round trips over gym wifi.
    """
    from .classes import class_out
    from .journeys import journey_out, workout_out
    from .pt import package_out, session_out

    member = _current_member(db, user)
    today = branch_today(member.branch.timezone)

    membership = db.scalar(
        select(Membership)
        .where(Membership.member_id == member.id)
        .order_by(Membership.ends_on.desc())
    )
    days_remaining = (membership.ends_on - today).days if membership else None
    membership_status = None
    if membership is not None:
        # Keep the stored status honest without needing a nightly job — same
        # self-heal as my_membership below, so Home and Membership never
        # disagree about whether it has lapsed.
        membership_status = pt_eligibility.effective_membership_status(
            membership.status, membership.ends_on, today
        )

    journey = journey_service.latest_journey(db, member.id)
    if journey is not None:
        # Reading the home screen is enough to complete a finished journey.
        journey_service.settle_journey(db, journey)

    workout = journey_service.today_workout(db, member)
    package = pt_service.latest_package(db, member.id)
    if package is not None:
        pt_service.settle_package(db, package)
    next_pt = pt_service.next_session(db, member.id)

    upcoming = class_service.upcoming(db, [member.branch_id], on_or_after=today, limit=1)
    unread = len(
        alert_service.visible_alerts(
            db, user, branch_ids=[member.branch_id], status=AlertStatus.OPEN, limit=100
        )
    )

    trainer = member.assigned_trainer
    return MemberHomeOut(
        member_id=member.id,
        full_name=member.user.full_name,
        branch_id=member.branch_id,
        branch_name=member.branch.name,
        membership_plan=membership.plan_name if membership else None,
        membership_status=membership_status.value if membership_status else None,
        days_remaining=days_remaining,
        is_inside=attendance_service.is_inside(db, user.id, member.branch_id, today),
        trainer_name=trainer.user.full_name if trainer and trainer.user else None,
        journey=journey_out(db, journey) if journey else None,
        today_workout=workout_out(db, workout) if workout else None,
        next_pt_session=session_out(db, next_pt) if next_pt else None,
        pt_package=package_out(db, package) if package else None,
        effective_pt_status=pt_service.effective_status_for_package(db, package).value,
        next_class=class_out(db, upcoming[0], user) if upcoming else None,
        occupancy=attendance_service.branch_occupancy(db, member.branch),
        unread_alerts=unread,
        streak_days=journey_service.streak(db, member, on=today),
        today_checkin=(
            MemberCheckInOut.model_validate(checkin)
            if (checkin := wellness_service.today_checkin(db, member, member.branch))
            else None
        ),
    )


@router.post("/me/checkin", response_model=MemberCheckInOut)
def submit_checkin(
    payload: MemberCheckInRequest,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> MemberCheckIn:
    """Today's "how are you feeling" answer. A resubmit the same day updates it."""
    member = _current_member(db, user)
    return wellness_service.submit_checkin(db, member, member.branch, payload.feeling)


@router.get("/me/activity", response_model=list[ActivityEntryOut])
def member_activity(
    limit: int = Query(default=40, ge=1, le=120),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> list[ActivityEntryOut]:
    """The activity timeline, with each entry labelled by kind.

    A gym visit, an own workout, a PT session and a group class are four
    different things and stay four different things here.
    """
    member = _current_member(db, user)
    return [
        ActivityEntryOut(**entry.__dict__)
        for entry in activity_service.timeline(db, member, limit=limit, offset=offset)
    ]


@router.get("/me/occupancy", response_model=OccupancyOut)
def my_branch_occupancy(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> OccupancyOut:
    member = _current_member(db, user)
    return OccupancyOut(**attendance_service.branch_occupancy(db, member.branch))


@router.post(
    "/me/attendance", response_model=MessageOut, dependencies=[Depends(checkin_rate_limit)]
)
def member_attendance(
    request: Request,
    payload: MemberEventRequest,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> MessageOut:
    """Member entry/exit, which is what live occupancy is derived from."""
    member = _current_member(db, user)
    branch = db.get(Branch, payload.branch_id)
    if branch is None or not branch.is_active:
        raise HTTPException(status_code=404, detail="Branch not found")

    attendance_service.member_event(
        db,
        user=user,
        member=member,
        branch=branch,
        event_type=EventType(payload.event_type),
        method=CaptureMethod(payload.method),
        qr_token=payload.qr_token,
        pin=payload.pin,
        request=request,
    )
    verb = "in" if payload.event_type is EventType.CHECK_IN else "out"
    return MessageOut(message=f"Checked {verb} at {branch.name}")


@router.post("", response_model=MemberCreateOut, status_code=201)
def register_member(
    payload: MemberCreateRequest,
    request: Request,
    db: Session = Depends(get_db),
    actor: User = Depends(require_management),
) -> MemberCreateOut:
    """Register a new member: account, membership, and their intake
    questionnaire in one transaction. Branch-scoped like every other
    management action — a branch manager registers members at their own
    branch, an owner at any of theirs.

    The plan determines duration and any included PT sessions
    (`PLAN_CATALOG`); a caller supplies the plan's name, never its dates or
    session count, so registration can't accidentally hand out terms nobody
    approved.
    """
    assert_branch_access(actor, payload.branch_id)
    branch = db.get(Branch, payload.branch_id)
    if branch is None or not branch.is_active:
        raise HTTPException(status_code=404, detail="Branch not found")

    plan = PLAN_CATALOG.get(payload.plan_name)
    if plan is None:
        raise HTTPException(
            status_code=400,
            detail=f"Unknown plan. Choose one of: {', '.join(PLAN_CATALOG)}",
        )
    duration_days, pt_sessions_total = plan

    if db.scalar(select(User).where(User.email == payload.email.lower())):
        raise HTTPException(status_code=409, detail="That email is already registered")

    role = db.scalar(select(Role).where(Role.key == RoleKey.MEMBER.value))
    if role is None:
        raise HTTPException(status_code=500, detail="Member role is not seeded")

    today = branch_today(branch.timezone)

    new_user = User(
        email=payload.email.lower(),
        full_name=payload.full_name,
        phone=payload.phone,
        password_hash=hash_password(payload.password),
        role_id=role.id,
        branch_id=branch.id,
    )
    db.add(new_user)
    db.flush()

    member = Member(
        user_id=new_user.id,
        branch_id=branch.id,
        member_code=f"{branch.code}-M{new_user.id:04d}",
        joined_on=today,
        registered_on=today,
        marketing_source_id=payload.marketing_source_id,
        is_active=True,
    )
    db.add(member)
    db.flush()

    membership = Membership(
        member_id=member.id,
        branch_id=branch.id,
        plan_name=payload.plan_name,
        status=MembershipStatus.ACTIVE,
        starts_on=today,
        ends_on=today + timedelta(days=duration_days),
        pt_sessions_total=pt_sessions_total,
        pt_sessions_used=0,
    )
    db.add(membership)

    intake_out: MemberIntakeOut | None = None
    if payload.intake is not None:
        intake = MemberIntake(member_id=member.id, **payload.intake.model_dump())
        db.add(intake)
        db.flush()
        intake_out = MemberIntakeOut.model_validate(intake)

    db.flush()

    audit.record(
        db,
        action=audit.ACTION_ADMIN_ACTION,
        actor=actor,
        entity_type="member",
        entity_id=member.id,
        branch_id=branch.id,
        request=request,
        details={"created_email": new_user.email, "plan_name": payload.plan_name},
    )

    return MemberCreateOut(
        member_id=member.id,
        member_code=member.member_code,
        full_name=new_user.full_name,
        email=new_user.email,
        branch=BranchBrief.model_validate(branch),
        membership=MembershipOut.model_validate(membership),
        intake=intake_out,
    )


@router.get("/{member_id}", response_model=TrainerClientDetailOut)
def member_detail(
    member_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> TrainerClientDetailOut:
    """A member's full operational picture, for staff who may read them.

    The owner's Member Intelligence screen, and any other staff view that
    needs one member in full, all read this — the same builder the trainer
    desk's client-detail screen uses, generalised to any authorised reader
    rather than one trainer's own clients. Membership, journey, PT package,
    recent attendance and recent workouts come back together because that is
    the whole picture staff actually need before acting on it.
    """
    member = db.scalar(
        select(Member)
        .options(
            joinedload(Member.user),
            joinedload(Member.branch),
            joinedload(Member.assigned_trainer).joinedload(Trainer.user),
        )
        .where(Member.id == member_id)
    )
    if member is None:
        raise HTTPException(status_code=404, detail="Member not found")
    assert_can_read_member(db, user, member)
    return client_detail_out(db, member)


__all__ = ["router"]

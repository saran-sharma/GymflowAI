"""Personal training: packages, sessions, the split attendance view and the
post-journey offer.

Pricing is only ever echoed back from configuration. Nothing here invents a
number to put in front of a member.
"""

from __future__ import annotations

from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.clock import branch_today
from app.core.deps import (
    assert_branch_access,
    get_current_user,
    require_management,
    scoped_branch_filter,
)
from app.db.models import (
    Journey,
    JourneyStatus,
    Member,
    PackageStatus,
    PTPackage,
    PTSession,
    RoleKey,
    SessionStatus,
    Trainer,
    User,
)
from app.db.session import get_db
from app.schemas.training import (
    ConvertToPtRequest,
    CreatePackageRequest,
    PTArrivalRequest,
    PTCloseRequest,
    PTCompleteRequest,
    PtConversionOut,
    PTOfferOut,
    PTPackageOut,
    PTSessionOut,
    PTSplitViewOut,
    SchedulePTRequest,
)
from app.services import alert_service, audit, journey_service, pt_service, settings_service

from .journeys import assert_can_read_member, assert_can_write_member, current_member

router = APIRouter(prefix="/pt", tags=["pt"])

PT_BENEFITS = [
    "Personalised coaching built around your goal",
    "Form correction on every lift",
    "Goal-based programming, adjusted as you progress",
    "Progress tracked session by session",
]

PRICING_DISCLAIMER = (
    "Session counts are configured by SLAM. Pricing and final package terms are "
    "confirmed at your branch."
)


def _trainer_of(db: Session, user: User) -> Trainer | None:
    return db.scalar(select(Trainer).where(Trainer.user_id == user.id))


def package_out(db: Session, package: PTPackage) -> PTPackageOut:
    member = db.get(Member, package.member_id)
    trainer = db.get(Trainer, package.trainer_id) if package.trainer_id else None
    threshold = settings_service.get_int(db, "pt.low_balance_threshold", package.branch_id)
    return PTPackageOut(
        id=package.id,
        member_id=package.member_id,
        member_name=member.user.full_name if member and member.user else None,
        branch_id=package.branch_id,
        trainer_id=package.trainer_id,
        trainer_name=trainer.user.full_name if trainer and trainer.user else None,
        sessions_total=package.sessions_total,
        sessions_used=package.sessions_used,
        sessions_remaining=package.sessions_remaining,
        status=package.status,
        start_date=package.start_date,
        expiry_date=package.expiry_date,
        origin=package.origin,
        price_amount=package.price_amount,
        currency=package.currency,
        low_balance=(
            package.status is PackageStatus.ACTIVE and 0 < package.sessions_remaining <= threshold
        ),
    )


def session_out(db: Session, session: PTSession) -> PTSessionOut:
    member = db.get(Member, session.member_id)
    trainer = db.get(Trainer, session.trainer_id)
    package = db.get(PTPackage, session.package_id)
    return PTSessionOut(
        id=session.id,
        package_id=session.package_id,
        member_id=session.member_id,
        member_name=member.user.full_name if member and member.user else None,
        trainer_id=session.trainer_id,
        trainer_name=trainer.user.full_name if trainer and trainer.user else None,
        branch_id=session.branch_id,
        session_date=session.session_date,
        scheduled_start=session.scheduled_start,
        scheduled_end=session.scheduled_end,
        session_number=session.session_number,
        package_size=package.sessions_total if package else None,
        status=session.status,
        member_checked_in_at=session.member_checked_in_at,
        trainer_checked_in_at=session.trainer_checked_in_at,
        completed_at=session.completed_at,
        notes=session.notes,
    )


def _load_session(db: Session, session_id: int) -> PTSession:
    session = db.get(PTSession, session_id)
    if session is None:
        raise HTTPException(status_code=404, detail="PT session not found")
    return session


def _assert_session_access(db: Session, user: User, session: PTSession, *, write: bool) -> None:
    """Who may look at, and who may act on, a PT session."""
    role = user.role.key
    if role == RoleKey.MEMBER.value:
        member = db.scalar(select(Member).where(Member.user_id == user.id))
        if member is None or member.id != session.member_id:
            raise HTTPException(status_code=403, detail="This is not your session")
        if write:
            # A member confirms their own arrival; closing the session is the
            # trainer's call, and is blocked at the endpoint.
            return
        return
    if role == RoleKey.TRAINER.value:
        trainer = _trainer_of(db, user)
        if trainer is None or trainer.id != session.trainer_id:
            raise HTTPException(status_code=403, detail="This is not your session")
        return
    assert_branch_access(user, session.branch_id)


# -------------------------------------------------------------- member view


@router.get("/me/package", response_model=PTPackageOut | None)
def my_package(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> PTPackageOut | None:
    member = current_member(db, user)
    package = pt_service.latest_package(db, member.id)
    if package is None:
        return None
    pt_service.settle_package(db, package)
    return package_out(db, package)


@router.get("/me/sessions", response_model=list[PTSessionOut])
def my_sessions(
    limit: int = Query(default=30, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> list[PTSessionOut]:
    member = current_member(db, user)
    rows = pt_service.sessions_for_member(db, member.id, limit=limit, offset=offset)
    return [session_out(db, s) for s in rows]


@router.get("/me/next", response_model=PTSessionOut | None)
def my_next_session(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> PTSessionOut | None:
    member = current_member(db, user)
    session = pt_service.next_session(db, member.id)
    return session_out(db, session) if session else None


@router.get("/me/offer", response_model=PTOfferOut)
def my_pt_offer(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> PTOfferOut:
    """What the member sees after Day 45.

    Eligibility is a completed journey with no package yet — nothing is
    "offered" to somebody mid-programme or already training.
    """
    member = current_member(db, user)
    journey = journey_service.latest_journey(db, member.id)
    if journey is not None:
        journey_service.settle_journey(db, journey)
    package = pt_service.active_package(db, member.id)

    eligible = journey is not None and journey.status is JourneyStatus.COMPLETED and package is None
    options = [
        {"sessions": size, "label": f"{size} sessions", "price_amount": None, "currency": None}
        for size in pt_service.package_options(db, member.branch_id)
    ]

    if eligible and journey is not None:
        journey.pt_offer_shown = True
        db.flush()
        headline = "Your 45-Day General Training journey is complete."
        message = "Ready to progress further?"
    elif package is not None:
        headline = "You are already training with a PT package."
        message = f"{package.sessions_remaining} of {package.sessions_total} sessions remain."
    else:
        headline = "Finish your 45-day journey first."
        message = "PT is the next step once General Training is complete."

    return PTOfferOut(
        eligible=eligible,
        headline=headline,
        message=message,
        benefits=PT_BENEFITS,
        options=options,
        disclaimer=PRICING_DISCLAIMER,
    )


# ------------------------------------------------------------ trainer view


@router.get("/trainer/today", response_model=list[PTSessionOut])
def trainer_today(
    on: date | None = Query(default=None),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> list[PTSessionOut]:
    trainer = _trainer_of(db, user)
    if trainer is None:
        raise HTTPException(status_code=403, detail="This account is not a trainer")
    work_date = on or branch_today(trainer.branch.timezone if trainer.branch else None)
    return [session_out(db, s) for s in pt_service.sessions_for_trainer(db, trainer.id, work_date)]


# ---------------------------------------------------------------- sessions


@router.get("/sessions/{session_id}", response_model=PTSplitViewOut)
def split_attendance(
    session_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> PTSplitViewOut:
    """The dual-person view: member on one side, trainer on the other."""
    session = _load_session(db, session_id)
    _assert_session_access(db, user, session, write=False)
    view = pt_service.split_view(db, session)
    return PTSplitViewOut(
        session=session_out(db, session),
        member_name=view.member_name,
        trainer_name=view.trainer_name,
        member_checked_in=view.member_checked_in,
        trainer_checked_in=view.trainer_checked_in,
        can_complete=view.can_complete,
    )


@router.post("/sessions/{session_id}/arrival", response_model=PTSplitViewOut)
def record_arrival(
    session_id: int,
    payload: PTArrivalRequest,
    request: Request,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> PTSplitViewOut:
    """Record that the member or the trainer has arrived. Server time only."""
    session = _load_session(db, session_id)
    _assert_session_access(db, user, session, write=True)

    if user.role.key == RoleKey.MEMBER.value and payload.who != "member":
        raise HTTPException(status_code=403, detail="You can only confirm your own arrival")

    pt_service.mark_arrival(db, session=session, who=payload.who)
    audit.record(
        db,
        action="pt.arrival",
        actor=user,
        entity_type="pt_session",
        entity_id=session.id,
        branch_id=session.branch_id,
        request=request,
        details={"who": payload.who, "session_number": session.session_number},
    )
    return split_attendance(session_id, db, user)


@router.post("/sessions/{session_id}/complete", response_model=PTSessionOut)
def complete_session(
    session_id: int,
    payload: PTCompleteRequest,
    request: Request,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> PTSessionOut:
    """Close the session as delivered. Trainers and management only."""
    if user.role.key == RoleKey.MEMBER.value:
        raise HTTPException(status_code=403, detail="Only your trainer can complete a session")
    session = _load_session(db, session_id)
    _assert_session_access(db, user, session, write=True)

    view = pt_service.split_view(db, session)
    if not view.member_checked_in or not view.trainer_checked_in:
        raise HTTPException(
            status_code=409,
            detail={
                "code": "attendance_incomplete",
                "message": "Both the member and the trainer must be marked present first.",
            },
        )

    pt_service.complete_session(
        db, session=session, completed_by_user_id=user.id, notes=payload.notes
    )
    audit.record(
        db,
        action="pt.session_complete",
        actor=user,
        entity_type="pt_session",
        entity_id=session.id,
        branch_id=session.branch_id,
        request=request,
        details={"session_number": session.session_number, "member_id": session.member_id},
    )
    return session_out(db, session)


@router.post("/sessions/{session_id}/close", response_model=PTSessionOut)
def close_session(
    session_id: int,
    payload: PTCloseRequest,
    request: Request,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> PTSessionOut:
    """Cancel or no-show a session. Neither consumes one from the package."""
    if user.role.key == RoleKey.MEMBER.value:
        raise HTTPException(status_code=403, detail="Ask your trainer to change this session")
    session = _load_session(db, session_id)
    _assert_session_access(db, user, session, write=True)

    pt_service.close_session(db, session=session, outcome=payload.outcome, notes=payload.notes)
    audit.record(
        db,
        action="pt.session_close",
        actor=user,
        entity_type="pt_session",
        entity_id=session.id,
        branch_id=session.branch_id,
        request=request,
        details={"outcome": payload.outcome.value, "reason": payload.notes},
    )
    return session_out(db, session)


@router.post("/sessions", response_model=PTSessionOut, status_code=201)
def schedule_session(
    payload: SchedulePTRequest,
    request: Request,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> PTSessionOut:
    if user.role.key == RoleKey.MEMBER.value:
        raise HTTPException(status_code=403, detail="Ask your branch to book a PT session")
    package = db.get(PTPackage, payload.package_id)
    if package is None:
        raise HTTPException(status_code=404, detail="PT package not found")
    assert_branch_access(user, package.branch_id)

    session = pt_service.schedule_session(
        db,
        package=package,
        trainer_id=payload.trainer_id,
        scheduled_start=payload.scheduled_start,
        scheduled_end=payload.scheduled_end,
    )
    audit.record(
        db,
        action="pt.session_scheduled",
        actor=user,
        entity_type="pt_session",
        entity_id=session.id,
        branch_id=session.branch_id,
        request=request,
        details={"member_id": session.member_id, "session_number": session.session_number},
    )
    return session_out(db, session)


# --------------------------------------------------------------- packages


@router.post("/packages", response_model=PTPackageOut, status_code=201)
def create_package(
    payload: CreatePackageRequest,
    request: Request,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> PTPackageOut:
    member = db.get(Member, payload.member_id)
    if member is None:
        raise HTTPException(status_code=404, detail="Member not found")
    assert_can_write_member(db, user, member)

    journey_id = payload.journey_id
    origin = "direct"
    if journey_id is None:
        journey = journey_service.latest_journey(db, member.id)
        if journey is not None and journey.status is JourneyStatus.COMPLETED:
            journey_id = journey.id
    if journey_id is not None:
        journey = db.get(Journey, journey_id)
        if journey is not None and journey.status is JourneyStatus.COMPLETED:
            origin = "journey_conversion"

    package = pt_service.create_package(
        db,
        member=member,
        sessions_total=payload.sessions_total,
        trainer_id=payload.trainer_id,
        start_date=payload.start_date,
        expiry_date=payload.expiry_date,
        journey_id=journey_id,
        origin=origin,
        price_amount=payload.price_amount,
        currency=payload.currency,
        created_by_user_id=user.id,
    )
    alert_service.create_task(
        db,
        key="pt_first_session",
        dedupe_key=f"pt-package:{package.id}:first-session",
        title=f"Book the first PT session — {member.user.full_name if member.user else 'member'}",
        branch_id=package.branch_id,
        member_id=member.id,
        assigned_trainer_id=package.trainer_id,
    )
    audit.record(
        db,
        action="pt.package_created",
        actor=user,
        entity_type="pt_package",
        entity_id=package.id,
        branch_id=package.branch_id,
        request=request,
        details={
            "member_id": member.id,
            "sessions_total": package.sessions_total,
            "origin": origin,
        },
    )
    return package_out(db, package)


@router.post(
    "/members/{member_id}/convert",
    response_model=PtConversionOut,
    status_code=201,
)
def convert_member_to_pt(
    member_id: int,
    payload: ConvertToPtRequest,
    request: Request,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> PtConversionOut:
    """A trainer moves their member from General Training onto PT.

    Deliberately not open to a member, and deliberately not automatic. The
    45-day mark raises an alert and stops; the decision is a conversation on
    the gym floor and only the trainer who had it can record its outcome.
    Management may also convert, because a branch manager standing in for an
    absent trainer is a real situation.
    """
    member = db.get(Member, member_id)
    if member is None:
        raise HTTPException(status_code=404, detail="Member not found")

    # A member cannot convert themselves; this reuses the same staff-only rule
    # that guards recording an assessment.
    assert_can_write_member(db, user, member)

    if not payload.confirm:
        raise HTTPException(
            status_code=400,
            detail={
                "code": "confirmation_required",
                "message": "Converting a member to PT has to be confirmed.",
            },
        )

    trainer = _converting_trainer(db, user, member)
    package = pt_service.convert_to_pt(
        db,
        member=member,
        trainer=trainer,
        actor=user,
        sessions_total=payload.sessions_total,
        note=payload.note,
    )
    db.commit()

    return PtConversionOut(
        member_id=member.id,
        member_name=member.user.full_name,
        trainer_id=trainer.id,
        trainer_name=trainer.user.full_name,
        from_training_type="general_training",
        to_training_type="pt",
        package=package_out(db, package),
        converted_at=package.created_at,
    )


def _converting_trainer(db: Session, user: User, member: Member) -> Trainer:
    """Whose conversion this is.

    A trainer converts as themselves. Management converting on a trainer's
    behalf is recorded against the member's assigned trainer, because the
    relationship that continues afterwards is the member's, not the manager's.
    """
    if user.role.key == RoleKey.TRAINER.value:
        trainer = db.scalar(select(Trainer).where(Trainer.user_id == user.id))
        if trainer is None:
            raise HTTPException(status_code=403, detail="No trainer profile for this account")
        return trainer

    if member.assigned_trainer_id:
        assigned = db.get(Trainer, member.assigned_trainer_id)
        if assigned is not None:
            return assigned

    raise HTTPException(
        status_code=409,
        detail={
            "code": "no_trainer",
            "message": "Assign a trainer to this member before converting them to PT.",
        },
    )


@router.get("/packages", response_model=list[PTPackageOut])
def list_packages(
    branch_id: int | None = Query(default=None),
    status_filter: PackageStatus | None = Query(default=None, alias="status"),
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
    user: User = Depends(require_management),
) -> list[PTPackageOut]:
    allowed = scoped_branch_filter(user, branch_id)
    stmt = (
        select(PTPackage)
        .order_by(PTPackage.start_date.desc(), PTPackage.id.desc())
        .offset(offset)
        .limit(limit)
    )
    if allowed is not None:
        stmt = stmt.where(PTPackage.branch_id.in_(allowed))
    if status_filter is not None:
        stmt = stmt.where(PTPackage.status == status_filter)
    packages = list(db.scalars(stmt).all())
    for package in packages:
        pt_service.settle_package(db, package)
    return [package_out(db, p) for p in packages]


@router.get("/members/{member_id}/package", response_model=PTPackageOut | None)
def member_package(
    member_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> PTPackageOut | None:
    member = db.get(Member, member_id)
    if member is None:
        raise HTTPException(status_code=404, detail="Member not found")
    assert_can_read_member(db, user, member)
    package = pt_service.latest_package(db, member.id)
    if package is None:
        return None
    pt_service.settle_package(db, package)
    return package_out(db, package)


@router.get("/options", response_model=list[int])
def options(
    branch_id: int | None = Query(default=None),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> list[int]:
    """Configured package sizes. The app never hardcodes 12/20/30."""
    return pt_service.package_options(db, branch_id or user.branch_id)


@router.get("/utilisation")
def utilisation(
    start: date,
    end: date,
    branch_id: int | None = Query(default=None),
    db: Session = Depends(get_db),
    user: User = Depends(require_management),
) -> dict:
    allowed = scoped_branch_filter(user, branch_id)
    return pt_service.utilisation(db, allowed, start, end)


@router.get("/sessions", response_model=list[PTSessionOut])
def list_sessions(
    on: date | None = Query(default=None),
    branch_id: int | None = Query(default=None),
    status_filter: SessionStatus | None = Query(default=None, alias="status"),
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
    user: User = Depends(require_management),
) -> list[PTSessionOut]:
    allowed = scoped_branch_filter(user, branch_id)
    stmt = select(PTSession).order_by(PTSession.scheduled_start.desc()).offset(offset).limit(limit)
    if allowed is not None:
        stmt = stmt.where(PTSession.branch_id.in_(allowed))
    if on is not None:
        stmt = stmt.where(PTSession.session_date == on)
    if status_filter is not None:
        stmt = stmt.where(PTSession.status == status_filter)
    return [session_out(db, s) for s in db.scalars(stmt).all()]


__all__ = ["package_out", "router", "session_out"]

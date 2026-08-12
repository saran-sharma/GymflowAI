"""Member V1 — deliberately small.

Membership status, own attendance, live occupancy at their branch, and who
their trainer is. Nothing else: no CRM, no diet platform, no PT booking.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy import select
from sqlalchemy.orm import Session, joinedload

from app.core.clock import branch_today
from app.core.deps import get_current_user
from app.core.rate_limit import checkin_rate_limit
from app.db.models import (
    AttendanceEvent,
    Branch,
    CaptureMethod,
    EventType,
    Member,
    Membership,
    MembershipStatus,
    PersonType,
    Trainer,
    User,
)
from app.db.session import get_db
from app.schemas.common import (
    BranchBrief,
    MemberEventRequest,
    MemberMeOut,
    MembershipOut,
    MemberVisitOut,
    MessageOut,
    OccupancyOut,
)
from app.services import attendance_service, incentive_service

from .trainers import trainer_out

router = APIRouter(prefix="/members", tags=["members"])


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
        if days_remaining < 0 and membership.status is MembershipStatus.ACTIVE:
            membership.status = MembershipStatus.EXPIRED

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


__all__ = ["router"]

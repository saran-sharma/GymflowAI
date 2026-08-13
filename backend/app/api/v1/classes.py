"""Group classes: create, announce, RSVP, attendance."""

from __future__ import annotations

from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.deps import (
    assert_branch_access,
    get_current_user,
    require_management,
    resolve_branch,
    scoped_branch_filter,
)
from app.db.models import (
    Branch,
    GroupClass,
    GroupClassAttendance,
    GroupClassRsvp,
    Member,
    RoleKey,
    Trainer,
    User,
)
from app.db.session import get_db
from app.schemas.common import MessageOut
from app.schemas.training import (
    ClassAttendanceRequest,
    ClassRosterEntry,
    CreateClassRequest,
    GroupClassOut,
    RsvpRequest,
)
from app.services import audit, class_service

router = APIRouter(prefix="/classes", tags=["classes"])


def _member_of(db: Session, user: User) -> Member | None:
    return db.scalar(select(Member).where(Member.user_id == user.id))


def _trainer_of(db: Session, user: User) -> Trainer | None:
    return db.scalar(select(Trainer).where(Trainer.user_id == user.id))


def class_out(db: Session, group_class: GroupClass, viewer: User | None = None) -> GroupClassOut:
    tally = class_service.counts(db, group_class)
    branch = db.get(Branch, group_class.branch_id)
    trainer = db.get(Trainer, group_class.trainer_id) if group_class.trainer_id else None

    my_response = None
    if viewer is not None and viewer.role.key == RoleKey.MEMBER.value:
        member = _member_of(db, viewer)
        if member is not None:
            row = db.scalar(
                select(GroupClassRsvp).where(
                    GroupClassRsvp.class_id == group_class.id,
                    GroupClassRsvp.member_id == member.id,
                )
            )
            my_response = row.response if row else None

    return GroupClassOut(
        id=group_class.id,
        branch_id=group_class.branch_id,
        branch_name=branch.name if branch else None,
        trainer_id=group_class.trainer_id,
        trainer_name=trainer.user.full_name if trainer and trainer.user else None,
        name=group_class.name,
        description=group_class.description,
        starts_at=group_class.starts_at,
        ends_at=group_class.ends_at,
        class_date=group_class.class_date,
        capacity=group_class.capacity,
        status=group_class.status,
        announcement=group_class.announcement,
        yes_count=tally["yes"],
        no_count=tally["no"],
        pending_count=tally["pending"],
        attended_count=tally["attended"],
        available=tally["available"],
        show_up_pct=tally["show_up_pct"],
        my_response=my_response,
    )


def _load_class(db: Session, class_id: int) -> GroupClass:
    group_class = db.get(GroupClass, class_id)
    if group_class is None:
        raise HTTPException(status_code=404, detail="Class not found")
    return group_class


def _assert_can_manage(db: Session, user: User, group_class: GroupClass) -> None:
    """Management anywhere in scope, or the trainer actually taking the class."""
    if user.role.key == RoleKey.TRAINER.value:
        trainer = _trainer_of(db, user)
        if trainer is None or trainer.id != group_class.trainer_id:
            raise HTTPException(status_code=403, detail="You are not taking this class")
        return
    if user.role.key == RoleKey.MEMBER.value:
        raise HTTPException(status_code=403, detail="Not permitted")
    assert_branch_access(user, group_class.branch_id)


@router.get("", response_model=list[GroupClassOut])
def list_classes(
    branch_id: int | None = Query(default=None),
    on_or_after: date | None = Query(default=None),
    limit: int = Query(default=30, ge=1, le=100),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> list[GroupClassOut]:
    """Upcoming classes a member, trainer or manager may see at their branches."""
    if user.role.key == RoleKey.MEMBER.value:
        member = _member_of(db, user)
        allowed = [member.branch_id] if member else []
    elif user.role.key == RoleKey.TRAINER.value:
        trainer = _trainer_of(db, user)
        allowed = [trainer.branch_id] if trainer else []
    else:
        allowed = scoped_branch_filter(user, branch_id)

    rows = class_service.upcoming(db, allowed, on_or_after=on_or_after, limit=limit)
    return [class_out(db, c, user) for c in rows]


@router.post("", response_model=GroupClassOut, status_code=201)
def create_class(
    payload: CreateClassRequest,
    request: Request,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> GroupClassOut:
    if user.role.key == RoleKey.MEMBER.value:
        raise HTTPException(status_code=403, detail="Not permitted")
    if user.role.key == RoleKey.TRAINER.value:
        trainer = _trainer_of(db, user)
        if trainer is None or trainer.branch_id != payload.branch_id:
            raise HTTPException(
                status_code=403, detail="You can only create classes at your branch"
            )

    branch = resolve_branch(db, user, payload.branch_id)
    group_class = class_service.create_class(
        db,
        branch=branch,
        name=payload.name,
        starts_at=payload.starts_at,
        ends_at=payload.ends_at,
        trainer_id=payload.trainer_id,
        capacity=payload.capacity,
        description=payload.description,
        announcement=payload.announcement,
        created_by_user_id=user.id,
    )
    audit.record(
        db,
        action="class.create",
        actor=user,
        entity_type="group_class",
        entity_id=group_class.id,
        branch_id=branch.id,
        request=request,
        details={"name": group_class.name, "starts_at": group_class.starts_at.isoformat()},
    )
    return class_out(db, group_class, user)


@router.get("/{class_id}", response_model=GroupClassOut)
def class_detail(
    class_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> GroupClassOut:
    group_class = _load_class(db, class_id)
    if user.role.key == RoleKey.MEMBER.value:
        member = _member_of(db, user)
        if member is None or member.branch_id != group_class.branch_id:
            raise HTTPException(status_code=403, detail="This class is at another branch")
    elif user.role.key != RoleKey.TRAINER.value:
        assert_branch_access(user, group_class.branch_id)
    return class_out(db, group_class, user)


@router.post("/{class_id}/rsvp", response_model=GroupClassOut)
def rsvp(
    class_id: int,
    payload: RsvpRequest,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> GroupClassOut:
    """Yes or no. Members only — an RSVP is the member's answer to give."""
    member = _member_of(db, user)
    if member is None:
        raise HTTPException(status_code=403, detail="This account is not a member")
    group_class = _load_class(db, class_id)
    class_service.set_rsvp(db, group_class=group_class, member=member, answer=payload.response)
    return class_out(db, group_class, user)


@router.get("/{class_id}/roster", response_model=list[ClassRosterEntry])
def roster(
    class_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> list[ClassRosterEntry]:
    """Who said yes, and who turned up. Staff only."""
    group_class = _load_class(db, class_id)
    _assert_can_manage(db, user, group_class)

    rsvps = db.scalars(
        select(GroupClassRsvp).where(GroupClassRsvp.class_id == group_class.id)
    ).all()
    attendance = {
        row.member_id: row.attended
        for row in db.scalars(
            select(GroupClassAttendance).where(GroupClassAttendance.class_id == group_class.id)
        ).all()
    }

    out = []
    for row in rsvps:
        member = db.get(Member, row.member_id)
        out.append(
            ClassRosterEntry(
                member_id=row.member_id,
                member_name=member.user.full_name if member and member.user else "Member",
                response=row.response,
                attended=attendance.get(row.member_id),
            )
        )
    return sorted(out, key=lambda e: e.member_name)


@router.post("/{class_id}/attendance", response_model=MessageOut)
def record_attendance(
    class_id: int,
    payload: ClassAttendanceRequest,
    request: Request,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> MessageOut:
    """Actual attendance, recorded separately from the RSVP."""
    group_class = _load_class(db, class_id)
    _assert_can_manage(db, user, group_class)

    changed = class_service.record_attendance(
        db,
        group_class=group_class,
        member_ids=payload.member_ids,
        attended=payload.attended,
        recorded_by_user_id=user.id,
    )
    audit.record(
        db,
        action="class.attendance",
        actor=user,
        entity_type="group_class",
        entity_id=group_class.id,
        branch_id=group_class.branch_id,
        request=request,
        details={"members": changed, "attended": payload.attended},
    )
    return MessageOut(message=f"{changed} member(s) recorded.")


@router.post("/{class_id}/close", response_model=GroupClassOut)
def close_class(
    class_id: int,
    request: Request,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> GroupClassOut:
    group_class = _load_class(db, class_id)
    _assert_can_manage(db, user, group_class)
    class_service.close_class(db, group_class)
    audit.record(
        db,
        action="class.close",
        actor=user,
        entity_type="group_class",
        entity_id=group_class.id,
        branch_id=group_class.branch_id,
        request=request,
    )
    return class_out(db, group_class, user)


@router.post("/{class_id}/cancel", response_model=GroupClassOut)
def cancel_class(
    class_id: int,
    request: Request,
    reason: str | None = Query(default=None, max_length=300),
    db: Session = Depends(get_db),
    user: User = Depends(require_management),
) -> GroupClassOut:
    group_class = _load_class(db, class_id)
    assert_branch_access(user, group_class.branch_id)
    class_service.cancel_class(db, group_class, reason)
    audit.record(
        db,
        action="class.cancel",
        actor=user,
        entity_type="group_class",
        entity_id=group_class.id,
        branch_id=group_class.branch_id,
        request=request,
        details={"reason": reason},
    )
    return class_out(db, group_class, user)


__all__ = ["class_out", "router"]

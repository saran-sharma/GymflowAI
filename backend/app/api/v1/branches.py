"""Branches, the rotating check-in QR, and live occupancy."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.clock import now_utc
from app.core.config import settings
from app.core.deps import (
    MANAGEMENT_ROLES,
    get_current_user,
    resolve_branch,
    scoped_branch_filter,
)
from app.db.models import Branch, User
from app.db.session import get_db
from app.domain import qr as qr_domain
from app.schemas.common import BranchOut, BranchQrOut, OccupancyOut
from app.services import attendance_service

router = APIRouter(prefix="/branches", tags=["branches"])


def _visible_branches(db: Session, user: User) -> list[Branch]:
    stmt = select(Branch).where(Branch.is_active.is_(True)).order_by(Branch.name)
    allowed = scoped_branch_filter(user, None)
    if allowed is not None:
        stmt = stmt.where(Branch.id.in_(allowed))
    return list(db.scalars(stmt).all())


@router.get("", response_model=list[BranchOut])
def list_branches(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> list[Branch]:
    return _visible_branches(db, user)


# Declared before /{branch_id} so "occupancy" is not read as a branch id.
@router.get("/occupancy", response_model=list[OccupancyOut])
def all_occupancy(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> list[OccupancyOut]:
    return [
        OccupancyOut(**attendance_service.branch_occupancy(db, branch))
        for branch in _visible_branches(db, user)
    ]


@router.get("/{branch_id}", response_model=BranchOut)
def get_branch(
    branch_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> Branch:
    return resolve_branch(db, user, branch_id)


@router.get("/{branch_id}/checkin-qr", response_model=BranchQrOut)
def branch_checkin_qr(
    branch_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> BranchQrOut:
    """The code shown on the branch's desk screen.

    Restricted to management: this token is what proves someone is physically
    at the branch, so serving it to a trainer's own phone would defeat the
    point of scanning it.
    """
    branch = resolve_branch(db, user, branch_id)
    if user.role.key not in MANAGEMENT_ROLES:
        raise HTTPException(status_code=403, detail="Only branch management can display the QR")

    return BranchQrOut(
        branch_id=branch.id,
        branch_code=branch.code,
        token=qr_domain.issue_token(branch.id, branch.qr_secret),
        rotates_in_seconds=qr_domain.seconds_until_rotation(),
        window_seconds=settings.qr_window_seconds,
        server_time=now_utc(),
    )


@router.get("/{branch_id}/occupancy", response_model=OccupancyOut)
def branch_occupancy(
    branch_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> OccupancyOut:
    branch = resolve_branch(db, user, branch_id)
    return OccupancyOut(**attendance_service.branch_occupancy(db, branch))


__all__ = ["router"]

"""The intelligence surface.

One protected read per role-facing view. The data behind it — training
consistency, inactivity, records, trend, plateau, journey and membership
signals — is computed deterministically from what the member logged; the
response's only non-deterministic field is the ``headline`` sentence, which a
narration provider may rephrase and which always has a template fallback.

Authorization reuses ``assert_can_read_member`` exactly as the journey and
workout endpoints do: a member reaches only their own record, a trainer only
members at their branch, management only branches in scope. There is no
by-arbitrary-id path around it.
"""

from __future__ import annotations

from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.orm import Session, joinedload

from app.core.deps import get_current_user
from app.db.models import Member, User
from app.db.session import get_db
from app.services.intelligence import build_member_intelligence, build_narrator
from app.services.intelligence.schemas import MemberIntelligence

from .journeys import _load_member, assert_can_read_member

router = APIRouter(prefix="/intelligence", tags=["intelligence"])


@router.get("/members/{member_id}", response_model=MemberIntelligence)
def member_intelligence(
    member_id: int,
    on: date | None = Query(default=None, description="Analyse as of this date (testing)."),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> MemberIntelligence:
    member = _load_member(db, member_id)
    assert_can_read_member(db, user, member)
    return build_member_intelligence(db, member, today=on, narrator=build_narrator())


@router.get("/me", response_model=MemberIntelligence)
def my_intelligence(
    on: date | None = Query(default=None),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> MemberIntelligence:
    """A member's own intelligence without needing to know their member id."""
    member = db.scalar(
        select(Member)
        .options(joinedload(Member.user), joinedload(Member.branch))
        .where(Member.user_id == user.id)
    )
    if member is None:
        raise HTTPException(status_code=404, detail="This account has no member record")
    return build_member_intelligence(db, member, today=on, narrator=build_narrator())


__all__ = ["router"]

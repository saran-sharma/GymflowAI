"""The intelligence surface.

One protected read per role-facing view. The data behind it — training
consistency, inactivity, records, trend, plateau, journey and membership
signals — is computed deterministically from what the member logged; the
response's only non-deterministic field is the ``headline`` sentence, which a
narration provider may rephrase and which always has a template fallback.

Authorization reuses ``assert_can_read_member`` exactly as the journey and
workout endpoints do: a member reaches only their own record, a trainer only
members at their branch, management only branches in scope. There is no
by-arbitrary-id path around it. The trainer brief and attention queue add a
staff-only gate on top — they are coaching tools, not something a member reads
about themselves.
"""

from __future__ import annotations

from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.orm import Session, joinedload

from app.core.deps import get_current_user, require_management, scoped_branch_filter
from app.db.models import Branch, Member, RoleKey, Trainer, User
from app.db.session import get_db
from app.services.intelligence import build_member_intelligence, build_narrator
from app.services.intelligence.owner import build_owner_daily_brief
from app.services.intelligence.progression import recommendation_for
from app.services.intelligence.schemas import (
    MemberIntelligence,
    OwnerDailyBrief,
    ProgressionRecommendation,
    TrainerAttentionQueue,
    TrainerBrief,
    WeeklySummary,
)
from app.services.intelligence.trainer import build_attention_queue, build_trainer_brief
from app.services.intelligence.weekly import member_weekly_summary, owner_weekly_summary

from .journeys import _load_member, _trainer_of, assert_can_read_member
from .trainers import _my_trainer

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


@router.get(
    "/members/{member_id}/exercises/{exercise}/recommendation",
    response_model=ProgressionRecommendation,
)
def exercise_recommendation(
    member_id: int,
    exercise: str,
    target_reps: str | None = Query(default=None),
    before_session_id: int | None = Query(default=None),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> ProgressionRecommendation:
    """A conservative next-weight suggestion for one lift.

    Advisory only — it sits beside the trainer's programme and never rewrites
    it (a workout item has a rep target, not a weight). Same read rule as the
    rest of the surface.
    """
    member = _load_member(db, member_id)
    assert_can_read_member(db, user, member)
    rec = recommendation_for(
        db,
        member_id=member.id,
        exercise=exercise,
        target_reps=target_reps,
        before_session_id=before_session_id,
    )
    return ProgressionRecommendation.from_domain(rec)


@router.get(
    "/me/exercises/{exercise}/recommendation",
    response_model=ProgressionRecommendation,
)
def my_exercise_recommendation(
    exercise: str,
    target_reps: str | None = Query(default=None),
    before_session_id: int | None = Query(default=None),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> ProgressionRecommendation:
    member = db.scalar(select(Member).where(Member.user_id == user.id))
    if member is None:
        raise HTTPException(status_code=404, detail="This account has no member record")
    rec = recommendation_for(
        db,
        member_id=member.id,
        exercise=exercise,
        target_reps=target_reps,
        before_session_id=before_session_id,
    )
    return ProgressionRecommendation.from_domain(rec)


@router.get("/me/weekly", response_model=WeeklySummary)
def my_weekly_summary(
    week_ending: date | None = Query(default=None),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> WeeklySummary:
    member = db.scalar(select(Member).where(Member.user_id == user.id))
    if member is None:
        raise HTTPException(status_code=404, detail="This account has no member record")
    return member_weekly_summary(db, member, week_ending=week_ending, narrator=build_narrator())


@router.get("/members/{member_id}/weekly", response_model=WeeklySummary)
def member_weekly(
    member_id: int,
    week_ending: date | None = Query(default=None),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> WeeklySummary:
    member = _load_member(db, member_id)
    assert_can_read_member(db, user, member)
    return member_weekly_summary(db, member, week_ending=week_ending, narrator=build_narrator())


@router.get("/owner/weekly", response_model=WeeklySummary)
def owner_weekly(
    branch_id: int | None = Query(default=None),
    week_ending: date | None = Query(default=None),
    db: Session = Depends(get_db),
    user: User = Depends(require_management),
) -> WeeklySummary:
    allowed = scoped_branch_filter(user, branch_id)
    scope_label = "All branches"
    if allowed is not None and len(allowed) == 1:
        branch = db.get(Branch, allowed[0])
        scope_label = branch.name if branch else "One branch"
    return owner_weekly_summary(
        db,
        branch_ids=allowed,
        scope_label=scope_label,
        week_ending=week_ending,
        narrator=build_narrator(),
    )


@router.get("/members/{member_id}/brief", response_model=TrainerBrief)
def trainer_brief(
    member_id: int,
    on: date | None = Query(default=None),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> TrainerBrief:
    """The coach's structured read of one member.

    Same branch rule as the rest of the surface, plus a staff gate: a member
    does not get a "suggested focus" list about themselves.
    """
    if user.role.key == RoleKey.MEMBER.value:
        raise HTTPException(status_code=403, detail="The trainer brief is a staff view")
    member = _load_member(db, member_id)
    assert_can_read_member(db, user, member)
    trainer = _trainer_of(db, user)
    return build_trainer_brief(
        db,
        member,
        trainer_id=trainer.id if trainer else None,
        today=on,
        narrator=build_narrator(),
    )


@router.get("/trainer/attention", response_model=TrainerAttentionQueue)
def trainer_attention(
    on: date | None = Query(default=None),
    limit: int = Query(default=20, ge=1, le=100),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> TrainerAttentionQueue:
    """The signed-in trainer's assigned members, ranked by why they need a look.

    Scoped to the assignment — the people this trainer coaches — not the whole
    branch.
    """
    trainer: Trainer = _my_trainer(db, user)
    return build_attention_queue(db, trainer, today=on, limit=limit)


@router.get("/owner/daily-brief", response_model=OwnerDailyBrief)
def owner_daily_brief(
    branch_id: int | None = Query(default=None),
    on: date | None = Query(default=None),
    db: Session = Depends(get_db),
    user: User = Depends(require_management),
) -> OwnerDailyBrief:
    """The owner's "what needs my attention today?" — aggregate counts across
    the branches this account may see, never invented revenue."""
    allowed = scoped_branch_filter(user, branch_id)
    scope_label = "All branches"
    if allowed is not None and len(allowed) == 1:
        branch = db.get(Branch, allowed[0])
        scope_label = branch.name if branch else "One branch"
    return build_owner_daily_brief(
        db,
        branch_ids=allowed,
        scope_label=scope_label,
        today=on,
        narrator=build_narrator(),
    )


__all__ = ["router"]

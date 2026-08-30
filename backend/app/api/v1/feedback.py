"""Trainer feedback: the member submits, the owner moderates, both see numbers.

Nothing a member sends is visible anywhere until an owner approves it
(`feedback_service`). A trainer can read their own approved testimonials and
summary but has no moderation route at all — the moderation endpoints require
management, and even a management user is refused if the review is of
themselves.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy import select
from sqlalchemy.orm import Session, joinedload

from app.core.config import settings
from app.core.deps import (
    assert_branch_access,
    get_current_user,
    require_management,
    visible_branch_ids,
)
from app.db.models import (
    Member,
    PTSession,
    RoleKey,
    SessionStatus,
    Trainer,
    TrainerReview,
    TrainerReviewStatus,
    User,
    WorkoutSession,
)
from app.db.session import get_db
from app.schemas.common import MessageOut
from app.schemas.feedback import (
    MemberReviewOut,
    ModerationReviewOut,
    RatingSummaryOut,
    ReviewConsentRequest,
    ReviewCreateRequest,
    ReviewModerateRequest,
    ReviewModerationOut,
    ReviewPromptOut,
    ReviewReportRequest,
    TestimonialOut,
    TrainerBrief,
    TrainerSummaryRow,
    TrainerTestimonialsOut,
)
from app.services import feedback_service

router = APIRouter(prefix="/feedback", tags=["feedback"])


# --------------------------------------------------------------- helpers


def _current_member(db: Session, user: User) -> Member:
    member = db.scalar(
        select(Member)
        .options(joinedload(Member.user), joinedload(Member.branch))
        .where(Member.user_id == user.id)
    )
    if member is None:
        raise HTTPException(status_code=403, detail="This account is not a member")
    return member


def _current_trainer(db: Session, user: User) -> Trainer:
    trainer = db.scalar(
        select(Trainer).options(joinedload(Trainer.user)).where(Trainer.user_id == user.id)
    )
    if trainer is None:
        raise HTTPException(status_code=403, detail="This account is not a trainer")
    return trainer


def _trainer_brief(trainer: Trainer) -> TrainerBrief:
    return TrainerBrief(
        id=trainer.id,
        name=trainer.user.full_name,
        designation=trainer.designation,
        branch_id=trainer.branch_id,
    )


def _load_trainer(db: Session, trainer_id: int) -> Trainer:
    trainer = db.scalar(
        select(Trainer).options(joinedload(Trainer.user)).where(Trainer.id == trainer_id)
    )
    if trainer is None:
        raise HTTPException(status_code=404, detail="Trainer not found")
    return trainer


def _member_review_out(review: TrainerReview) -> MemberReviewOut:
    return MemberReviewOut(
        id=review.id,
        trainer=_trainer_brief(review.trainer),
        rating=review.rating,
        comment=review.comment,
        status=review.status,
        display_name_consent=review.display_name_consent,
        can_retract=feedback_service.can_retract(review),
        reported=review.reported,
        created_at=review.created_at,
        published_at=review.published_at,
    )


def _moderation_review_out(db: Session, review: TrainerReview) -> ModerationReviewOut:
    return ModerationReviewOut(
        id=review.id,
        trainer=_trainer_brief(review.trainer),
        author_label=feedback_service.review_author_label(review),
        member_id=review.member_id,
        branch_id=review.branch_id,
        rating=review.rating,
        comment=review.comment,
        status=review.status,
        reported=review.reported,
        reported_reason=review.reported_reason,
        created_at=review.created_at,
        published_at=review.published_at,
        moderations=[
            ReviewModerationOut.model_validate(m)
            for m in feedback_service.review_moderations(db, review)
        ],
    )


def _summary_out(summary: feedback_service.RatingSummary) -> RatingSummaryOut:
    return RatingSummaryOut(
        trainer_id=summary.trainer_id,
        average_rating=summary.average_rating,
        review_count=summary.review_count,
        pending_count=summary.pending_count,
        approved_testimonial_count=summary.approved_testimonial_count,
        recent_average=summary.recent_average,
        trend=summary.trend,
    )


def _load_review(db: Session, review_id: int) -> TrainerReview:
    review = db.scalar(
        select(TrainerReview)
        .options(
            joinedload(TrainerReview.trainer).joinedload(Trainer.user),
            joinedload(TrainerReview.member).joinedload(Member.user),
        )
        .where(TrainerReview.id == review_id)
    )
    if review is None:
        raise HTTPException(status_code=404, detail="Review not found")
    return review


# ------------------------------------------------------ member: submit + own


@router.get("/reviews/prompt", response_model=ReviewPromptOut)
def review_prompt(
    workout_session_id: int | None = Query(default=None),
    pt_session_id: int | None = Query(default=None),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> ReviewPromptOut:
    """After a workout/PT session completes the app asks here whether to show
    the "How was your experience with …" prompt."""
    member = _current_member(db, user)
    base = ReviewPromptOut(
        eligible=False,
        already_reviewed=False,
        trainer=None,
        policy_version=settings.feedback_policy_version,
        support_contact=settings.support_contact,
    )

    trainer: Trainer | None = None
    if workout_session_id is not None:
        session = db.get(WorkoutSession, workout_session_id)
        if session is None or session.member_id != member.id:
            return base
        base.already_reviewed = (
            feedback_service.existing_review(
                db, member_id=member.id, workout_session_id=workout_session_id
            )
            is not None
        )
        if session.status == SessionStatus.COMPLETED and session.supervising_trainer_id:
            trainer = _load_trainer(db, session.supervising_trainer_id)
    elif pt_session_id is not None:
        pt = db.get(PTSession, pt_session_id)
        if pt is None or pt.member_id != member.id:
            return base
        base.already_reviewed = (
            feedback_service.existing_review(db, member_id=member.id, pt_session_id=pt_session_id)
            is not None
        )
        if pt.status == SessionStatus.COMPLETED:
            trainer = _load_trainer(db, pt.trainer_id)

    if trainer is not None:
        base.trainer = _trainer_brief(trainer)
        base.eligible = not base.already_reviewed
    return base


@router.post("/reviews", response_model=MemberReviewOut, status_code=201)
def submit_review(
    payload: ReviewCreateRequest,
    request: Request,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> MemberReviewOut:
    member = _current_member(db, user)

    workout_session: WorkoutSession | None = None
    pt_session: PTSession | None = None
    trainer: Trainer | None = None

    if payload.workout_session_id is not None:
        workout_session = db.get(WorkoutSession, payload.workout_session_id)
        if workout_session is None or workout_session.member_id != member.id:
            raise HTTPException(status_code=404, detail="Workout not found")
        if workout_session.status != SessionStatus.COMPLETED:
            raise HTTPException(status_code=409, detail="That workout is not finished yet")
        if not workout_session.supervising_trainer_id:
            raise HTTPException(status_code=422, detail="That workout had no trainer to review")
        trainer = _load_trainer(db, workout_session.supervising_trainer_id)
    elif payload.pt_session_id is not None:
        pt_session = db.get(PTSession, payload.pt_session_id)
        if pt_session is None or pt_session.member_id != member.id:
            raise HTTPException(status_code=404, detail="PT session not found")
        if pt_session.status != SessionStatus.COMPLETED:
            raise HTTPException(status_code=409, detail="That PT session is not finished yet")
        trainer = _load_trainer(db, pt_session.trainer_id)
    else:
        raise HTTPException(status_code=422, detail="A session reference is required")

    try:
        review = feedback_service.create_review(
            db,
            member=member,
            trainer=trainer,
            rating=payload.rating,
            comment=payload.comment,
            display_name_consent=payload.display_name_consent,
            policy_ack=payload.policy_ack,
            workout_session=workout_session,
            pt_session=pt_session,
            request=request,
        )
    except feedback_service.ReviewError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    review.trainer = trainer
    return _member_review_out(review)


@router.get("/reviews/me", response_model=list[MemberReviewOut])
def my_reviews(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> list[MemberReviewOut]:
    member = _current_member(db, user)
    return [_member_review_out(r) for r in feedback_service.list_member_reviews(db, member)]


@router.patch("/reviews/{review_id}/consent", response_model=MemberReviewOut)
def update_consent(
    review_id: int,
    payload: ReviewConsentRequest,
    request: Request,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> MemberReviewOut:
    review = _load_review(db, review_id)
    if review.member.user_id != user.id:
        raise HTTPException(status_code=403, detail="This is not your review")
    feedback_service.set_display_consent(
        db, review, consent=payload.display_name_consent, actor=user, request=request
    )
    return _member_review_out(review)


@router.delete("/reviews/{review_id}", response_model=MessageOut)
def retract_review(
    review_id: int,
    request: Request,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> MessageOut:
    review = _load_review(db, review_id)
    if review.member.user_id != user.id:
        raise HTTPException(status_code=403, detail="This is not your review")
    try:
        feedback_service.retract_review(db, review, actor=user, request=request)
    except feedback_service.ReviewError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    return MessageOut(message="Your review was withdrawn.")


@router.post("/reviews/{review_id}/report", response_model=MessageOut)
def report_review(
    review_id: int,
    payload: ReviewReportRequest,
    request: Request,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> MessageOut:
    """Objectionable-content report. Available to the member who wrote it and
    to management for the branch; it flags the row at the top of the queue."""
    review = _load_review(db, review_id)
    role = user.role.key
    if role == RoleKey.MEMBER.value:
        if review.member.user_id != user.id:
            raise HTTPException(status_code=403, detail="This is not your review")
    elif role in ("owner", "super_admin", "branch_manager"):
        assert_branch_access(user, review.branch_id)
    else:
        raise HTTPException(status_code=403, detail="Not permitted")
    feedback_service.report_review(db, review, reason=payload.reason, actor=user, request=request)
    return MessageOut(message="Thanks — this review has been sent to the gym owner to check.")


# --------------------------------------------------------- owner moderation


@router.get("/reviews", response_model=list[ModerationReviewOut])
def moderation_queue(
    status: TrainerReviewStatus | None = Query(default=None),
    reported: bool = Query(default=False),
    db: Session = Depends(get_db),
    user: User = Depends(require_management),
) -> list[ModerationReviewOut]:
    reviews = feedback_service.moderation_queue(
        db,
        branch_ids=visible_branch_ids(db, user),
        status=status,
        reported_only=reported,
    )
    return [_moderation_review_out(db, r) for r in reviews]


@router.post("/reviews/{review_id}/moderate", response_model=ModerationReviewOut)
def moderate_review(
    review_id: int,
    payload: ReviewModerateRequest,
    request: Request,
    db: Session = Depends(get_db),
    user: User = Depends(require_management),
) -> ModerationReviewOut:
    review = _load_review(db, review_id)
    assert_branch_access(user, review.branch_id)
    try:
        feedback_service.moderate_review(
            db,
            review,
            action=payload.action,
            actor=user,
            note=payload.note,
            request=request,
        )
    except feedback_service.ReviewError as exc:
        raise HTTPException(status_code=403, detail=str(exc)) from exc
    return _moderation_review_out(db, review)


@router.get("/trainer-summaries", response_model=list[TrainerSummaryRow])
def trainer_summaries(
    db: Session = Depends(get_db),
    user: User = Depends(require_management),
) -> list[TrainerSummaryRow]:
    rows = feedback_service.owner_trainer_summaries(db, branch_ids=visible_branch_ids(db, user))
    return [TrainerSummaryRow(trainer=_trainer_brief(t), summary=_summary_out(s)) for t, s in rows]


# ---------------------------------------------------- trainer profile view


@router.get("/me/rating-summary", response_model=RatingSummaryOut)
def my_rating_summary(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> RatingSummaryOut:
    trainer = _current_trainer(db, user)
    return _summary_out(feedback_service.rating_summary(db, trainer))


@router.get("/trainers/{trainer_id}/testimonials", response_model=TrainerTestimonialsOut)
def trainer_testimonials(
    trainer_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> TrainerTestimonialsOut:
    """Approved testimonials for a trainer. Any authenticated user may read
    them, restricted to their branch scope — a member sees their own
    trainer's, a trainer sees their own, management sees any in scope."""
    trainer = _load_trainer(db, trainer_id)
    if user.role.key not in ("owner", "super_admin"):
        assert_branch_access(user, trainer.branch_id)
    approved = feedback_service.approved_testimonials(db, trainer)
    return TrainerTestimonialsOut(
        trainer=_trainer_brief(trainer),
        summary=_summary_out(feedback_service.rating_summary(db, trainer)),
        testimonials=[
            TestimonialOut(
                id=r.id,
                rating=r.rating,
                comment=r.comment,
                author_label=feedback_service.review_author_label(r),
                published_at=r.published_at,
            )
            for r in approved
        ],
    )


__all__ = ["router"]

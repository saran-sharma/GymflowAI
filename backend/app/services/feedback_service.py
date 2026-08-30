"""Post-workout trainer feedback, owner moderation, and the numbers both roles see.

A member's rating is created ``pending`` and is invisible everywhere until an
owner approves it. Nothing here publishes to a trainer profile directly, a
trainer can never moderate a review of themselves, and every moderation step
writes both a ``TrainerReviewModeration`` row (for the owner's inline history)
and an ``AuditLog`` entry (the tamper-evident trail).

Identity is withheld by default: a testimonial reads "Verified GymFlow Member"
unless the member ticked ``display_name_consent``, and even then it is only a
first name plus a last initial.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import timedelta

from fastapi import Request
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.clock import now_utc
from app.core.config import settings
from app.db.models import (
    Member,
    PTSession,
    ReviewModerationAction,
    Trainer,
    TrainerReview,
    TrainerReviewModeration,
    TrainerReviewStatus,
    User,
    WorkoutSession,
)
from app.services import audit

ACTION_REVIEW_SUBMITTED = "feedback.review_submitted"
ACTION_REVIEW_RETRACTED = "feedback.review_retracted"
ACTION_REVIEW_CONSENT = "feedback.review_consent_changed"
ACTION_REVIEW_REPORTED = "feedback.review_reported"
ACTION_REVIEW_MODERATED = "feedback.review_moderated"

COMMENT_MAX = 1000
REPORT_REASON_MAX = 500
NOTE_MAX = 2000


class ReviewError(ValueError):
    """A rule the caller broke — mapped to 4xx by the router."""


# ------------------------------------------------------------------ create


def existing_review(
    db: Session,
    *,
    member_id: int,
    workout_session_id: int | None = None,
    pt_session_id: int | None = None,
) -> TrainerReview | None:
    stmt = select(TrainerReview).where(TrainerReview.member_id == member_id)
    if workout_session_id is not None:
        stmt = stmt.where(TrainerReview.workout_session_id == workout_session_id)
    elif pt_session_id is not None:
        stmt = stmt.where(TrainerReview.pt_session_id == pt_session_id)
    else:
        return None
    return db.scalar(stmt)


def create_review(
    db: Session,
    *,
    member: Member,
    trainer: Trainer,
    rating: int,
    comment: str | None = None,
    display_name_consent: bool = False,
    policy_ack: bool = False,
    workout_session: WorkoutSession | None = None,
    pt_session: PTSession | None = None,
    request: Request | None = None,
) -> TrainerReview:
    if not policy_ack:
        raise ReviewError("The review policy must be acknowledged before submitting.")
    if rating not in (1, 2, 3, 4, 5):
        raise ReviewError("Rating must be a whole number from 1 to 5.")
    if workout_session is None and pt_session is None:
        raise ReviewError("A review must reference the session it came from.")

    text = (comment or "").strip() or None
    if text and len(text) > COMMENT_MAX:
        raise ReviewError(f"Comment must be {COMMENT_MAX} characters or fewer.")

    if existing_review(
        db,
        member_id=member.id,
        workout_session_id=workout_session.id if workout_session else None,
        pt_session_id=pt_session.id if pt_session else None,
    ):
        raise ReviewError("This session has already been reviewed.")

    review = TrainerReview(
        member_id=member.id,
        trainer_id=trainer.id,
        branch_id=member.branch_id,
        workout_session_id=workout_session.id if workout_session else None,
        pt_session_id=pt_session.id if pt_session else None,
        rating=rating,
        comment=text,
        status=TrainerReviewStatus.PENDING,
        display_name_consent=bool(display_name_consent),
        policy_ack_version=settings.feedback_policy_version,
    )
    db.add(review)
    db.flush()
    audit.record(
        db,
        action=ACTION_REVIEW_SUBMITTED,
        actor=member.user,
        entity_type="trainer_review",
        entity_id=review.id,
        branch_id=member.branch_id,
        request=request,
        details={"trainer_id": trainer.id, "rating": rating, "has_comment": text is not None},
    )
    return review


# ------------------------------------------------------ member self-service


def list_member_reviews(db: Session, member: Member) -> list[TrainerReview]:
    return list(
        db.scalars(
            select(TrainerReview)
            .where(TrainerReview.member_id == member.id)
            .order_by(TrainerReview.created_at.desc())
        )
    )


def can_retract(review: TrainerReview) -> bool:
    """A member may pull a review only before it is published — i.e. while it
    is still pending."""
    return review.status == TrainerReviewStatus.PENDING


def retract_review(
    db: Session, review: TrainerReview, *, actor: User, request: Request | None = None
) -> None:
    if not can_retract(review):
        raise ReviewError("A review can only be withdrawn while it is still pending.")
    audit.record(
        db,
        action=ACTION_REVIEW_RETRACTED,
        actor=actor,
        entity_type="trainer_review",
        entity_id=review.id,
        branch_id=review.branch_id,
        request=request,
        details={"trainer_id": review.trainer_id, "rating": review.rating},
    )
    db.delete(review)
    db.flush()


def set_display_consent(
    db: Session,
    review: TrainerReview,
    *,
    consent: bool,
    actor: User,
    request: Request | None = None,
) -> TrainerReview:
    """Turning consent off re-anonymises an already-approved testimonial
    without un-publishing it (§5)."""
    review.display_name_consent = bool(consent)
    db.flush()
    audit.record(
        db,
        action=ACTION_REVIEW_CONSENT,
        actor=actor,
        entity_type="trainer_review",
        entity_id=review.id,
        branch_id=review.branch_id,
        request=request,
        details={
            "display_name_consent": review.display_name_consent,
            "status": review.status.value,
        },
    )
    return review


def report_review(
    db: Session,
    review: TrainerReview,
    *,
    reason: str | None,
    actor: User,
    request: Request | None = None,
) -> TrainerReview:
    review.reported = True
    review.reported_reason = (reason or "").strip()[:REPORT_REASON_MAX] or None
    review.reported_at = now_utc()
    db.add(
        TrainerReviewModeration(
            review_id=review.id,
            actor_user_id=actor.id,
            actor_role=actor.role.key if actor.role else None,
            action=ReviewModerationAction.REPORT,
            from_status=review.status,
            to_status=review.status,
            note=review.reported_reason,
        )
    )
    db.flush()
    audit.record(
        db,
        action=ACTION_REVIEW_REPORTED,
        actor=actor,
        entity_type="trainer_review",
        entity_id=review.id,
        branch_id=review.branch_id,
        request=request,
        details={"trainer_id": review.trainer_id},
    )
    return review


# ------------------------------------------------------------ moderation


_STATUS_FOR_ACTION = {
    ReviewModerationAction.APPROVE: TrainerReviewStatus.APPROVED,
    ReviewModerationAction.REJECT: TrainerReviewStatus.REJECTED,
    ReviewModerationAction.REMOVE: TrainerReviewStatus.REMOVED,
    ReviewModerationAction.REINSTATE: TrainerReviewStatus.APPROVED,
}


def moderate_review(
    db: Session,
    review: TrainerReview,
    *,
    action: ReviewModerationAction,
    actor: User,
    note: str | None = None,
    request: Request | None = None,
) -> TrainerReview:
    """Owner action on a review. `NOTE` records a private internal note with
    no status change; every other action moves the status and stamps
    ``published_at`` when it becomes approved."""
    if review.trainer.user_id == actor.id:
        raise ReviewError("A trainer cannot moderate a review of themselves.")

    clean_note = (note or "").strip()[:NOTE_MAX] or None
    from_status = review.status

    if action == ReviewModerationAction.NOTE:
        if not clean_note:
            raise ReviewError("An internal note cannot be empty.")
        to_status = from_status
    else:
        to_status = _STATUS_FOR_ACTION.get(action)
        if to_status is None:
            raise ReviewError(f"Unsupported moderation action: {action.value}.")
        review.status = to_status
        if to_status == TrainerReviewStatus.APPROVED:
            review.published_at = review.published_at or now_utc()
        elif to_status in (TrainerReviewStatus.REJECTED, TrainerReviewStatus.REMOVED):
            # Keep the row and its history; it is simply no longer shown.
            review.published_at = (
                None if to_status == TrainerReviewStatus.REJECTED else review.published_at
            )

    db.add(
        TrainerReviewModeration(
            review_id=review.id,
            actor_user_id=actor.id,
            actor_role=actor.role.key if actor.role else None,
            action=action,
            from_status=from_status,
            to_status=to_status,
            note=clean_note,
        )
    )
    db.flush()
    audit.record(
        db,
        action=ACTION_REVIEW_MODERATED,
        actor=actor,
        entity_type="trainer_review",
        entity_id=review.id,
        branch_id=review.branch_id,
        request=request,
        details={
            "moderation_action": action.value,
            "from": from_status.value,
            "to": to_status.value,
            "trainer_id": review.trainer_id,
        },
    )
    return review


def moderation_queue(
    db: Session,
    *,
    branch_ids: list[int] | None,
    status: TrainerReviewStatus | None = None,
    reported_only: bool = False,
) -> list[TrainerReview]:
    stmt = select(TrainerReview)
    if branch_ids is not None:
        stmt = stmt.where(TrainerReview.branch_id.in_(branch_ids))
    if status is not None:
        stmt = stmt.where(TrainerReview.status == status)
    if reported_only:
        stmt = stmt.where(TrainerReview.reported.is_(True))
    # Reported first, then newest.
    return list(
        db.scalars(stmt.order_by(TrainerReview.reported.desc(), TrainerReview.created_at.desc()))
    )


def review_moderations(db: Session, review: TrainerReview) -> list[TrainerReviewModeration]:
    return list(
        db.scalars(
            select(TrainerReviewModeration)
            .where(TrainerReviewModeration.review_id == review.id)
            .order_by(TrainerReviewModeration.id)
        )
    )


# --------------------------------------------------------------- display


def member_display_name(member: Member) -> str:
    """First name + last initial, e.g. "Aditya R." — never the full name."""
    parts = (member.user.full_name or "").split()
    if not parts:
        return "Verified GymFlow Member"
    if len(parts) == 1:
        return parts[0]
    return f"{parts[0]} {parts[-1][0]}."


def review_author_label(review: TrainerReview) -> str:
    if review.display_name_consent:
        return member_display_name(review.member)
    return "Verified GymFlow Member"


def approved_testimonials(db: Session, trainer: Trainer, *, limit: int = 20) -> list[TrainerReview]:
    return list(
        db.scalars(
            select(TrainerReview)
            .where(
                TrainerReview.trainer_id == trainer.id,
                TrainerReview.status == TrainerReviewStatus.APPROVED,
            )
            .order_by(
                TrainerReview.published_at.desc().nullslast(), TrainerReview.created_at.desc()
            )
            .limit(limit)
        )
    )


# --------------------------------------------------------------- analytics


@dataclass(frozen=True)
class RatingSummary:
    trainer_id: int
    average_rating: float | None
    review_count: int  # approved
    pending_count: int
    approved_testimonial_count: int  # approved AND has a comment
    recent_average: float | None  # approved in the last 30 days
    trend: float | None  # recent_average minus the 30 days before that


def _avg(db: Session, trainer_id: int, *, since=None, until=None) -> tuple[float | None, int]:
    stmt = select(func.avg(TrainerReview.rating), func.count(TrainerReview.id)).where(
        TrainerReview.trainer_id == trainer_id,
        TrainerReview.status == TrainerReviewStatus.APPROVED,
    )
    if since is not None:
        stmt = stmt.where(TrainerReview.created_at >= since)
    if until is not None:
        stmt = stmt.where(TrainerReview.created_at < until)
    avg, count = db.execute(stmt).one()
    return (float(avg) if avg is not None else None, int(count or 0))


def rating_summary(db: Session, trainer: Trainer) -> RatingSummary:
    overall_avg, approved_count = _avg(db, trainer.id)
    now = now_utc()
    recent_avg, _ = _avg(db, trainer.id, since=now - timedelta(days=30))
    prior_avg, _ = _avg(
        db, trainer.id, since=now - timedelta(days=60), until=now - timedelta(days=30)
    )
    pending_count = int(
        db.scalar(
            select(func.count(TrainerReview.id)).where(
                TrainerReview.trainer_id == trainer.id,
                TrainerReview.status == TrainerReviewStatus.PENDING,
            )
        )
        or 0
    )
    testimonial_count = int(
        db.scalar(
            select(func.count(TrainerReview.id)).where(
                TrainerReview.trainer_id == trainer.id,
                TrainerReview.status == TrainerReviewStatus.APPROVED,
                TrainerReview.comment.is_not(None),
            )
        )
        or 0
    )
    trend = (
        round(recent_avg - prior_avg, 2)
        if recent_avg is not None and prior_avg is not None
        else None
    )
    return RatingSummary(
        trainer_id=trainer.id,
        average_rating=round(overall_avg, 2) if overall_avg is not None else None,
        review_count=approved_count,
        pending_count=pending_count,
        approved_testimonial_count=testimonial_count,
        recent_average=round(recent_avg, 2) if recent_avg is not None else None,
        trend=trend,
    )


def owner_trainer_summaries(
    db: Session, *, branch_ids: list[int] | None
) -> list[tuple[Trainer, RatingSummary]]:
    stmt = select(Trainer).where(Trainer.is_active.is_(True))
    if branch_ids is not None:
        stmt = stmt.where(Trainer.branch_id.in_(branch_ids))
    trainers = list(db.scalars(stmt.order_by(Trainer.id)))
    return [(t, rating_summary(db, t)) for t in trainers]


__all__ = [
    "ACTION_REVIEW_MODERATED",
    "ACTION_REVIEW_REPORTED",
    "ACTION_REVIEW_SUBMITTED",
    "COMMENT_MAX",
    "RatingSummary",
    "ReviewError",
    "approved_testimonials",
    "can_retract",
    "create_review",
    "existing_review",
    "list_member_reviews",
    "member_display_name",
    "moderate_review",
    "moderation_queue",
    "owner_trainer_summaries",
    "rating_summary",
    "report_review",
    "retract_review",
    "review_author_label",
    "review_moderations",
    "set_display_consent",
]

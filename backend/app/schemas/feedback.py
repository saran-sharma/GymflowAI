"""Request/response models for trainer feedback and progress photos.

A domain module of its own (like `payments` and `hardware`) — the surface is
self-contained and the mobile client reads it as one feature.
"""

from __future__ import annotations

from datetime import date, datetime

from pydantic import BaseModel, ConfigDict, Field

from app.db.models import ProgressPhotoAngle, ReviewModerationAction, TrainerReviewStatus


class ORMModel(BaseModel):
    model_config = ConfigDict(from_attributes=True)


# ---------------------------------------------------------- trainer reviews


class TrainerBrief(BaseModel):
    id: int
    name: str
    designation: str | None = None
    branch_id: int


class ReviewPromptOut(BaseModel):
    """What the app needs to decide whether to show the post-workout prompt."""

    eligible: bool
    already_reviewed: bool
    trainer: TrainerBrief | None = None
    policy_version: str
    support_contact: str


class ReviewCreateRequest(BaseModel):
    workout_session_id: int | None = None
    pt_session_id: int | None = None
    rating: int = Field(ge=1, le=5)
    comment: str | None = Field(default=None, max_length=1000)
    display_name_consent: bool = False
    policy_ack: bool = False


class ReviewConsentRequest(BaseModel):
    display_name_consent: bool


class ReviewReportRequest(BaseModel):
    reason: str | None = Field(default=None, max_length=500)


class ReviewModerateRequest(BaseModel):
    action: ReviewModerationAction
    note: str | None = Field(default=None, max_length=2000)


class ReviewModerationOut(ORMModel):
    id: int
    action: ReviewModerationAction
    from_status: TrainerReviewStatus | None
    to_status: TrainerReviewStatus | None
    note: str | None
    actor_role: str | None
    created_at: datetime


class MemberReviewOut(BaseModel):
    """A member looking at their own submitted reviews."""

    id: int
    trainer: TrainerBrief
    rating: int
    comment: str | None
    status: TrainerReviewStatus
    display_name_consent: bool
    can_retract: bool
    reported: bool
    created_at: datetime
    published_at: datetime | None


class ModerationReviewOut(BaseModel):
    """The owner's moderation queue row — carries the internal history."""

    id: int
    trainer: TrainerBrief
    author_label: str  # "Aditya R." or "Verified GymFlow Member"
    member_id: int
    branch_id: int
    rating: int
    comment: str | None
    status: TrainerReviewStatus
    reported: bool
    reported_reason: str | None
    created_at: datetime
    published_at: datetime | None
    moderations: list[ReviewModerationOut]


class TestimonialOut(BaseModel):
    """A single approved testimonial as shown on a trainer profile."""

    id: int
    rating: int
    comment: str | None
    author_label: str
    published_at: datetime | None


class RatingSummaryOut(BaseModel):
    trainer_id: int
    average_rating: float | None
    review_count: int
    pending_count: int
    approved_testimonial_count: int
    recent_average: float | None
    trend: float | None


class TrainerSummaryRow(BaseModel):
    trainer: TrainerBrief
    summary: RatingSummaryOut


class TrainerTestimonialsOut(BaseModel):
    trainer: TrainerBrief
    summary: RatingSummaryOut
    testimonials: list[TestimonialOut]


# --------------------------------------------------------- progress photos


class ProgressPhotoOut(BaseModel):
    id: int
    member_id: int
    angle: ProgressPhotoAngle
    taken_on: date
    note: str | None
    width: int | None
    height: int | None
    content_type: str
    byte_size: int
    trainer_visible: bool
    owner_visible: bool
    image_url: str
    created_at: datetime


class ProgressPhotoUpdateRequest(BaseModel):
    note: str | None = Field(default=None, max_length=500)
    note_set: bool = False
    trainer_visible: bool | None = None
    owner_visible: bool | None = None


class ProgressShareRequest(BaseModel):
    photo_id: int
    compare_photo_id: int | None = None
    caption: str | None = Field(default=None, max_length=280)
    # Only these keys are honoured; anything else is dropped server-side.
    include_date: bool = False
    include_period: bool = False
    message: str | None = Field(default=None, max_length=120)


class ProgressSharePayloadOut(BaseModel):
    share_id: int
    template: str
    brand: dict
    caption: str
    photo_url: str
    compare_photo_url: str | None
    included: dict


__all__ = [
    "MemberReviewOut",
    "ModerationReviewOut",
    "ProgressPhotoOut",
    "ProgressPhotoUpdateRequest",
    "ProgressSharePayloadOut",
    "ProgressShareRequest",
    "RatingSummaryOut",
    "ReviewConsentRequest",
    "ReviewCreateRequest",
    "ReviewModerateRequest",
    "ReviewModerationOut",
    "ReviewPromptOut",
    "ReviewReportRequest",
    "TestimonialOut",
    "TrainerBrief",
    "TrainerSummaryRow",
    "TrainerTestimonialsOut",
]

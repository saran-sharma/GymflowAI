"""Schemas for the training surfaces: journey, workouts, PT and classes.

Split out of ``common`` because these are the screens a member and a trainer
live in, and keeping them together makes the shape of the SLAM programme
readable in one file.
"""

from __future__ import annotations

from datetime import date, datetime
from typing import Any

from pydantic import BaseModel, ConfigDict, Field

from app.db.models import (
    AssessmentStatus,
    ClassStatus,
    DayStatus,
    ItemStatus,
    JourneyStatus,
    JourneyType,
    PackageStatus,
    RsvpResponse,
    SessionStatus,
    WorkoutSplit,
)


class ORMModel(BaseModel):
    model_config = ConfigDict(from_attributes=True)


# ---------------------------------------------------------------- journey


class JourneyDayOut(ORMModel):
    day_number: int
    planned_on: date
    split: WorkoutSplit
    status: DayStatus
    completed_at: datetime | None = None


class AssessmentOut(ORMModel):
    id: int
    status: AssessmentStatus
    goal: str | None = None
    height_cm: float | None = None
    weight_kg: float | None = None
    notes: str | None = None
    trainer_id: int | None = None
    recorded_at: datetime | None = None


class CardioSessionOut(ORMModel):
    id: int
    day_number: int
    duration_minutes: int
    machine: str | None = None
    completed_at: datetime


class JourneyOut(BaseModel):
    id: int
    member_id: int
    member_name: str
    branch_id: int
    journey_type: JourneyType
    status: JourneyStatus
    start_date: date
    end_date: date
    duration_days: int
    assessment_days: int
    current_day: int
    phase: str
    split_today: WorkoutSplit
    assessment_status: AssessmentStatus
    cardio_completed: int
    cardio_required: int
    days_completed: int
    workouts_completed: int
    completion_pct: float
    completed_on: date | None = None
    completion_summary: dict[str, Any] | None = None
    assigned_trainer_id: int | None = None
    assigned_trainer_name: str | None = None
    pt_converted: bool = False
    is_demo: bool = False


class StartJourneyRequest(BaseModel):
    member_id: int
    start_date: date | None = None
    trainer_id: int | None = None


class AssessmentRequest(BaseModel):
    goal: str | None = Field(default=None, max_length=160)
    height_cm: float | None = Field(default=None, gt=0, lt=300)
    weight_kg: float | None = Field(default=None, gt=0, lt=500)
    notes: str | None = Field(default=None, max_length=2000)
    completed: bool = True


class CardioRequest(BaseModel):
    day_number: int = Field(ge=1, le=10)
    duration_minutes: int = Field(ge=0, le=300)
    machine: str | None = Field(default=None, max_length=80)
    notes: str | None = Field(default=None, max_length=500)


# --------------------------------------------------------------- workouts


class WorkoutItemOut(ORMModel):
    id: int
    order_index: int
    exercise: str
    sets: int
    reps: str
    rest_seconds: int
    status: ItemStatus
    completed_at: datetime | None = None


class WorkoutSessionOut(BaseModel):
    id: int
    member_id: int
    branch_id: int
    journey_id: int | None = None
    day_number: int | None = None
    split: WorkoutSplit
    split_label: str
    session_date: date
    status: SessionStatus
    started_at: datetime | None = None
    completed_at: datetime | None = None
    supervising_trainer_id: int | None = None
    items: list[WorkoutItemOut] = []
    completed_items: int = 0
    total_items: int = 0


class PlanItemOut(ORMModel):
    id: int
    split: WorkoutSplit
    order_index: int
    exercise: str
    sets: int
    reps: str
    rest_seconds: int
    notes: str | None = None


class PlanItemUpsert(BaseModel):
    split: WorkoutSplit
    exercise: str = Field(min_length=1, max_length=120)
    sets: int = Field(ge=1, le=20)
    reps: str = Field(min_length=1, max_length=32)
    rest_seconds: int = Field(ge=0, le=600)
    notes: str | None = Field(default=None, max_length=160)


class WorkoutPlanOut(BaseModel):
    id: int
    name: str
    member_id: int | None = None
    journey_id: int | None = None
    is_active: bool
    items: list[PlanItemOut] = []


class StartWorkoutRequest(BaseModel):
    split: WorkoutSplit | None = None
    supervising_trainer_id: int | None = None


class WorkoutItemUpdate(BaseModel):
    done: bool = True


# --------------------------------------------------------------------- PT


class PTPackageOut(BaseModel):
    id: int
    member_id: int
    member_name: str | None = None
    branch_id: int
    trainer_id: int | None = None
    trainer_name: str | None = None
    sessions_total: int
    sessions_used: int
    sessions_remaining: int
    status: PackageStatus
    start_date: date
    expiry_date: date | None = None
    origin: str
    price_amount: float | None = None
    currency: str | None = None
    low_balance: bool = False


class PTSessionOut(BaseModel):
    id: int
    package_id: int
    member_id: int
    member_name: str | None = None
    trainer_id: int
    trainer_name: str | None = None
    branch_id: int
    session_date: date
    scheduled_start: datetime
    scheduled_end: datetime | None = None
    session_number: int
    package_size: int | None = None
    status: SessionStatus
    member_checked_in_at: datetime | None = None
    trainer_checked_in_at: datetime | None = None
    completed_at: datetime | None = None
    notes: str | None = None


class PTSplitViewOut(BaseModel):
    """The dual-person PT attendance view — member on one side, trainer on the other."""

    session: PTSessionOut
    member_name: str
    trainer_name: str
    member_checked_in: bool
    trainer_checked_in: bool
    can_complete: bool


class CreatePackageRequest(BaseModel):
    member_id: int
    sessions_total: int = Field(ge=1, le=200)
    trainer_id: int | None = None
    start_date: date | None = None
    expiry_date: date | None = None
    journey_id: int | None = None
    price_amount: float | None = Field(default=None, ge=0)
    currency: str | None = Field(default=None, max_length=8)


class SchedulePTRequest(BaseModel):
    package_id: int
    trainer_id: int
    scheduled_start: datetime
    scheduled_end: datetime | None = None


class PTArrivalRequest(BaseModel):
    who: str = Field(pattern="^(member|trainer)$")


class PTCompleteRequest(BaseModel):
    notes: str | None = Field(default=None, max_length=2000)


class PTCloseRequest(BaseModel):
    outcome: SessionStatus
    notes: str | None = Field(default=None, max_length=2000)


class PTOfferOut(BaseModel):
    """What the member is shown after Day 45. Pricing only if SLAM configured it."""

    eligible: bool
    headline: str
    message: str
    benefits: list[str]
    options: list[dict[str, Any]]
    disclaimer: str


# ---------------------------------------------------------- group classes


class GroupClassOut(BaseModel):
    id: int
    branch_id: int
    branch_name: str | None = None
    trainer_id: int | None = None
    trainer_name: str | None = None
    name: str
    description: str | None = None
    starts_at: datetime
    ends_at: datetime | None = None
    class_date: date
    capacity: int
    status: ClassStatus
    announcement: str | None = None
    yes_count: int = 0
    no_count: int = 0
    pending_count: int = 0
    attended_count: int = 0
    available: int = 0
    show_up_pct: float = 0.0
    my_response: RsvpResponse | None = None


class CreateClassRequest(BaseModel):
    branch_id: int
    name: str = Field(min_length=2, max_length=120)
    starts_at: datetime
    ends_at: datetime | None = None
    trainer_id: int | None = None
    capacity: int | None = Field(default=None, ge=1, le=500)
    description: str | None = Field(default=None, max_length=1000)
    announcement: str | None = Field(default=None, max_length=500)


class RsvpRequest(BaseModel):
    response: RsvpResponse


class ClassAttendanceRequest(BaseModel):
    member_ids: list[int] = Field(min_length=1, max_length=200)
    attended: bool = True


class ClassRosterEntry(BaseModel):
    member_id: int
    member_name: str
    response: RsvpResponse
    attended: bool | None = None


__all__ = [name for name in dir() if name[0].isupper()]

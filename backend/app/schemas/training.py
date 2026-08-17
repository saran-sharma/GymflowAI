"""Schemas for the training surfaces: journey, workouts, PT and classes.

Split out of ``common`` because these are the screens a member and a trainer
live in, and keeping them together makes the shape of the SLAM programme
readable in one file.
"""

from __future__ import annotations

from datetime import date, datetime, time
from typing import Any

from pydantic import BaseModel, ConfigDict, Field

from app.db.models import (
    AssessmentStatus,
    ClassStatus,
    DayStatus,
    ItemStatus,
    JourneyStatus,
    JourneyType,
    MembershipStatus,
    PackageStatus,
    RsvpResponse,
    SessionStatus,
    WorkoutSplit,
)
from app.domain.records import RecordKind


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
    # How many sets have actually been logged, against the ``sets`` the plan
    # asked for. Counted in one aggregate by ``workout_out`` rather than by
    # walking the relationship, which would be a query per exercise.
    #
    # Named apart from the model's ``logged_sets`` relationship on purpose:
    # sharing the name makes ``model_validate`` read the list of rows into this
    # integer field and fail validation.
    sets_logged: int = 0


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


# ------------------------------------------------------------ logged sets

# The bounds are the point of these schemas. A set is typed on a phone mid-
# workout, one-handed, so a fat-fingered "600" reps or a 5000 kg squat has to
# be rejected at the edge rather than stored and then explained away later in
# every chart that reads the table.

MAX_SET_NUMBER = 50
# Comfortably past the heaviest lift ever recorded, and inside NUMERIC(5, 1).
MAX_WEIGHT_KG = 1000.0
MAX_REPS = 500


class WorkoutSetOut(ORMModel):
    id: int
    session_item_id: int
    set_number: int
    weight_kg: float
    reps: int
    rpe: float | None = None
    completed_at: datetime | None = None


class WorkoutSetCreate(BaseModel):
    set_number: int = Field(ge=1, le=MAX_SET_NUMBER)
    # Zero is allowed and meaningful: a bodyweight movement carries no load.
    weight_kg: float = Field(ge=0, le=MAX_WEIGHT_KG)
    reps: int = Field(ge=1, le=MAX_REPS)
    # RPE is recorded in half points; anything finer is noise the scale does
    # not carry, and anything outside 1–10 is not on the scale at all.
    rpe: float | None = Field(default=None, ge=1, le=10, multiple_of=0.5)
    completed_at: datetime | None = None


class ExerciseSessionOut(BaseModel):
    """One past session of one exercise, with what it adds up to.

    The totals are computed from the sets in the same response rather than
    stored, so a corrected or deleted set changes them immediately and no
    figure can drift away from the rows it claims to summarise.
    """

    session_id: int
    session_date: date
    split: WorkoutSplit
    split_label: str
    sets: list[WorkoutSetOut] = []
    volume_kg: float
    top_weight_kg: float
    total_reps: int
    # None when no set in the session carried one. Never 0, which on a 1-10
    # scale would read as "effortless" rather than "not recorded".
    average_rpe: float | None = None


class PersonalRecordOut(BaseModel):
    """Something the set just logged beat.

    Values are numbers, not sentences: the app already knows how to render a
    load, and a server-built string would drift from it.
    """

    kind: RecordKind
    weight_kg: float
    reps: int
    volume_kg: float | None = None
    previous_weight_kg: float | None = None
    previous_reps: int | None = None
    previous_volume_kg: float | None = None


class WorkoutSetHistory(BaseModel):
    """Everything known about one member's history with one lift.

    ``sessions`` is most recent first and excludes the session being worked in,
    whose sets are already on screen. An empty list is the honest answer for a
    first-ever session — the app says so rather than rendering an empty table
    that looks like a failed load.

    The records look at *all* of the member's sets, not just the sessions
    returned: a "heaviest ever" that quietly meant "heaviest of the last eight"
    would be a lie.
    """

    exercise: str
    sessions: list[ExerciseSessionOut] = []
    heaviest: WorkoutSetOut | None = None
    best_volume_kg: float | None = None
    best_volume_on: date | None = None


class WorkoutSetLogged(BaseModel):
    """A stored set, and anything it beat.

    Records ride back with the write that earned them so the app never has to
    ask a second time — and so a PR can never be shown for a set the server
    did not store.
    """

    set: WorkoutSetOut
    records: list[PersonalRecordOut] = []


class WorkoutSetUpdate(BaseModel):
    """Every field optional — a correction usually touches one of them.

    ``rpe`` cannot be cleared back to null through this: an explicit null is
    indistinguishable from an omitted field in JSON, and silently wiping a
    coaching input on an unrelated edit is the worse failure.
    """

    set_number: int | None = Field(default=None, ge=1, le=MAX_SET_NUMBER)
    weight_kg: float | None = Field(default=None, ge=0, le=MAX_WEIGHT_KG)
    reps: int | None = Field(default=None, ge=1, le=MAX_REPS)
    rpe: float | None = Field(default=None, ge=1, le=10, multiple_of=0.5)
    completed_at: datetime | None = None


# --------------------------------------------------------------------- PT


class ConvertToPtRequest(BaseModel):
    """A trainer's explicit decision to move a member onto PT.

    ``confirm`` is required and must be true. It is not ceremony: this endpoint
    changes which programme is authoritative for a member, and a mistyped route
    or a double-tap should not be able to do that. The client sends it only
    after the trainer has answered a confirmation.
    """

    sessions_total: int = Field(ge=1, le=100)
    confirm: bool
    note: str | None = Field(default=None, max_length=500)


class PtConversionOut(BaseModel):
    member_id: int
    member_name: str
    trainer_id: int
    trainer_name: str
    from_training_type: str
    to_training_type: str
    package: PTPackageOut
    converted_at: datetime


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


class ActivityEntryOut(BaseModel):
    """One line of the member's timeline, labelled with which kind it is."""

    kind: str
    on: date
    at: datetime | None = None
    title: str
    detail: str | None = None
    reference_id: int | None = None
    branch_id: int | None = None


class MemberHomeOut(BaseModel):
    """Everything the member's home screen needs, in one request.

    Composed server-side rather than fetched as six calls, because the screen
    is opened on gym wifi from a phone in someone's hand.
    """

    member_id: int
    full_name: str
    branch_id: int
    branch_name: str
    membership_plan: str | None = None
    membership_status: str | None = None
    days_remaining: int | None = None
    is_inside: bool = False
    trainer_name: str | None = None
    journey: JourneyOut | None = None
    today_workout: WorkoutSessionOut | None = None
    next_pt_session: PTSessionOut | None = None
    pt_package: PTPackageOut | None = None
    next_class: GroupClassOut | None = None
    occupancy: dict[str, Any] | None = None
    unread_alerts: int = 0
    streak_days: int = 0


class TrainerClientOut(BaseModel):
    """One of a trainer's assigned members, as their desk needs them.

    Everything here is read from a record that already exists. `payment_status`
    is deliberately absent: GymFlow has no billing model, and a trainer acting
    on an invented payment state would be acting on nothing.
    """

    member_id: int
    member_code: str
    full_name: str
    branch_id: int
    joined_on: date | None = None
    membership_plan: str | None = None
    membership_status: MembershipStatus | None = None
    days_remaining: int | None = None
    journey: JourneyOut | None = None
    pt_package: PTPackageOut | None = None
    next_pt_session: PTSessionOut | None = None
    last_seen_on: date | None = None
    visits_last_30: int = 0


class TrainerClientDetailOut(BaseModel):
    """The client detail screen, assembled from existing services only."""

    client: TrainerClientOut
    recent_sessions: list[PTSessionOut] = []
    recent_workouts: list[WorkoutSessionOut] = []
    activity: list[ActivityEntryOut] = []


class AvailabilitySlotOut(ORMModel):
    id: int
    trainer_id: int
    branch_id: int
    slot_date: date
    start_time: time
    end_time: time
    booked_session_id: int | None = None
    note: str | None = None


class AvailabilitySlotIn(BaseModel):
    start_time: time
    end_time: time
    note: str | None = None


class PublishAvailabilityRequest(BaseModel):
    """One day's slots. Publishing a day replaces what was there for that day.

    Replace rather than merge: a trainer editing their Tuesday is describing
    Tuesday, and a merge would silently keep a slot they had just removed.
    """

    slot_date: date
    slots: list[AvailabilitySlotIn] = Field(default_factory=list)


class ClassRosterEntry(BaseModel):
    member_id: int
    member_name: str
    response: RsvpResponse
    attended: bool | None = None


__all__ = [name for name in dir() if name[0].isupper()]

"""Request and response models.

Kept in one module because the API surface is small and every schema is read by
the same mobile client — splitting them per-router would mean chasing an import
for each screen.
"""

from __future__ import annotations

from datetime import date, datetime, time
from typing import Any

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator

from app.core.config import settings
from app.db.models import (
    AttendanceStatus,
    CaptureMethod,
    EventType,
    IncentiveStatus,
    MembershipStatus,
)


class ORMModel(BaseModel):
    model_config = ConfigDict(from_attributes=True)


# ------------------------------------------------------------------- auth


class LoginRequest(BaseModel):
    """Sign-in credentials.

    ``email`` carries either an email address or a mobile number: SLAM knows
    some staff by one and some by the other, and the field name is kept so
    existing clients do not have to change. The lookup normalises both.
    """

    email: str = Field(min_length=3, max_length=255)
    password: str = Field(min_length=8, max_length=128)
    device_name: str | None = Field(default=None, max_length=120)

    @field_validator("email")
    @classmethod
    def _strip(cls, value: str) -> str:
        return value.strip()


class RefreshRequest(BaseModel):
    refresh_token: str = Field(min_length=10, max_length=2048)


class TokenPair(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    expires_in: int


class BranchBrief(ORMModel):
    id: int
    code: str
    name: str
    city: str | None = None
    timezone: str


class UserOut(ORMModel):
    id: int
    email: EmailStr
    full_name: str
    phone: str | None = None
    role: str
    branch_id: int | None = None
    branch: BranchBrief | None = None
    has_pin: bool = False

    @classmethod
    def from_user(cls, user: Any) -> UserOut:
        return cls(
            id=user.id,
            email=user.email,
            full_name=user.full_name,
            phone=user.phone,
            role=user.role.key,
            branch_id=user.branch_id,
            branch=BranchBrief.model_validate(user.branch) if user.branch else None,
            has_pin=bool(user.pin_hash),
        )


class LoginResponse(BaseModel):
    user: UserOut
    tokens: TokenPair


class SetPinRequest(BaseModel):
    current_password: str = Field(min_length=8, max_length=128)
    pin: str = Field(min_length=settings.pin_min_length, max_length=settings.pin_max_length)

    @field_validator("pin")
    @classmethod
    def _digits_only(cls, value: str) -> str:
        if not value.isdigit():
            raise ValueError("PIN must be digits only")
        if len(set(value)) == 1:
            raise ValueError("PIN must not be a single repeated digit")
        return value


class ChangePasswordRequest(BaseModel):
    current_password: str = Field(min_length=8, max_length=128)
    new_password: str = Field(min_length=10, max_length=128)


class PushTokenRequest(BaseModel):
    push_token: str = Field(min_length=8, max_length=255)


# ----------------------------------------------------------------- branch


class BranchOut(ORMModel):
    id: int
    code: str
    name: str
    city: str | None = None
    address: str | None = None
    timezone: str
    capacity: int
    is_active: bool


class BranchQrOut(BaseModel):
    branch_id: int
    branch_code: str
    token: str
    rotates_in_seconds: int
    window_seconds: int
    server_time: datetime


class OccupancyOut(BaseModel):
    branch_id: int
    branch_name: str
    inside: int
    capacity: int
    occupancy_pct: float
    crowd_level: str
    entries_today: int
    exits_today: int
    as_of: str


# ---------------------------------------------------------------- trainer


class ShiftOut(ORMModel):
    id: int
    weekday: int
    start_time: time
    end_time: time
    grace_minutes: int | None = None
    early_exit_grace_minutes: int | None = None
    is_active: bool


class ShiftUpsert(BaseModel):
    weekday: int = Field(ge=0, le=6)
    start_time: time
    end_time: time
    grace_minutes: int | None = Field(default=None, ge=0, le=120)
    early_exit_grace_minutes: int | None = Field(default=None, ge=0, le=120)
    is_active: bool = True


class TrainerOut(BaseModel):
    id: int
    user_id: int
    full_name: str
    email: EmailStr
    phone: str | None = None
    employee_code: str
    designation: str | None = None
    specialty: str | None = None
    branch_id: int
    branch_name: str
    is_active: bool


class TrainerTodayOut(BaseModel):
    """What a trainer sees the moment the app opens."""

    trainer: TrainerOut
    work_date: date
    server_time: datetime
    has_shift: bool
    shift_start: datetime | None = None
    shift_end: datetime | None = None
    shift_label: str | None = None
    grace_minutes: int
    status: AttendanceStatus
    check_in_at: datetime | None = None
    check_out_at: datetime | None = None
    late_minutes: int = 0
    early_exit_minutes: int = 0
    can_check_in: bool
    can_check_out: bool
    methods_enabled: list[str]


class AttendanceDayOut(ORMModel):
    id: int
    trainer_id: int
    branch_id: int
    work_date: date
    status: AttendanceStatus
    scheduled_start: datetime | None = None
    scheduled_end: datetime | None = None
    check_in_at: datetime | None = None
    check_out_at: datetime | None = None
    check_in_method: CaptureMethod | None = None
    check_out_method: CaptureMethod | None = None
    late_minutes: int
    early_exit_minutes: int
    worked_minutes: int
    grace_minutes: int


class TrainerDetailOut(BaseModel):
    trainer: TrainerOut
    current_status: AttendanceStatus
    today: AttendanceDayOut | None = None
    shift_label: str | None = None
    month_punctuality_pct: float
    month_attendance_pct: float
    late_count: int
    early_exit_count: int
    absent_count: int
    missing_checkout_count: int
    completed_shifts: int
    scheduled_shifts: int
    incentive_status: IncentiveStatus
    incentive_checks: list[dict[str, Any]]
    incentive_disclaimer: str


# ------------------------------------------------------------- attendance


class CheckRequest(BaseModel):
    """No timestamp field, by design — the server supplies the time."""

    branch_id: int
    method: CaptureMethod = CaptureMethod.QR
    qr_token: str | None = Field(default=None, max_length=256)
    pin: str | None = Field(default=None, max_length=16)
    device_info: str | None = Field(default=None, max_length=200)

    @field_validator("method")
    @classmethod
    def _v1_methods_only(cls, value: CaptureMethod) -> CaptureMethod:
        if value not in (CaptureMethod.QR, CaptureMethod.PIN):
            raise ValueError("V1 supports QR and PIN check-in only")
        return value


class CheckResponse(BaseModel):
    message: str
    server_time: datetime
    branch_id: int
    branch_name: str
    status: AttendanceStatus
    shift_start: datetime | None = None
    shift_end: datetime | None = None
    check_in_at: datetime | None = None
    check_out_at: datetime | None = None
    late_minutes: int = 0
    early_exit_minutes: int = 0
    worked_minutes: int = 0


class AttendanceCorrectionRequest(BaseModel):
    check_in_at: datetime | None = None
    check_out_at: datetime | None = None
    reason: str = Field(min_length=4, max_length=500)


class MemberEventRequest(BaseModel):
    branch_id: int
    event_type: EventType
    method: CaptureMethod = CaptureMethod.QR
    qr_token: str | None = Field(default=None, max_length=256)
    pin: str | None = Field(default=None, max_length=16)


# -------------------------------------------------------------- incentive


class IncentiveRuleOut(ORMModel):
    id: int
    branch_id: int | None = None
    name: str
    min_punctuality_pct: float
    min_attendance_pct: float
    max_late_count: int
    max_early_exit_count: int
    max_missing_checkout_count: int
    review_band_pct: float
    is_active: bool


class IncentiveRuleUpdate(BaseModel):
    name: str | None = Field(default=None, max_length=120)
    min_punctuality_pct: float | None = Field(default=None, ge=0, le=100)
    min_attendance_pct: float | None = Field(default=None, ge=0, le=100)
    max_late_count: int | None = Field(default=None, ge=0, le=99)
    max_early_exit_count: int | None = Field(default=None, ge=0, le=99)
    max_missing_checkout_count: int | None = Field(default=None, ge=0, le=99)
    review_band_pct: float | None = Field(default=None, ge=0, le=50)
    is_active: bool | None = None


class IncentiveResultOut(BaseModel):
    trainer_id: int
    trainer_name: str
    branch_id: int
    branch_name: str
    period_start: date
    period_end: date
    punctuality_pct: float
    attendance_pct: float
    late_count: int
    early_exit_count: int
    absent_count: int
    missing_checkout_count: int
    completed_shifts: int
    scheduled_shifts: int
    score: float
    status: IncentiveStatus
    checks: list[dict[str, Any]]
    disclaimer: str


# ---------------------------------------------------------------- reports


class BranchSummaryOut(BaseModel):
    branch_id: int
    branch_code: str
    branch_name: str
    scheduled: int
    present: int
    on_time: int
    late: int
    absent: int
    early_exit: int
    missing_checkout: int
    punctuality_pct: float
    occupancy: OccupancyOut | None = None


class DashboardOut(BaseModel):
    work_date: date
    server_time: datetime
    total_trainers: int
    scheduled: int
    present: int
    late: int
    absent: int
    early_exit: int
    missing_checkout: int
    punctuality_pct: float
    branches: list[BranchSummaryOut]


class AuditLogOut(ORMModel):
    id: int
    actor_user_id: int | None = None
    actor_role: str | None = None
    action: str
    entity_type: str | None = None
    entity_id: str | None = None
    branch_id: int | None = None
    details: dict[str, Any]
    created_at: datetime


# ----------------------------------------------------------------- member


class MembershipOut(ORMModel):
    id: int
    plan_name: str
    status: MembershipStatus
    starts_on: date
    ends_on: date
    pt_sessions_total: int
    pt_sessions_used: int


class MemberMeOut(BaseModel):
    member_id: int
    member_code: str
    full_name: str
    branch: BranchBrief
    joined_on: date | None = None
    membership: MembershipOut | None = None
    days_remaining: int | None = None
    assigned_trainer: TrainerOut | None = None
    visits_this_month: int
    is_inside: bool


class MemberVisitOut(BaseModel):
    work_date: date
    check_in_at: datetime | None = None
    check_out_at: datetime | None = None
    minutes: int | None = None


class NotificationOut(ORMModel):
    id: int
    event_key: str
    title: str
    body: str
    channel: str
    status: str
    created_at: datetime
    read_at: datetime | None = None


class SettingOut(BaseModel):
    key: str
    value: Any
    branch_id: int | None = None
    description: str | None = None


class SettingUpdate(BaseModel):
    value: Any
    branch_id: int | None = None


class MemberInsideOut(BaseModel):
    """One member currently in the building."""

    member_id: int
    member_code: str
    full_name: str
    branch_id: int
    checked_in_at: datetime
    minutes_inside: int
    method: str | None = None


class WhoIsInsideOut(BaseModel):
    """Live occupancy for one branch: the count, and who makes it up.

    Both come from the same event-log rule — a person is inside when their most
    recent event today is a check-in — so the number and the list cannot
    disagree, and a duplicate scan still counts as one person.
    """

    branch_id: int
    branch_name: str
    count: int
    capacity: int | None = None
    members: list[MemberInsideOut]


class MessageOut(BaseModel):
    message: str


__all__ = [name for name in dir() if name[0].isupper()]

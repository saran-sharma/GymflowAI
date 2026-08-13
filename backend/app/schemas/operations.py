"""Schemas for the operating surfaces: alerts, corrections, marketing, trends.

These are the owner's screens plus the trainer's exception workflow — the
things SLAM manages the business with, as opposed to the training programme
itself.
"""

from __future__ import annotations

from datetime import date, datetime
from typing import Any

from pydantic import BaseModel, ConfigDict, Field

from app.db.models import (
    AlertSeverity,
    AlertStatus,
    AttendanceStatus,
    CorrectionStatus,
    CorrectionType,
)


class ORMModel(BaseModel):
    model_config = ConfigDict(from_attributes=True)


# ----------------------------------------------------------------- alerts


class AlertOut(ORMModel):
    id: int
    branch_id: int | None = None
    key: str
    severity: AlertSeverity
    status: AlertStatus
    title: str
    body: str
    entity_type: str | None = None
    entity_id: str | None = None
    action_route: str | None = None
    payload: dict[str, Any] = {}
    created_at: datetime
    resolved_at: datetime | None = None


class AlertActionRequest(BaseModel):
    dismiss: bool = False


class TaskOut(ORMModel):
    id: int
    branch_id: int
    member_id: int | None = None
    assigned_trainer_id: int | None = None
    key: str
    title: str
    detail: str | None = None
    due_on: date | None = None
    status: str
    completed_at: datetime | None = None


# ------------------------------------------------------------ corrections


class CorrectionRequestIn(BaseModel):
    attendance_id: int
    correction_type: CorrectionType
    reason: str = Field(min_length=5, max_length=1000)
    requested_check_in_at: datetime | None = None
    requested_check_out_at: datetime | None = None


class CorrectionReviewIn(BaseModel):
    approve: bool
    note: str | None = Field(default=None, max_length=1000)


class CorrectionOut(ORMModel):
    id: int
    trainer_attendance_id: int
    trainer_id: int
    trainer_name: str | None = None
    branch_id: int
    work_date: date
    correction_type: CorrectionType
    status: CorrectionStatus
    reason: str
    requested_check_in_at: datetime | None = None
    requested_check_out_at: datetime | None = None
    original_check_in_at: datetime | None = None
    original_check_out_at: datetime | None = None
    original_status: AttendanceStatus | None = None
    new_status: AttendanceStatus | None = None
    requested_by_user_id: int
    reviewed_by_user_id: int | None = None
    review_note: str | None = None
    reviewed_at: datetime | None = None
    created_at: datetime


# -------------------------------------------------------- trainer schedule


class ScheduleItemOut(BaseModel):
    kind: str
    reference_id: int
    title: str
    subtitle: str | None = None
    starts_at: datetime | None = None
    ends_at: datetime | None = None
    status: str
    member_id: int | None = None
    member_name: str | None = None
    branch_id: int | None = None
    session_number: int | None = None
    package_size: int | None = None
    attendees: int | None = None
    can_complete: bool = False


class TrainerPerformanceOut(BaseModel):
    """Discipline and delivery, side by side but never merged into one score."""

    trainer_id: int
    trainer_name: str
    branch_id: int
    period_start: date
    period_end: date
    punctuality_pct: float
    attendance_pct: float
    late_count: int
    early_exit_count: int
    absent_count: int
    missing_checkout_count: int
    sessions_scheduled: int
    sessions_completed: int
    session_completion_pct: float
    pt_scheduled: int
    pt_completed: int
    class_scheduled: int
    class_completed: int
    client_feedback: dict[str, Any] | None = None
    incentive_status: str
    incentive_checks: list[dict[str, Any]] = []
    incentive_disclaimer: str


# --------------------------------------------------------------- marketing


class MarketingSourceOut(ORMModel):
    id: int
    key: str
    label: str
    requires_referrer: bool
    sort_order: int
    is_active: bool


class CampaignOut(ORMModel):
    id: int
    branch_id: int | None = None
    name: str
    code: str
    description: str | None = None
    starts_on: date | None = None
    ends_on: date | None = None
    is_active: bool


class CampaignCreate(BaseModel):
    name: str = Field(min_length=2, max_length=120)
    code: str = Field(min_length=2, max_length=48)
    branch_id: int | None = None
    description: str | None = Field(default=None, max_length=1000)
    starts_on: date | None = None
    ends_on: date | None = None


class AcquisitionRequest(BaseModel):
    source_id: int | None = None
    campaign_id: int | None = None
    referrer_member_id: int | None = None
    registered_on: date | None = None
    note: str | None = Field(default=None, max_length=500)


class SourceFunnelOut(BaseModel):
    source_key: str
    source_label: str
    joined: int
    reached_day_45: int
    pt_conversions: int
    referrals: int
    day45_pct: float
    pt_conversion_pct: float
    campaigns: list[str] = []


class MarketingDashboardOut(BaseModel):
    period_start: date
    period_end: date
    new_members: int
    sources: list[SourceFunnelOut]
    campaigns: list[dict[str, Any]]
    referrals: list[dict[str, Any]]
    total_referrals: int
    has_data: bool


class ReferralOut(BaseModel):
    id: int
    referrer_member_id: int
    referrer_name: str
    referred_member_id: int
    referred_name: str
    branch_id: int
    created_at: datetime


# ------------------------------------------------------ branch performance


class TrendPoint(BaseModel):
    """A metric with its comparison.

    ``previous`` is null when there is not enough history to compare against —
    the app renders that as "—", never as a flat 0% change.
    """

    value: float
    previous: float | None = None
    delta: float | None = None
    has_comparison: bool = False


class BranchPerformanceOut(BaseModel):
    branch_id: int
    branch_code: str
    branch_name: str
    punctuality: TrendPoint
    attendance: TrendPoint
    late_marks: TrendPoint
    early_exits: TrendPoint
    session_completion: TrendPoint
    pt_utilisation: TrendPoint
    member_activity: TrendPoint
    marketing_conversion: TrendPoint
    members_inside: int = 0
    is_demo: bool = False


class BranchPerformanceResponse(BaseModel):
    period: str
    period_start: date
    period_end: date
    comparison_start: date | None = None
    comparison_end: date | None = None
    has_comparison: bool
    branches: list[BranchPerformanceOut]
    note: str | None = None


class OccupancyForecastOut(BaseModel):
    """Busy periods, withheld until there is enough history to be honest."""

    branch_id: int
    has_enough_history: bool
    days_of_history: int
    days_required: int
    busiest_hours: list[dict[str, Any]] = []
    note: str | None = None


class AutomationRunOut(BaseModel):
    ran_at: datetime
    branches: list[dict[str, Any]]


class NeedsAttentionOut(BaseModel):
    items: list[dict[str, Any]]
    pt_ready_count: int
    pending_corrections: int


__all__ = [name for name in dir() if name[0].isupper()]

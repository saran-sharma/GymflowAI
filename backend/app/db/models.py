"""GymFlow AI schema.

The shape follows the V1 goal — trainer accountability across three SLAM
branches — so anything branch-sensitive carries an explicit ``branch_id`` rather
than reaching it through a join. Authorization checks read that column
directly, which keeps branch isolation a single predicate instead of a
different traversal per endpoint.
"""

from __future__ import annotations

import enum
from datetime import date, datetime, time

from sqlalchemy import (
    JSON,
    Boolean,
    Date,
    DateTime,
    Enum,
    ForeignKey,
    Index,
    Integer,
    Numeric,
    String,
    Text,
    Time,
    UniqueConstraint,
    text,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, DemoMixin, TimestampMixin

# JSONB on Postgres, plain JSON everywhere else, so the suite can also run
# against SQLite when no Postgres is reachable.
JSONType = JSONB().with_variant(JSON(), "sqlite")


# Percentages are stored as NUMERIC for exactness but handed to Python as
# floats — every consumer is a ratio or a chart, none needs Decimal semantics.
def Pct() -> Numeric:
    return Numeric(5, 2, asdecimal=False)


# ----------------------------------------------------------------- enums


class RoleKey(str, enum.Enum):
    SUPER_ADMIN = "super_admin"
    OWNER = "owner"
    BRANCH_MANAGER = "branch_manager"
    TRAINER = "trainer"
    MEMBER = "member"


class PersonType(str, enum.Enum):
    TRAINER = "trainer"
    MEMBER = "member"


class EventType(str, enum.Enum):
    CHECK_IN = "check_in"
    CHECK_OUT = "check_out"


class CaptureMethod(str, enum.Enum):
    """How the identity behind an attendance event was established.

    QR and PIN are the two V1 methods. The rest are declared now so the
    downstream reports, exports and access-control interface do not need a
    schema migration when the hardware lands.
    """

    QR = "qr"
    PIN = "pin"
    FINGERPRINT = "fingerprint"
    RFID = "rfid"
    FACE = "face"
    MANUAL = "manual"


class AttendanceStatus(str, enum.Enum):
    SCHEDULED = "scheduled"
    ON_TIME = "on_time"
    LATE = "late"
    EARLY_EXIT = "early_exit"
    LATE_AND_EARLY_EXIT = "late_and_early_exit"
    ABSENT = "absent"
    MISSING_CHECKOUT = "missing_checkout"
    COMPLETED = "completed"


class IncentiveStatus(str, enum.Enum):
    ELIGIBLE = "eligible"
    NOT_ELIGIBLE = "not_eligible"
    NEEDS_REVIEW = "needs_review"


class MembershipStatus(str, enum.Enum):
    ACTIVE = "active"
    EXPIRED = "expired"
    FROZEN = "frozen"
    CANCELLED = "cancelled"


class NotificationStatus(str, enum.Enum):
    QUEUED = "queued"
    SENT = "sent"
    FAILED = "failed"
    SUPPRESSED = "suppressed"


class JourneyType(str, enum.Enum):
    """Only one journey exists in V1, but the column is an enum so SLAM's next
    programme is a new member of this list rather than a new table."""

    GENERAL_TRAINING = "general_training"


class JourneyStatus(str, enum.Enum):
    ACTIVE = "active"
    COMPLETED = "completed"
    PAUSED = "paused"
    CANCELLED = "cancelled"


class WorkoutSplit(str, enum.Enum):
    """What a given journey day is for.

    Days 1–3 of the SLAM journey are assessment and cardio; days 4 onward
    rotate the PPL split.
    """

    ASSESSMENT = "assessment"
    CARDIO = "cardio"
    PUSH = "push"
    PULL = "pull"
    LEGS = "legs"
    REST = "rest"


class DayStatus(str, enum.Enum):
    PENDING = "pending"
    IN_PROGRESS = "in_progress"
    COMPLETED = "completed"
    MISSED = "missed"


class AssessmentStatus(str, enum.Enum):
    NOT_STARTED = "not_started"
    IN_PROGRESS = "in_progress"
    COMPLETED = "completed"


class CheckInFeeling(str, enum.Enum):
    """The member's own daily check-in — personalisation, not a clinical scale."""

    GREAT = "great"
    GOOD = "good"
    OKAY = "okay"
    TIRED = "tired"
    LOW = "low"


class ItemStatus(str, enum.Enum):
    PENDING = "pending"
    COMPLETED = "completed"
    SKIPPED = "skipped"


class SessionStatus(str, enum.Enum):
    """Shared by PT sessions, own workouts and the trainer's day view.

    One vocabulary across all three keeps the trainer's schedule readable —
    "in progress" means the same thing whichever kind of session it labels.
    """

    SCHEDULED = "scheduled"
    IN_PROGRESS = "in_progress"
    COMPLETED = "completed"
    CANCELLED = "cancelled"
    MISSED = "missed"
    NO_SHOW = "no_show"


class PackageStatus(str, enum.Enum):
    ACTIVE = "active"
    COMPLETED = "completed"
    EXPIRED = "expired"
    CANCELLED = "cancelled"


class PaymentKind(str, enum.Enum):
    MEMBERSHIP = "membership"
    PT = "pt"
    GROUP_CLASS = "group_class"
    RENEWAL = "renewal"
    ADDON = "addon"


class PaymentMethod(str, enum.Enum):
    CASH = "cash"
    CARD = "card"
    UPI = "upi"
    BANK_TRANSFER = "bank_transfer"
    OTHER = "other"


class PaymentStatus(str, enum.Enum):
    PENDING = "pending"
    PAID = "paid"
    REFUNDED = "refunded"
    CANCELLED = "cancelled"


class ClassStatus(str, enum.Enum):
    SCHEDULED = "scheduled"
    CANCELLED = "cancelled"
    COMPLETED = "completed"


class RsvpResponse(str, enum.Enum):
    PENDING = "pending"
    YES = "yes"
    NO = "no"


class AlertSeverity(str, enum.Enum):
    INFO = "info"
    WARNING = "warning"
    CRITICAL = "critical"


class AlertStatus(str, enum.Enum):
    OPEN = "open"
    ACKNOWLEDGED = "acknowledged"
    RESOLVED = "resolved"
    DISMISSED = "dismissed"


class CorrectionType(str, enum.Enum):
    MISSING_CHECKOUT = "missing_checkout"
    LATE_REASON = "late_reason"
    EARLY_EXIT_REASON = "early_exit_reason"
    WRONG_CHECK_IN = "wrong_check_in"
    SHIFT_CORRECTION = "shift_correction"


class CorrectionStatus(str, enum.Enum):
    PENDING = "pending"
    APPROVED = "approved"
    REJECTED = "rejected"
    WITHDRAWN = "withdrawn"


# ----------------------------------------------------------------- tables


# One instance per named Postgres enum, shared by every column that uses it.
person_type_enum = Enum(PersonType, name="person_type")
event_type_enum = Enum(EventType, name="event_type")
capture_method_enum = Enum(CaptureMethod, name="capture_method")
attendance_status_enum = Enum(AttendanceStatus, name="attendance_status")
incentive_status_enum = Enum(IncentiveStatus, name="incentive_status")
membership_status_enum = Enum(MembershipStatus, name="membership_status")
notification_status_enum = Enum(NotificationStatus, name="notification_status")
journey_type_enum = Enum(JourneyType, name="journey_type")
journey_status_enum = Enum(JourneyStatus, name="journey_status")
workout_split_enum = Enum(WorkoutSplit, name="workout_split")
day_status_enum = Enum(DayStatus, name="day_status")
assessment_status_enum = Enum(AssessmentStatus, name="assessment_status")
checkin_feeling_enum = Enum(CheckInFeeling, name="checkin_feeling")
item_status_enum = Enum(ItemStatus, name="item_status")
session_status_enum = Enum(SessionStatus, name="session_status")
package_status_enum = Enum(PackageStatus, name="package_status")
class_status_enum = Enum(ClassStatus, name="class_status")
rsvp_response_enum = Enum(RsvpResponse, name="rsvp_response")
alert_severity_enum = Enum(AlertSeverity, name="alert_severity")
alert_status_enum = Enum(AlertStatus, name="alert_status")
correction_type_enum = Enum(CorrectionType, name="correction_type")
correction_status_enum = Enum(CorrectionStatus, name="correction_status")


class Role(Base, TimestampMixin):
    __tablename__ = "roles"

    id: Mapped[int] = mapped_column(primary_key=True)
    key: Mapped[str] = mapped_column(String(32), unique=True, nullable=False)
    name: Mapped[str] = mapped_column(String(64), nullable=False)
    description: Mapped[str | None] = mapped_column(Text)

    users: Mapped[list[User]] = relationship(back_populates="role")


class Branch(Base, TimestampMixin, DemoMixin):
    __tablename__ = "branches"

    id: Mapped[int] = mapped_column(primary_key=True)
    code: Mapped[str] = mapped_column(String(32), unique=True, nullable=False)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    city: Mapped[str | None] = mapped_column(String(80))
    address: Mapped[str | None] = mapped_column(Text)
    timezone: Mapped[str] = mapped_column(String(64), default="Asia/Kolkata", nullable=False)
    capacity: Mapped[int] = mapped_column(Integer, default=100, nullable=False)
    # Secret behind the rotating check-in QR shown at the branch desk. Never
    # leaves the server; only derived, short-lived tokens are handed out.
    qr_secret: Mapped[str] = mapped_column(String(128), nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    trainers: Mapped[list[Trainer]] = relationship(back_populates="branch")
    members: Mapped[list[Member]] = relationship(back_populates="branch")


class User(Base, TimestampMixin, DemoMixin):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True)
    email: Mapped[str] = mapped_column(String(255), unique=True, nullable=False, index=True)
    phone: Mapped[str | None] = mapped_column(String(24))
    full_name: Mapped[str] = mapped_column(String(120), nullable=False)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    # Short numeric PIN used only for floor check-in, never for login.
    pin_hash: Mapped[str | None] = mapped_column(String(255))
    role_id: Mapped[int] = mapped_column(ForeignKey("roles.id"), nullable=False)
    # Null for SUPER_ADMIN and OWNER, who span every branch.
    branch_id: Mapped[int | None] = mapped_column(ForeignKey("branches.id"), index=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    last_login_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    failed_login_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    locked_until: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    push_token: Mapped[str | None] = mapped_column(String(255))

    role: Mapped[Role] = relationship(back_populates="users")
    branch: Mapped[Branch | None] = relationship()
    trainer: Mapped[Trainer | None] = relationship(back_populates="user", uselist=False)
    member: Mapped[Member | None] = relationship(back_populates="user", uselist=False)

    @property
    def role_key(self) -> str:
        return self.role.key


class RefreshToken(Base, TimestampMixin):
    """Server-side record so a refresh token can be revoked before it expires."""

    __tablename__ = "refresh_tokens"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    jti: Mapped[str] = mapped_column(String(64), unique=True, nullable=False)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    user_agent: Mapped[str | None] = mapped_column(String(255))


class Trainer(Base, TimestampMixin, DemoMixin):
    __tablename__ = "trainers"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), unique=True, nullable=False
    )
    branch_id: Mapped[int] = mapped_column(ForeignKey("branches.id"), nullable=False, index=True)
    employee_code: Mapped[str] = mapped_column(String(32), unique=True, nullable=False)
    designation: Mapped[str | None] = mapped_column(String(80))
    specialty: Mapped[str | None] = mapped_column(String(120))
    joined_on: Mapped[date | None] = mapped_column(Date)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    user: Mapped[User] = relationship(back_populates="trainer")
    branch: Mapped[Branch] = relationship(back_populates="trainers")
    shifts: Mapped[list[Shift]] = relationship(back_populates="trainer")


class Member(Base, TimestampMixin, DemoMixin):
    __tablename__ = "members"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), unique=True, nullable=False
    )
    branch_id: Mapped[int] = mapped_column(ForeignKey("branches.id"), nullable=False, index=True)
    member_code: Mapped[str] = mapped_column(String(32), unique=True, nullable=False)
    assigned_trainer_id: Mapped[int | None] = mapped_column(ForeignKey("trainers.id"))
    joined_on: Mapped[date | None] = mapped_column(Date)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    # Set when the record originates in an external system of record (Yoactiv).
    # Unique (Postgres allows any number of NULLs under a unique index) so a
    # Yoactiv identity can never be linked to more than one GymFlow member;
    # see app.integrations.yoactiv.identity for the lookup this backs.
    external_ref: Mapped[str | None] = mapped_column(String(64), unique=True, index=True)

    # How SLAM acquired this member. Captured at registration; the owner's
    # marketing dashboard is entirely derived from these three columns plus
    # the referral row, so nothing here is a separate reporting copy.
    marketing_source_id: Mapped[int | None] = mapped_column(
        ForeignKey("marketing_sources.id"), index=True
    )
    campaign_id: Mapped[int | None] = mapped_column(ForeignKey("campaigns.id"), index=True)
    registered_on: Mapped[date | None] = mapped_column(Date, index=True)

    user: Mapped[User] = relationship(back_populates="member")
    branch: Mapped[Branch] = relationship(back_populates="members")
    assigned_trainer: Mapped[Trainer | None] = relationship()
    memberships: Mapped[list[Membership]] = relationship(back_populates="member")
    marketing_source: Mapped[MarketingSource | None] = relationship()
    campaign: Mapped[Campaign | None] = relationship()


class Membership(Base, TimestampMixin, DemoMixin):
    __tablename__ = "memberships"

    id: Mapped[int] = mapped_column(primary_key=True)
    member_id: Mapped[int] = mapped_column(
        ForeignKey("members.id", ondelete="CASCADE"), nullable=False, index=True
    )
    branch_id: Mapped[int] = mapped_column(ForeignKey("branches.id"), nullable=False, index=True)
    plan_name: Mapped[str] = mapped_column(String(120), nullable=False)
    status: Mapped[MembershipStatus] = mapped_column(
        membership_status_enum,
        default=MembershipStatus.ACTIVE,
        nullable=False,
    )
    starts_on: Mapped[date] = mapped_column(Date, nullable=False)
    ends_on: Mapped[date] = mapped_column(Date, nullable=False)
    pt_sessions_total: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    pt_sessions_used: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

    member: Mapped[Member] = relationship(back_populates="memberships")


class Shift(Base, TimestampMixin, DemoMixin):
    """A trainer's recurring weekly shift.

    ``grace_minutes`` is nullable on purpose: null means "use the branch or
    global setting", so the owner can retune lateness for the whole chain
    without rewriting every trainer's roster.
    """

    __tablename__ = "shifts"

    id: Mapped[int] = mapped_column(primary_key=True)
    trainer_id: Mapped[int] = mapped_column(
        ForeignKey("trainers.id", ondelete="CASCADE"), nullable=False, index=True
    )
    branch_id: Mapped[int] = mapped_column(ForeignKey("branches.id"), nullable=False, index=True)
    # 0 = Monday .. 6 = Sunday, matching date.weekday().
    weekday: Mapped[int] = mapped_column(Integer, nullable=False)
    start_time: Mapped[time] = mapped_column(Time, nullable=False)
    end_time: Mapped[time] = mapped_column(Time, nullable=False)
    grace_minutes: Mapped[int | None] = mapped_column(Integer)
    early_exit_grace_minutes: Mapped[int | None] = mapped_column(Integer)
    effective_from: Mapped[date | None] = mapped_column(Date)
    effective_to: Mapped[date | None] = mapped_column(Date)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    trainer: Mapped[Trainer] = relationship(back_populates="shifts")

    __table_args__ = (Index("ix_shifts_trainer_weekday", "trainer_id", "weekday"),)


class AttendanceEvent(Base, TimestampMixin):
    """Append-only log of every check-in/out, for trainers and members alike.

    Rows are never updated. ``trainer_attendance`` is the derived daily roll-up;
    this table is the evidence it is computed from.
    """

    __tablename__ = "attendance_events"

    id: Mapped[int] = mapped_column(primary_key=True)
    branch_id: Mapped[int] = mapped_column(ForeignKey("branches.id"), nullable=False, index=True)
    person_type: Mapped[PersonType] = mapped_column(person_type_enum, nullable=False)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False, index=True)
    event_type: Mapped[EventType] = mapped_column(event_type_enum, nullable=False)
    method: Mapped[CaptureMethod] = mapped_column(capture_method_enum, nullable=False)
    # Server clock, always. No client-supplied timestamp is ever persisted here.
    occurred_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    work_date: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    source_ip: Mapped[str | None] = mapped_column(String(64))
    device_info: Mapped[str | None] = mapped_column(String(255))
    notes: Mapped[str | None] = mapped_column(Text)
    recorded_by_user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"))
    # Set only for events a push-based hardware integration delivered (today:
    # the X2008/ADMS fingerprint receiver). Null for every QR/PIN/manual
    # event, which never carries an external identity for a duplicate to key
    # off. Constructed by the receiver as "{device_serial}:{enrolled_id}:
    # {device_reported_time}" — see app/services/attendance_service.py — so
    # it is unique by construction across every device without a composite
    # constraint, and a redelivered batch (the terminal resending its backlog
    # is normal ADMS behaviour) resolves to the same row instead of a second
    # visit.
    external_event_id: Mapped[str | None] = mapped_column(String(160))

    __table_args__ = (
        Index("ix_events_branch_date", "branch_id", "work_date"),
        Index("ix_events_user_date", "user_id", "work_date"),
        UniqueConstraint("external_event_id", name="uq_attendance_event_external_id"),
    )


class FingerprintDevice(Base, TimestampMixin):
    """A registered ZKTeco/ADMS fingerprint terminal (e.g. an X2008) and the
    branch its events belong to.

    Holds only non-secret device facts — serial, LAN address, the ADMS
    "Device ID" — never the terminal's Communication Key, which is a real
    secret and lives only in ``Settings.fingerprint_comm_key`` (environment
    only, never the database). A bespoke table rather than a `Setting` JSON
    blob because the ADMS push receiver needs an indexed, unique lookup from
    an inbound request's device serial straight to a branch; scanning every
    settings row and parsing JSON to find a match does not scale past a
    handful of branches and loses the DB-level uniqueness guarantee a
    physical serial number should have.

    ``device_number`` is the terminal's own small ADMS "Device ID" (e.g. 1) —
    unique per branch, not globally, unlike ``serial``.
    """

    __tablename__ = "fingerprint_devices"

    id: Mapped[int] = mapped_column(primary_key=True)
    branch_id: Mapped[int] = mapped_column(ForeignKey("branches.id"), nullable=False, index=True)
    device_number: Mapped[int] = mapped_column(Integer, nullable=False)
    serial: Mapped[str] = mapped_column(String(64), unique=True, nullable=False)
    label: Mapped[str] = mapped_column(String(120), nullable=False)
    ip_address: Mapped[str | None] = mapped_column(String(64))
    tcp_port: Mapped[int | None] = mapped_column(Integer)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    branch: Mapped[Branch] = relationship()

    __table_args__ = (
        UniqueConstraint("branch_id", "device_number", name="uq_fingerprint_device_branch_number"),
    )


class FingerprintEnrollment(Base, TimestampMixin):
    """Maps a member to the numeric enroll-ID they registered under on a
    fingerprint terminal.

    Deliberately its own table rather than ``Member.external_ref`` — that
    column's docstring reserves it for Yoactiv, and reusing it here would
    silently conflate two unrelated external systems on one column, which is
    exactly the implicit cross-integration coupling this codebase's
    per-integration contracts are structured to avoid.

    ``enrolled_id`` is unique per *device*, not globally (two terminals can
    both hand out enroll-ID "7" to different people), so the uniqueness
    constraint is scoped to the device. ``member_id`` is unique on its own:
    V1 gives a member exactly one enrollment, at their own branch's device.
    """

    __tablename__ = "fingerprint_enrollments"

    id: Mapped[int] = mapped_column(primary_key=True)
    member_id: Mapped[int] = mapped_column(
        ForeignKey("members.id", ondelete="CASCADE"), unique=True, nullable=False
    )
    branch_id: Mapped[int] = mapped_column(ForeignKey("branches.id"), nullable=False, index=True)
    device_id: Mapped[int] = mapped_column(
        ForeignKey("fingerprint_devices.id", ondelete="CASCADE"), nullable=False, index=True
    )
    enrolled_id: Mapped[str] = mapped_column(String(32), nullable=False)

    member: Mapped[Member] = relationship()
    device: Mapped[FingerprintDevice] = relationship()

    __table_args__ = (
        UniqueConstraint("device_id", "enrolled_id", name="uq_fingerprint_enrollment_device_slot"),
    )


class TrainerAttendance(Base, TimestampMixin):
    """One row per trainer per working day — the accountability record."""

    __tablename__ = "trainer_attendance"

    id: Mapped[int] = mapped_column(primary_key=True)
    trainer_id: Mapped[int] = mapped_column(
        ForeignKey("trainers.id", ondelete="CASCADE"), nullable=False, index=True
    )
    branch_id: Mapped[int] = mapped_column(ForeignKey("branches.id"), nullable=False, index=True)
    work_date: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    shift_id: Mapped[int | None] = mapped_column(ForeignKey("shifts.id"))
    # Snapshot of the rules in force on the day, so re-tuning the grace period
    # tomorrow cannot silently rewrite yesterday's verdicts.
    scheduled_start: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    scheduled_end: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    grace_minutes: Mapped[int] = mapped_column(Integer, default=10, nullable=False)
    early_exit_grace_minutes: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    check_in_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    check_out_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    check_in_method: Mapped[CaptureMethod | None] = mapped_column(capture_method_enum)
    check_out_method: Mapped[CaptureMethod | None] = mapped_column(capture_method_enum)
    status: Mapped[AttendanceStatus] = mapped_column(
        attendance_status_enum,
        default=AttendanceStatus.SCHEDULED,
        nullable=False,
    )
    late_minutes: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    early_exit_minutes: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    worked_minutes: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    corrected_by_user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"))
    correction_reason: Mapped[str | None] = mapped_column(Text)

    trainer: Mapped[Trainer] = relationship()
    branch: Mapped[Branch] = relationship()

    __table_args__ = (
        UniqueConstraint("trainer_id", "work_date", name="uq_trainer_attendance_day"),
        Index("ix_trainer_attendance_branch_date", "branch_id", "work_date"),
    )


class IncentiveRule(Base, TimestampMixin, DemoMixin):
    """Configurable thresholds. Nothing about eligibility is hardcoded."""

    __tablename__ = "incentive_rules"

    id: Mapped[int] = mapped_column(primary_key=True)
    # Null branch = chain-wide default; a branch row overrides it.
    branch_id: Mapped[int | None] = mapped_column(ForeignKey("branches.id"), index=True)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    min_punctuality_pct: Mapped[float] = mapped_column(Pct(), default=90, nullable=False)
    min_attendance_pct: Mapped[float] = mapped_column(Pct(), default=95, nullable=False)
    max_late_count: Mapped[int] = mapped_column(Integer, default=2, nullable=False)
    max_early_exit_count: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    max_missing_checkout_count: Mapped[int] = mapped_column(Integer, default=2, nullable=False)
    # How far below a threshold still lands in NEEDS_REVIEW rather than a flat
    # no — a trainer at 89.5% against a 90% bar is a conversation, not a denial.
    review_band_pct: Mapped[float] = mapped_column(Pct(), default=5, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    effective_from: Mapped[date | None] = mapped_column(Date)

    branch: Mapped[Branch | None] = relationship()


class IncentiveResult(Base, TimestampMixin):
    __tablename__ = "incentive_results"

    id: Mapped[int] = mapped_column(primary_key=True)
    trainer_id: Mapped[int] = mapped_column(
        ForeignKey("trainers.id", ondelete="CASCADE"), nullable=False, index=True
    )
    branch_id: Mapped[int] = mapped_column(ForeignKey("branches.id"), nullable=False, index=True)
    rule_id: Mapped[int | None] = mapped_column(ForeignKey("incentive_rules.id"))
    # First day of the month the result covers.
    period_start: Mapped[date] = mapped_column(Date, nullable=False)
    period_end: Mapped[date] = mapped_column(Date, nullable=False)
    punctuality_pct: Mapped[float] = mapped_column(Pct(), default=0, nullable=False)
    attendance_pct: Mapped[float] = mapped_column(Pct(), default=0, nullable=False)
    late_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    early_exit_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    absent_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    missing_checkout_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    completed_shifts: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    scheduled_shifts: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    score: Mapped[float] = mapped_column(Pct(), default=0, nullable=False)
    status: Mapped[IncentiveStatus] = mapped_column(incentive_status_enum, nullable=False)
    reasons: Mapped[dict] = mapped_column(JSONType, default=dict, nullable=False)
    computed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)

    __table_args__ = (UniqueConstraint("trainer_id", "period_start", name="uq_incentive_period"),)


class Notification(Base, TimestampMixin):
    """Outbox. V1 only queues; providers are mocked until a channel is live."""

    __tablename__ = "notifications"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), index=True)
    branch_id: Mapped[int | None] = mapped_column(ForeignKey("branches.id"), index=True)
    event_key: Mapped[str] = mapped_column(String(64), nullable=False)
    channel: Mapped[str] = mapped_column(String(32), default="push", nullable=False)
    title: Mapped[str] = mapped_column(String(160), nullable=False)
    body: Mapped[str] = mapped_column(Text, nullable=False)
    payload: Mapped[dict] = mapped_column(JSONType, default=dict, nullable=False)
    status: Mapped[NotificationStatus] = mapped_column(
        notification_status_enum,
        default=NotificationStatus.QUEUED,
        nullable=False,
    )
    sent_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    read_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class AuditLog(Base):
    """Append-only. Written for every security- or money-adjacent action."""

    __tablename__ = "audit_logs"

    id: Mapped[int] = mapped_column(primary_key=True)
    actor_user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), index=True)
    actor_role: Mapped[str | None] = mapped_column(String(32))
    action: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    entity_type: Mapped[str | None] = mapped_column(String(64))
    entity_id: Mapped[str | None] = mapped_column(String(64))
    branch_id: Mapped[int | None] = mapped_column(ForeignKey("branches.id"), index=True)
    source_ip: Mapped[str | None] = mapped_column(String(64))
    user_agent: Mapped[str | None] = mapped_column(String(255))
    # Never holds credentials, tokens or PINs — see services/audit.py.
    details: Mapped[dict] = mapped_column(JSONType, default=dict, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, index=True
    )


# --------------------------------------------------------------- marketing


class MarketingSource(Base, TimestampMixin, DemoMixin):
    """How a member found SLAM. Configurable, not a hardcoded enum.

    ``requires_referrer`` is what makes the referral capture conditional
    without the API having to special-case the string "referral".
    """

    __tablename__ = "marketing_sources"

    id: Mapped[int] = mapped_column(primary_key=True)
    key: Mapped[str] = mapped_column(String(48), unique=True, nullable=False)
    label: Mapped[str] = mapped_column(String(80), nullable=False)
    requires_referrer: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    sort_order: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)


class Campaign(Base, TimestampMixin, DemoMixin):
    __tablename__ = "campaigns"

    id: Mapped[int] = mapped_column(primary_key=True)
    # Null branch = the campaign ran across the whole chain.
    branch_id: Mapped[int | None] = mapped_column(ForeignKey("branches.id"), index=True)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    code: Mapped[str] = mapped_column(String(48), unique=True, nullable=False)
    description: Mapped[str | None] = mapped_column(Text)
    starts_on: Mapped[date | None] = mapped_column(Date)
    ends_on: Mapped[date | None] = mapped_column(Date)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    branch: Mapped[Branch | None] = relationship()


class Referral(Base, TimestampMixin, DemoMixin):
    """Who introduced whom.

    No reward column: SLAM has not set a referral policy yet, and inventing
    one here would put a number in front of a member that nobody agreed to.
    """

    __tablename__ = "referrals"

    id: Mapped[int] = mapped_column(primary_key=True)
    referrer_member_id: Mapped[int] = mapped_column(
        ForeignKey("members.id", ondelete="CASCADE"), nullable=False, index=True
    )
    referred_member_id: Mapped[int] = mapped_column(
        ForeignKey("members.id", ondelete="CASCADE"), nullable=False, index=True
    )
    branch_id: Mapped[int] = mapped_column(ForeignKey("branches.id"), nullable=False, index=True)
    note: Mapped[str | None] = mapped_column(Text)

    referrer: Mapped[Member] = relationship(foreign_keys=[referrer_member_id])
    referred: Mapped[Member] = relationship(foreign_keys=[referred_member_id])

    __table_args__ = (UniqueConstraint("referred_member_id", name="uq_referral_referred"),)


# ----------------------------------------------------------------- journey


class Journey(Base, TimestampMixin, DemoMixin):
    """A member's structured training programme — SLAM's 45-day journey in V1.

    ``duration_days`` is stored per journey rather than read from settings at
    display time so retuning the programme length tomorrow cannot silently
    move the finish line for someone already halfway through it.
    """

    __tablename__ = "journeys"

    id: Mapped[int] = mapped_column(primary_key=True)
    member_id: Mapped[int] = mapped_column(
        ForeignKey("members.id", ondelete="CASCADE"), nullable=False, index=True
    )
    branch_id: Mapped[int] = mapped_column(ForeignKey("branches.id"), nullable=False, index=True)
    journey_type: Mapped[JourneyType] = mapped_column(
        journey_type_enum, default=JourneyType.GENERAL_TRAINING, nullable=False
    )
    start_date: Mapped[date] = mapped_column(Date, nullable=False)
    end_date: Mapped[date] = mapped_column(Date, nullable=False)
    duration_days: Mapped[int] = mapped_column(Integer, default=45, nullable=False)
    assessment_days: Mapped[int] = mapped_column(Integer, default=3, nullable=False)
    cardio_sessions_required: Mapped[int] = mapped_column(Integer, default=3, nullable=False)
    status: Mapped[JourneyStatus] = mapped_column(
        journey_status_enum, default=JourneyStatus.ACTIVE, nullable=False
    )
    assessment_status: Mapped[AssessmentStatus] = mapped_column(
        assessment_status_enum, default=AssessmentStatus.NOT_STARTED, nullable=False
    )
    assigned_trainer_id: Mapped[int | None] = mapped_column(ForeignKey("trainers.id"))
    completed_on: Mapped[date | None] = mapped_column(Date)
    # Written once by the Day-45 automation; the member's completion screen and
    # the owner's PT opportunity list both read this rather than recomputing.
    completion_summary: Mapped[dict | None] = mapped_column(JSONType)
    pt_offer_shown: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    pt_converted: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

    member: Mapped[Member] = relationship()
    branch: Mapped[Branch] = relationship()
    assigned_trainer: Mapped[Trainer | None] = relationship()
    days: Mapped[list[JourneyDay]] = relationship(
        back_populates="journey", cascade="all, delete-orphan"
    )

    __table_args__ = (Index("ix_journeys_branch_status", "branch_id", "status"),)


class JourneyDay(Base, TimestampMixin):
    """One row per planned day. Materialised up front so "Day 12 of 45" is a
    lookup rather than a calculation that every caller could get wrong."""

    __tablename__ = "journey_days"

    id: Mapped[int] = mapped_column(primary_key=True)
    journey_id: Mapped[int] = mapped_column(
        ForeignKey("journeys.id", ondelete="CASCADE"), nullable=False, index=True
    )
    day_number: Mapped[int] = mapped_column(Integer, nullable=False)
    planned_on: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    split: Mapped[WorkoutSplit] = mapped_column(workout_split_enum, nullable=False)
    status: Mapped[DayStatus] = mapped_column(
        day_status_enum, default=DayStatus.PENDING, nullable=False
    )
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    journey: Mapped[Journey] = relationship(back_populates="days")

    __table_args__ = (UniqueConstraint("journey_id", "day_number", name="uq_journey_day"),)


class Assessment(Base, TimestampMixin, DemoMixin):
    """The Day 1–3 fitness assessment, recorded by a trainer.

    Deliberately holds only what a trainer measures by hand. Body composition
    belongs to InBody and is not invented here — see BodyComposition.
    """

    __tablename__ = "assessments"

    id: Mapped[int] = mapped_column(primary_key=True)
    journey_id: Mapped[int | None] = mapped_column(
        ForeignKey("journeys.id", ondelete="CASCADE"), index=True
    )
    member_id: Mapped[int] = mapped_column(
        ForeignKey("members.id", ondelete="CASCADE"), nullable=False, index=True
    )
    branch_id: Mapped[int] = mapped_column(ForeignKey("branches.id"), nullable=False, index=True)
    trainer_id: Mapped[int | None] = mapped_column(ForeignKey("trainers.id"))
    status: Mapped[AssessmentStatus] = mapped_column(
        assessment_status_enum, default=AssessmentStatus.NOT_STARTED, nullable=False
    )
    goal: Mapped[str | None] = mapped_column(String(160))
    height_cm: Mapped[float | None] = mapped_column(Numeric(5, 1, asdecimal=False))
    weight_kg: Mapped[float | None] = mapped_column(Numeric(5, 1, asdecimal=False))
    notes: Mapped[str | None] = mapped_column(Text)
    recorded_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class CardioSession(Base, TimestampMixin, DemoMixin):
    """A Day 1–3 cardio block. Counted against ``cardio_sessions_required``."""

    __tablename__ = "cardio_sessions"

    id: Mapped[int] = mapped_column(primary_key=True)
    journey_id: Mapped[int] = mapped_column(
        ForeignKey("journeys.id", ondelete="CASCADE"), nullable=False, index=True
    )
    member_id: Mapped[int] = mapped_column(
        ForeignKey("members.id", ondelete="CASCADE"), nullable=False, index=True
    )
    branch_id: Mapped[int] = mapped_column(ForeignKey("branches.id"), nullable=False, index=True)
    day_number: Mapped[int] = mapped_column(Integer, nullable=False)
    duration_minutes: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    machine: Mapped[str | None] = mapped_column(String(80))
    notes: Mapped[str | None] = mapped_column(Text)
    recorded_by_user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"))
    completed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)

    __table_args__ = (UniqueConstraint("journey_id", "day_number", name="uq_cardio_journey_day"),)


# ---------------------------------------------------------------- workouts


class WorkoutPlan(Base, TimestampMixin, DemoMixin):
    """A named PPL plan. Chain templates have ``member_id`` null; assigning one
    to a member copies it, so editing the template never rewrites history."""

    __tablename__ = "workout_plans"

    id: Mapped[int] = mapped_column(primary_key=True)
    member_id: Mapped[int | None] = mapped_column(
        ForeignKey("members.id", ondelete="CASCADE"), index=True
    )
    journey_id: Mapped[int | None] = mapped_column(
        ForeignKey("journeys.id", ondelete="CASCADE"), index=True
    )
    branch_id: Mapped[int | None] = mapped_column(ForeignKey("branches.id"), index=True)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    is_template: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    created_by_user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"))

    items: Mapped[list[WorkoutPlanItem]] = relationship(
        back_populates="plan", cascade="all, delete-orphan"
    )


class WorkoutPlanItem(Base, TimestampMixin):
    __tablename__ = "workout_plan_items"

    id: Mapped[int] = mapped_column(primary_key=True)
    plan_id: Mapped[int] = mapped_column(
        ForeignKey("workout_plans.id", ondelete="CASCADE"), nullable=False, index=True
    )
    split: Mapped[WorkoutSplit] = mapped_column(workout_split_enum, nullable=False)
    order_index: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    exercise: Mapped[str] = mapped_column(String(120), nullable=False)
    sets: Mapped[int] = mapped_column(Integer, default=3, nullable=False)
    reps: Mapped[str] = mapped_column(String(32), default="10", nullable=False)
    rest_seconds: Mapped[int] = mapped_column(Integer, default=60, nullable=False)
    notes: Mapped[str | None] = mapped_column(String(160))

    plan: Mapped[WorkoutPlan] = relationship(back_populates="items")

    __table_args__ = (Index("ix_plan_items_plan_split", "plan_id", "split"),)


class WorkoutSession(Base, TimestampMixin, DemoMixin):
    """A member's OWN workout.

    Distinct from a gym visit (an attendance event), a PT session and a group
    class — §13 of the brief turns on these four staying separable.
    """

    __tablename__ = "workout_sessions"

    id: Mapped[int] = mapped_column(primary_key=True)
    member_id: Mapped[int] = mapped_column(
        ForeignKey("members.id", ondelete="CASCADE"), nullable=False, index=True
    )
    branch_id: Mapped[int] = mapped_column(ForeignKey("branches.id"), nullable=False, index=True)
    journey_id: Mapped[int | None] = mapped_column(
        ForeignKey("journeys.id", ondelete="CASCADE"), index=True
    )
    journey_day_id: Mapped[int | None] = mapped_column(
        ForeignKey("journey_days.id", ondelete="SET NULL")
    )
    day_number: Mapped[int | None] = mapped_column(Integer)
    split: Mapped[WorkoutSplit] = mapped_column(workout_split_enum, nullable=False)
    session_date: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    status: Mapped[SessionStatus] = mapped_column(
        session_status_enum, default=SessionStatus.SCHEDULED, nullable=False
    )
    # Set when a trainer is supervising the member's own workout — the
    # "own workout support" line on the trainer's schedule.
    supervising_trainer_id: Mapped[int | None] = mapped_column(
        ForeignKey("trainers.id"), index=True
    )
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    notes: Mapped[str | None] = mapped_column(Text)

    items: Mapped[list[WorkoutSessionItem]] = relationship(
        back_populates="session", cascade="all, delete-orphan"
    )
    member: Mapped[Member] = relationship()

    __table_args__ = (
        Index("ix_workout_sessions_member_date", "member_id", "session_date"),
        # Partial: only SCHEDULED/IN_PROGRESS/COMPLETED collide. CANCELLED and
        # NO_SHOW are deliberately excluded — start_workout() already treats
        # them as non-blocking so a member can restart on the same day after
        # a cancelled/no-show session, and this constraint must not forbid
        # what the service layer already allows.
        Index(
            "uq_workout_sessions_member_active_day",
            "member_id",
            "session_date",
            unique=True,
            postgresql_where=text("status IN ('SCHEDULED', 'IN_PROGRESS', 'COMPLETED')"),
            sqlite_where=text("status IN ('SCHEDULED', 'IN_PROGRESS', 'COMPLETED')"),
        ),
    )


class WorkoutSessionItem(Base, TimestampMixin):
    __tablename__ = "workout_session_items"

    id: Mapped[int] = mapped_column(primary_key=True)
    session_id: Mapped[int] = mapped_column(
        ForeignKey("workout_sessions.id", ondelete="CASCADE"), nullable=False, index=True
    )
    plan_item_id: Mapped[int | None] = mapped_column(
        ForeignKey("workout_plan_items.id", ondelete="SET NULL")
    )
    order_index: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    exercise: Mapped[str] = mapped_column(String(120), nullable=False)
    sets: Mapped[int] = mapped_column(Integer, default=3, nullable=False)
    reps: Mapped[str] = mapped_column(String(32), default="10", nullable=False)
    rest_seconds: Mapped[int] = mapped_column(Integer, default=60, nullable=False)
    status: Mapped[ItemStatus] = mapped_column(
        item_status_enum, default=ItemStatus.PENDING, nullable=False
    )
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    session: Mapped[WorkoutSession] = relationship(back_populates="items")
    # ``sets`` above is the prescription, so the performed sets need a different
    # name. Ordered here so no reader has to remember to sort them.
    logged_sets: Mapped[list[WorkoutSet]] = relationship(
        back_populates="item",
        cascade="all, delete-orphan",
        order_by="WorkoutSet.set_number",
    )


class WorkoutSet(Base, TimestampMixin):
    """One set the member actually performed.

    ``WorkoutSessionItem`` holds what the plan asked for — three sets of ten —
    and a single status for the whole exercise. That cannot record what was
    lifted: a member who presses 60 kg for 8 and then 60 kg for 6 has done two
    different sets of one prescribed exercise. This is the row per set, and it
    is the only place actual weight, actual reps and RPE exist.

    Everything downstream — previous-session performance, personal records,
    volume, RPE trends — reads from here. Without it those numbers could only
    be invented.
    """

    __tablename__ = "workout_sets"

    id: Mapped[int] = mapped_column(primary_key=True)
    session_item_id: Mapped[int] = mapped_column(
        ForeignKey("workout_session_items.id", ondelete="CASCADE"), nullable=False, index=True
    )
    # 1-based, and unique per exercise: "set 2" has to mean one row.
    set_number: Mapped[int] = mapped_column(Integer, nullable=False)
    # Kilograms to one decimal, which is the finest increment any plate loading
    # produces. Bodyweight movements record 0.0 — an honest "no external load"
    # rather than a null that would then have to be guessed at on read.
    weight_kg: Mapped[float] = mapped_column(Numeric(5, 1, asdecimal=False), nullable=False)
    reps: Mapped[int] = mapped_column(Integer, nullable=False)
    # Rate of perceived exertion, 1–10 in half points. Nullable because it is a
    # coaching input a member may not record, and a defaulted RPE would read as
    # data the member never gave.
    rpe: Mapped[float | None] = mapped_column(Numeric(3, 1, asdecimal=False))
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    item: Mapped[WorkoutSessionItem] = relationship(back_populates="logged_sets")

    __table_args__ = (
        UniqueConstraint("session_item_id", "set_number", name="uq_workout_set_number"),
    )


# ---------------------------------------------------------------------- PT


class PTPackage(Base, TimestampMixin, DemoMixin):
    """A block of personal-training sessions a member has bought.

    ``price_amount`` is nullable and never defaulted: SLAM has not supplied
    pricing, and a made-up number shown to a member would be worse than none.
    """

    __tablename__ = "pt_packages"

    id: Mapped[int] = mapped_column(primary_key=True)
    member_id: Mapped[int] = mapped_column(
        ForeignKey("members.id", ondelete="CASCADE"), nullable=False, index=True
    )
    branch_id: Mapped[int] = mapped_column(ForeignKey("branches.id"), nullable=False, index=True)
    trainer_id: Mapped[int | None] = mapped_column(ForeignKey("trainers.id"), index=True)
    journey_id: Mapped[int | None] = mapped_column(ForeignKey("journeys.id"), index=True)
    sessions_total: Mapped[int] = mapped_column(Integer, nullable=False)
    sessions_used: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    status: Mapped[PackageStatus] = mapped_column(
        package_status_enum, default=PackageStatus.ACTIVE, nullable=False
    )
    start_date: Mapped[date] = mapped_column(Date, nullable=False)
    expiry_date: Mapped[date | None] = mapped_column(Date)
    price_amount: Mapped[float | None] = mapped_column(Numeric(10, 2, asdecimal=False))
    currency: Mapped[str | None] = mapped_column(String(8))
    # "journey_conversion" when it came out of a completed 45-day journey,
    # which is what the marketing funnel counts as a PT conversion.
    origin: Mapped[str] = mapped_column(String(32), default="direct", nullable=False)
    created_by_user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"))

    member: Mapped[Member] = relationship()
    trainer: Mapped[Trainer | None] = relationship()

    @property
    def sessions_remaining(self) -> int:
        return max(0, self.sessions_total - self.sessions_used)


class PTSession(Base, TimestampMixin, DemoMixin):
    """One PT appointment.

    Member and trainer arrival are separate columns on purpose — the split PT
    attendance view is a read of these two, not a second attendance model.
    """

    __tablename__ = "pt_sessions"

    id: Mapped[int] = mapped_column(primary_key=True)
    package_id: Mapped[int] = mapped_column(
        ForeignKey("pt_packages.id", ondelete="CASCADE"), nullable=False, index=True
    )
    member_id: Mapped[int] = mapped_column(
        ForeignKey("members.id", ondelete="CASCADE"), nullable=False, index=True
    )
    trainer_id: Mapped[int] = mapped_column(ForeignKey("trainers.id"), nullable=False, index=True)
    branch_id: Mapped[int] = mapped_column(ForeignKey("branches.id"), nullable=False, index=True)
    session_date: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    scheduled_start: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    scheduled_end: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    # Position within the package: "7 / 20".
    session_number: Mapped[int] = mapped_column(Integer, nullable=False)
    status: Mapped[SessionStatus] = mapped_column(
        session_status_enum, default=SessionStatus.SCHEDULED, nullable=False
    )
    member_checked_in_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    trainer_checked_in_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    completed_by_user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"))
    notes: Mapped[str | None] = mapped_column(Text)

    package: Mapped[PTPackage] = relationship()
    member: Mapped[Member] = relationship()
    trainer: Mapped[Trainer] = relationship()

    __table_args__ = (
        Index("ix_pt_sessions_trainer_date", "trainer_id", "session_date"),
        Index("ix_pt_sessions_branch_date", "branch_id", "session_date"),
    )


# ---------------------------------------------------------- group classes


class GroupClass(Base, TimestampMixin, DemoMixin):
    __tablename__ = "group_classes"

    id: Mapped[int] = mapped_column(primary_key=True)
    branch_id: Mapped[int] = mapped_column(ForeignKey("branches.id"), nullable=False, index=True)
    trainer_id: Mapped[int | None] = mapped_column(ForeignKey("trainers.id"), index=True)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    description: Mapped[str | None] = mapped_column(Text)
    starts_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, index=True)
    ends_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    class_date: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    capacity: Mapped[int] = mapped_column(Integer, default=20, nullable=False)
    status: Mapped[ClassStatus] = mapped_column(
        class_status_enum, default=ClassStatus.SCHEDULED, nullable=False
    )
    announcement: Mapped[str | None] = mapped_column(Text)
    created_by_user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"))

    branch: Mapped[Branch] = relationship()
    trainer: Mapped[Trainer | None] = relationship()


class GroupClassRsvp(Base, TimestampMixin):
    """The member's answer. Kept apart from attendance: saying yes and turning
    up are different facts, and SLAM needs to see the gap between them."""

    __tablename__ = "group_class_rsvps"

    id: Mapped[int] = mapped_column(primary_key=True)
    class_id: Mapped[int] = mapped_column(
        ForeignKey("group_classes.id", ondelete="CASCADE"), nullable=False, index=True
    )
    member_id: Mapped[int] = mapped_column(
        ForeignKey("members.id", ondelete="CASCADE"), nullable=False, index=True
    )
    response: Mapped[RsvpResponse] = mapped_column(
        rsvp_response_enum, default=RsvpResponse.PENDING, nullable=False
    )
    responded_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    member: Mapped[Member] = relationship()

    __table_args__ = (UniqueConstraint("class_id", "member_id", name="uq_class_rsvp"),)


class GroupClassAttendance(Base, TimestampMixin):
    __tablename__ = "group_class_attendance"

    id: Mapped[int] = mapped_column(primary_key=True)
    class_id: Mapped[int] = mapped_column(
        ForeignKey("group_classes.id", ondelete="CASCADE"), nullable=False, index=True
    )
    member_id: Mapped[int] = mapped_column(
        ForeignKey("members.id", ondelete="CASCADE"), nullable=False, index=True
    )
    branch_id: Mapped[int] = mapped_column(ForeignKey("branches.id"), nullable=False, index=True)
    attended: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    recorded_by_user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"))
    recorded_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)

    member: Mapped[Member] = relationship()

    __table_args__ = (UniqueConstraint("class_id", "member_id", name="uq_class_attendance"),)


# ------------------------------------------------------------------ alerts


class Alert(Base, TimestampMixin):
    """In-app alert. The only notification channel V1 depends on.

    ``dedupe_key`` is what lets the automations run as often as they like — a
    second pass over the same fact updates the existing row rather than
    stacking a duplicate in the owner's list.
    """

    __tablename__ = "alerts"

    id: Mapped[int] = mapped_column(primary_key=True)
    branch_id: Mapped[int | None] = mapped_column(ForeignKey("branches.id"), index=True)
    # Which role should see it. Null user = anyone holding that role.
    target_role: Mapped[str | None] = mapped_column(String(32), index=True)
    target_user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), index=True)
    key: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    severity: Mapped[AlertSeverity] = mapped_column(
        alert_severity_enum, default=AlertSeverity.INFO, nullable=False
    )
    status: Mapped[AlertStatus] = mapped_column(
        alert_status_enum, default=AlertStatus.OPEN, nullable=False, index=True
    )
    title: Mapped[str] = mapped_column(String(160), nullable=False)
    body: Mapped[str] = mapped_column(Text, nullable=False)
    entity_type: Mapped[str | None] = mapped_column(String(48))
    entity_id: Mapped[str | None] = mapped_column(String(48))
    # Where tapping the alert should land in the app.
    action_route: Mapped[str | None] = mapped_column(String(160))
    dedupe_key: Mapped[str] = mapped_column(String(180), unique=True, nullable=False)
    payload: Mapped[dict] = mapped_column(JSONType, default=dict, nullable=False)
    resolved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    acknowledged_by_user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"))

    __table_args__ = (Index("ix_alerts_branch_status", "branch_id", "status"),)


class Task(Base, TimestampMixin):
    """Follow-up work the automations create — the PT call after Day 45."""

    __tablename__ = "tasks"

    id: Mapped[int] = mapped_column(primary_key=True)
    branch_id: Mapped[int] = mapped_column(ForeignKey("branches.id"), nullable=False, index=True)
    member_id: Mapped[int | None] = mapped_column(ForeignKey("members.id", ondelete="CASCADE"))
    assigned_trainer_id: Mapped[int | None] = mapped_column(ForeignKey("trainers.id"))
    key: Mapped[str] = mapped_column(String(64), nullable=False)
    title: Mapped[str] = mapped_column(String(160), nullable=False)
    detail: Mapped[str | None] = mapped_column(Text)
    due_on: Mapped[date | None] = mapped_column(Date)
    status: Mapped[str] = mapped_column(String(24), default="open", nullable=False, index=True)
    dedupe_key: Mapped[str] = mapped_column(String(180), unique=True, nullable=False)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    completed_by_user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"))


# ------------------------------------------------------ attendance appeals


class AttendanceCorrection(Base, TimestampMixin):
    """A trainer's request to fix an attendance record, and its verdict.

    The original values are copied in at request time so the audit answers
    "what did this say before?" without replaying the event log.
    """

    __tablename__ = "attendance_corrections"

    id: Mapped[int] = mapped_column(primary_key=True)
    trainer_attendance_id: Mapped[int] = mapped_column(
        ForeignKey("trainer_attendance.id", ondelete="CASCADE"), nullable=False, index=True
    )
    trainer_id: Mapped[int] = mapped_column(
        ForeignKey("trainers.id", ondelete="CASCADE"), nullable=False, index=True
    )
    branch_id: Mapped[int] = mapped_column(ForeignKey("branches.id"), nullable=False, index=True)
    work_date: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    correction_type: Mapped[CorrectionType] = mapped_column(correction_type_enum, nullable=False)
    status: Mapped[CorrectionStatus] = mapped_column(
        correction_status_enum, default=CorrectionStatus.PENDING, nullable=False, index=True
    )
    reason: Mapped[str] = mapped_column(Text, nullable=False)
    requested_check_in_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    requested_check_out_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    original_check_in_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    original_check_out_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    original_status: Mapped[AttendanceStatus | None] = mapped_column(attendance_status_enum)
    new_status: Mapped[AttendanceStatus | None] = mapped_column(attendance_status_enum)
    requested_by_user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)
    reviewed_by_user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"))
    review_note: Mapped[str | None] = mapped_column(Text)
    reviewed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    trainer: Mapped[Trainer] = relationship()
    attendance: Mapped[TrainerAttendance] = relationship()


class BodyComposition(Base, TimestampMixin):
    """Reserved for InBody. No V1 workflow writes or reads this.

    The table exists so the member's progress screen has a real place to put
    scan results the day the integration is switched on — and so nothing in
    the meantime is tempted to fabricate the numbers somewhere else.
    """

    __tablename__ = "body_compositions"

    id: Mapped[int] = mapped_column(primary_key=True)
    member_id: Mapped[int] = mapped_column(
        ForeignKey("members.id", ondelete="CASCADE"), nullable=False, index=True
    )
    branch_id: Mapped[int] = mapped_column(ForeignKey("branches.id"), nullable=False, index=True)
    measured_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    source: Mapped[str] = mapped_column(String(32), default="inbody", nullable=False)
    external_ref: Mapped[str | None] = mapped_column(String(64), index=True)
    weight_kg: Mapped[float | None] = mapped_column(Numeric(5, 1, asdecimal=False))
    body_fat_pct: Mapped[float | None] = mapped_column(Pct())
    muscle_mass_kg: Mapped[float | None] = mapped_column(Numeric(5, 1, asdecimal=False))
    bmi: Mapped[float | None] = mapped_column(Numeric(5, 1, asdecimal=False))
    visceral_fat: Mapped[float | None] = mapped_column(Numeric(5, 1, asdecimal=False))
    bmr_kcal: Mapped[int | None] = mapped_column(Integer)
    body_water_pct: Mapped[float | None] = mapped_column(Pct())

    __table_args__ = (
        # Re-running the same InBody export must not duplicate a scan. Every
        # real InBody row carries a Local ID (the machine's own identifier for
        # the scan), so the common case is covered by a plain uniqueness rule
        # on (member, external_ref) — NULLs are distinct in both Postgres and
        # SQLite, so members whose rows lack a Local ID are unaffected by it.
        UniqueConstraint(
            "member_id", "external_ref", name="uq_body_compositions_member_external_ref"
        ),
        # For the rare row that arrives without a Local ID at all, fall back
        # to guarding on (member, measured_at) instead — but only among rows
        # that also lack a Local ID, so it never collides with the primary
        # rule above for the normal case.
        Index(
            "uq_body_compositions_member_measured_at_no_ref",
            "member_id",
            "measured_at",
            unique=True,
            postgresql_where=text("external_ref IS NULL"),
            sqlite_where=text("external_ref IS NULL"),
        ),
    )


class MemberCheckIn(Base, TimestampMixin):
    """A member's own daily "how are you feeling" answer.

    One row per member per day — enforced by the unique constraint below, not
    just by service-layer discipline, so a retried submit cannot double the
    row rather than update it. ``work_date`` is server-derived the same way
    every other day-scoped record in the journey architecture is
    (``branch_today``), never a client-supplied date, so a member cannot
    backdate or predate an entry by changing their phone's clock.

    Deliberately member-only: there is no trainer- or owner-facing write path
    onto this table, and no column here claims to be a readiness or recovery
    score. It is what the member said, nothing inferred from it.
    """

    __tablename__ = "member_checkins"
    __table_args__ = (UniqueConstraint("member_id", "work_date", name="uq_member_checkin_day"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    member_id: Mapped[int] = mapped_column(
        ForeignKey("members.id", ondelete="CASCADE"), nullable=False, index=True
    )
    branch_id: Mapped[int] = mapped_column(ForeignKey("branches.id"), nullable=False, index=True)
    work_date: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    feeling: Mapped[CheckInFeeling] = mapped_column(checkin_feeling_enum, nullable=False)


class TrainerAvailability(Base, TimestampMixin, DemoMixin):
    """A slot a trainer has published as bookable.

    Carries ``is_demo`` like every other seeded entity, so slots created for UI
    evaluation can be removed without touching a trainer's real published
    hours.

    Stored as an explicit date plus a local start/end time rather than a
    recurring rule: SLAM trainers publish a week at a time and change it often,
    and a recurrence that has to be exploded before it can be read is harder to
    correct than the seven rows it replaces.

    Nothing consumes these yet. Members cannot book PT — the API answers them
    with "Ask your branch to book a PT session" — so for now this is the
    trainer's published intent, and the desk that creates the session reads it.
    The uniqueness constraint is what stops the same slot being published twice
    and then booked twice.
    """

    __tablename__ = "trainer_availability"
    __table_args__ = (
        UniqueConstraint(
            "trainer_id", "slot_date", "start_time", name="uq_trainer_availability_slot"
        ),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    trainer_id: Mapped[int] = mapped_column(
        ForeignKey("trainers.id", ondelete="CASCADE"), nullable=False, index=True
    )
    branch_id: Mapped[int] = mapped_column(ForeignKey("branches.id"), nullable=False, index=True)
    slot_date: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    start_time: Mapped[time] = mapped_column(Time, nullable=False)
    end_time: Mapped[time] = mapped_column(Time, nullable=False)
    # Set when a PT session is created against this slot, so publishing and
    # booking cannot disagree about whether the hour is still free.
    booked_session_id: Mapped[int | None] = mapped_column(
        ForeignKey("pt_sessions.id", ondelete="SET NULL"), index=True
    )
    note: Mapped[str | None] = mapped_column(String(160))

    trainer: Mapped[Trainer] = relationship()


class Payment(Base, TimestampMixin, DemoMixin):
    """Money SLAM has asked for, and whether it arrived.

    One row per charge, not per instalment: a membership sold in March is one
    payment that is either pending or paid, and a renewal in June is a
    different row. That keeps "what is outstanding" a query over status rather
    than a running balance nobody can reconcile.

    `amount` is what the member owes after `discount` and including `tax` — the
    figure on the receipt. The components are kept so a receipt can be
    reprinted, not so anything recomputes the total from them.

    `collected_by_user_id` is who took the money, which is the question asked
    first whenever cash and a spreadsheet disagree.
    """

    __tablename__ = "payments"

    id: Mapped[int] = mapped_column(primary_key=True)
    branch_id: Mapped[int] = mapped_column(ForeignKey("branches.id"), nullable=False, index=True)
    member_id: Mapped[int] = mapped_column(
        ForeignKey("members.id", ondelete="CASCADE"), nullable=False, index=True
    )
    kind: Mapped[PaymentKind] = mapped_column(
        Enum(PaymentKind, name="payment_kind"), nullable=False, index=True
    )
    status: Mapped[PaymentStatus] = mapped_column(
        Enum(PaymentStatus, name="payment_status"),
        default=PaymentStatus.PENDING,
        nullable=False,
        index=True,
    )
    method: Mapped[PaymentMethod | None] = mapped_column(Enum(PaymentMethod, name="payment_method"))

    amount: Mapped[float] = mapped_column(Numeric(10, 2, asdecimal=False), nullable=False)
    discount: Mapped[float] = mapped_column(
        Numeric(10, 2, asdecimal=False), default=0, nullable=False
    )
    tax: Mapped[float] = mapped_column(Numeric(10, 2, asdecimal=False), default=0, nullable=False)
    currency: Mapped[str] = mapped_column(String(3), default="INR", nullable=False)

    # What the charge is for. Exactly one is set for a typed payment; an addon
    # may carry none, which is why they are nullable rather than a polymorphic
    # key that would need a join to know what it points at.
    membership_id: Mapped[int | None] = mapped_column(
        ForeignKey("memberships.id", ondelete="SET NULL"), index=True
    )
    pt_package_id: Mapped[int | None] = mapped_column(
        ForeignKey("pt_packages.id", ondelete="SET NULL"), index=True
    )
    group_class_id: Mapped[int | None] = mapped_column(
        ForeignKey("group_classes.id", ondelete="SET NULL"), index=True
    )
    # Set for PT so a trainer's delivered revenue is answerable without
    # inferring it from the package's trainer, which can change.
    trainer_id: Mapped[int | None] = mapped_column(ForeignKey("trainers.id"), index=True)

    due_on: Mapped[date | None] = mapped_column(Date, index=True)
    paid_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), index=True)
    collected_by_user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), index=True)
    receipt_no: Mapped[str | None] = mapped_column(String(32), unique=True)
    notes: Mapped[str | None] = mapped_column(String(255))

    member: Mapped[Member] = relationship()
    branch: Mapped[Branch] = relationship()


class Setting(Base, TimestampMixin):
    """Configurable business rules, global or per branch."""

    __tablename__ = "settings"

    id: Mapped[int] = mapped_column(primary_key=True)
    branch_id: Mapped[int | None] = mapped_column(ForeignKey("branches.id"), index=True)
    key: Mapped[str] = mapped_column(String(80), nullable=False)
    value: Mapped[dict] = mapped_column(JSONType, nullable=False)
    description: Mapped[str | None] = mapped_column(Text)
    updated_by_user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"))

    __table_args__ = (UniqueConstraint("branch_id", "key", name="uq_setting_scope_key"),)


__all__ = [
    "Alert",
    "AlertSeverity",
    "AlertStatus",
    "Assessment",
    "AssessmentStatus",
    "AttendanceCorrection",
    "AttendanceEvent",
    "AttendanceStatus",
    "AuditLog",
    "BodyComposition",
    "Branch",
    "Campaign",
    "CaptureMethod",
    "CardioSession",
    "CheckInFeeling",
    "ClassStatus",
    "CorrectionStatus",
    "CorrectionType",
    "DayStatus",
    "EventType",
    "FingerprintDevice",
    "FingerprintEnrollment",
    "GroupClass",
    "GroupClassAttendance",
    "GroupClassRsvp",
    "IncentiveResult",
    "IncentiveRule",
    "IncentiveStatus",
    "ItemStatus",
    "Journey",
    "JourneyDay",
    "JourneyStatus",
    "JourneyType",
    "MarketingSource",
    "Member",
    "MemberCheckIn",
    "Membership",
    "MembershipStatus",
    "Notification",
    "NotificationStatus",
    "PTPackage",
    "PTSession",
    "PackageStatus",
    "PersonType",
    "Referral",
    "RefreshToken",
    "Role",
    "RoleKey",
    "RsvpResponse",
    "SessionStatus",
    "Setting",
    "Shift",
    "Task",
    "Trainer",
    "TrainerAttendance",
    "User",
    "WorkoutPlan",
    "WorkoutPlanItem",
    "WorkoutSession",
    "WorkoutSessionItem",
    "WorkoutSet",
    "WorkoutSplit",
]

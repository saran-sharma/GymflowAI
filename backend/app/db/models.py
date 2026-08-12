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


# ----------------------------------------------------------------- tables


# One instance per named Postgres enum, shared by every column that uses it.
person_type_enum = Enum(PersonType, name="person_type")
event_type_enum = Enum(EventType, name="event_type")
capture_method_enum = Enum(CaptureMethod, name="capture_method")
attendance_status_enum = Enum(AttendanceStatus, name="attendance_status")
incentive_status_enum = Enum(IncentiveStatus, name="incentive_status")
membership_status_enum = Enum(MembershipStatus, name="membership_status")
notification_status_enum = Enum(NotificationStatus, name="notification_status")


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
    external_ref: Mapped[str | None] = mapped_column(String(64), index=True)

    user: Mapped[User] = relationship(back_populates="member")
    branch: Mapped[Branch] = relationship(back_populates="members")
    assigned_trainer: Mapped[Trainer | None] = relationship()
    memberships: Mapped[list[Membership]] = relationship(back_populates="member")


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

    __table_args__ = (
        Index("ix_events_branch_date", "branch_id", "work_date"),
        Index("ix_events_user_date", "user_id", "work_date"),
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
    "AttendanceEvent",
    "AttendanceStatus",
    "AuditLog",
    "Branch",
    "CaptureMethod",
    "EventType",
    "IncentiveResult",
    "IncentiveRule",
    "IncentiveStatus",
    "Member",
    "Membership",
    "MembershipStatus",
    "Notification",
    "NotificationStatus",
    "PersonType",
    "RefreshToken",
    "Role",
    "RoleKey",
    "Setting",
    "Shift",
    "Trainer",
    "TrainerAttendance",
    "User",
]

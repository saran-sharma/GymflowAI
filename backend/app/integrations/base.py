"""Integration contracts.

Every external system SLAM may eventually connect — Yoactiv, InBody, the
turnstile controller, WhatsApp, an intelligence service — sits behind one of
these Protocols. V1 ships local/mock implementations of all of them and the
core product must remain fully usable with every integration disabled.

Nothing here calls a vendor. Where a vendor's API is not documented to us, the
interface deliberately stops at the contract; see ``docs/INTEGRATIONS.md``.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date, datetime
from typing import Any, Protocol, runtime_checkable

# ------------------------------------------------------------------ models
# Plain transport shapes so a provider never has to import the ORM.


@dataclass(frozen=True)
class ExternalMember:
    external_id: str
    full_name: str
    email: str | None = None
    phone: str | None = None
    branch_code: str | None = None
    plan_name: str | None = None
    status: str | None = None
    starts_on: date | None = None
    ends_on: date | None = None
    raw: dict[str, Any] = field(default_factory=dict)


@dataclass(frozen=True)
class ExternalTrainer:
    external_id: str
    full_name: str
    branch_code: str | None = None
    email: str | None = None
    phone: str | None = None
    designation: str | None = None
    raw: dict[str, Any] = field(default_factory=dict)


@dataclass(frozen=True)
class ExternalAttendanceEvent:
    external_id: str
    person_external_id: str
    person_type: str  # "member" | "trainer"
    event_type: str  # "check_in" | "check_out"
    occurred_at: datetime  # must be the source system's authoritative time
    branch_code: str | None = None
    method: str | None = None
    raw: dict[str, Any] = field(default_factory=dict)


@dataclass(frozen=True)
class BodyCompositionReading:
    external_id: str
    person_external_id: str
    measured_at: datetime
    weight_kg: float | None = None
    body_fat_pct: float | None = None
    skeletal_muscle_kg: float | None = None
    bmi: float | None = None
    visceral_fat_level: float | None = None
    raw: dict[str, Any] = field(default_factory=dict)


@dataclass(frozen=True)
class AccessDecision:
    allowed: bool
    person_external_id: str | None = None
    reason: str | None = None
    raw: dict[str, Any] = field(default_factory=dict)


@dataclass(frozen=True)
class AccessEvent:
    """One access-control scan, normalized to what a device can actually
    tell us — the shape every hardware adapter (X2008 today; a future
    RFID/face terminal tomorrow) converts its own wire format into before a
    Member Resolver ever sees it.

    Deliberately excludes anything the hardware does not genuinely provide:

    * ``event_type`` is ``None`` here on purpose for a passive attendance
      terminal like the X2008 — it has no "in" or "out" button, only a scan.
      Whether a given scan is a check-in or check-out is inferred downstream
      from the member's current state (see
      ``attendance_service.record_fingerprint_scan``), not asserted by the
      device, so this field is never fabricated to look more certain than
      the source data is.
    * ``device_occurred_at`` is the device's own clock, kept for traceability
      only — GymFlow's attendance record is timestamped by ``received_at``
      (the server clock), the same "never trust a client/device clock"
      principle ``app.core.clock`` already applies everywhere else.
    """

    device_id: str  # the device's own serial/identifier, not GymFlow's PK
    device_user_id: str  # the enrolled-id the device assigned this person
    device_occurred_at: datetime | None
    received_at: datetime
    branch_code: str | None = None
    event_type: str | None = None
    reference_id: str | None = None
    raw: dict[str, Any] = field(default_factory=dict)


@dataclass(frozen=True)
class NotificationMessage:
    to: str
    title: str
    body: str
    template: str | None = None
    data: dict[str, Any] = field(default_factory=dict)


@dataclass(frozen=True)
class DeliveryReceipt:
    accepted: bool
    provider: str
    provider_message_id: str | None = None
    detail: str | None = None


@dataclass(frozen=True)
class Insight:
    key: str
    title: str
    detail: str
    severity: str = "info"
    confidence: float = 0.0
    data: dict[str, Any] = field(default_factory=dict)


# --------------------------------------------------------------- protocols


@runtime_checkable
class IntegrationProvider(Protocol):
    """Common surface so the registry can report what is wired up."""

    name: str
    enabled: bool

    def health(self) -> dict[str, Any]: ...


@runtime_checkable
class IMemberProvider(IntegrationProvider, Protocol):
    def list_members(self, branch_code: str | None = None) -> list[ExternalMember]: ...
    def get_member(self, external_id: str) -> ExternalMember | None: ...


@runtime_checkable
class ITrainerProvider(IntegrationProvider, Protocol):
    def list_trainers(self, branch_code: str | None = None) -> list[ExternalTrainer]: ...
    def get_trainer(self, external_id: str) -> ExternalTrainer | None: ...


@runtime_checkable
class IAttendanceProvider(IntegrationProvider, Protocol):
    def pull_events(
        self, since: datetime, branch_code: str | None = None
    ) -> list[ExternalAttendanceEvent]: ...


@runtime_checkable
class IBodyCompositionProvider(IntegrationProvider, Protocol):
    def latest_reading(self, person_external_id: str) -> BodyCompositionReading | None: ...
    def readings_since(self, since: datetime) -> list[BodyCompositionReading]: ...


@runtime_checkable
class IAccessControlProvider(IntegrationProvider, Protocol):
    """Turnstiles, fingerprint readers, RFID and face terminals.

    Biometric *templates* are never accepted or stored by GymFlow. A provider
    resolves a scan to an identifier on its own hardware and hands us only that
    identifier and the decision.
    """

    supported_methods: tuple[str, ...]

    def verify(self, branch_code: str, method: str, credential: str) -> AccessDecision: ...
    def open_gate(self, branch_code: str, device_id: str) -> bool: ...


@runtime_checkable
class INotificationProvider(IntegrationProvider, Protocol):
    channel: str

    def send(self, message: NotificationMessage) -> DeliveryReceipt: ...


@runtime_checkable
class IIntelligenceProvider(IntegrationProvider, Protocol):
    def insights(self, branch_code: str | None = None) -> list[Insight]: ...
    def churn_risk(self, member_external_ids: list[str]) -> dict[str, float]: ...


class IntegrationDisabled(RuntimeError):
    """Raised when a caller reaches a provider that has not been turned on."""


__all__ = [
    "AccessDecision",
    "AccessEvent",
    "BodyCompositionReading",
    "DeliveryReceipt",
    "ExternalAttendanceEvent",
    "ExternalMember",
    "ExternalTrainer",
    "IAccessControlProvider",
    "IAttendanceProvider",
    "IBodyCompositionProvider",
    "IIntelligenceProvider",
    "IMemberProvider",
    "INotificationProvider",
    "ITrainerProvider",
    "Insight",
    "IntegrationDisabled",
    "IntegrationProvider",
    "NotificationMessage",
]

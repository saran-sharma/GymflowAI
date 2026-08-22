"""ZKTeco X2008 — SLAM's confirmed fingerprint attendance terminal.

Confirmed real device facts (from a physical inspection of the unit at a SLAM
branch, not guessed):

    Device: X2008              Serial: CUB7250201499
    MAC: 00:17:61:10:15:f2     Device ID: 1
    Device IP: 192.168.0.5     TCP Port: 4370
    Fingerprint Algorithm: Finger VX10.0
    Platform: ZMM200_TFT       MCU: 14
    Server Mode: ADMS          ADMS Server: http://biometric.yoactiv.com

"ADMS" is ZKTeco's standard push protocol: the terminal periodically POSTs
attendance logs to a configured server URL (conventionally under
``/iclock/cdata``) as pipe/tab-delimited text, rather than GymFlow polling it.
This is a widely published protocol family, not a proprietary one — but it has
**not been verified against this specific unit's firmware**. Nothing in this
module has seen real traffic from serial CUB7250201499. Every place that
depends on the wire format's exact shape says so and is disabled until
``settings.access_control_enabled`` is true.

What IS real and safe regardless of the protocol's field-level correctness:
GymFlow never receives, stores or transmits a fingerprint template. This
terminal resolves a scan to its own locally-assigned "enroll ID" on its own
hardware; everything below only ever handles that small integer/string
identifier and what it maps to in ``fingerprint_enrollments``.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from typing import Any

from sqlalchemy import select

from app.core.config import settings
from app.integrations.base import AccessDecision, IntegrationDisabled

#: X2008 is a standalone fingerprint attendance terminal. RFID/face are part
#: of the broader `ALL_METHODS` vocabulary other hardware may one day fill in
#: — this device only confirms fingerprint.
SUPPORTED_METHODS = ("fingerprint",)


class X2008FingerprintProvider:
    """Best-effort ``IAccessControlProvider`` for the X2008/ADMS terminal.

    ``verify`` exists to satisfy the interface and for direct testing; the
    real, primary path is the push receiver in
    ``app/api/v1/hardware.py`` calling
    ``app.services.attendance_service.record_fingerprint_scan`` after this
    module's ``resolve_enrollment`` has already turned a scan's enrolled-id
    into a member. ``verify``'s signature only carries a branch code, not a
    device id, so where a branch has more than one terminal it resolves the
    credential against any device registered to that branch — documented
    here rather than hidden, since it is a real limitation of the shared
    interface, not an oversight.
    """

    name = "x2008"
    supported_methods = SUPPORTED_METHODS

    def __init__(self, session_factory: Any | None = None) -> None:
        self.enabled = settings.access_control_enabled
        self._session_factory = session_factory

    def _unavailable(self) -> IntegrationDisabled:
        return IntegrationDisabled(
            "The X2008 fingerprint terminal is not enabled. Set "
            "ACCESS_CONTROL_ENABLED=true and FINGERPRINT_ADMS_SHARED_SECRET, "
            "register the device and enroll members first. See "
            "docs/INTEGRATIONS.md."
        )

    def verify(self, branch_code: str, method: str, credential: str) -> AccessDecision:
        if method not in self.supported_methods:
            return AccessDecision(
                allowed=False, reason=f"{method} is not handled by the X2008 provider"
            )
        if not self.enabled or self._session_factory is None:
            raise self._unavailable()

        from app.db.models import Branch, FingerprintDevice, FingerprintEnrollment, Member

        with self._session_factory() as db:
            branch = db.scalar(select(Branch).where(Branch.code == branch_code))
            if branch is None:
                return AccessDecision(allowed=False, reason="unknown branch")

            enrollment = db.scalar(
                select(FingerprintEnrollment)
                .join(
                    FingerprintDevice,
                    FingerprintEnrollment.device_id == FingerprintDevice.id,
                )
                .where(
                    FingerprintDevice.branch_id == branch.id,
                    FingerprintEnrollment.enrolled_id == credential,
                )
            )
            if enrollment is None:
                return AccessDecision(
                    allowed=False, reason="enrolled id not recognised at this branch"
                )
            member = db.get(Member, enrollment.member_id)
            if member is None or member.branch_id != branch.id:
                # Data integrity guard: an enrollment should never outlive or
                # outreach the member/branch it was created for.
                return AccessDecision(allowed=False, reason="member/branch mismatch")
            return AccessDecision(
                allowed=True,
                person_external_id=member.member_code,
                raw={"enrolled_id": credential, "device": "x2008"},
            )

    def open_gate(self, branch_code: str, device_id: str) -> bool:
        # X2008 is a fingerprint attendance recorder, not a turnstile
        # controller — confirmed device facts list no actuator/relay. It has
        # nothing for GymFlow to trigger, so this is a real "no", not a
        # placeholder.
        return False

    def health(self) -> dict[str, Any]:
        return {
            "name": self.name,
            "enabled": self.enabled,
            "status": "adms_push_unverified" if self.enabled else "disabled",
            "methods": list(self.supported_methods),
            "biometric_templates_stored": False,
            "protocol_verified_against_device": False,
            "blocked_on": (
                []
                if not self.enabled
                else ["field-level ADMS confirmation against real device traffic"]
            ),
        }


__all__ = [
    "SUPPORTED_METHODS",
    "X2008FingerprintProvider",
    "ParsedFingerprintRecord",
    "ParseResult",
    "parse_adms_attlog",
]


# --------------------------------------------------------------- ADMS parsing
#
# UNVERIFIED against serial CUB7250201499 / its firmware. This implements the
# generic, widely-documented shape of a ZKTeco-family ADMS `table=ATTLOG`
# push: one record per line, tab-separated, starting with the enrolled id and
# the device-reported timestamp. Field order beyond that (a status/check-type
# column, a verify-method column) varies across firmware revisions and is
# treated as optional here rather than relied on. CONFIRM AGAINST REAL DEVICE
# LOGS BEFORE ENABLING IN PRODUCTION — see docs/INTEGRATIONS.md.
#
# Deliberately NOT implemented: the ADMS handshake some firmwares require
# before they start pushing (`GET /iclock/cdata` option negotiation,
# `/iclock/getrequest` command polling, `/iclock/devicecmd` acknowledgement).
# If the X2008's firmware needs that handshake, ATTLOG batches may never
# arrive until it is built and verified against real traffic. This is a real
# gap, not an edge case, and is called out again in docs/INTEGRATIONS.md.


@dataclass(frozen=True)
class ParsedFingerprintRecord:
    enrolled_id: str
    device_time_raw: str
    device_time: datetime | None
    status_raw: str | None
    verify_type_raw: str | None


@dataclass(frozen=True)
class ParseResult:
    records: list[ParsedFingerprintRecord]
    malformed_line_count: int


def _parse_device_time(raw: str) -> datetime | None:
    for fmt in ("%Y-%m-%d %H:%M:%S", "%Y-%m-%dT%H:%M:%S"):
        try:
            return datetime.strptime(raw, fmt)
        except ValueError:
            continue
    return None


def parse_adms_attlog(body: str) -> ParseResult:
    """Parse a `table=ATTLOG` ADMS push body.

    Never raises on a malformed line — one bad line in a batch of dozens must
    not discard the rest. Malformed lines are counted, not silently dropped
    without a trace, so the caller can log/alert on a receiver that is
    consistently failing to parse (the first sign the field-level format
    assumption above is wrong for this firmware).
    """
    records: list[ParsedFingerprintRecord] = []
    malformed = 0
    for line in body.splitlines():
        line = line.strip()
        if not line:
            continue
        fields = line.split("\t")
        if len(fields) < 2:
            # Some gateways normalise to whitespace-separated instead of tabs.
            fields = line.split()
        if len(fields) < 2:
            malformed += 1
            continue
        enrolled_id = fields[0].strip()
        time_raw = fields[1].strip()
        if not enrolled_id or not time_raw:
            malformed += 1
            continue
        records.append(
            ParsedFingerprintRecord(
                enrolled_id=enrolled_id,
                device_time_raw=time_raw,
                device_time=_parse_device_time(time_raw),
                status_raw=fields[2].strip() if len(fields) > 2 else None,
                verify_type_raw=fields[3].strip() if len(fields) > 3 else None,
            )
        )
    return ParseResult(records=records, malformed_line_count=malformed)

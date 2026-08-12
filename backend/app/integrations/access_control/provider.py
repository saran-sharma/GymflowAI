"""Access control — fingerprint, RFID and face terminals.

V1 does not touch hardware. Trainers check in with a rotating branch QR code or
a PIN, both handled entirely inside GymFlow.

Hard rule, enforced by this interface: GymFlow never receives, stores or
transmits a biometric template. A hardware provider matches on its own device
and returns only an identifier plus an allow/deny decision.
"""

from __future__ import annotations

from typing import Any

from app.core.config import settings
from app.integrations.base import AccessDecision, IntegrationDisabled

#: Methods the architecture is built to accept. QR and PIN are live in V1.
ALL_METHODS = ("qr", "pin", "fingerprint", "rfid", "face")
V1_METHODS = ("qr", "pin")


class SoftwareAccessControlProvider:
    """The V1 provider: GymFlow itself validates QR and PIN.

    ``verify`` here returns "not handled by hardware" — the real checks live in
    ``services.attendance_service`` where they can be audited alongside the
    attendance write they authorise.
    """

    name = "software"
    enabled = True
    supported_methods = V1_METHODS

    def verify(self, branch_code: str, method: str, credential: str) -> AccessDecision:
        if method not in self.supported_methods:
            return AccessDecision(
                allowed=False, reason=f"{method} requires hardware not present in V1"
            )
        return AccessDecision(
            allowed=False,
            reason="QR and PIN are verified inside GymFlow, not through this provider",
        )

    def open_gate(self, branch_code: str, device_id: str) -> bool:
        return False

    def health(self) -> dict[str, Any]:
        return {
            "name": self.name,
            "enabled": True,
            "status": "ok",
            "methods": list(self.supported_methods),
            "biometric_templates_stored": False,
        }


class HardwareAccessControlProvider:
    """Placeholder for a turnstile/biometric controller."""

    name = "hardware"
    supported_methods = ALL_METHODS

    def __init__(self) -> None:
        self.enabled = settings.access_control_enabled

    def _unavailable(self) -> IntegrationDisabled:
        raise IntegrationDisabled(
            "Access-control hardware is not integrated. Required first: vendor "
            "and model of the controller, its local/cloud API, and how it "
            "identifies a person to us (never a biometric template)."
        )

    def verify(self, branch_code: str, method: str, credential: str) -> AccessDecision:
        self._unavailable()

    def open_gate(self, branch_code: str, device_id: str) -> bool:
        self._unavailable()

    def health(self) -> dict[str, Any]:
        return {
            "name": self.name,
            "enabled": self.enabled,
            "status": "interface_only",
            "blocked_on": ["controller vendor/model", "device API", "identifier format"],
            "biometric_templates_stored": False,
        }


def build_provider():
    return (
        HardwareAccessControlProvider()
        if settings.access_control_enabled
        else SoftwareAccessControlProvider()
    )


__all__ = [
    "ALL_METHODS",
    "V1_METHODS",
    "HardwareAccessControlProvider",
    "SoftwareAccessControlProvider",
    "build_provider",
]

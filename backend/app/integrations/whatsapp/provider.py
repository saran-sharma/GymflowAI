"""Notification channels.

V1 requires none of these. Notifications are written to the ``notifications``
table by the app; a provider only decides whether anything leaves the building.
The default provider records the message and stops there, which keeps every
alert visible in-app without a vendor account.
"""

from __future__ import annotations

from typing import Any

from app.core.config import settings
from app.integrations.base import DeliveryReceipt, IntegrationDisabled, NotificationMessage


class OutboxNotificationProvider:
    """Default. Accepts the message so it stays queued in GymFlow's outbox."""

    name = "outbox"
    channel = "in_app"
    enabled = True

    def send(self, message: NotificationMessage) -> DeliveryReceipt:
        return DeliveryReceipt(
            accepted=True,
            provider=self.name,
            detail="Stored in the GymFlow outbox; no external delivery in V1.",
        )

    def health(self) -> dict[str, Any]:
        return {"name": self.name, "enabled": True, "channel": self.channel, "status": "ok"}


class WhatsAppProvider:
    """WhatsApp Business API — contract only.

    Future use: owner alerts (trainer late/absent), trainer shift reminders,
    member membership and PT reminders.
    """

    name = "whatsapp"
    channel = "whatsapp"

    def __init__(self) -> None:
        self.enabled = settings.whatsapp_enabled

    def send(self, message: NotificationMessage) -> DeliveryReceipt:
        raise IntegrationDisabled(
            "WhatsApp is not integrated. Required first: a WhatsApp Business "
            "account, phone-number ID, permanent access token and approved "
            "message templates."
        )

    def health(self) -> dict[str, Any]:
        return {
            "name": self.name,
            "enabled": self.enabled,
            "channel": self.channel,
            "status": "interface_only",
            "blocked_on": [
                "WhatsApp Business account",
                "phone number ID",
                "access token",
                "approved templates",
            ],
        }


class ExpoPushProvider:
    """Expo push notifications for the mobile app.

    Off by default; the abstraction exists so turning it on is configuration
    rather than a code change in the alerting path.
    """

    name = "expo_push"
    channel = "push"

    def __init__(self) -> None:
        self.enabled = settings.push_enabled

    def send(self, message: NotificationMessage) -> DeliveryReceipt:
        if not self.enabled:
            raise IntegrationDisabled("Push delivery is disabled (PUSH_ENABLED=false).")
        # Wiring to Expo's push service happens when the app has real device
        # tokens and a project ID; the outbox row already carries everything
        # that call would need.
        raise IntegrationDisabled("Expo push transport is not wired up in V1.")

    def health(self) -> dict[str, Any]:
        return {
            "name": self.name,
            "enabled": self.enabled,
            "channel": self.channel,
            "status": "interface_only",
        }


def build_provider():
    if settings.whatsapp_enabled:
        return WhatsAppProvider()
    if settings.push_enabled:
        return ExpoPushProvider()
    return OutboxNotificationProvider()


__all__ = [
    "ExpoPushProvider",
    "OutboxNotificationProvider",
    "WhatsAppProvider",
    "build_provider",
]

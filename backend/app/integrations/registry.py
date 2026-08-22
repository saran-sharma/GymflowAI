"""One place that decides which provider implementation is live.

Everything else asks the registry, so flipping an integration on is an
environment change rather than an import change scattered across the codebase.
"""

from __future__ import annotations

from functools import lru_cache
from typing import Any

from app.db.session import SessionLocal
from app.integrations.access_control import provider as access_control
from app.integrations.inbody import provider as inbody
from app.integrations.intelligence import provider as intelligence
from app.integrations.whatsapp import provider as notifications
from app.integrations.yoactiv import provider as yoactiv


@lru_cache
def member_provider():
    return yoactiv.build_provider(SessionLocal)


@lru_cache
def trainer_provider():
    # Trainers come from the same system of record as members.
    return yoactiv.build_provider(SessionLocal)


@lru_cache
def attendance_provider():
    return yoactiv.build_provider(SessionLocal)


@lru_cache
def body_composition_provider():
    return inbody.build_provider()


@lru_cache
def access_control_provider():
    return access_control.build_provider(SessionLocal)


@lru_cache
def notification_provider():
    return notifications.build_provider()


@lru_cache
def intelligence_provider():
    return intelligence.build_provider(SessionLocal)


def status() -> list[dict[str, Any]]:
    """Health of every integration, for the admin screen and /health."""
    providers = {
        "member": member_provider(),
        "body_composition": body_composition_provider(),
        "access_control": access_control_provider(),
        "notification": notification_provider(),
        "intelligence": intelligence_provider(),
    }
    out = []
    for slot, provider in providers.items():
        health = provider.health()
        health["slot"] = slot
        out.append(health)
    return out


__all__ = [
    "access_control_provider",
    "attendance_provider",
    "body_composition_provider",
    "intelligence_provider",
    "member_provider",
    "notification_provider",
    "status",
    "trainer_provider",
]

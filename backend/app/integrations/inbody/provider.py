"""InBody body-composition — interface only in V1.

Implementing this needs three facts we do not have: the exact InBody model in
each SLAM branch, which InBody software it reports into (Lookin' Body / Web),
and whether that installation exposes an API or only a scheduled export.
"""

from __future__ import annotations

from datetime import datetime
from typing import Any

from app.core.config import settings
from app.integrations.base import BodyCompositionReading, IntegrationDisabled


class InBodyProvider:
    name = "inbody"

    def __init__(self) -> None:
        self.enabled = settings.inbody_enabled

    def _unavailable(self) -> IntegrationDisabled:
        return IntegrationDisabled(
            "InBody is not integrated. Required first: device model per branch, "
            "the InBody software in use, and its API or export capability."
        )

    def latest_reading(self, person_external_id: str) -> BodyCompositionReading | None:
        raise self._unavailable()

    def readings_since(self, since: datetime) -> list[BodyCompositionReading]:
        raise self._unavailable()

    def health(self) -> dict[str, Any]:
        return {
            "name": self.name,
            "enabled": self.enabled,
            "status": "interface_only",
            "blocked_on": ["device model", "installed software", "API/export capability"],
        }


class NullBodyCompositionProvider:
    """Used while the integration is off. Reports absence rather than faking data."""

    name = "inbody-null"
    enabled = False

    def latest_reading(self, person_external_id: str) -> BodyCompositionReading | None:
        return None

    def readings_since(self, since: datetime) -> list[BodyCompositionReading]:
        return []

    def health(self) -> dict[str, Any]:
        return {"name": self.name, "enabled": False, "status": "disabled"}


def build_provider():
    return InBodyProvider() if settings.inbody_enabled else NullBodyCompositionProvider()


__all__ = ["InBodyProvider", "NullBodyCompositionProvider", "build_provider"]

"""Yoactiv — contract only.

Yoactiv is SLAM's system of record for members, trainers, memberships and
payments. We do **not** have its API documentation, so nothing here invents an
endpoint, a payload shape or an auth scheme, and nothing scrapes the product.

What exists today is the contract GymFlow will consume through, plus a local
provider that reads GymFlow's own database so V1 is not blocked. When the real
documentation arrives, `YoactivClient` below is the only thing that changes.

See ``docs/INTEGRATIONS.md`` for the exact list of information required before
this can be implemented.
"""

from __future__ import annotations

from datetime import datetime
from typing import Any

from app.core.config import settings
from app.integrations.base import (
    ExternalAttendanceEvent,
    ExternalMember,
    ExternalTrainer,
    IntegrationDisabled,
)


class YoactivClient:
    """Placeholder transport.

    Every method raises. This is intentional: a half-guessed client that
    silently returns empty lists would look like "Yoactiv has no members"
    rather than "Yoactiv is not integrated yet".
    """

    name = "yoactiv"

    def __init__(self, base_url: str | None = None, api_key: str | None = None) -> None:
        self.base_url = base_url
        self.api_key = api_key

    def _unavailable(self, what: str) -> IntegrationDisabled:
        return IntegrationDisabled(
            f"Yoactiv {what} is not implemented. GymFlow needs Yoactiv's API "
            "documentation, authentication scheme, endpoint list and rate "
            "limits before this can be built. See docs/INTEGRATIONS.md."
        )

    # -- IMemberProvider ------------------------------------------------
    def list_members(self, branch_code: str | None = None) -> list[ExternalMember]:
        raise self._unavailable("member sync")

    def get_member(self, external_id: str) -> ExternalMember | None:
        raise self._unavailable("member lookup")

    # -- ITrainerProvider -----------------------------------------------
    def list_trainers(self, branch_code: str | None = None) -> list[ExternalTrainer]:
        raise self._unavailable("trainer sync")

    def get_trainer(self, external_id: str) -> ExternalTrainer | None:
        raise self._unavailable("trainer lookup")

    # -- IAttendanceProvider --------------------------------------------
    def pull_events(
        self, since: datetime, branch_code: str | None = None
    ) -> list[ExternalAttendanceEvent]:
        raise self._unavailable("attendance sync")

    def health(self) -> dict[str, Any]:
        return {
            "name": self.name,
            "enabled": False,
            "status": "contract_only",
            "blocked_on": [
                "API documentation",
                "authentication scheme",
                "endpoint list",
                "rate limits",
                "webhook availability",
            ],
        }


class LocalMemberProvider:
    """The V1 provider: GymFlow's own database is the source.

    Keeping this behind the same interface means switching to Yoactiv later is
    a registry change, not a rewrite of the member and trainer endpoints.
    """

    name = "local"
    enabled = True

    def __init__(self, session_factory: Any | None = None) -> None:
        self._session_factory = session_factory

    def _members(self) -> list[ExternalMember]:
        if self._session_factory is None:
            return []
        from sqlalchemy import select

        from app.db.models import Member

        with self._session_factory() as db:
            rows = db.scalars(select(Member)).all()
            return [
                ExternalMember(
                    external_id=row.member_code,
                    full_name=row.user.full_name,
                    email=row.user.email,
                    phone=row.user.phone,
                    branch_code=row.branch.code,
                )
                for row in rows
            ]

    def list_members(self, branch_code: str | None = None) -> list[ExternalMember]:
        members = self._members()
        if branch_code:
            return [m for m in members if m.branch_code == branch_code]
        return members

    def get_member(self, external_id: str) -> ExternalMember | None:
        return next((m for m in self._members() if m.external_id == external_id), None)

    def health(self) -> dict[str, Any]:
        return {"name": self.name, "enabled": True, "status": "ok", "source": "gymflow_db"}


def build_provider(session_factory: Any | None = None):
    if settings.yoactiv_enabled:
        return YoactivClient()
    return LocalMemberProvider(session_factory)


__all__ = ["LocalMemberProvider", "YoactivClient", "build_provider"]

"""Member intelligence.

No V1 feature depends on this. The rule-based provider below reads numbers the
app already computes and states them plainly — it makes no prediction and calls
no model. A future churn/renewal model plugs in behind the same interface.
"""

from __future__ import annotations

from typing import Any

from app.core.config import settings
from app.integrations.base import Insight, IntegrationDisabled


class RuleBasedIntelligenceProvider:
    """Deterministic observations, not predictions.

    Everything it returns is traceable to a stored count, so an owner can
    always ask "where did that come from" and get an answer.
    """

    name = "rules"
    enabled = True

    def __init__(self, session_factory: Any | None = None) -> None:
        self._session_factory = session_factory

    def insights(self, branch_code: str | None = None) -> list[Insight]:
        if self._session_factory is None:
            return []

        from sqlalchemy import func, select

        from app.core.clock import branch_today
        from app.db.models import AttendanceStatus, Branch, TrainerAttendance
        from app.services.incentive_service import month_bounds

        out: list[Insight] = []
        with self._session_factory() as db:
            branches = db.scalars(select(Branch).where(Branch.is_active.is_(True))).all()
            for branch in branches:
                if branch_code and branch.code != branch_code:
                    continue
                start, end = month_bounds(branch_today(branch.timezone))
                counts = dict(
                    db.execute(
                        select(TrainerAttendance.status, func.count())
                        .where(
                            TrainerAttendance.branch_id == branch.id,
                            TrainerAttendance.work_date >= start,
                            TrainerAttendance.work_date <= end,
                        )
                        .group_by(TrainerAttendance.status)
                    ).all()
                )
                late = counts.get(AttendanceStatus.LATE, 0) + counts.get(
                    AttendanceStatus.LATE_AND_EARLY_EXIT, 0
                )
                absent = counts.get(AttendanceStatus.ABSENT, 0)
                total = sum(counts.values())
                if total and late / total >= 0.2:
                    out.append(
                        Insight(
                            key=f"late_rate_{branch.code}",
                            title=f"{branch.name}: late marks above 20%",
                            detail=f"{late} of {total} rostered shifts this month started after the grace window.",
                            severity="warning",
                            confidence=1.0,
                            data={"branch_code": branch.code, "late": late, "total": total},
                        )
                    )
                if absent:
                    out.append(
                        Insight(
                            key=f"absence_{branch.code}",
                            title=f"{branch.name}: {absent} unworked shift(s)",
                            detail="Rostered shifts with no check-in at all this month.",
                            severity="critical" if absent > 2 else "info",
                            confidence=1.0,
                            data={"branch_code": branch.code, "absent": absent},
                        )
                    )
        return out

    def churn_risk(self, member_external_ids: list[str]) -> dict[str, float]:
        # Churn prediction is a later phase. Returning zeros would read as
        # "nobody is at risk", which is a claim this provider cannot make.
        return {}

    def health(self) -> dict[str, Any]:
        return {"name": self.name, "enabled": True, "status": "ok", "mode": "deterministic"}


class ModelIntelligenceProvider:
    name = "model"

    def __init__(self) -> None:
        self.enabled = settings.intelligence_enabled

    def insights(self, branch_code: str | None = None) -> list[Insight]:
        raise IntegrationDisabled("No intelligence model is configured.")

    def churn_risk(self, member_external_ids: list[str]) -> dict[str, float]:
        raise IntegrationDisabled("No intelligence model is configured.")

    def health(self) -> dict[str, Any]:
        return {"name": self.name, "enabled": self.enabled, "status": "interface_only"}


def build_provider(session_factory: Any | None = None):
    if settings.intelligence_enabled:
        return ModelIntelligenceProvider()
    return RuleBasedIntelligenceProvider(session_factory)


__all__ = ["ModelIntelligenceProvider", "RuleBasedIntelligenceProvider", "build_provider"]

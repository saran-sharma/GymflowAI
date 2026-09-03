"""The wire contract for everything the intelligence layer returns.

One insight shape is shared by the member, trainer and owner surfaces so the
mobile app renders them with a single component. The rule the whole layer is
built to keep: every field here is either a number GymFlow computed or a
sentence assembled from those numbers — never a figure a language model was
trusted to produce.
"""

from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field

Severity = Literal["positive", "info", "attention", "critical"]
#: Kept small and closed: the app maps each to an icon and an accent, and an
#: unrecognised type would render blank.
InsightType = Literal[
    "consistency",
    "inactivity",
    "personal_record",
    "trend",
    "plateau",
    "journey",
    "membership",
]

NarrationSource = Literal["deterministic", "llm"]
IntelligenceState = Literal["ok", "insufficient_data"]


class InsightEvidence(BaseModel):
    """One `label: value` line under an insight.

    ``value`` is pre-formatted text (``"62.5 kg"``, ``"11 days"``) because the
    number's unit and precision are part of what the evidence *is*; the app
    renders the string, it does not re-derive it.
    """

    label: str
    value: str


class InsightAction(BaseModel):
    """Where tapping the insight goes. Always an in-app route the current role
    is already allowed to open — never a deep link that would 403."""

    label: str
    route: str | None = None


class IntelligenceInsight(BaseModel):
    id: str
    type: InsightType
    severity: Severity
    title: str
    summary: str
    evidence: list[InsightEvidence] = Field(default_factory=list)
    action: InsightAction | None = None


class IntelligenceCoverage(BaseModel):
    """What the insights were computed from, so the UI can be honest about how
    much history is behind them."""

    completed_sessions: int
    weeks_of_history: int
    analysed_through: datetime


class MemberIntelligence(BaseModel):
    """The payload behind the Member Progress "intelligence" section and,
    unchanged, the trainer's read of the same member."""

    member_id: int
    generated_at: datetime
    state: IntelligenceState
    #: One plain sentence. On ``insufficient_data`` this is the empty-state copy.
    headline: str
    #: Already ordered by priority (critical → attention → positive → info).
    #: The member UI shows the first few; nothing here is hidden from a trainer.
    insights: list[IntelligenceInsight] = Field(default_factory=list)
    #: The single most useful next step, or ``None`` when nothing is actionable.
    next_action: InsightAction | None = None
    narration_source: NarrationSource
    coverage: IntelligenceCoverage


__all__ = [
    "InsightAction",
    "InsightEvidence",
    "IntelligenceCoverage",
    "IntelligenceInsight",
    "IntelligenceState",
    "MemberIntelligence",
    "NarrationSource",
    "Severity",
]

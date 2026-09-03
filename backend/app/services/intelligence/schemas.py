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


class TrainerBrief(BaseModel):
    """A structured read of one member for the trainer who coaches them.

    Reuses the same deterministic signals as ``MemberIntelligence`` — the
    insights list is identical — but framed for a coach: the current state at a
    glance, what is going well, what to watch, and a short list of concrete
    focus points. Carries no owner-only information: no incentive, revenue or
    payment figure appears here.
    """

    member_id: int
    member_name: str
    generated_at: datetime
    state: IntelligenceState
    #: Current-state facts — journey day, last session, cadence, next PT.
    today: list[InsightEvidence] = Field(default_factory=list)
    #: Positive / informational insights.
    progress: list[IntelligenceInsight] = Field(default_factory=list)
    #: Attention / critical insights.
    watch: list[IntelligenceInsight] = Field(default_factory=list)
    #: 1–3 deterministic, plain-language things to work on next session.
    suggested_focus: list[str] = Field(default_factory=list)
    coverage: IntelligenceCoverage


class AttentionItem(BaseModel):
    """One member a trainer should look at, and exactly why.

    ``reason`` is a specific sentence, never a bare score. ``route`` is the
    in-app path to that member's detail so the desk item is a deep link, not a
    dead end.
    """

    member_id: int
    member_name: str
    #: 0 is most urgent. Stable across calls for an unchanged database.
    priority: int
    severity: Severity
    reason: str
    detail: str | None = None
    route: str
    metrics: list[InsightEvidence] = Field(default_factory=list)


class TrainerAttentionQueue(BaseModel):
    generated_at: datetime
    #: How many assigned members were evaluated to produce ``items``.
    considered: int
    items: list[AttentionItem] = Field(default_factory=list)


TrendDirection = Literal["up", "down", "flat"]


class OwnerIssue(BaseModel):
    """One thing on the owner's desk this morning.

    ``direction`` is set only where a comparable prior period exists — a
    month-to-date rate against last month, a branch against the group. It is
    ``None`` for a plain count with nothing honest to compare it to.
    """

    id: str
    severity: Severity
    title: str
    #: The explanation — why this is on the list.
    summary: str
    evidence: list[InsightEvidence] = Field(default_factory=list)
    direction: TrendDirection | None = None
    action: InsightAction | None = None


class OwnerDailyBrief(BaseModel):
    generated_at: datetime
    #: "All branches" or the branch name the brief was scoped to.
    scope: str
    #: One plain sentence. The empty-state copy when there is nothing to flag.
    headline: str
    issues: list[OwnerIssue] = Field(default_factory=list)
    narration_source: NarrationSource


ProgressionAction = Literal["increase", "hold", "reduce", "insufficient_data"]


class ProgressionRecommendation(BaseModel):
    """A next-weight suggestion for one lift.

    It is advice, not a prescription — GymFlow's workout items carry a rep
    target, never a weight, so there is nothing here to overwrite. The member or
    their trainer decides whether to take it. Fields map onto the UI's
    CURRENT / LAST PERFORMANCE / RECOMMENDED NEXT / WHY.
    """

    exercise: str
    action: ProgressionAction
    last_weight_kg: float | None = None
    last_reps: int | None = None
    last_rpe: float | None = None
    recommended_weight_kg: float | None = None
    target_reps: str | None = None
    delta_kg: float | None = None
    rationale: str

    @classmethod
    def from_domain(cls, rec) -> ProgressionRecommendation:
        return cls(
            exercise=rec.exercise,
            action=rec.action.value,
            last_weight_kg=rec.last_weight_kg,
            last_reps=rec.last_reps,
            last_rpe=rec.last_rpe,
            recommended_weight_kg=rec.recommended_weight_kg,
            target_reps=rec.target_reps,
            delta_kg=rec.delta_kg,
            rationale=rec.rationale,
        )


__all__ = [
    "AttentionItem",
    "InsightAction",
    "InsightEvidence",
    "IntelligenceCoverage",
    "IntelligenceInsight",
    "IntelligenceState",
    "MemberIntelligence",
    "NarrationSource",
    "OwnerDailyBrief",
    "OwnerIssue",
    "ProgressionAction",
    "ProgressionRecommendation",
    "Severity",
    "TrainerAttentionQueue",
    "TrainerBrief",
    "TrendDirection",
]

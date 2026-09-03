"""Assemble one member's intelligence from their signals.

:mod:`.signals` produces numbers and classifications; this module decides which
of them are worth showing, writes the sentence for each, attaches the evidence
that backs it and the route that acts on it, and orders the result so the most
important thing is first. The member's Progress screen and the trainer's read of
the same member both render exactly this.

Everything is deterministic except the one headline sentence, which the narrator
may rephrase (see :mod:`.narrator`).
"""

from __future__ import annotations

from datetime import date

from sqlalchemy.orm import Session

from app.core.clock import branch_today, now_utc
from app.db.models import Branch, Member
from app.services.intelligence import signals as sig
from app.services.intelligence.narrator import (
    NarrationRequest,
    TemplateNarrator,
    safe_narrate,
)
from app.services.intelligence.schemas import (
    InsightAction,
    InsightEvidence,
    IntelligenceCoverage,
    IntelligenceInsight,
    MemberIntelligence,
)

#: Routes the member app already exposes. Kept here so an insight can never
#: point somewhere the member cannot open.
_WORKOUT_ROUTE = "/(member)/workout"
_PROGRESS_ROUTE = "/(member)/progress"
_PT_ROUTE = "/(member)/pt"

_SEVERITY_ORDER = {"critical": 0, "attention": 1, "positive": 2, "info": 3}

_EMPTY_STATE_HEADLINE = (
    "Complete a few workouts and GymFlow will start showing your training trends here."
)


def _kg(value: float) -> str:
    return f"{value:g} kg"


def _load(value: float) -> str:
    """A total-volume figure, which runs to five or six digits over a month.

    Shown in tonnes once it passes 10,000 kg — "104 t" is a number a person
    can hold, "104,231 kg" is not — and thousands-separated below that.
    """
    if value >= 10_000:
        return f"{round(value / 1000, 1):g} t"
    return f"{value:,.0f} kg"


def _days(value: int) -> str:
    return "1 day" if value == 1 else f"{value} days"


# --------------------------------------------------------------- per-signal


def _inactivity_insight(s: sig.InactivitySignal) -> IntelligenceInsight | None:
    if s.level not in ("slipping", "inactive") or s.days_since_training is None:
        return None
    severity = "critical" if s.level == "inactive" else "attention"
    evidence = [InsightEvidence(label="Since last session", value=_days(s.days_since_training))]
    if s.last_training_on is not None:
        evidence.append(InsightEvidence(label="Last trained", value=s.last_training_on.isoformat()))
    return IntelligenceInsight(
        id="inactivity",
        type="inactivity",
        severity=severity,
        title=f"No training in {_days(s.days_since_training)}",
        summary=(
            "Your last recorded session was "
            f"{_days(s.days_since_training)} ago. A short session back gets the streak going."
        ),
        evidence=evidence,
        action=InsightAction(label="Start today's workout", route=_WORKOUT_ROUTE),
    )


def _consistency_insight(s: sig.ConsistencySignal) -> IntelligenceInsight | None:
    if s.level == "strong":
        return IntelligenceInsight(
            id="consistency",
            type="consistency",
            severity="positive",
            title="Training is consistent",
            summary=(
                f"{s.sessions_in_window} sessions in the last {s.window_weeks} weeks — "
                f"about {s.per_week:g} a week."
            ),
            evidence=[
                InsightEvidence(
                    label=f"Last {s.window_weeks} weeks", value=f"{s.sessions_in_window} sessions"
                ),
                InsightEvidence(label="Weekly average", value=f"{s.per_week:g}"),
            ],
        )
    if s.level == "low":
        return IntelligenceInsight(
            id="consistency",
            type="consistency",
            severity="attention",
            title="Training has dropped off",
            summary=(
                f"{s.sessions_in_window} sessions in the last {s.window_weeks} weeks, below "
                f"the {s.target_per_week:g}-a-week the programme is built around."
            ),
            evidence=[
                InsightEvidence(
                    label=f"Last {s.window_weeks} weeks", value=f"{s.sessions_in_window} sessions"
                ),
                InsightEvidence(label="Weekly average", value=f"{s.per_week:g}"),
                InsightEvidence(label="Target", value=f"{s.target_per_week:g} / week"),
            ],
            action=InsightAction(label="Plan a session", route=_WORKOUT_ROUTE),
        )
    return None


def _records_insight(s: sig.RecordsSignal) -> IntelligenceInsight | None:
    if s.count == 0:
        return None
    top = s.records[0]
    plural = "record" if s.count == 1 else "records"
    evidence = [
        InsightEvidence(label=top.exercise, value=f"{_kg(top.weight_kg)} × {top.reps}"),
        InsightEvidence(label="Achieved", value=top.achieved_on.isoformat()),
    ]
    if s.count > 1:
        evidence.append(InsightEvidence(label="Also", value=f"{s.count - 1} more this month"))
    return IntelligenceInsight(
        id="personal_record",
        type="personal_record",
        severity="positive",
        title=f"{s.count} personal {plural} this month",
        summary=(
            f"Your heaviest {top.exercise} set — {_kg(top.weight_kg)} for {top.reps} — "
            f"landed in the last {s.window_days} days."
        ),
        evidence=evidence,
        action=InsightAction(label="See progress", route=_PROGRESS_ROUTE),
    )


def _trend_insight(s: sig.TrendSignal) -> IntelligenceInsight | None:
    if s.direction not in ("improving", "declining") or s.volume_change_pct is None:
        return None
    up = s.direction == "improving"
    pct = abs(s.volume_change_pct)
    return IntelligenceInsight(
        id="trend",
        type="trend",
        severity="positive" if up else "attention",
        title="Training volume is up" if up else "Training volume is down",
        summary=(
            f"Total load over the last {s.window_days} days is "
            f"{pct:g}% {'higher' if up else 'lower'} than the {s.window_days} before."
        ),
        evidence=[
            InsightEvidence(
                label="This period",
                value=f"{_load(s.current_volume_kg)} · {s.current_sessions} sessions",
            ),
            InsightEvidence(
                label="Previous",
                value=f"{_load(s.previous_volume_kg)} · {s.previous_sessions} sessions",
            ),
            InsightEvidence(label="Change", value=f"{'+' if up else '−'}{pct:g}%"),
        ],
        action=None if up else InsightAction(label="See progress", route=_PROGRESS_ROUTE),
    )


def _plateau_insight(s: sig.PlateauSignal) -> IntelligenceInsight | None:
    if not s.detected or s.exercise is None:
        return None
    return IntelligenceInsight(
        id="plateau",
        type="plateau",
        # Deliberately "info", not "attention": a plateau is a normal phase, and
        # the right move (a small load bump, or a word with the trainer) is not
        # urgent.
        severity="info",
        title=f"{s.exercise} has been steady",
        summary=s.reason,
        evidence=[
            InsightEvidence(label="Top set", value=_kg(s.top_weight_kg)),
            InsightEvidence(label="Sessions looked at", value=str(s.sessions_considered)),
            InsightEvidence(label="Over", value=_days(s.span_days)),
        ],
        action=InsightAction(label="See progress", route=_PROGRESS_ROUTE),
    )


def _journey_insight(s: sig.JourneySignal) -> IntelligenceInsight | None:
    if s.status is None:
        return None
    if s.status == "completed" and s.pt_converted is False:
        return IntelligenceInsight(
            id="journey",
            type="journey",
            severity="info",
            title="Your programme is complete",
            summary="You finished the 45-day journey. Your trainer plans what comes next.",
            evidence=[
                InsightEvidence(label="Completion", value=f"{s.completion_pct:g}%")
                if s.completion_pct is not None
                else InsightEvidence(label="Status", value="Complete"),
            ],
            action=InsightAction(label="See what comes next", route=_PT_ROUTE),
        )
    if (
        s.status == "active"
        and s.days_remaining is not None
        and s.days_remaining <= sig.T.journey_finishing_soon_days
    ):
        return IntelligenceInsight(
            id="journey",
            type="journey",
            severity="info",
            title=f"Day {s.current_day} of {s.duration_days}",
            summary=f"You are near the end of your journey — {_days(s.days_remaining)} to go.",
            evidence=[
                InsightEvidence(label="Progress", value=f"{s.completion_pct:g}%")
                if s.completion_pct is not None
                else InsightEvidence(label="Day", value=str(s.current_day)),
                InsightEvidence(label="Remaining", value=_days(s.days_remaining)),
            ],
        )
    return None


def _membership_insight(s: sig.MembershipSignal) -> IntelligenceInsight | None:
    if not s.expiring_soon or s.days_remaining is None:
        return None
    return IntelligenceInsight(
        id="membership",
        type="membership",
        severity="attention",
        title="Membership ends soon",
        summary=f"Your membership ends in {_days(s.days_remaining)}. Renew to keep training.",
        evidence=[
            InsightEvidence(label="Ends", value=s.ends_on.isoformat() if s.ends_on else "—"),
            InsightEvidence(label="Days left", value=_days(s.days_remaining)),
        ],
    )


# --------------------------------------------------------------- assembly

_BUILDERS = (
    ("inactivity", _inactivity_insight, "inactivity"),
    ("consistency", _consistency_insight, "consistency"),
    ("personal_record", _records_insight, "records"),
    ("trend", _trend_insight, "trend"),
    ("plateau", _plateau_insight, "plateau"),
    ("journey", _journey_insight, "journey"),
    ("membership", _membership_insight, "membership"),
)


def _order_key(insight: IntelligenceInsight, position: int) -> tuple[int, int]:
    return (_SEVERITY_ORDER.get(insight.severity, 9), position)


def _fallback_headline(insights: list[IntelligenceInsight], s: sig.MemberSignals) -> str:
    if not insights:
        return "You are on track — nothing needs attention this week."
    top = insights[0]
    if top.severity in ("critical", "attention"):
        return f"Worth a look: {top.title.lower()}."
    if top.severity == "positive":
        return f"Going well — {top.title.lower()}."
    return top.title


def build_member_intelligence(
    db: Session,
    member: Member,
    *,
    today: date | None = None,
    narrator=None,
) -> MemberIntelligence:
    narrator = narrator or TemplateNarrator()
    if today is None:
        branch = db.get(Branch, member.branch_id)
        today = branch_today(branch.timezone if branch else None)

    s = sig.member_signals(db, member, today=today)
    coverage = IntelligenceCoverage(
        completed_sessions=s.completed_sessions,
        weeks_of_history=s.weeks_of_history,
        analysed_through=now_utc(),
    )

    if not s.has_minimum_data:
        return MemberIntelligence(
            member_id=member.id,
            generated_at=now_utc(),
            state="insufficient_data",
            headline=_EMPTY_STATE_HEADLINE,
            insights=[],
            next_action=InsightAction(label="Start a workout", route=_WORKOUT_ROUTE),
            narration_source="deterministic",
            coverage=coverage,
        )

    built: list[IntelligenceInsight] = []
    for _id, builder, attr in _BUILDERS:
        insight = builder(getattr(s, attr))
        if insight is not None:
            built.append(insight)

    ordered = [
        insight
        for insight, _ in sorted(
            ((insight, i) for i, insight in enumerate(built)),
            key=lambda pair: _order_key(pair[0], pair[1]),
        )
    ]

    next_action = next((i.action for i in ordered if i.action is not None), None)

    fallback = _fallback_headline(ordered, s)
    narration = safe_narrate(
        narrator,
        NarrationRequest(
            audience="member",
            fallback_headline=fallback,
            context={
                "consistency": s.consistency.level,
                "inactivity": s.inactivity.level,
                "trend": s.trend.direction,
                "recent_prs": s.records.count,
                "plateau": s.plateau.detected,
                "top_insight": ordered[0].title if ordered else None,
            },
        ),
    )

    return MemberIntelligence(
        member_id=member.id,
        generated_at=now_utc(),
        state="ok",
        headline=narration.headline,
        insights=ordered,
        next_action=next_action,
        narration_source=narration.source,
        coverage=coverage,
    )


__all__ = ["build_member_intelligence"]

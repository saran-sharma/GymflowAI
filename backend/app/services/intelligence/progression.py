"""What to lift next — a conservative, explainable suggestion.

This is a *recommendation*, not a prescription. GymFlow's workout items carry a
target rep range, never a target weight, so there is nothing here for this to
overwrite: the output sits beside the trainer's programme, it does not change
it. The member (or their trainer) decides whether to take it.

The rules are intentionally timid:

* No suggestion until there are two logged sessions of the lift.
* Add load only when the last top set met its rep target and did not feel
  maximal (RPE, when recorded, at or below ``progression_rpe_ok``).
* Hold when reps were short or the set felt hard.
* Back off only when reps were badly short, or the set was a true grinder.
* Never suggest a jump larger than ``progression_max_increase_pct`` of the last
  top weight.

No estimated 1RM, no percentages-of-max, no physiological modelling — those
would dress a guess up as a measurement, the same line ``app.domain.records``
holds for personal records. The rule is pure; :func:`recommendation_for`
gathers the one input it needs from what the member logged.
"""

from __future__ import annotations

import enum
from dataclasses import dataclass

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.db.models import WorkoutSession, WorkoutSessionItem, WorkoutSet
from app.services import journey_service
from app.services.intelligence.thresholds import THRESHOLDS as T

#: Substrings that mark a lift as compound lower-body, which tolerates a bigger
#: absolute jump than an isolation or upper-body movement.
_LOWER_BODY_HINTS = (
    "squat",
    "deadlift",
    "leg press",
    "hip thrust",
    "lunge",
    "romanian",
    "rdl",
)


class Action(str, enum.Enum):
    INCREASE = "increase"
    HOLD = "hold"
    REDUCE = "reduce"
    INSUFFICIENT_DATA = "insufficient_data"


@dataclass(frozen=True)
class LastPerformance:
    """The top set of the member's most recent session of this lift."""

    weight_kg: float
    reps: int
    rpe: float | None
    session_count: int


@dataclass(frozen=True)
class ProgressionRecommendation:
    exercise: str
    action: Action
    #: LAST PERFORMANCE — what they actually did.
    last_weight_kg: float | None
    last_reps: int | None
    last_rpe: float | None
    #: RECOMMENDED NEXT — never more than a small step, always explained.
    recommended_weight_kg: float | None
    target_reps: str | None
    delta_kg: float | None
    #: WHY — one plain sentence.
    rationale: str


# --------------------------------------------------------------- the rule


def _step_for(exercise: str) -> float:
    name = exercise.lower()
    if any(hint in name for hint in _LOWER_BODY_HINTS):
        return T.progression_step_lower_kg
    return T.progression_step_kg


def _target_low(target_reps: str | None) -> int | None:
    """The bottom of a rep target like ``"8-10"`` or ``"8"``; ``None`` if it
    cannot be parsed, in which case reps are treated as un-targeted."""
    if not target_reps:
        return None
    head = target_reps.strip().split("-")[0].strip()
    try:
        value = int(head)
    except ValueError:
        return None
    return value if value > 0 else None


def recommend(
    exercise: str,
    *,
    last: LastPerformance | None,
    target_reps: str | None,
) -> ProgressionRecommendation:
    if last is None or last.session_count < T.progression_min_sessions:
        return ProgressionRecommendation(
            exercise=exercise,
            action=Action.INSUFFICIENT_DATA,
            last_weight_kg=last.weight_kg if last else None,
            last_reps=last.reps if last else None,
            last_rpe=last.rpe if last else None,
            recommended_weight_kg=None,
            target_reps=target_reps,
            delta_kg=None,
            rationale="Log one more session of this lift and GymFlow can suggest a next weight.",
        )

    goal = _target_low(target_reps)
    cap = round(last.weight_kg * (1 + T.progression_max_increase_pct / 100), 1)

    # --- back off: reps badly short, or a true grinder -----------------
    badly_short = goal is not None and last.reps <= goal - T.progression_reps_miss_for_backoff
    grinder = last.rpe is not None and last.rpe >= 10
    if last.weight_kg > 0 and (badly_short or grinder):
        recommended = round(last.weight_kg * (1 - T.progression_backoff_pct / 100), 1)
        why = (
            f"Last set was {last.reps} reps"
            + (f" against a {goal}-rep target" if goal is not None else "")
            + (" and felt maximal" if grinder else "")
            + f". Drop to about {recommended:g} kg and rebuild."
        )
        return ProgressionRecommendation(
            exercise=exercise,
            action=Action.REDUCE,
            last_weight_kg=last.weight_kg,
            last_reps=last.reps,
            last_rpe=last.rpe,
            recommended_weight_kg=recommended,
            target_reps=target_reps,
            delta_kg=round(recommended - last.weight_kg, 1),
            rationale=why,
        )

    # --- add load: hit the target and it was not maximal --------------
    hit_target = goal is None or last.reps >= goal
    felt_ok = last.rpe is None or last.rpe <= T.progression_rpe_ok
    if last.weight_kg > 0 and hit_target and felt_ok:
        recommended = min(round(last.weight_kg + _step_for(exercise), 1), cap)
        delta = round(recommended - last.weight_kg, 1)
        if delta <= 0:
            return _hold(
                exercise,
                last,
                target_reps,
                "You are already progressing quickly — hold here for a session.",
            )
        why = (
            f"Last set was {last.reps} reps"
            + (f" against the {goal}-rep target" if goal is not None else "")
            + (f", RPE {last.rpe:g}" if last.rpe is not None else "")
            + f". Try {recommended:g} kg next time."
        )
        return ProgressionRecommendation(
            exercise=exercise,
            action=Action.INCREASE,
            last_weight_kg=last.weight_kg,
            last_reps=last.reps,
            last_rpe=last.rpe,
            recommended_weight_kg=recommended,
            target_reps=target_reps,
            delta_kg=delta,
            rationale=why,
        )

    # --- otherwise hold ---------------------------------------------
    if goal is not None and last.reps < goal:
        reason = (
            f"Last set was {last.reps} reps against a {goal}-rep target. Stay at this "
            f"weight and earn the reps first."
        )
    else:
        reason = (
            f"Last set hit {last.reps} reps"
            + (f" at RPE {last.rpe:g}" if last.rpe is not None else "")
            + ". Hold here until it feels easier, then add load."
        )
    return _hold(exercise, last, target_reps, reason)


def _hold(
    exercise: str, last: LastPerformance, target_reps: str | None, why: str
) -> ProgressionRecommendation:
    return ProgressionRecommendation(
        exercise=exercise,
        action=Action.HOLD,
        last_weight_kg=last.weight_kg,
        last_reps=last.reps,
        last_rpe=last.rpe,
        recommended_weight_kg=last.weight_kg,
        target_reps=target_reps,
        delta_kg=0.0,
        rationale=why,
    )


# --------------------------------------------------------------- gathering


def _session_count(db: Session, member_id: int, exercise: str) -> int:
    return int(
        db.scalar(
            select(func.count(func.distinct(WorkoutSession.id)))
            .select_from(WorkoutSet)
            .join(WorkoutSessionItem, WorkoutSet.session_item_id == WorkoutSessionItem.id)
            .join(WorkoutSession, WorkoutSessionItem.session_id == WorkoutSession.id)
            .where(
                WorkoutSession.member_id == member_id,
                WorkoutSessionItem.exercise == exercise,
            )
        )
        or 0
    )


def _latest_target_reps(db: Session, member_id: int, exercise: str) -> str | None:
    return db.scalar(
        select(WorkoutSessionItem.reps)
        .join(WorkoutSession, WorkoutSessionItem.session_id == WorkoutSession.id)
        .where(
            WorkoutSession.member_id == member_id,
            WorkoutSessionItem.exercise == exercise,
        )
        .order_by(WorkoutSession.session_date.desc(), WorkoutSession.id.desc())
    )


def recommendation_for(
    db: Session,
    *,
    member_id: int,
    exercise: str,
    target_reps: str | None = None,
    before_session_id: int | None = None,
) -> ProgressionRecommendation:
    """The next-weight suggestion for one lift.

    ``before_session_id`` excludes the session being worked in, so the
    suggestion is based on the *previous* session rather than the one being
    filled in now.
    """
    history = journey_service.exercise_history(
        db,
        member_id=member_id,
        exercise=exercise,
        before_session_id=before_session_id,
        limit=1,
    )
    goal = target_reps or _latest_target_reps(db, member_id, exercise)

    if not history.sessions or not history.sessions[0].sets:
        return recommend(exercise, last=None, target_reps=goal)

    latest = history.sessions[0]
    top = max(latest.sets, key=lambda s: (s.weight_kg, s.reps))
    last = LastPerformance(
        weight_kg=float(top.weight_kg),
        reps=int(top.reps),
        rpe=float(top.rpe) if top.rpe is not None else None,
        session_count=_session_count(db, member_id, exercise),
    )
    return recommend(exercise, last=last, target_reps=goal)


__all__ = [
    "Action",
    "LastPerformance",
    "ProgressionRecommendation",
    "recommend",
    "recommendation_for",
]

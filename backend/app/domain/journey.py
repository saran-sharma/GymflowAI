"""The shape of SLAM's General Training journey.

Pure functions only — no database, no clock. The rules live here so the
day-number arithmetic that decides "assessment or PPL?", "which split today?"
and "is this the last day?" is testable in isolation and identical everywhere
it is asked.

The programme:

    Day 1 – 3    assessment + cardio
    Day 4 – 45   the PPL rotation (push, pull, legs, repeating)
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date

from app.db.models import WorkoutSplit

DEFAULT_DURATION_DAYS = 45
DEFAULT_ASSESSMENT_DAYS = 3
DEFAULT_CARDIO_SESSIONS = 3
DEFAULT_SPLIT_PATTERN: tuple[WorkoutSplit, ...] = (
    WorkoutSplit.PUSH,
    WorkoutSplit.PULL,
    WorkoutSplit.LEGS,
)


@dataclass(frozen=True)
class JourneyPlanRules:
    duration_days: int = DEFAULT_DURATION_DAYS
    assessment_days: int = DEFAULT_ASSESSMENT_DAYS
    cardio_sessions_required: int = DEFAULT_CARDIO_SESSIONS
    split_pattern: tuple[WorkoutSplit, ...] = DEFAULT_SPLIT_PATTERN


def parse_split_pattern(raw: list | tuple | None) -> tuple[WorkoutSplit, ...]:
    """Turn a configured ``["push", "pull", "legs"]`` into enum members.

    An unrecognised entry is dropped rather than raising: a typo in a settings
    row should not take the member's workout screen down with it.
    """
    if not raw:
        return DEFAULT_SPLIT_PATTERN
    out: list[WorkoutSplit] = []
    for item in raw:
        try:
            out.append(WorkoutSplit(str(item).strip().lower()))
        except ValueError:
            continue
    return tuple(out) or DEFAULT_SPLIT_PATTERN


def day_number_for(start_date: date, on: date) -> int:
    """Which day of the journey ``on`` is.

    Day 1 is the start date itself. The result is *not* clamped — a caller
    asking about a date before the start gets 0 or a negative number, which is
    exactly the signal it needs to say "not started yet".
    """
    return (on - start_date).days + 1


def split_for_day(day_number: int, rules: JourneyPlanRules = JourneyPlanRules()) -> WorkoutSplit:
    """What the member trains on a given day.

    Days inside the assessment window are cardio days (the assessment itself
    is a separate record, not a workout). Everything after rotates the split,
    anchored so the first training day is the first entry of the pattern.
    """
    if day_number <= 0:
        return WorkoutSplit.REST
    if day_number <= rules.assessment_days:
        return WorkoutSplit.CARDIO
    offset = day_number - rules.assessment_days - 1
    return rules.split_pattern[offset % len(rules.split_pattern)]


def is_final_day(day_number: int, rules: JourneyPlanRules = JourneyPlanRules()) -> bool:
    return day_number >= rules.duration_days


def phase_for_day(day_number: int, rules: JourneyPlanRules = JourneyPlanRules()) -> str:
    """A label the app can show without re-deriving the boundaries."""
    if day_number <= 0:
        return "not_started"
    if day_number <= rules.assessment_days:
        return "assessment"
    if day_number <= rules.duration_days:
        return "training"
    return "complete"


def plan_days(
    start_date: date, rules: JourneyPlanRules = JourneyPlanRules()
) -> list[tuple[int, date, WorkoutSplit]]:
    """The whole programme, one tuple per day."""
    from datetime import timedelta

    return [
        (n, start_date + timedelta(days=n - 1), split_for_day(n, rules))
        for n in range(1, rules.duration_days + 1)
    ]


__all__ = [
    "DEFAULT_ASSESSMENT_DAYS",
    "DEFAULT_CARDIO_SESSIONS",
    "DEFAULT_DURATION_DAYS",
    "DEFAULT_SPLIT_PATTERN",
    "JourneyPlanRules",
    "day_number_for",
    "is_final_day",
    "parse_split_pattern",
    "phase_for_day",
    "plan_days",
    "split_for_day",
]

"""What counts as a personal record.

The rules live here, away from the query that feeds them, because they are the
part worth arguing about: every kind below requires something to have been
beaten. A member's first set of a lift sets no record, and neither does the
first set at a new weight — calling either a PR would be congratulating them on
having no history, which is exactly the fabrication this layer exists to avoid.

Deliberately absent: estimated 1RM. Every e1RM formula is a model fitted to
someone else's lifters, and presenting its output beside a weight the member
actually lifted would present an estimate as a measurement.
"""

from __future__ import annotations

import enum
from collections.abc import Iterable
from dataclasses import dataclass


class RecordKind(str, enum.Enum):
    #: Heavier than any set of this exercise the member has ever logged.
    HEAVIEST_WEIGHT = "heaviest_weight"
    #: More reps than they have ever managed at exactly this weight.
    BEST_REPS_AT_WEIGHT = "best_reps_at_weight"
    #: More kilograms moved on this lift in one session than ever before.
    SESSION_VOLUME = "session_volume"


@dataclass(frozen=True)
class Performed:
    """One performed set, reduced to the two numbers a record is judged on."""

    weight_kg: float
    reps: int


@dataclass
class PersonalRecord:
    kind: RecordKind
    weight_kg: float
    reps: int
    volume_kg: float | None = None
    previous_weight_kg: float | None = None
    previous_reps: int | None = None
    previous_volume_kg: float | None = None


def volume_of(sets: Iterable[Performed]) -> float:
    """Kilograms moved.

    Bodyweight sets contribute nothing measurable, which is the honest answer:
    the load is real but GymFlow does not know the member's body weight, and
    substituting a guess would put an invented number into a total.
    """
    return round(sum(entry.weight_kg * entry.reps for entry in sets), 1)


def records_for(
    logged: Performed,
    *,
    earlier: list[Performed],
    session_so_far: list[Performed],
    past_session_volumes: list[float],
) -> list[PersonalRecord]:
    """Everything ``logged`` beat.

    ``earlier`` is every set of this exercise the member logged before this one,
    in any session. ``session_so_far`` is the ones from today, which count
    towards today's volume but are also part of ``earlier`` for the weight and
    rep comparisons — a heavier second set today is still a heaviest ever.
    """
    found: list[PersonalRecord] = []

    # Bodyweight movements are excluded from the weight record: a "record" of
    # 0 kg says nothing, and every first bodyweight set would trip it.
    if logged.weight_kg > 0 and earlier:
        best = max(earlier, key=lambda entry: entry.weight_kg)
        if logged.weight_kg > best.weight_kg:
            found.append(
                PersonalRecord(
                    kind=RecordKind.HEAVIEST_WEIGHT,
                    weight_kg=logged.weight_kg,
                    reps=logged.reps,
                    previous_weight_kg=best.weight_kg,
                    previous_reps=best.reps,
                )
            )

    # Most reps at this exact weight, once the member has worked there before.
    # By construction this cannot fire alongside a heaviest-weight record.
    at_weight = [entry.reps for entry in earlier if entry.weight_kg == logged.weight_kg]
    if at_weight and logged.reps > max(at_weight):
        found.append(
            PersonalRecord(
                kind=RecordKind.BEST_REPS_AT_WEIGHT,
                weight_kg=logged.weight_kg,
                reps=logged.reps,
                previous_weight_kg=logged.weight_kg,
                previous_reps=max(at_weight),
            )
        )

    # Most moved on this lift in one session. Needs a previous session that
    # moved something, or the first session with any load would "beat" zero.
    measurable = [volume for volume in past_session_volumes if volume > 0]
    if measurable:
        today = volume_of([*session_so_far, logged])
        if today > max(measurable):
            found.append(
                PersonalRecord(
                    kind=RecordKind.SESSION_VOLUME,
                    weight_kg=logged.weight_kg,
                    reps=logged.reps,
                    volume_kg=today,
                    previous_volume_kg=max(measurable),
                )
            )

    return found

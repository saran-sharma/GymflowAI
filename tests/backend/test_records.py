"""What counts as a personal record.

These are pure rules, so they run without a database. The thing they exist to
pin is the negative case: a member with no history sets no records. Every kind
here requires something to have been beaten, and a layer that congratulated
someone on their first ever set would be fabricating the achievement it claims
to have detected.
"""

from __future__ import annotations

import pytest

from app.domain.records import Performed, RecordKind, records_for, volume_of


def performed(weight: float, reps: int) -> Performed:
    return Performed(weight_kg=weight, reps=reps)


def kinds(found) -> list[RecordKind]:
    return [record.kind for record in found]


def detect(logged, *, earlier=(), session_so_far=(), past_volumes=()):
    return records_for(
        logged,
        earlier=list(earlier),
        session_so_far=list(session_so_far),
        past_session_volumes=list(past_volumes),
    )


# ------------------------------------------------------------------ volume


def test_volume_is_kilograms_moved():
    assert volume_of([performed(60, 8), performed(50, 10)]) == 980


def test_bodyweight_sets_add_no_measurable_volume():
    """The load is real, but GymFlow does not know the member's body weight and
    a guess would put an invented number into a total."""
    assert volume_of([performed(0, 20)]) == 0


def test_volume_keeps_a_half_plate_honest():
    assert volume_of([performed(62.5, 8)]) == 500


# ------------------------------------------------- nothing beaten, no record


def test_a_first_ever_set_sets_no_record():
    """The whole point. Congratulating a member on having no history is the
    fabrication this layer exists to avoid."""
    assert detect(performed(60, 8)) == []


def test_a_first_set_at_a_new_weight_is_not_a_reps_record():
    # Heavier than anything before, so it is a weight record — but "best reps
    # at 65" cannot be claimed on the only set ever done at 65.
    found = detect(performed(65, 5), earlier=[performed(60, 8)])
    assert kinds(found) == [RecordKind.HEAVIEST_WEIGHT]


def test_matching_a_previous_best_is_not_beating_it():
    assert detect(performed(60, 8), earlier=[performed(60, 8)]) == []


def test_a_lighter_easier_set_sets_nothing():
    assert detect(performed(50, 6), earlier=[performed(60, 8)]) == []


# ------------------------------------------------------------- heaviest


def test_a_heavier_set_than_any_before_is_a_record():
    found = detect(performed(65, 5), earlier=[performed(60, 8), performed(62.5, 6)])
    assert kinds(found) == [RecordKind.HEAVIEST_WEIGHT]
    assert found[0].weight_kg == 65
    assert found[0].reps == 5
    # It names what it beat, so the app never has to ask a second time.
    assert found[0].previous_weight_kg == 62.5
    assert found[0].previous_reps == 6


def test_a_heavier_set_later_in_the_same_session_still_counts():
    """Today's earlier sets are history the moment the next one is logged."""
    found = detect(
        performed(70, 3),
        earlier=[performed(60, 8), performed(65, 5)],
        session_so_far=[performed(60, 8), performed(65, 5)],
    )
    assert RecordKind.HEAVIEST_WEIGHT in kinds(found)


def test_bodyweight_never_sets_a_weight_record():
    """A record of 0 kg says nothing, and every first pull-up would trip it."""
    found = detect(performed(0, 25), earlier=[performed(0, 10)])
    assert RecordKind.HEAVIEST_WEIGHT not in kinds(found)
    # The reps at that weight are still a real improvement.
    assert RecordKind.BEST_REPS_AT_WEIGHT in kinds(found)


# --------------------------------------------------------- reps at a weight


def test_more_reps_at_a_weight_worked_before_is_a_record():
    found = detect(performed(60, 10), earlier=[performed(60, 8), performed(65, 4)])
    assert kinds(found) == [RecordKind.BEST_REPS_AT_WEIGHT]
    assert found[0].previous_reps == 8
    assert found[0].previous_weight_kg == 60


def test_reps_are_compared_only_at_the_same_weight():
    # 12 reps at 50 does not make 9 reps at 60 unremarkable.
    found = detect(performed(60, 9), earlier=[performed(60, 8), performed(50, 12)])
    assert kinds(found) == [RecordKind.BEST_REPS_AT_WEIGHT]


def test_a_weight_record_and_a_reps_record_cannot_both_fire():
    """By construction: a new heaviest has no earlier sets at that weight."""
    found = detect(performed(80, 12), earlier=[performed(60, 8)])
    assert kinds(found) == [RecordKind.HEAVIEST_WEIGHT]


# ------------------------------------------------------------ session volume


def test_moving_more_in_a_session_than_ever_before_is_a_record():
    found = detect(
        performed(60, 8),
        earlier=[performed(60, 8)],
        session_so_far=[performed(60, 8)],
        past_volumes=[480],
    )
    assert RecordKind.SESSION_VOLUME in kinds(found)
    volume = next(r for r in found if r.kind is RecordKind.SESSION_VOLUME)
    assert volume.volume_kg == 960
    assert volume.previous_volume_kg == 480


def test_a_first_session_never_beats_a_volume_it_has_no_comparison_for():
    found = detect(performed(60, 8), earlier=[], session_so_far=[], past_volumes=[])
    assert RecordKind.SESSION_VOLUME not in kinds(found)


def test_a_previous_session_of_only_bodyweight_is_not_a_volume_to_beat():
    """Its volume is 0, and beating zero is not an achievement."""
    found = detect(
        performed(60, 8),
        earlier=[performed(0, 20)],
        session_so_far=[],
        past_volumes=[0],
    )
    assert RecordKind.SESSION_VOLUME not in kinds(found)


def test_equalling_the_best_session_volume_is_not_beating_it():
    found = detect(
        performed(60, 8), earlier=[performed(60, 8)], session_so_far=[], past_volumes=[480]
    )
    assert RecordKind.SESSION_VOLUME not in kinds(found)


def test_one_set_can_earn_two_records_at_once():
    """A heaviest-ever that also tips the session over its best volume."""
    found = detect(
        performed(70, 8),
        earlier=[performed(60, 8)],
        session_so_far=[performed(60, 8)],
        past_volumes=[480],
    )
    assert set(kinds(found)) == {RecordKind.HEAVIEST_WEIGHT, RecordKind.SESSION_VOLUME}


@pytest.mark.parametrize("kind", list(RecordKind))
def test_every_kind_has_a_stable_wire_value(kind):
    """These strings reach the app, so they are API surface."""
    assert kind.value in {"heaviest_weight", "best_reps_at_weight", "session_volume"}

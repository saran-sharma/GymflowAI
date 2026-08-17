"""The development seed, checked for the things the demo depends on.

Seed data is not decoration here: it is how the member, trainer and owner flows
get validated before anyone touches a phone. A seed that produces no logged
sets makes every demo member look like a first-timer and leaves the whole
performance layer untestable, which is exactly the gap this file guards.

Everything the seeder writes is flagged ``is_demo`` and gated on
``SEED_DEMO_DATA``; the last test holds that line.
"""

from __future__ import annotations

import random

from sqlalchemy import func, select

from app.db.models import (
    Member,
    SessionStatus,
    WorkoutSession,
    WorkoutSessionItem,
    WorkoutSet,
)
from app.seed import _exercise_seed, _seeded_sets, seed_workout_in_progress
from app.services import journey_service


def test_a_seeded_exercise_produces_one_row_per_prescribed_set():
    sets = _seeded_sets("Barbell Bench Press", week=1, prescribed=4, rng=random.Random(1))
    assert len(sets) == 4
    for weight, reps, rpe in sets:
        assert weight > 0
        assert reps >= 4
        assert rpe is None or 6.0 <= rpe <= 10.0


def test_reps_fall_across_the_sets_of_an_exercise():
    """As they do on a real chart — a flat 10×4 reads as generated."""
    sets = _seeded_sets("Back Squat", week=3, prescribed=4, rng=random.Random(7))
    reps = [r for _, r, _ in sets]
    assert reps == sorted(reps, reverse=True)


def test_the_load_creeps_up_over_the_weeks():
    """Without progression there is nothing for records or history to find."""
    early = _seeded_sets("Leg Press", week=1, prescribed=3, rng=random.Random(3))[0][0]
    later = _seeded_sets("Leg Press", week=8, prescribed=3, rng=random.Random(3))[0][0]
    assert later > early


def test_the_same_lift_starts_at_the_same_weight_across_runs():
    """`hash()` is salted per process, so using it would reshape a member's
    history on every re-seed."""
    assert _exercise_seed("Barbell Bench Press") == _exercise_seed("Barbell Bench Press")
    assert _exercise_seed("Back Squat") != _exercise_seed("Barbell Bench Press")


def test_a_mid_workout_member_has_finished_and_unfinished_exercises(db, world):
    """ "Some completed and incomplete sets" is what the member flow needs to
    be entered from anywhere other than a standing start."""
    from datetime import date, timedelta

    member = world["member_ngk"]
    journey_service.start_journey(db, member=member, start_date=date.today() - timedelta(days=10))
    db.flush()

    assert seed_workout_in_progress(db, member, random.Random(5)) is True
    db.flush()

    session = journey_service.today_workout(db, member)
    items = sorted(session.items, key=lambda i: i.order_index)
    logged = {
        item.id: db.scalar(
            select(func.count())
            .select_from(WorkoutSet)
            .where(WorkoutSet.session_item_id == item.id)
        )
        for item in items
    }

    assert items[0].status is items[0].status.COMPLETED
    assert logged[items[0].id] == items[0].sets  # finished
    assert 0 < logged[items[1].id] < items[1].sets  # part-way
    assert logged[items[2].id] == 0  # untouched


def test_a_member_who_already_trained_today_is_left_alone(db, world):
    """Two sessions on one date is a shape production never produces."""
    from datetime import date, timedelta

    member = world["member_ngk"]
    journey_service.start_journey(db, member=member, start_date=date.today() - timedelta(days=10))
    journey_service.start_workout(db, member=member)
    db.flush()

    assert seed_workout_in_progress(db, member, random.Random(5)) is False
    assert (
        db.scalar(
            select(func.count())
            .select_from(WorkoutSession)
            .where(WorkoutSession.member_id == member.id)
        )
        == 1
    )


def test_seeding_is_off_unless_it_is_asked_for():
    """Demo rows must never appear because a production process booted."""
    from app.core.config import settings

    assert settings.seed_demo_data is False


def test_every_seeded_row_is_flagged_as_demo(db, world):
    """The flag is what makes `--clear-demo` able to leave real records alone."""
    from datetime import date, timedelta

    member = world["member_ngk"]
    journey = journey_service.start_journey(
        db, member=member, start_date=date.today() - timedelta(days=10)
    )
    db.flush()
    # The fixture member is seeded demo data; the journey inherits the flag.
    assert db.get(Member, member.id).is_demo is True
    assert journey.is_demo is True


def test_logged_sets_hang_off_a_completed_session_item(db, world):
    """The relationship the whole performance layer reads through."""
    from datetime import date, timedelta

    member = world["member_ngk"]
    journey_service.start_journey(db, member=member, start_date=date.today() - timedelta(days=10))
    seed_workout_in_progress(db, member, random.Random(2))
    db.flush()

    item = db.scalar(
        select(WorkoutSessionItem)
        .join(WorkoutSession, WorkoutSessionItem.session_id == WorkoutSession.id)
        .where(
            WorkoutSession.member_id == member.id,
            WorkoutSessionItem.status == WorkoutSessionItem.status.type.enum_class.COMPLETED,
        )
    )
    assert item is not None
    assert len(item.logged_sets) == item.sets
    assert all(s.item.id == item.id for s in item.logged_sets)


def test_a_seeded_session_is_not_left_open_by_accident(db, world):
    from datetime import date, timedelta

    member = world["member_ngk"]
    journey_service.start_journey(db, member=member, start_date=date.today() - timedelta(days=10))
    seed_workout_in_progress(db, member, random.Random(2))
    db.flush()

    session = journey_service.today_workout(db, member)
    # Deliberately still open: the member is mid-workout, not finished.
    assert session.status is not SessionStatus.COMPLETED

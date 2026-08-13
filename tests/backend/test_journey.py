"""The 45-day journey: day arithmetic, the assessment phase and Day-45 automation.

The day boundaries are the whole product here — Day 3 is the last cardio day,
Day 4 is the first PPL day, Day 45 completes and Day 46 must not un-complete —
so each one is asserted explicitly rather than sampled.
"""

from __future__ import annotations

from datetime import date, timedelta

import pytest
from conftest import make_member
from sqlalchemy import select

from app.db.models import (
    Alert,
    AssessmentStatus,
    DayStatus,
    JourneyStatus,
    PTPackage,
    SessionStatus,
    Task,
    WorkoutSplit,
)
from app.domain import journey as journey_domain
from app.services import journey_service, pt_service

# ------------------------------------------------------------ pure domain


@pytest.mark.parametrize(
    ("day", "expected"),
    [
        (0, WorkoutSplit.REST),  # before the journey starts
        (1, WorkoutSplit.CARDIO),
        (2, WorkoutSplit.CARDIO),
        (3, WorkoutSplit.CARDIO),  # last assessment-phase day
        (4, WorkoutSplit.PUSH),  # first training day
        (5, WorkoutSplit.PULL),
        (6, WorkoutSplit.LEGS),
        (7, WorkoutSplit.PUSH),  # rotation wraps
        (44, WorkoutSplit.PULL),
        (45, WorkoutSplit.LEGS),
    ],
)
def test_split_for_day_follows_the_slam_programme(day, expected):
    assert journey_domain.split_for_day(day) is expected


@pytest.mark.parametrize(
    ("day", "phase"),
    [
        (0, "not_started"),
        (1, "assessment"),
        (3, "assessment"),
        (4, "training"),
        (45, "training"),
        (46, "complete"),
    ],
)
def test_phase_boundaries(day, phase):
    assert journey_domain.phase_for_day(day) == phase


def test_day_number_counts_the_start_date_as_day_one():
    start = date(2026, 8, 1)
    assert journey_domain.day_number_for(start, start) == 1
    assert journey_domain.day_number_for(start, start + timedelta(days=44)) == 45
    # A date before the start is not clamped; callers need the signal.
    assert journey_domain.day_number_for(start, start - timedelta(days=1)) == 0


def test_plan_days_covers_the_whole_programme_once():
    days = journey_domain.plan_days(date(2026, 8, 1))
    assert len(days) == 45
    assert [n for n, _d, _s in days] == list(range(1, 46))
    assert days[0][2] is WorkoutSplit.CARDIO
    assert days[-1][2] is WorkoutSplit.LEGS


def test_a_typo_in_the_configured_split_pattern_falls_back_rather_than_crashing():
    assert journey_domain.parse_split_pattern(["push", "not-a-split", "legs"]) == (
        WorkoutSplit.PUSH,
        WorkoutSplit.LEGS,
    )
    assert journey_domain.parse_split_pattern([]) == journey_domain.DEFAULT_SPLIT_PATTERN


# ------------------------------------------------------------- the service


def _start(db, member, days_ago: int):
    """A journey whose current day is ``days_ago + 1``."""
    return journey_service.start_journey(
        db, member=member, start_date=date.today() - timedelta(days=days_ago)
    )


def test_starting_a_journey_materialises_45_days_and_a_plan(db, world):
    member = world["member_ngk"]
    journey = _start(db, member, 0)

    assert journey.duration_days == 45
    assert len(journey.days) == 45
    assert journey.end_date == journey.start_date + timedelta(days=44)

    plan = journey_service.plan_for(db, journey)
    assert journey_service.plan_items(db, plan, WorkoutSplit.PUSH), "PPL chart should be copied in"


def test_a_member_cannot_run_two_journeys_at_once(db, world):
    member = world["member_ngk"]
    _start(db, member, 0)
    with pytest.raises(journey_service.JourneyError):
        _start(db, member, 0)


def test_day_zero_reports_not_started(db, world):
    member = world["member_ngk"]
    journey = journey_service.start_journey(
        db, member=member, start_date=date.today() + timedelta(days=1)
    )
    progress = journey_service.progress(db, journey)
    assert progress.current_day == 0
    assert progress.phase == "not_started"


def test_cardio_is_confined_to_the_assessment_window(db, world):
    member = world["member_ngk"]
    journey = _start(db, member, 2)  # day 3

    journey_service.record_cardio(db, journey=journey, day_number=3, duration_minutes=20)
    # Day 4 is a training day; cardio does not belong to it.
    with pytest.raises(journey_service.JourneyError):
        journey_service.record_cardio(db, journey=journey, day_number=4, duration_minutes=20)


def test_cardio_cannot_be_recorded_twice_for_one_day(db, world):
    journey = _start(db, world["member_ngk"], 1)
    journey_service.record_cardio(db, journey=journey, day_number=2, duration_minutes=20)
    with pytest.raises(journey_service.JourneyError):
        journey_service.record_cardio(db, journey=journey, day_number=2, duration_minutes=25)


def test_assessment_completion_updates_the_journey_and_day_one(db, world):
    journey = _start(db, world["member_ngk"], 0)
    journey_service.record_assessment(db, journey=journey, trainer_id=None, goal="Fat loss")

    assert journey.assessment_status is AssessmentStatus.COMPLETED
    day_one = next(d for d in journey.days if d.day_number == 1)
    assert day_one.status is DayStatus.COMPLETED


def test_completing_a_workout_ticks_off_its_journey_day(db, world):
    journey = _start(db, world["member_ngk"], 5)  # day 6
    session = journey_service.start_workout(db, member=world["member_ngk"])
    assert session.day_number == 6
    assert session.split is WorkoutSplit.LEGS

    journey_service.complete_workout(db, session)
    day_six = next(d for d in journey.days if d.day_number == 6)
    assert day_six.status is DayStatus.COMPLETED


def test_starting_a_workout_twice_in_a_day_reuses_the_open_session(db, world):
    _start(db, world["member_ngk"], 5)
    first = journey_service.start_workout(db, member=world["member_ngk"])
    second = journey_service.start_workout(db, member=world["member_ngk"])
    assert first.id == second.id


# ------------------------------------------------------- day-45 automation


def test_day_44_does_not_complete_the_journey(db, world):
    journey = _start(db, world["member_ngk"], 43)  # day 44
    journey_service.settle_journey(db, journey)
    assert journey.status is JourneyStatus.ACTIVE
    assert journey.completed_on is None


def test_day_45_completes_the_journey_with_no_manual_trigger(db, world):
    member = world["member_ngk"]
    journey = _start(db, member, 44)  # day 45
    assert journey_service.progress(db, journey).current_day == 45

    journey_service.settle_journey(db, journey)

    assert journey.status is JourneyStatus.COMPLETED
    assert journey.completed_on is not None
    summary = journey.completion_summary
    assert summary is not None
    assert summary["duration_days"] == 45
    assert "workouts_completed" in summary
    # No body composition is invented — that belongs to InBody.
    assert "body_fat_pct" not in summary


def test_day_45_raises_the_owner_alert_the_member_alert_and_the_follow_up_task(db, world):
    member = world["member_ngk"]
    journey = _start(db, member, 44)
    journey_service.settle_journey(db, journey)

    keys = {a.key for a in db.scalars(select(Alert)).all()}
    assert "journey.day45_complete" in keys, "the owner needs to know"
    assert "journey.pt_ready" in keys, "the member needs to know"

    task = db.scalar(select(Task).where(Task.key == "pt_follow_up"))
    assert task is not None
    assert task.member_id == member.id
    assert task.status == "open"


def test_settling_is_idempotent(db, world):
    journey = _start(db, world["member_ngk"], 44)
    journey_service.settle_journey(db, journey)
    first_completed_on = journey.completed_on

    journey_service.settle_journey(db, journey)
    journey_service.settle_journey(db, journey)

    assert journey.completed_on == first_completed_on
    assert len(list(db.scalars(select(Task).where(Task.key == "pt_follow_up")).all())) == 1
    day45_alerts = [a for a in db.scalars(select(Alert)).all() if a.key == "journey.day45_complete"]
    assert len(day45_alerts) == 1


def test_day_46_stays_completed_and_reports_day_45(db, world):
    journey = _start(db, world["member_ngk"], 45)  # day 46
    journey_service.settle_journey(db, journey)

    progress = journey_service.progress(db, journey)
    assert journey.status is JourneyStatus.COMPLETED
    # Clamped: a member past the end is still shown as having finished Day 45.
    assert progress.current_day == 45
    assert progress.phase == "complete"


def test_finishing_the_last_workout_completes_the_journey_in_the_same_request(db, world):
    member = world["member_ngk"]
    _start(db, member, 44)  # day 45
    session = journey_service.start_workout(db, member=member)
    journey_service.complete_workout(db, session)

    journey = journey_service.latest_journey(db, member.id)
    assert journey.status is JourneyStatus.COMPLETED


def test_a_completed_journey_appears_as_a_pt_opportunity_until_it_converts(db, world):
    member = world["member_ngk"]
    journey = _start(db, member, 44)
    journey_service.settle_journey(db, journey)

    ready = journey_service.pt_ready_members(db, [member.branch_id])
    assert [j.id for j in ready] == [journey.id]

    pt_service.create_package(
        db, member=member, sessions_total=12, journey_id=journey.id, origin="journey_conversion"
    )
    assert journey_service.pt_ready_members(db, [member.branch_id]) == []
    assert db.scalar(select(PTPackage).where(PTPackage.journey_id == journey.id)) is not None


def test_settle_all_sweeps_only_the_journeys_that_are_due(db, world):
    roles = world["roles"]
    finished, _ = make_member(db, roles, world["branches"]["ngk"], "Finished Member")
    mid, _ = make_member(db, roles, world["branches"]["ngk"], "Mid Member")
    _start(db, finished, 44)
    _start(db, mid, 10)
    db.flush()

    assert journey_service.settle_all(db, world["branches"]["ngk"].id) == 1


def test_streak_counts_consecutive_completed_own_workouts(db, world):
    member = world["member_ngk"]
    _start(db, member, 20)
    today = date.today()

    for offset in (2, 1, 0):
        session = journey_service.start_workout(
            db, member=member, on=today - timedelta(days=offset)
        )
        journey_service.complete_workout(db, session)
        assert session.status is SessionStatus.COMPLETED

    assert journey_service.streak(db, member, on=today) == 3

"""One canonical rule for "what is today's workout".

The physical-device bug was a *client* that re-derived "today" from
`start_date + current_day` with timezone-unsafe math and highlighted the
wrong day on the week strip while the Today's-Workout card (straight from the
server) showed the right one. These tests pin the server side of that
contract so a regression is caught here first:

  progress().split_today
    == the JourneyDay row for current_day
    == what start_workout(on=today) actually opens

and that "today" is the member's *branch* date, never the machine's.

They also cover the custom-program rotation, which is now calendar-anchored
(a pure function of the date) rather than a WorkoutSession count.
"""

from __future__ import annotations

from datetime import date, datetime, timedelta
from zoneinfo import ZoneInfo

import pytest

from app.core import clock
from app.db.models import DayStatus, JourneyDay, WorkoutSplit
from app.services import journey_service, workout_template_service

IST = ZoneInfo("Asia/Kolkata")

# A Monday, so day 1 = Mon. Assessment is days 1-3 (cardio); PPL starts day 4.
#   day 4  = Thu  -> PUSH      day 7  = Sun -> PUSH
#   day 5  = Fri  -> PULL      day 8  = Mon -> PULL
#   day 6  = Sat  -> LEGS      day 9  = Tue -> LEGS
JOURNEY_START = date(2026, 8, 3)  # Monday


def _member_on_journey(db, world):
    member = world["member_ngk"]  # branch timezone is Asia/Kolkata
    journey = journey_service.start_journey(db, member=member, start_date=JOURNEY_START)
    db.commit()
    return member, journey


def _freeze_ist(d: date, hour: int = 9):
    """Freeze the clock at `hour:00` India time on calendar date `d`."""
    clock.freeze(datetime(d.year, d.month, d.day, hour, 0, tzinfo=IST))


@pytest.fixture(autouse=True)
def _thaw():
    yield
    clock.freeze(None)


# --------------------------------------------- weekday -> split, one source


@pytest.mark.parametrize(
    ("on", "weekday", "expected_split"),
    [
        (date(2026, 8, 9), "Sunday", WorkoutSplit.PUSH),  # day 7
        (date(2026, 8, 10), "Monday", WorkoutSplit.PULL),  # day 8
        (date(2026, 8, 11), "Tuesday", WorkoutSplit.LEGS),  # day 9
    ],
)
def test_split_today_matches_the_day_row_and_what_start_opens(
    db, world, on, weekday, expected_split
):
    member, journey = _member_on_journey(db, world)
    _freeze_ist(on)

    prog = journey_service.progress(db, journey)
    day_row = db.scalar(
        db.query(JourneyDay)
        .filter(JourneyDay.journey_id == journey.id, JourneyDay.day_number == prog.current_day)
        .statement
    )
    session = journey_service.start_workout(db, member=member)
    db.commit()

    assert prog.split_today == expected_split, weekday
    assert day_row.planned_on == on
    assert day_row.split == expected_split
    assert session.split == expected_split  # the strip and the card cannot disagree


def test_rest_phase_is_cardio_not_a_ppl_split(db, world):
    _, journey = _member_on_journey(db, world)
    _freeze_ist(date(2026, 8, 4))  # day 2 — still the assessment/cardio phase
    prog = journey_service.progress(db, journey)
    assert prog.current_day == 2
    assert prog.split_today == WorkoutSplit.CARDIO


def test_next_scheduled_day_is_exactly_one_calendar_day_on(db, world):
    _, journey = _member_on_journey(db, world)
    _freeze_ist(date(2026, 8, 10))  # Monday, day 8, PULL

    prog = journey_service.progress(db, journey)
    today_row = db.scalar(
        db.query(JourneyDay)
        .filter(JourneyDay.journey_id == journey.id, JourneyDay.day_number == prog.current_day)
        .statement
    )
    next_row = db.scalar(
        db.query(JourneyDay)
        .filter(JourneyDay.journey_id == journey.id, JourneyDay.day_number == prog.current_day + 1)
        .statement
    )
    assert next_row.planned_on == today_row.planned_on + timedelta(days=1)
    assert (today_row.split, next_row.split) == (WorkoutSplit.PULL, WorkoutSplit.LEGS)


def test_completing_todays_workout_does_not_move_today(db, world):
    member, journey = _member_on_journey(db, world)
    _freeze_ist(date(2026, 8, 10))  # Monday, day 8, PULL

    before = journey_service.progress(db, journey)
    session = journey_service.start_workout(db, member=member)
    db.commit()
    journey_service.complete_workout(db, session)
    db.commit()

    after = journey_service.progress(db, journey)
    assert (after.current_day, after.split_today) == (before.current_day, before.split_today)
    # the day itself is marked done, but "today" is still day 8
    done_row = db.scalar(
        db.query(JourneyDay)
        .filter(JourneyDay.journey_id == journey.id, JourneyDay.day_number == 8)
        .statement
    )
    assert done_row.status == DayStatus.COMPLETED


# ------------------------------------------------- "today" follows the branch


def test_today_is_the_branch_date_not_the_machine_date(db, world):
    """22:00 UTC on the 9th is already 03:30 on the 10th in Asia/Kolkata."""
    _, journey = _member_on_journey(db, world)
    clock.freeze(datetime(2026, 8, 9, 22, 0, tzinfo=ZoneInfo("UTC")))

    prog = journey_service.progress(db, journey)
    # Machine/UTC date is the 9th (day 7, PUSH); the branch is the 10th.
    assert journey_service.current_day(db, journey) == 8
    assert prog.split_today == WorkoutSplit.PULL

    session = journey_service.start_workout(db, member=world["member_ngk"])
    db.commit()
    assert session.session_date == date(2026, 8, 10)
    assert session.split == WorkoutSplit.PULL


def test_week_boundary_saturday_to_sunday(db, world):
    _, journey = _member_on_journey(db, world)

    _freeze_ist(date(2026, 8, 8))  # Saturday, day 6
    assert journey_service.progress(db, journey).split_today == WorkoutSplit.LEGS

    _freeze_ist(date(2026, 8, 9))  # Sunday, day 7 — new ISO week, split rotates on
    assert journey_service.progress(db, journey).split_today == WorkoutSplit.PUSH


# --------------------------------------- custom program: a calendar rotation


def _apply_ppl_program(db, member):
    workout_template_service.ensure_default_templates(db)
    db.flush()
    from sqlalchemy import select

    from app.db.models import WorkoutTemplate

    template = db.scalar(select(WorkoutTemplate).where(WorkoutTemplate.key == "ppl_6day"))
    program = workout_template_service.apply_template(
        db, member=member, template=template, created_by_user_id=None
    )
    db.commit()
    return program


def test_program_day_is_a_pure_function_of_the_date(db, world):
    member = world["member_ngk"]
    program = _apply_ppl_program(db, member)
    anchor = workout_template_service.program_anchor_date(program)
    n = len(program.days)

    # Same date -> same day, every time (the old rule drifted per session).
    d0 = workout_template_service.resolve_program_day_for_date(program, anchor)
    d0_again = workout_template_service.resolve_program_day_for_date(program, anchor)
    assert d0.id == d0_again.id == program.days[0].id

    # Consecutive calendar days step through the trainer's order and wrap.
    seen = [
        workout_template_service.resolve_program_day_for_date(
            program, anchor + timedelta(days=i)
        ).id
        for i in range(n + 2)
    ]
    assert seen[:n] == [d.id for d in program.days]
    assert seen[n] == program.days[0].id
    assert seen[n + 1] == program.days[1].id


def test_start_workout_anchors_the_rotation_in_the_branch_timezone(db, world):
    """Regression: the rotation anchor is ``program.created_at`` read in the
    *branch* timezone, not UTC.

    Created at 20:00 UTC, the programme's IST calendar date is the next day.
    Reading the anchor as the UTC date put it one day behind the branch-local
    ``on`` the rotation steps against, landing "start workout" on day 2 on the
    very day the programme was set up.
    """
    member = world["member_ngk"]
    program = _apply_ppl_program(db, member)
    program.created_at = datetime(2026, 6, 3, 20, 0, tzinfo=ZoneInfo("UTC"))  # 2026-06-04 01:30 IST
    db.commit()

    # "Today" in IST is the same calendar day the programme was created.
    _freeze_ist(date(2026, 6, 4))
    started = journey_service.start_workout(db, member=member)
    db.commit()
    assert started.member_program_day_id == program.days[0].id

    preview = workout_template_service.resolve_today_program_day(
        program,
        on=clock.branch_today(member.branch.timezone),
        tz_name=member.branch.timezone,
    )
    assert preview.id == program.days[0].id

    # And the day after still steps to day 2, not day 3.
    _freeze_ist(date(2026, 6, 5))
    tomorrow = journey_service.start_workout(db, member=member)
    db.commit()
    assert tomorrow.member_program_day_id == program.days[1].id


def test_program_preview_and_start_agree_on_and_across_days(db, world):
    member = world["member_ngk"]
    journey_service.start_journey(db, member=member, start_date=JOURNEY_START)
    program = _apply_ppl_program(db, member)
    anchor = workout_template_service.program_anchor_date(program)

    _freeze_ist(anchor)
    preview_today = workout_template_service.resolve_today_program_day(
        program, on=clock.branch_today(member.branch.timezone)
    )
    started = journey_service.start_workout(db, member=member)
    db.commit()
    assert preview_today.id == started.member_program_day_id == program.days[0].id

    _freeze_ist(anchor + timedelta(days=1))
    tomorrow = journey_service.start_workout(db, member=member)
    db.commit()
    assert tomorrow.member_program_day_id == program.days[1].id

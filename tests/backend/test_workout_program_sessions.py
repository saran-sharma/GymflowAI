"""A personalized program superseding the journey's own PPL rotation.

The 45-day journey and its `WorkoutPlan`/`WorkoutSplit` machinery are
untouched (`test_journey.py`, `test_workout_sets.py` cover that). This file
covers the one new decision `start_workout` makes: once a member has an
active `MemberWorkoutProgram`, today's own-workout is built from that
program's days instead — even if the member is still, separately, on a
45-day journey.
"""

from __future__ import annotations

from datetime import date, timedelta

from app.db.models import JourneyDay, SessionStatus
from app.services import (
    activity_service,
    journey_service,
    schedule_service,
    workout_template_service,
)

BASE = "/api/v1/journeys"


def _apply_ppl(db, member, user=None):
    workout_template_service.ensure_default_templates(db)
    db.flush()
    from sqlalchemy import select

    from app.db.models import WorkoutTemplate

    template = db.scalar(select(WorkoutTemplate).where(WorkoutTemplate.key == "ppl_6day"))
    return workout_template_service.apply_template(
        db, member=member, template=template, created_by_user_id=user.id if user else None
    )


def test_start_workout_uses_the_program_over_the_journey_split(db, world):
    member = world["member_ngk"]
    journey_service.start_journey(db, member=member, start_date=date.today() - timedelta(days=10))
    program = _apply_ppl(db, member)
    db.commit()

    session = journey_service.start_workout(db, member=member)
    db.commit()

    assert session.split is None
    assert session.journey_id is None
    assert session.member_program_day_id == program.days[0].id
    assert len(session.items) == len(program.days[0].exercises)
    assert {i.exercise for i in session.items} == {e.exercise for e in program.days[0].exercises}


def test_start_workout_rotates_through_program_days_in_order(db, world):
    member = world["member_ngk"]
    program = _apply_ppl(db, member)
    db.commit()
    day_ids = [d.id for d in program.days]

    seen = []
    for offset in range(len(day_ids) + 2):  # go one full lap past wraparound
        on = date.today() - timedelta(days=30) + timedelta(days=offset)
        session = journey_service.start_workout(db, member=member, on=on)
        db.commit()
        seen.append(session.member_program_day_id)

    assert seen[: len(day_ids)] == day_ids
    assert seen[len(day_ids)] == day_ids[0]  # wraps back to the first day
    assert seen[len(day_ids) + 1] == day_ids[1]


def test_program_today_preview_matches_what_start_workout_will_actually_use(
    client, world, auth, db
):
    member = world["member_ngk"]
    program = _apply_ppl(db, member)
    db.commit()
    headers = auth(world["member_ngk_user"])

    preview = client.get(f"/api/v1/members/{member.id}/program/today", headers=headers)
    assert preview.status_code == 200, preview.text
    assert preview.json()["id"] == program.days[0].id

    start = client.post("/api/v1/journeys/me/workout/start", json={}, headers=headers)
    assert start.status_code == 200, start.text
    assert start.json()["program_day_id"] == program.days[0].id
    assert start.json()["program_day_name"] == program.days[0].name
    assert start.json()["split"] is None
    assert start.json()["split_label"] is None

    # The next preview (a new day, since today's session already exists)
    # points at the second day — proving the preview and the real creation
    # share one source of truth.
    next_preview = client.get(f"/api/v1/members/{member.id}/program/today", headers=headers)
    assert next_preview.status_code == 200
    assert next_preview.json()["id"] == program.days[1].id


def test_completing_a_program_based_session_does_not_touch_the_journey(db, world):
    member = world["member_ngk"]
    journey = journey_service.start_journey(
        db, member=member, start_date=date.today() - timedelta(days=10)
    )
    _apply_ppl(db, member)
    db.commit()

    session = journey_service.start_workout(db, member=member)
    db.commit()
    journey_service.complete_workout(db, session)
    db.commit()

    # None of the journey's own materialised days moved, because this
    # session was never linked to the journey at all.
    still_pending = (
        db.query(JourneyDay)
        .filter(JourneyDay.journey_id == journey.id, JourneyDay.status == "pending")
        .count()
    )
    assert still_pending > 0


def test_logging_sets_still_works_for_a_program_based_session(client, world, auth, db):
    member = world["member_ngk"]
    _apply_ppl(db, member)
    db.commit()
    headers = auth(world["member_ngk_user"])

    session = journey_service.start_workout(db, member=member)
    db.commit()
    item = sorted(session.items, key=lambda i: i.order_index)[0]

    response = client.post(
        f"/api/v1/journeys/workouts/{session.id}/items/{item.id}/sets",
        json={"set_number": 1, "weight_kg": 60, "reps": 8},
        headers=headers,
    )
    assert response.status_code == 201, response.text
    assert response.json()["set"]["weight_kg"] == 60


def test_activity_timeline_labels_a_program_based_workout_without_crashing(db, world):
    """`workout.split.value` used to be called unconditionally here — a
    completed program-based session (split is None) would raise, not just
    render wrong. This pins the fix rather than only the happy path."""
    member = world["member_ngk"]
    program = _apply_ppl(db, member)
    db.commit()

    session = journey_service.start_workout(db, member=member)
    session.status = SessionStatus.COMPLETED
    db.commit()

    entries = activity_service.timeline(db, member)
    own_workout = next(e for e in entries if e.kind == "own_workout")
    assert own_workout.detail == program.days[0].name


def test_trainer_schedule_labels_supervised_program_workout_without_crashing(db, world):
    member = world["member_ngk"]
    trainer = world["trainer_ngk"]
    program = _apply_ppl(db, member)
    db.commit()

    session = journey_service.start_workout(db, member=member, supervising_trainer_id=trainer.id)
    db.commit()

    items = schedule_service.trainer_day(db, trainer.id, session.session_date)
    own_workout_support = next(i for i in items if i.kind == "own_workout_support")
    assert program.days[0].name in own_workout_support.subtitle


def test_my_exercise_history_endpoint_works_for_a_program_based_lift(client, world, auth, db):
    """The Progress screen's detailed-exercise view: history by exercise
    name, with no open session to exclude (unlike the item-scoped endpoint
    used mid-workout)."""
    member = world["member_ngk"]
    _apply_ppl(db, member)
    db.commit()
    headers = auth(world["member_ngk_user"])

    session = journey_service.start_workout(db, member=member)
    db.commit()
    item = sorted(session.items, key=lambda i: i.order_index)[0]
    journey_service.log_set(db, item=item, set_number=1, weight_kg=70, reps=8)
    db.commit()

    response = client.get(f"/api/v1/journeys/me/exercises/{item.exercise}/history", headers=headers)
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["exercise"] == item.exercise
    assert len(body["sessions"]) == 1
    assert body["sessions"][0]["sets"][0]["weight_kg"] == 70


def test_a_member_with_no_active_program_keeps_the_old_split_behavior(db, world):
    """Backward compatibility: nobody's existing journey workout changes."""
    member = world["member_ngk"]
    journey_service.start_journey(db, member=member, start_date=date.today() - timedelta(days=10))
    db.commit()

    session = journey_service.start_workout(db, member=member)
    db.commit()

    assert session.split is not None
    assert session.member_program_day_id is None
    assert session.journey_id is not None

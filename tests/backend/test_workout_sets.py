"""Per-set workout logging.

This table is the only place actual weight, actual reps and RPE exist, so
everything downstream — previous-session performance, personal records, volume
— is only as trustworthy as what these tests pin. Three things get asserted
explicitly rather than sampled: that a set survives a round trip unchanged,
that a set nobody could have performed is refused at the edge, and that one
member can never reach another member's workout.
"""

from __future__ import annotations

from datetime import date, timedelta

import pytest
from conftest import make_member
from sqlalchemy import select

from app.db.models import (
    SessionStatus,
    WorkoutSession,
    WorkoutSessionItem,
    WorkoutSet,
    WorkoutSplit,
)
from app.services import journey_service

BASE = "/api/v1/journeys"


# ------------------------------------------------------------------ setup


@pytest.fixture
def workout(db, world):
    """A started workout for the Nagalkeni member, with its exercises."""
    journey_service.start_journey(
        db, member=world["member_ngk"], start_date=date.today() - timedelta(days=5)
    )
    session = journey_service.start_workout(db, member=world["member_ngk"])
    db.commit()
    return session


def sets_url(session, item) -> str:
    return f"{BASE}/workouts/{session.id}/items/{item.id}/sets"


def first_item(session):
    return sorted(session.items, key=lambda i: i.order_index)[0]


# -------------------------------------------------------------------- CRUD


def test_a_member_logs_a_set_and_reads_it_back_unchanged(client, world, auth, workout):
    """The round trip is the whole feature: what was lifted is what comes back."""
    headers = auth(world["member_ngk_user"])
    item = first_item(workout)

    created = client.post(
        sets_url(workout, item),
        json={"set_number": 1, "weight_kg": 60.0, "reps": 8, "rpe": 7.5},
        headers=headers,
    )
    assert created.status_code == 201, created.text
    body = created.json()
    assert body["set_number"] == 1
    assert body["weight_kg"] == 60.0
    assert body["reps"] == 8
    assert body["rpe"] == 7.5
    assert body["session_item_id"] == item.id
    # Logged means performed, so the time is filled in rather than left null.
    assert body["completed_at"] is not None

    listed = client.get(sets_url(workout, item), headers=headers)
    assert listed.status_code == 200
    assert listed.json() == [body]


def test_sets_come_back_in_set_order_not_insertion_order(client, world, auth, workout):
    headers = auth(world["member_ngk_user"])
    item = first_item(workout)
    for number in (3, 1, 2):
        client.post(
            sets_url(workout, item),
            json={"set_number": number, "weight_kg": 40, "reps": 10},
            headers=headers,
        )

    listed = client.get(sets_url(workout, item), headers=headers).json()
    assert [s["set_number"] for s in listed] == [1, 2, 3]


def test_a_correction_touches_only_the_fields_it_sends(client, world, auth, workout):
    """A member fixing the weight must not silently lose the RPE they recorded."""
    headers = auth(world["member_ngk_user"])
    item = first_item(workout)
    created = client.post(
        sets_url(workout, item),
        json={"set_number": 1, "weight_kg": 60, "reps": 8, "rpe": 8},
        headers=headers,
    ).json()

    updated = client.patch(
        f"{sets_url(workout, item)}/{created['id']}",
        json={"weight_kg": 62.5},
        headers=headers,
    )
    assert updated.status_code == 200, updated.text
    assert updated.json()["weight_kg"] == 62.5
    assert updated.json()["reps"] == 8
    assert updated.json()["rpe"] == 8.0


def test_a_mistyped_set_can_be_deleted(client, db, world, auth, workout):
    headers = auth(world["member_ngk_user"])
    item = first_item(workout)
    created = client.post(
        sets_url(workout, item),
        json={"set_number": 1, "weight_kg": 600, "reps": 8},
        headers=headers,
    ).json()

    removed = client.delete(f"{sets_url(workout, item)}/{created['id']}", headers=headers)
    assert removed.status_code == 200, removed.text

    assert client.get(sets_url(workout, item), headers=headers).json() == []
    assert db.get(WorkoutSet, created["id"]) is None


def test_a_trainer_at_the_same_branch_can_correct_a_members_set(client, world, auth, workout):
    """Trainers coach on the floor; the correction is theirs to make."""
    item = first_item(workout)
    created = client.post(
        sets_url(workout, item),
        json={"set_number": 1, "weight_kg": 60, "reps": 8},
        headers=auth(world["member_ngk_user"]),
    ).json()

    updated = client.patch(
        f"{sets_url(workout, item)}/{created['id']}",
        json={"reps": 6},
        headers=auth(world["trainer_ngk_user"]),
    )
    assert updated.status_code == 200, updated.text
    assert updated.json()["reps"] == 6


# -------------------------------------------------------------- validation


@pytest.mark.parametrize(
    ("payload", "why"),
    [
        ({"set_number": 0, "weight_kg": 60, "reps": 8}, "sets are 1-based"),
        (
            {"set_number": 51, "weight_kg": 60, "reps": 8},
            "fifty sets of one exercise is a typo",
        ),
        ({"set_number": 1, "weight_kg": -1, "reps": 8}, "negative load is not a thing"),
        ({"set_number": 1, "weight_kg": 1001, "reps": 8}, "past every record ever set"),
        (
            {"set_number": 1, "weight_kg": 60, "reps": 0},
            "a set with no reps was not performed",
        ),
        (
            {"set_number": 1, "weight_kg": 60, "reps": 501},
            "reps in the hundreds is a typo",
        ),
        ({"set_number": 1, "weight_kg": 60, "reps": 8, "rpe": 0.5}, "RPE starts at 1"),
        ({"set_number": 1, "weight_kg": 60, "reps": 8, "rpe": 11}, "RPE stops at 10"),
        (
            {"set_number": 1, "weight_kg": 60, "reps": 8, "rpe": 7.3},
            "RPE moves in half points",
        ),
    ],
)
def test_a_set_nobody_could_have_performed_is_refused(client, world, auth, workout, payload, why):
    response = client.post(
        sets_url(workout, first_item(workout)),
        json=payload,
        headers=auth(world["member_ngk_user"]),
    )
    assert response.status_code == 422, why


def test_bodyweight_records_zero_load_rather_than_being_refused(client, world, auth, workout):
    """Zero is a real answer for a pull-up; only negatives are impossible."""
    response = client.post(
        sets_url(workout, first_item(workout)),
        json={"set_number": 1, "weight_kg": 0, "reps": 12},
        headers=auth(world["member_ngk_user"]),
    )
    assert response.status_code == 201, response.text
    assert response.json()["weight_kg"] == 0.0


def test_the_same_set_number_cannot_be_logged_twice(client, world, auth, workout):
    """ "Set 2" has to identify one row, or the history is unreadable."""
    headers = auth(world["member_ngk_user"])
    item = first_item(workout)
    body = {"set_number": 1, "weight_kg": 60, "reps": 8}
    assert client.post(sets_url(workout, item), json=body, headers=headers).status_code == 201

    clash = client.post(sets_url(workout, item), json=body, headers=headers)
    assert clash.status_code == 409
    assert clash.json()["detail"]["code"] == "set_number_taken"


def test_renumbering_onto_an_occupied_number_is_refused(client, world, auth, workout):
    headers = auth(world["member_ngk_user"])
    item = first_item(workout)
    for number in (1, 2):
        client.post(
            sets_url(workout, item),
            json={"set_number": number, "weight_kg": 60, "reps": 8},
            headers=headers,
        )
    second = client.get(sets_url(workout, item), headers=headers).json()[1]

    clash = client.patch(
        f"{sets_url(workout, item)}/{second['id']}",
        json={"set_number": 1},
        headers=headers,
    )
    assert clash.status_code == 409
    assert clash.json()["detail"]["code"] == "set_number_taken"


def test_renumbering_a_set_to_the_number_it_already_has_is_allowed(client, world, auth, workout):
    """The uniqueness check must not collide with the row it is checking."""
    headers = auth(world["member_ngk_user"])
    item = first_item(workout)
    created = client.post(
        sets_url(workout, item),
        json={"set_number": 1, "weight_kg": 60, "reps": 8},
        headers=headers,
    ).json()

    same = client.patch(
        f"{sets_url(workout, item)}/{created['id']}",
        json={"set_number": 1, "reps": 9},
        headers=headers,
    )
    assert same.status_code == 200, same.text
    assert same.json()["reps"] == 9


def test_a_finished_workout_stops_accepting_sets(client, db, world, auth, workout):
    """Otherwise today's session quietly absorbs tomorrow's work."""
    headers = auth(world["member_ngk_user"])
    item = first_item(workout)
    logged = client.post(
        sets_url(workout, item),
        json={"set_number": 1, "weight_kg": 60, "reps": 8},
        headers=headers,
    ).json()

    journey_service.complete_workout(db, workout)
    db.commit()
    assert workout.status is SessionStatus.COMPLETED

    late = client.post(
        sets_url(workout, item),
        json={"set_number": 2, "weight_kg": 60, "reps": 8},
        headers=headers,
    )
    assert late.status_code == 409

    # The record stays readable — completion closes writing, not reading.
    listed = client.get(sets_url(workout, item), headers=headers)
    assert listed.status_code == 200
    assert [s["id"] for s in listed.json()] == [logged["id"]]


# ----------------------------------------------------------- authorization


def test_logging_a_set_requires_authentication(client, workout):
    response = client.post(
        sets_url(workout, first_item(workout)),
        json={"set_number": 1, "weight_kg": 60, "reps": 8},
    )
    assert response.status_code == 401


def test_reading_sets_requires_authentication(client, workout):
    assert client.get(sets_url(workout, first_item(workout))).status_code == 401


def test_a_member_cannot_read_another_members_sets(client, db, world, auth, workout):
    other_member, other_user = make_member(
        db, world["roles"], world["branches"]["ngk"], "Nikhil Suresh"
    )
    db.commit()

    response = client.get(sets_url(workout, first_item(workout)), headers=auth(other_user))
    assert response.status_code == 403


def test_a_member_cannot_log_a_set_into_another_members_workout(client, db, world, auth, workout):
    """The one that matters: another member's training history is not writable."""
    _, other_user = make_member(db, world["roles"], world["branches"]["ngk"], "Nikhil Suresh")
    db.commit()

    response = client.post(
        sets_url(workout, first_item(workout)),
        json={"set_number": 1, "weight_kg": 60, "reps": 8},
        headers=auth(other_user),
    )
    assert response.status_code == 403


def test_a_trainer_at_another_branch_is_refused(client, world, auth, workout):
    response = client.get(
        sets_url(workout, first_item(workout)), headers=auth(world["trainer_bgh_user"])
    )
    assert response.status_code == 403


def test_a_member_cannot_delete_another_members_set(client, db, world, auth, workout):
    item = first_item(workout)
    created = client.post(
        sets_url(workout, item),
        json={"set_number": 1, "weight_kg": 60, "reps": 8},
        headers=auth(world["member_ngk_user"]),
    ).json()
    _, other_user = make_member(db, world["roles"], world["branches"]["ngk"], "Nikhil Suresh")
    db.commit()

    response = client.delete(f"{sets_url(workout, item)}/{created['id']}", headers=auth(other_user))
    assert response.status_code == 403
    assert db.get(WorkoutSet, created["id"]) is not None


# ---------------------------------------------------------- relationships


def test_an_exercise_from_a_different_workout_is_not_reachable(client, db, world, auth, workout):
    """A session id the caller owns must not launder an item id they do not."""
    other_member, _ = make_member(db, world["roles"], world["branches"]["ngk"], "Nikhil Suresh")
    journey_service.start_journey(
        db, member=other_member, start_date=date.today() - timedelta(days=5)
    )
    other_session = journey_service.start_workout(db, member=other_member)
    db.commit()
    foreign_item = first_item(other_session)

    response = client.post(
        f"{BASE}/workouts/{workout.id}/items/{foreign_item.id}/sets",
        json={"set_number": 1, "weight_kg": 60, "reps": 8},
        headers=auth(world["member_ngk_user"]),
    )
    assert response.status_code == 404
    assert response.json()["detail"]["code"] == "item_not_found"


def test_a_set_from_a_different_exercise_is_not_reachable(client, world, auth, workout):
    headers = auth(world["member_ngk_user"])
    items = sorted(workout.items, key=lambda i: i.order_index)
    created = client.post(
        sets_url(workout, items[0]),
        json={"set_number": 1, "weight_kg": 60, "reps": 8},
        headers=headers,
    ).json()

    response = client.patch(
        f"{sets_url(workout, items[1])}/{created['id']}",
        json={"reps": 6},
        headers=headers,
    )
    assert response.status_code == 404
    assert response.json()["detail"]["code"] == "set_not_found"


def test_sets_reach_their_exercise_through_the_relationship(db, world, workout):
    item = first_item(workout)
    prescribed = item.sets
    journey_service.log_set(db, item=item, set_number=1, weight_kg=60, reps=8, rpe=7)
    journey_service.log_set(db, item=item, set_number=2, weight_kg=62.5, reps=6)
    db.commit()

    db.refresh(item)
    assert [s.set_number for s in item.logged_sets] == [1, 2]
    assert item.logged_sets[0].item.id == item.id
    # The prescription and the performance are separate numbers, and stay so:
    # logging two sets does not move the plan's count, whatever the plan asked for.
    assert item.sets == prescribed
    assert len(item.logged_sets) == 2


def test_deleting_an_exercise_takes_its_sets_with_it(db, world, workout):
    """The sets describe that exercise and mean nothing without it."""
    item = first_item(workout)
    journey_service.log_set(db, item=item, set_number=1, weight_kg=60, reps=8)
    db.commit()

    db.delete(item)
    db.commit()
    assert db.scalars(select(WorkoutSet).where(WorkoutSet.session_item_id == item.id)).all() == []


# --------------------------------------------------- previous performance


def _past_session(db, member, *, days_ago: int, exercise: str, sets: list[tuple[float, int]]):
    """A completed workout on an earlier date, with sets logged against one lift.

    Built directly rather than through ``start_workout``, which deliberately
    reuses today's open session and so cannot produce a session in the past.
    """
    session = WorkoutSession(
        member_id=member.id,
        branch_id=member.branch_id,
        split=WorkoutSplit.PUSH,
        session_date=date.today() - timedelta(days=days_ago),
        status=SessionStatus.COMPLETED,
    )
    db.add(session)
    db.flush()
    item = WorkoutSessionItem(
        session_id=session.id, order_index=0, exercise=exercise, sets=3, reps="10"
    )
    db.add(item)
    db.flush()
    for number, (weight, reps) in enumerate(sets, start=1):
        journey_service.log_set(db, item=item, set_number=number, weight_kg=weight, reps=reps)
    return session


def previous_url(session, item) -> str:
    return f"{BASE}/workouts/{session.id}/items/{item.id}/previous"


def test_no_history_reads_as_null_not_as_an_empty_list(client, world, auth, workout):
    """ "You have not done this before" and "we could not load it" must differ."""
    response = client.get(
        previous_url(workout, first_item(workout)), headers=auth(world["member_ngk_user"])
    )
    assert response.status_code == 200
    assert response.json() is None


def test_previous_performance_returns_the_last_session_that_logged_sets(
    client, db, world, auth, workout
):
    item = first_item(workout)
    _past_session(
        db, world["member_ngk"], days_ago=3, exercise=item.exercise, sets=[(60, 8), (60, 6)]
    )
    db.commit()

    body = client.get(previous_url(workout, item), headers=auth(world["member_ngk_user"])).json()
    assert body is not None
    assert body["exercise"] == item.exercise
    assert body["session_date"] == (date.today() - timedelta(days=3)).isoformat()
    assert [(s["weight_kg"], s["reps"]) for s in body["sets"]] == [(60.0, 8), (60.0, 6)]


def test_the_most_recent_history_wins(client, db, world, auth, workout):
    item = first_item(workout)
    _past_session(db, world["member_ngk"], days_ago=10, exercise=item.exercise, sets=[(50, 10)])
    _past_session(db, world["member_ngk"], days_ago=2, exercise=item.exercise, sets=[(65, 5)])
    db.commit()

    body = client.get(previous_url(workout, item), headers=auth(world["member_ngk_user"])).json()
    assert [(s["weight_kg"], s["reps"]) for s in body["sets"]] == [(65.0, 5)]


def test_a_past_session_with_no_logged_sets_is_not_offered_as_history(
    client, db, world, auth, workout
):
    """An exercise ticked off without sets has nothing to show."""
    item = first_item(workout)
    _past_session(db, world["member_ngk"], days_ago=2, exercise=item.exercise, sets=[])
    _past_session(db, world["member_ngk"], days_ago=9, exercise=item.exercise, sets=[(55, 7)])
    db.commit()

    body = client.get(previous_url(workout, item), headers=auth(world["member_ngk_user"])).json()
    assert body["session_date"] == (date.today() - timedelta(days=9)).isoformat()


def test_history_never_crosses_members(client, db, world, auth, workout):
    """Another member's lifts are not this member's previous performance."""
    item = first_item(workout)
    other, _ = make_member(db, world["roles"], world["branches"]["ngk"], "Nikhil Suresh")
    journey_service.start_journey(db, member=other, start_date=date.today() - timedelta(days=5))
    _past_session(db, other, days_ago=1, exercise=item.exercise, sets=[(200, 20)])
    db.commit()

    response = client.get(previous_url(workout, item), headers=auth(world["member_ngk_user"]))
    assert response.json() is None


def test_the_current_session_is_not_its_own_history(client, world, auth, workout):
    headers = auth(world["member_ngk_user"])
    item = first_item(workout)
    client.post(
        sets_url(workout, item), json={"set_number": 1, "weight_kg": 60, "reps": 8}, headers=headers
    )

    assert client.get(previous_url(workout, item), headers=headers).json() is None


def test_reading_history_requires_authentication_and_ownership(client, db, world, auth, workout):
    item = first_item(workout)
    assert client.get(previous_url(workout, item)).status_code == 401

    _, other_user = make_member(db, world["roles"], world["branches"]["ngk"], "Nikhil Suresh")
    db.commit()
    assert client.get(previous_url(workout, item), headers=auth(other_user)).status_code == 403


# ----------------------------------------------------- the chart's summary


def test_the_workout_chart_reports_how_many_sets_are_logged(client, world, auth, workout):
    """The chart is where a member picks the next lift, so it has to show
    which ones they have already worked through."""
    headers = auth(world["member_ngk_user"])
    item = first_item(workout)
    for number in (1, 2):
        client.post(
            sets_url(workout, item),
            json={"set_number": number, "weight_kg": 60, "reps": 8},
            headers=headers,
        )

    chart = client.get("/api/v1/journeys/me/workout/today", headers=headers).json()
    by_id = {entry["id"]: entry for entry in chart["items"]}
    assert by_id[item.id]["sets_logged"] == 2
    # Every other exercise reports zero rather than omitting the field.
    assert all(
        by_id[other.id]["sets_logged"] == 0 for other in workout.items if other.id != item.id
    )


def test_the_logged_count_is_one_query_not_one_per_exercise(client, world, auth, workout):
    """Guards the aggregate: walking the relationship would be an N+1 that only
    shows up as a slow screen on a member with a full chart."""
    from sqlalchemy import event

    from app.db.session import engine

    headers = auth(world["member_ngk_user"])
    client.post(
        sets_url(workout, first_item(workout)),
        json={"set_number": 1, "weight_kg": 60, "reps": 8},
        headers=headers,
    )

    counted: list[str] = []

    def record(conn, cursor, statement, *rest):
        counted.append(statement)

    event.listen(engine, "before_cursor_execute", record)
    try:
        client.get("/api/v1/journeys/me/workout/today", headers=headers)
    finally:
        # The same function object, or the listener outlives the test and
        # every later test pays for it.
        event.remove(engine, "before_cursor_execute", record)

    set_queries = [q for q in counted if "workout_sets" in q.lower()]
    assert len(set_queries) == 1, set_queries

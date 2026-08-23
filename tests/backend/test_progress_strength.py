"""Strength trend: real progression built from logged sets, nothing invented.

Progress and Workout duplicated the same "this week" strip before this; the
gap on the other side was that Progress had no strength-progression view at
all, even though the mid-workout logging modal already computed exactly this
data (`journey_service.exercise_history`) one exercise at a time. This is
that same computation, read across every recently-trained lift.
"""

from __future__ import annotations

from datetime import date, timedelta

from app.db.models import SessionStatus, WorkoutSession, WorkoutSessionItem, WorkoutSplit
from app.services import journey_service

API = "/api/v1"


def _past_session(db, member, *, days_ago: int, exercise: str, sets: list[tuple[float, int]]):
    """A completed workout on an earlier date, with sets logged against one lift."""
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


def test_no_sets_logged_is_an_empty_list(db, world):
    assert journey_service.strength_trend(db, member_id=world["member_ngk"].id) == []


def test_points_are_oldest_first_for_one_exercise(db, world):
    member = world["member_ngk"]
    _past_session(db, member, days_ago=14, exercise="Bench press", sets=[(50, 8)])
    _past_session(db, member, days_ago=7, exercise="Bench press", sets=[(55, 8)])
    _past_session(db, member, days_ago=1, exercise="Bench press", sets=[(60, 6)])
    db.commit()

    trends = journey_service.strength_trend(db, member_id=member.id)
    assert len(trends) == 1
    bench = trends[0]
    assert bench.exercise == "Bench press"
    assert [p.top_weight_kg for p in bench.points] == [50.0, 55.0, 60.0]
    assert [p.session_date for p in bench.points] == [
        date.today() - timedelta(days=14),
        date.today() - timedelta(days=7),
        date.today() - timedelta(days=1),
    ]


def test_heaviest_looks_at_the_whole_history_not_just_the_window(db, world):
    member = world["member_ngk"]
    for i in range(10):
        _past_session(db, member, days_ago=30 - i, exercise="Squat", sets=[(100 + i, 5)])
    db.commit()

    trends = journey_service.strength_trend(db, member_id=member.id, sessions_limit=5)
    squat = next(t for t in trends if t.exercise == "Squat")
    assert len(squat.points) == 5  # windowed for the chart
    assert squat.heaviest_kg == 109.0  # but the record itself is not windowed


def test_flags_a_recent_pr_when_the_latest_session_ties_or_beats_the_record(db, world):
    member = world["member_ngk"]
    _past_session(db, member, days_ago=10, exercise="Deadlift", sets=[(120, 5)])
    _past_session(db, member, days_ago=1, exercise="Deadlift", sets=[(130, 5)])
    db.commit()

    trends = journey_service.strength_trend(db, member_id=member.id)
    deadlift = next(t for t in trends if t.exercise == "Deadlift")
    assert deadlift.is_recent_pr is True


def test_does_not_flag_a_pr_when_an_earlier_session_was_heavier(db, world):
    member = world["member_ngk"]
    _past_session(db, member, days_ago=10, exercise="Deadlift", sets=[(140, 5)])
    _past_session(db, member, days_ago=1, exercise="Deadlift", sets=[(120, 5)])
    db.commit()

    trends = journey_service.strength_trend(db, member_id=member.id)
    deadlift = next(t for t in trends if t.exercise == "Deadlift")
    assert deadlift.is_recent_pr is False


def test_an_exercise_never_logged_does_not_appear(db, world):
    member = world["member_ngk"]
    _past_session(db, member, days_ago=1, exercise="Bench press", sets=[(50, 8)])
    db.commit()

    trends = journey_service.strength_trend(db, member_id=member.id)
    assert [t.exercise for t in trends] == ["Bench press"]


def test_most_recently_trained_exercise_comes_first(db, world):
    member = world["member_ngk"]
    _past_session(db, member, days_ago=20, exercise="Squat", sets=[(100, 5)])
    _past_session(db, member, days_ago=2, exercise="Overhead press", sets=[(40, 8)])
    db.commit()

    trends = journey_service.strength_trend(db, member_id=member.id)
    assert [t.exercise for t in trends] == ["Overhead press", "Squat"]


def test_never_crosses_members(db, world):
    from conftest import make_member

    other, _ = make_member(db, world["roles"], world["branches"]["ngk"], "Someone Else")
    db.commit()
    _past_session(db, world["member_ngk"], days_ago=1, exercise="Bench press", sets=[(50, 8)])
    db.commit()

    assert journey_service.strength_trend(db, member_id=other.id) == []


# ------------------------------------------------------------------------ API


def test_member_reads_their_own_strength_trend(client, db, world, auth):
    member = world["member_ngk"]
    _past_session(db, member, days_ago=1, exercise="Bench press", sets=[(50, 8)])
    db.commit()

    response = client.get(
        f"{API}/journeys/me/progress/strength", headers=auth(world["member_ngk_user"])
    )
    assert response.status_code == 200
    body = response.json()
    assert body["exercises"][0]["exercise"] == "Bench press"
    assert body["exercises"][0]["points"][0]["top_weight_kg"] == 50.0


def test_a_trainer_reads_their_clients_strength_trend(client, db, world, auth):
    member = world["member_ngk"]
    _past_session(db, member, days_ago=1, exercise="Bench press", sets=[(50, 8)])
    db.commit()

    response = client.get(
        f"{API}/journeys/members/{member.id}/progress/strength",
        headers=auth(world["trainer_ngk_user"]),
    )
    assert response.status_code == 200
    assert response.json()["exercises"][0]["exercise"] == "Bench press"


def test_a_member_cannot_read_another_members_strength_trend(client, db, world, auth):
    from conftest import make_member

    other, other_user = make_member(db, world["roles"], world["branches"]["ngk"], "Someone Else")
    db.commit()

    response = client.get(
        f"{API}/journeys/members/{other.id}/progress/strength",
        headers=auth(world["member_ngk_user"]),
    )
    assert response.status_code == 403


def test_a_correction_that_removes_the_pr_set_lets_the_old_pr_return(client, db, world, auth):
    """The PR is never a stored number — it is recomputed from whatever sets
    actually exist. Deleting a mistakenly-logged heavier set must therefore
    let the true previous best show again, not leave a phantom PR standing
    or a gap where the badge used to be."""
    member = world["member_ngk"]
    _past_session(db, member, days_ago=7, exercise="Back squat", sets=[(100.0, 5)])
    session = _past_session(db, member, days_ago=0, exercise="Back squat", sets=[(120.0, 5)])
    db.commit()

    trend = journey_service.strength_trend(db, member_id=member.id)
    squat = next(t for t in trend if t.exercise == "Back squat")
    assert squat.heaviest_kg == 120.0
    assert squat.is_recent_pr is True

    item = session.items[0]
    mistaken_set = item.logged_sets[0]
    journey_service.delete_set(db, row=mistaken_set)
    db.commit()

    trend_after = journey_service.strength_trend(db, member_id=member.id)
    squat_after = next((t for t in trend_after if t.exercise == "Back squat"), None)
    assert squat_after is not None
    assert squat_after.heaviest_kg == 100.0


def test_correcting_a_sets_weight_down_recomputes_whether_it_is_still_a_pr(client, db, world, auth):
    member = world["member_ngk"]
    _past_session(db, member, days_ago=7, exercise="Deadlift", sets=[(140.0, 3)])
    session = _past_session(db, member, days_ago=0, exercise="Deadlift", sets=[(150.0, 3)])
    db.commit()

    before = journey_service.strength_trend(db, member_id=member.id)
    lift = next(t for t in before if t.exercise == "Deadlift")
    assert lift.is_recent_pr is True

    latest_set = session.items[0].logged_sets[0]
    journey_service.update_set(db, row=latest_set, changes={"weight_kg": 130.0})
    db.commit()

    after = journey_service.strength_trend(db, member_id=member.id)
    lift_after = next(t for t in after if t.exercise == "Deadlift")
    assert lift_after.heaviest_kg == 140.0
    assert lift_after.is_recent_pr is False


def test_a_tied_weight_still_counts_as_the_pr(client, db, world, auth):
    member = world["member_ngk"]
    _past_session(db, member, days_ago=7, exercise="Overhead press", sets=[(50.0, 6)])
    _past_session(db, member, days_ago=0, exercise="Overhead press", sets=[(50.0, 6)])
    db.commit()

    trend = journey_service.strength_trend(db, member_id=member.id)
    lift = next(t for t in trend if t.exercise == "Overhead press")
    assert lift.heaviest_kg == 50.0
    assert lift.is_recent_pr is True

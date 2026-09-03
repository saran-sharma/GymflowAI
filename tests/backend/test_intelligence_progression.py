"""The workout progression recommendation — conservative, explained, advisory."""

from __future__ import annotations

from datetime import date, timedelta

from intelligence_helpers import add_workout

from app.services.intelligence.progression import (
    Action,
    LastPerformance,
    recommend,
    recommendation_for,
)
from app.services.intelligence.thresholds import THRESHOLDS as T

API = "/api/v1/intelligence"
TODAY = date(2026, 6, 1)


# --------------------------------------------------------------- the rule


def test_no_recommendation_below_two_sessions():
    r = recommend(
        "Bench Press",
        last=LastPerformance(weight_kg=60, reps=10, rpe=7, session_count=1),
        target_reps="8-10",
    )
    assert r.action is Action.INSUFFICIENT_DATA
    assert r.recommended_weight_kg is None


def test_increase_when_target_hit_and_not_maximal():
    r = recommend(
        "Barbell Bench Press",
        last=LastPerformance(weight_kg=60, reps=10, rpe=7, session_count=4),
        target_reps="8-10",
    )
    assert r.action is Action.INCREASE
    assert r.recommended_weight_kg == 62.5  # upper-body step
    assert r.delta_kg == 2.5
    assert "62.5" in r.rationale


def test_lower_body_gets_the_bigger_step():
    r = recommend(
        "Back Squat",
        last=LastPerformance(weight_kg=100, reps=8, rpe=7, session_count=5),
        target_reps="6-8",
    )
    assert r.action is Action.INCREASE
    assert r.recommended_weight_kg == 105.0  # lower-body step


def test_hold_when_reps_hit_but_it_was_hard():
    r = recommend(
        "Seated Row",
        last=LastPerformance(weight_kg=50, reps=8, rpe=9.5, session_count=3),
        target_reps="8",
    )
    assert r.action is Action.HOLD
    assert r.recommended_weight_kg == 50
    assert "easier" in r.rationale


def test_hold_when_reps_short_but_not_maximal():
    r = recommend(
        "Overhead Press",
        last=LastPerformance(weight_kg=40, reps=6, rpe=8, session_count=3),
        target_reps="8-10",
    )
    assert r.action is Action.HOLD
    assert "earn the reps" in r.rationale


def test_reduce_when_reps_badly_short():
    r = recommend(
        "Deadlift",
        last=LastPerformance(weight_kg=120, reps=4, rpe=None, session_count=4),
        target_reps="8-10",
    )
    assert r.action is Action.REDUCE
    assert r.recommended_weight_kg == 108.0  # 10% off
    assert r.delta_kg == -12.0


def test_reduce_on_a_true_grinder_even_at_target():
    r = recommend(
        "Bench Press",
        last=LastPerformance(weight_kg=80, reps=10, rpe=10, session_count=4),
        target_reps="8-10",
    )
    assert r.action is Action.REDUCE
    assert "maximal" in r.rationale


def test_increase_is_capped_at_five_percent():
    # step would be +5 on a 40 kg squat = +12.5%, cap is +5% = 42.0
    r = recommend(
        "Front Squat",
        last=LastPerformance(weight_kg=40, reps=8, rpe=6, session_count=5),
        target_reps="6-8",
    )
    assert r.action is Action.INCREASE
    assert r.recommended_weight_kg == 42.0
    assert r.recommended_weight_kg <= 40 * (1 + T.progression_max_increase_pct / 100)


def test_untargeted_reps_still_allows_a_recommendation():
    r = recommend(
        "Cable Fly",
        last=LastPerformance(weight_kg=20, reps=12, rpe=7, session_count=3),
        target_reps=None,
    )
    assert r.action is Action.INCREASE


# --------------------------------------------------------------- gathering


def test_recommendation_for_reads_the_last_session_top_set(db, world):
    member = world["member_ngk"]
    ex = "Barbell Bench Press"
    add_workout(db, member, on=TODAY - timedelta(days=14), exercise=ex, sets=[(55, 8)])
    add_workout(db, member, on=TODAY - timedelta(days=4), exercise=ex, sets=[(60, 8), (60, 10)])
    db.commit()

    r = recommendation_for(db, member_id=member.id, exercise=ex, target_reps="8-10")
    assert r.action is Action.INCREASE
    assert r.last_weight_kg == 60
    assert r.last_reps == 10  # the better of the two top sets
    assert r.recommended_weight_kg == 62.5


def test_recommendation_for_excludes_the_open_session(db, world):
    member = world["member_ngk"]
    ex = "Barbell Bench Press"
    add_workout(db, member, on=TODAY - timedelta(days=10), exercise=ex, sets=[(60, 9)])
    add_workout(db, member, on=TODAY - timedelta(days=3), exercise=ex, sets=[(62.5, 9)])
    open_session = add_workout(db, member, on=TODAY, exercise=ex, sets=[(65, 9)])
    db.commit()

    r = recommendation_for(
        db,
        member_id=member.id,
        exercise=ex,
        target_reps="8-10",
        before_session_id=open_session.id,
    )
    assert r.last_weight_kg == 62.5  # not the 65 from the open session


def test_recommendation_for_new_lift_is_insufficient_data(db, world):
    member = world["member_ngk"]
    add_workout(db, member, on=TODAY - timedelta(days=2), exercise="Pendlay Row", sets=[(50, 8)])
    db.commit()
    r = recommendation_for(db, member_id=member.id, exercise="Pendlay Row")
    assert r.action is Action.INSUFFICIENT_DATA


# --------------------------------------------------------------- endpoint


def test_recommendation_endpoint_for_own_lift(client, db, world, auth):
    member = world["member_ngk"]
    ex = "Barbell Bench Press"
    add_workout(db, member, on=TODAY - timedelta(days=12), exercise=ex, sets=[(55, 9)])
    add_workout(db, member, on=TODAY - timedelta(days=4), exercise=ex, sets=[(60, 9)])
    db.commit()

    r = client.get(
        f"{API}/me/exercises/{ex}/recommendation?target_reps=8-10",
        headers=auth(world["member_ngk_user"]),
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["action"] == "increase"
    assert body["recommended_weight_kg"] == 62.5
    assert body["rationale"]


def test_recommendation_endpoint_respects_the_read_rule(client, db, world, auth):
    member = world["member_ngk"]
    add_workout(db, member, on=TODAY - timedelta(days=5), exercise="Squat", sets=[(80, 8)])
    db.commit()

    # A trainer at another branch cannot read it.
    denied = client.get(
        f"{API}/members/{member.id}/exercises/Squat/recommendation",
        headers=auth(world["trainer_bgh_user"]),
    )
    assert denied.status_code == 403

    # The member's own branch trainer can.
    ok = client.get(
        f"{API}/members/{member.id}/exercises/Squat/recommendation",
        headers=auth(world["trainer_ngk_user"]),
    )
    assert ok.status_code == 200

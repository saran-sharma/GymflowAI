"""The deterministic member signals.

Dates are explicit everywhere — every calculator takes ``today`` — so nothing
here depends on the wall clock. Each test pins one classification boundary or
one insufficient-data path.
"""

from __future__ import annotations

from datetime import UTC, date, datetime, timedelta

from intelligence_helpers import add_weekly_workouts, add_workout

from app.db.models import AttendanceEvent, CaptureMethod, EventType, PersonType
from app.services.intelligence import signals as sig
from app.services.intelligence.thresholds import THRESHOLDS as T

TODAY = date(2026, 6, 1)


# --------------------------------------------------------------- consistency


def test_consistency_is_insufficient_data_below_the_floor(db, world):
    member = world["member_ngk"]
    add_workout(db, member, on=TODAY - timedelta(days=2))
    add_workout(db, member, on=TODAY - timedelta(days=5))
    db.commit()

    s = sig.consistency(db, member.id, today=TODAY)
    assert s.sessions_in_window == 2
    assert s.level == "insufficient_data"


def test_consistency_strong_when_hitting_target(db, world):
    member = world["member_ngk"]
    add_weekly_workouts(db, member, ending=TODAY, weeks=4, per_week=3)
    db.commit()

    s = sig.consistency(db, member.id, today=TODAY)
    assert s.sessions_in_window == 12
    assert s.per_week == 3.0
    assert s.level == "strong"


def test_consistency_low_when_well_under_target(db, world):
    member = world["member_ngk"]
    # 4 sessions across 4 weeks = 1/week, target is 3.
    add_weekly_workouts(db, member, ending=TODAY, weeks=4, per_week=1)
    db.commit()

    s = sig.consistency(db, member.id, today=TODAY)
    assert s.level == "low"
    assert s.ratio < T.consistency_low_ratio


# --------------------------------------------------------------- inactivity


def test_inactivity_no_history(db, world):
    s = sig.inactivity(db, world["member_ngk"], today=TODAY)
    assert s.level == "no_history"
    assert s.days_since_training is None


def test_inactivity_active_when_recent(db, world):
    member = world["member_ngk"]
    add_workout(db, member, on=TODAY - timedelta(days=2))
    db.commit()
    s = sig.inactivity(db, member, today=TODAY)
    assert s.level == "active"
    assert s.days_since_training == 2


def test_inactivity_slipping_then_inactive_at_boundaries(db, world):
    member = world["member_ngk"]
    add_workout(db, member, on=TODAY - timedelta(days=T.inactivity_attention_days))
    db.commit()
    assert sig.inactivity(db, member, today=TODAY).level == "slipping"

    # Move the only session back past the critical line.
    from app.db.models import WorkoutSession

    session = db.query(WorkoutSession).filter_by(member_id=member.id).one()
    session.session_date = TODAY - timedelta(days=T.inactivity_critical_days)
    db.commit()
    assert sig.inactivity(db, member, today=TODAY).level == "inactive"


# --------------------------------------------------------------- records


def test_recent_record_needs_prior_history(db, world):
    member = world["member_ngk"]
    # A single heavy session is not a record — there is nothing to have beaten.
    add_workout(db, member, on=TODAY - timedelta(days=3), sets=[(100.0, 5)])
    db.commit()
    assert sig.recent_records(db, member.id, today=TODAY).count == 0


def test_recent_record_detected_when_latest_is_heaviest_ever(db, world):
    member = world["member_ngk"]
    add_workout(db, member, on=TODAY - timedelta(days=40), sets=[(80.0, 5)])
    add_workout(db, member, on=TODAY - timedelta(days=20), sets=[(85.0, 5)])
    add_workout(db, member, on=TODAY - timedelta(days=4), sets=[(92.5, 3)])
    db.commit()

    s = sig.recent_records(db, member.id, today=TODAY)
    assert s.count == 1
    assert s.records[0].weight_kg == 92.5
    assert s.records[0].exercise == "Barbell Bench Press"


def test_old_pr_is_not_recent(db, world):
    member = world["member_ngk"]
    add_workout(db, member, on=TODAY - timedelta(days=200), sets=[(80.0, 5)])
    add_workout(db, member, on=TODAY - timedelta(days=120), sets=[(95.0, 3)])
    add_workout(db, member, on=TODAY - timedelta(days=3), sets=[(70.0, 8)])
    db.commit()
    # Heaviest ever (95) is 120 days old; nothing recent beat it.
    assert sig.recent_records(db, member.id, today=TODAY).count == 0


# --------------------------------------------------------------- trend


def test_trend_insufficient_without_both_windows(db, world):
    member = world["member_ngk"]
    add_weekly_workouts(db, member, ending=TODAY, weeks=3, per_week=3)  # current only
    db.commit()
    assert sig.training_trend(db, member.id, today=TODAY).direction == "insufficient_data"


def test_trend_improving_on_volume_rise(db, world):
    member = world["member_ngk"]
    span = T.trend_window_days
    prev_end = TODAY - timedelta(days=span)
    # Previous window: light. Current window: heavier, same frequency.
    add_weekly_workouts(db, member, ending=prev_end, weeks=4, per_week=2, weight_kg=40.0)
    add_weekly_workouts(db, member, ending=TODAY, weeks=4, per_week=2, weight_kg=70.0)
    db.commit()

    s = sig.training_trend(db, member.id, today=TODAY)
    assert s.direction == "improving"
    assert s.volume_change_pct is not None and s.volume_change_pct > T.trend_meaningful_change_pct


def test_trend_declining_on_volume_drop(db, world):
    member = world["member_ngk"]
    span = T.trend_window_days
    prev_end = TODAY - timedelta(days=span)
    add_weekly_workouts(db, member, ending=prev_end, weeks=4, per_week=3, weight_kg=80.0)
    add_weekly_workouts(db, member, ending=TODAY, weeks=4, per_week=3, weight_kg=45.0)
    db.commit()
    assert sig.training_trend(db, member.id, today=TODAY).direction == "declining"


# --------------------------------------------------------------- plateau


def test_plateau_not_called_without_enough_sessions(db, world):
    member = world["member_ngk"]
    add_workout(db, member, on=TODAY - timedelta(days=10), sets=[(60.0, 8)])
    add_workout(db, member, on=TODAY - timedelta(days=5), sets=[(60.0, 8)])
    db.commit()
    s = sig.plateau(db, member.id, today=TODAY)
    assert s.detected is False
    assert "at least" in s.reason


def test_plateau_detected_on_a_long_flat_stretch(db, world):
    member = world["member_ngk"]
    for days_ago in (35, 28, 21, 14, 7):
        add_workout(db, member, on=TODAY - timedelta(days=days_ago), sets=[(60.0, 8)])
    db.commit()

    s = sig.plateau(db, member.id, today=TODAY)
    assert s.detected is True
    assert s.exercise == "Barbell Bench Press"
    assert s.weight_range_kg <= T.plateau_weight_tolerance_kg
    assert s.span_days >= T.plateau_min_span_days


def test_plateau_not_called_when_weight_is_moving(db, world):
    member = world["member_ngk"]
    for i, days_ago in enumerate((35, 28, 21, 14, 7)):
        add_workout(db, member, on=TODAY - timedelta(days=days_ago), sets=[(55.0 + i * 2.5, 8)])
    db.commit()
    s = sig.plateau(db, member.id, today=TODAY)
    assert s.detected is False


def test_plateau_yields_to_a_recent_pr(db, world):
    member = world["member_ngk"]
    # Four flat sessions then a clear PR inside the recent window.
    for days_ago in (40, 33, 26, 19):
        add_workout(db, member, on=TODAY - timedelta(days=days_ago), sets=[(60.0, 8)])
    add_workout(db, member, on=TODAY - timedelta(days=5), sets=[(70.0, 5)])
    db.commit()
    s = sig.plateau(db, member.id, today=TODAY)
    assert s.detected is False
    assert "personal record" in s.reason


# --------------------------------------------------------------- coverage roll-up


def test_member_signals_reports_coverage_and_minimum(db, world):
    member = world["member_ngk"]
    add_workout(db, member, on=TODAY - timedelta(days=30))
    add_workout(db, member, on=TODAY - timedelta(days=15))
    add_workout(db, member, on=TODAY - timedelta(days=3))
    db.commit()

    s = sig.member_signals(db, member, today=TODAY)
    assert s.completed_sessions == 3
    assert s.has_minimum_data is True
    assert s.weeks_of_history >= 3


def test_member_signals_below_minimum(db, world):
    member = world["member_ngk"]
    add_workout(db, member, on=TODAY - timedelta(days=3))
    db.commit()
    s = sig.member_signals(db, member, today=TODAY)
    assert s.has_minimum_data is False


def test_gym_visit_feeds_inactivity_last_visit(db, world):
    member = world["member_ngk"]
    db.add(
        AttendanceEvent(
            branch_id=member.branch_id,
            user_id=member.user_id,
            person_type=PersonType.MEMBER,
            event_type=EventType.CHECK_IN,
            method=CaptureMethod.QR,
            occurred_at=datetime(2026, 5, 31, 12, 0, tzinfo=UTC),
            work_date=TODAY - timedelta(days=1),
        )
    )
    db.commit()
    s = sig.inactivity(db, member, today=TODAY)
    assert s.last_visit_on == TODAY - timedelta(days=1)
    assert s.days_since_visit == 1

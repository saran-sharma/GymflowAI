"""The member intelligence assembler — signals in, ordered insights out."""

from __future__ import annotations

from datetime import date, timedelta

from intelligence_helpers import add_weekly_workouts, add_workout

from app.services.intelligence import build_member_intelligence
from app.services.intelligence.narrator import TemplateNarrator

TODAY = date(2026, 6, 1)


def _intel(db, member):
    return build_member_intelligence(db, member, today=TODAY, narrator=TemplateNarrator())


def test_insufficient_data_is_an_explicit_state_not_an_empty_ok(db, world):
    member = world["member_ngk"]
    add_workout(db, member, on=TODAY - timedelta(days=3))
    db.commit()

    intel = _intel(db, member)
    assert intel.state == "insufficient_data"
    assert intel.insights == []
    assert "Complete a few workouts" in intel.headline
    assert intel.next_action is not None  # still points at "start a workout"


def test_consistent_member_gets_a_positive_section(db, world):
    member = world["member_ngk"]
    add_weekly_workouts(db, member, ending=TODAY, weeks=4, per_week=3)
    db.commit()

    intel = _intel(db, member)
    assert intel.state == "ok"
    kinds = {i.type for i in intel.insights}
    assert "consistency" in kinds
    consistency = next(i for i in intel.insights if i.type == "consistency")
    assert consistency.severity == "positive"
    assert consistency.evidence  # never a bare claim


def test_critical_inactivity_is_ordered_first(db, world):
    member = world["member_ngk"]
    # Enough history to clear the minimum, but nothing for four weeks.
    for days_ago in (60, 55, 50, 45, 40, 35):
        add_workout(db, member, on=TODAY - timedelta(days=days_ago))
    db.commit()

    intel = _intel(db, member)
    assert intel.state == "ok"
    assert intel.insights[0].type == "inactivity"
    assert intel.insights[0].severity == "critical"
    # The next action is the first actionable insight's action.
    assert intel.next_action is not None
    assert intel.next_action.route == intel.insights[0].action.route


def test_every_insight_carries_evidence(db, world):
    member = world["member_ngk"]
    add_weekly_workouts(db, member, ending=TODAY, weeks=4, per_week=3, weight_kg=50.0)
    add_workout(db, member, on=TODAY - timedelta(days=40), exercise="Deadlift", sets=[(100.0, 5)])
    add_workout(db, member, on=TODAY - timedelta(days=6), exercise="Deadlift", sets=[(120.0, 3)])
    db.commit()

    intel = _intel(db, member)
    assert intel.insights
    for insight in intel.insights:
        assert insight.evidence, f"{insight.type} has no evidence"
        assert insight.summary


def test_narration_source_is_reported(db, world):
    member = world["member_ngk"]
    add_weekly_workouts(db, member, ending=TODAY, weeks=4, per_week=3)
    db.commit()
    intel = _intel(db, member)
    assert intel.narration_source == "deterministic"
    assert intel.coverage.completed_sessions == 12


def test_a_broken_narrator_does_not_take_the_read_down(db, world):
    """§21: the deterministic content must still render if narration fails."""
    member = world["member_ngk"]
    add_weekly_workouts(db, member, ending=TODAY, weeks=4, per_week=3)
    db.commit()

    class Broken:
        def narrate(self, request):
            raise RuntimeError("boom")

    intel = build_member_intelligence(db, member, today=TODAY, narrator=Broken())
    assert intel.state == "ok"
    assert intel.insights  # signals survived
    assert intel.headline  # fell back to the template sentence
    assert intel.narration_source == "deterministic"

"""Contextual nudges — deterministic source, dedup, cooldown, role scope.

Nudges ride the existing Alert table, so a raised nudge is asserted both by
what ``sweep_*`` returns and by what shows up in ``GET /alerts`` for the
recipient — never for anyone else.
"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

from intelligence_helpers import add_workout

from app.core import clock
from app.services import journey_service
from app.services.intelligence import nudges

API = "/api/v1"

# A frozen "now" well clear of the seed data's dates.
NOW = datetime(2026, 6, 15, 9, 0, tzinfo=UTC)
TODAY = NOW.date()


def _freeze(dt=NOW):
    clock.freeze(dt)


# --------------------------------------------------------------- member candidates


def test_inactivity_nudge_is_raised_and_lands_in_the_members_own_feed(client, db, world, auth):
    member = world["member_ngk"]
    # Enough history to have a baseline, then a 3-week gap.
    for days_ago in (40, 37, 34, 31):
        add_workout(db, member, on=TODAY - timedelta(days=days_ago))
    db.commit()

    _freeze()
    raised = nudges.sweep_member(db, member, today=TODAY)
    db.commit()
    clock.freeze(None)

    assert [a.key for a in raised] == [nudges.NUDGE_MEMBER_INACTIVITY]
    alert = raised[0]
    assert alert.target_user_id == member.user_id
    assert alert.action_route == "/(member)/workout"
    assert alert.entity_type == "nudge"
    assert "evidence" in alert.payload

    feed = client.get(f"{API}/alerts", headers=auth(world["member_ngk_user"]))
    assert alert.title in {row["title"] for row in feed.json()}

    # And nobody else sees it.
    other_feed = client.get(f"{API}/alerts", headers=auth(world["trainer_ngk_user"]))
    assert alert.title not in {row["title"] for row in other_feed.json()}


def test_personal_record_nudge_fires_for_a_fresh_pr(db, world):
    member = world["member_ngk"]
    add_workout(db, member, on=TODAY - timedelta(days=20), exercise="Deadlift", sets=[(100, 5)])
    add_workout(db, member, on=TODAY - timedelta(days=1), exercise="Deadlift", sets=[(115, 3)])
    db.commit()

    _freeze()
    raised = nudges.sweep_member(db, member, today=TODAY)
    clock.freeze(None)
    keys = [a.key for a in raised]
    assert nudges.NUDGE_MEMBER_PR in keys
    pr = next(a for a in raised if a.key == nudges.NUDGE_MEMBER_PR)
    assert "Deadlift" in pr.body


def test_journey_milestone_nudge_at_day_30(db, world):
    member = world["member_ngk"]
    journey_service.start_journey(db, member=member, start_date=TODAY - timedelta(days=29))
    db.commit()

    _freeze()
    raised = nudges.sweep_member(db, member, today=TODAY)
    clock.freeze(None)
    milestone = next(a for a in raised if a.key == nudges.NUDGE_MEMBER_MILESTONE)
    assert "Day 30" in milestone.title


# --------------------------------------------------------------- dedup + cooldown


def test_a_second_sweep_the_same_day_raises_nothing(db, world):
    member = world["member_ngk"]
    for days_ago in (40, 37, 34, 31):
        add_workout(db, member, on=TODAY - timedelta(days=days_ago))
    db.commit()

    _freeze()
    first = nudges.sweep_member(db, member, today=TODAY)
    db.commit()
    second = nudges.sweep_member(db, member, today=TODAY)
    db.commit()
    clock.freeze(None)

    assert len(first) >= 1
    assert second == []  # dedup on the exact key + cooldown both hold

    from sqlalchemy import func, select

    from app.db.models import Alert

    n = db.scalar(
        select(func.count()).select_from(Alert).where(Alert.key == nudges.NUDGE_MEMBER_INACTIVITY)
    )
    assert n == 1


def test_cooldown_expires_after_enough_days(db, world):
    member = world["member_ngk"]
    for days_ago in (40, 37, 34, 31):
        add_workout(db, member, on=TODAY - timedelta(days=days_ago))
    db.commit()

    _freeze(NOW)
    nudges.sweep_member(db, member, today=TODAY)
    db.commit()

    # Ten days later — past the 5-day cooldown, and a new ISO week.
    later = NOW + timedelta(days=10)
    _freeze(later)
    raised = nudges.sweep_member(db, member, today=later.date())
    db.commit()
    clock.freeze(None)

    assert nudges.NUDGE_MEMBER_INACTIVITY in [a.key for a in raised]

    from sqlalchemy import func, select

    from app.db.models import Alert

    n = db.scalar(
        select(func.count()).select_from(Alert).where(Alert.key == nudges.NUDGE_MEMBER_INACTIVITY)
    )
    assert n == 2  # one per period, spaced by the cooldown


def test_a_healthy_member_gets_no_nudges(db, world):
    member = world["member_ngk"]
    from intelligence_helpers import add_weekly_workouts

    add_weekly_workouts(db, member, ending=TODAY, weeks=4, per_week=3)
    db.commit()
    _freeze()
    raised = nudges.sweep_member(db, member, today=TODAY)
    clock.freeze(None)
    assert raised == []


# --------------------------------------------------------------- trainer


def test_trainer_nudge_for_an_inactive_assigned_member(db, world):
    trainer = world["trainer_ngk"]
    member = world["member_ngk"]  # assigned to trainer_ngk in the fixture
    for days_ago in (60, 55, 50, 45):
        add_workout(db, member, on=TODAY - timedelta(days=days_ago))
    db.commit()

    _freeze()
    raised = nudges.sweep_trainer(db, trainer, today=TODAY)
    clock.freeze(None)

    assert nudges.NUDGE_TRAINER_MEMBER_INACTIVE in [a.key for a in raised]
    n = raised[0]
    assert n.target_user_id == trainer.user_id
    assert n.action_route == f"/(trainer)/client/{member.id}"


# --------------------------------------------------------------- endpoint


def test_sweep_endpoint_is_member_and_trainer_only(client, db, world, auth):
    member = world["member_ngk"]
    for days_ago in (40, 37, 34, 31):
        add_workout(db, member, on=TODAY - timedelta(days=days_ago))
    db.commit()

    _freeze()
    try:
        r = client.post(f"{API}/intelligence/nudges/sweep", headers=auth(world["member_ngk_user"]))
        assert r.status_code == 200
        assert r.json()["raised"] >= 1

        t = client.post(f"{API}/intelligence/nudges/sweep", headers=auth(world["trainer_ngk_user"]))
        assert t.status_code == 200

        denied = client.post(f"{API}/intelligence/nudges/sweep", headers=auth(world["owner"]))
        assert denied.status_code == 403
    finally:
        clock.freeze(None)

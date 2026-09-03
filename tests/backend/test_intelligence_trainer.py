"""The trainer-facing intelligence: the per-member brief and the desk queue."""

from __future__ import annotations

from datetime import date, timedelta

from conftest import make_member
from intelligence_helpers import add_weekly_workouts, add_workout

from app.services.intelligence.trainer import build_attention_queue, build_trainer_brief

API = "/api/v1/intelligence"
TODAY = date(2026, 6, 1)


# --------------------------------------------------------------- brief


def test_brief_splits_progress_from_watch(db, world):
    member = world["member_ngk"]
    # Consistent + a recent PR (progress), and a membership about to lapse (watch).
    add_weekly_workouts(db, member, ending=TODAY, weeks=4, per_week=3, weight_kg=50.0)
    add_workout(db, member, on=TODAY - timedelta(days=40), exercise="Row", sets=[(40.0, 8)])
    add_workout(db, member, on=TODAY - timedelta(days=5), exercise="Row", sets=[(55.0, 6)])
    membership = member.memberships[0] if hasattr(member, "memberships") else None
    if membership is None:
        from app.db.models import Membership

        membership = db.query(Membership).filter_by(member_id=member.id).first()
    membership.ends_on = TODAY + timedelta(days=7)
    db.commit()

    brief = build_trainer_brief(db, member, trainer_id=world["trainer_ngk"].id, today=TODAY)
    assert brief.state == "ok"
    assert brief.member_name == "Aditya Rao"
    assert any(i.type == "membership" for i in brief.watch)
    assert all(i.severity in ("attention", "critical") for i in brief.watch)
    assert all(i.severity in ("positive", "info") for i in brief.progress)
    assert brief.today  # current-state facts always present
    assert brief.suggested_focus  # never empty


def test_brief_suggested_focus_is_specific_for_a_plateau(db, world):
    member = world["member_ngk"]
    for days_ago in (35, 28, 21, 14, 7):
        add_workout(db, member, on=TODAY - timedelta(days=days_ago), sets=[(60.0, 8)])
    db.commit()

    brief = build_trainer_brief(db, member, trainer_id=world["trainer_ngk"].id, today=TODAY)
    assert any("flat" in line.lower() for line in brief.suggested_focus)


def test_brief_for_a_thin_history_is_insufficient_but_still_useful(db, world):
    member = world["member_ngk"]
    add_workout(db, member, on=TODAY - timedelta(days=2))
    db.commit()

    brief = build_trainer_brief(db, member, trainer_id=world["trainer_ngk"].id, today=TODAY)
    assert brief.state == "insufficient_data"
    assert brief.progress == []
    assert brief.watch == []
    assert brief.today
    assert "Not enough history" in brief.suggested_focus[0]


def test_brief_carries_no_incentive_or_payment_field(db, world):
    member = world["member_ngk"]
    add_weekly_workouts(db, member, ending=TODAY, weeks=4, per_week=3)
    db.commit()
    brief = build_trainer_brief(db, member, trainer_id=world["trainer_ngk"].id, today=TODAY)
    blob = brief.model_dump_json().lower()
    for banned in ("incentive", "revenue", "payment", "paid", "salary"):
        assert banned not in blob


# --------------------------------------------------------------- attention queue


def test_queue_ranks_the_worst_first_with_a_visible_reason(db, world):
    trainer = world["trainer_ngk"]
    branch = world["branches"]["ngk"]

    inactive = world["member_ngk"]  # assigned to trainer_ngk in the fixture
    for days_ago in (60, 55, 50, 45):
        add_workout(db, inactive, on=TODAY - timedelta(days=days_ago))

    low, _ = make_member(db, world["roles"], branch, "Low Consistency", trainer=trainer)
    add_weekly_workouts(db, low, ending=TODAY, weeks=4, per_week=1)

    healthy, _ = make_member(db, world["roles"], branch, "Doing Fine", trainer=trainer)
    add_weekly_workouts(db, healthy, ending=TODAY, weeks=4, per_week=3)
    db.commit()

    queue = build_attention_queue(db, trainer, today=TODAY)
    assert queue.considered == 3
    ids = [item.member_id for item in queue.items]
    assert ids[0] == inactive.id  # inactivity outranks low consistency
    assert low.id in ids
    assert healthy.id not in ids  # nothing wrong → not listed
    assert queue.items[0].severity == "critical"
    assert "No training in" in queue.items[0].reason
    assert queue.items[0].route == f"/(trainer)/client/{inactive.id}"
    assert [item.priority for item in queue.items] == list(range(len(queue.items)))


def test_queue_is_empty_when_every_client_is_on_track(db, world):
    trainer = world["trainer_ngk"]
    add_weekly_workouts(db, world["member_ngk"], ending=TODAY, weeks=4, per_week=3)
    db.commit()
    queue = build_attention_queue(db, trainer, today=TODAY)
    assert queue.considered == 1
    assert queue.items == []


# --------------------------------------------------------------- endpoints


def test_brief_endpoint_is_staff_only(client, db, world, auth):
    add_weekly_workouts(db, world["member_ngk"], ending=TODAY, weeks=4, per_week=3)
    db.commit()
    member = world["member_ngk"]

    ok = client.get(
        f"{API}/members/{member.id}/brief?on={TODAY.isoformat()}",
        headers=auth(world["trainer_ngk_user"]),
    )
    assert ok.status_code == 200
    assert ok.json()["member_id"] == member.id

    denied = client.get(f"{API}/members/{member.id}/brief", headers=auth(world["member_ngk_user"]))
    assert denied.status_code == 403


def test_brief_endpoint_respects_branch_scope(client, db, world, auth):
    add_weekly_workouts(db, world["member_ngk"], ending=TODAY, weeks=4, per_week=3)
    db.commit()
    r = client.get(
        f"{API}/members/{world['member_ngk'].id}/brief",
        headers=auth(world["trainer_bgh_user"]),
    )
    assert r.status_code == 403


def test_attention_endpoint_needs_a_trainer_account(client, db, world, auth):
    for days_ago in (60, 55, 50, 45):
        add_workout(db, world["member_ngk"], on=TODAY - timedelta(days=days_ago))
    db.commit()

    ok = client.get(
        f"{API}/trainer/attention?on={TODAY.isoformat()}",
        headers=auth(world["trainer_ngk_user"]),
    )
    assert ok.status_code == 200
    body = ok.json()
    assert body["items"][0]["member_id"] == world["member_ngk"].id

    for actor in ("owner", "member_ngk_user"):
        denied = client.get(f"{API}/trainer/attention", headers=auth(world[actor]))
        assert denied.status_code == 403

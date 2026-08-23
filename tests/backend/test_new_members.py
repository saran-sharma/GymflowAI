"""GET /reports/new-members — who joined recently, across every source.

The dashboard's "New members" tile used to open onto the marketing overview,
which is a source-by-source funnel view, not a list of people. This is the
flat list a tap on that count actually means.
"""

from __future__ import annotations

from datetime import date, timedelta

from app.db.models import Member

API = "/api/v1/reports/new-members"


def _register(db, member: Member, *, days_ago: int):
    member.registered_on = date.today() - timedelta(days=days_ago)
    db.commit()


def test_a_member_registered_inside_the_window_is_listed(client, world, auth, db):
    member = world["member_ngk"]
    _register(db, member, days_ago=10)

    response = client.get(f"{API}?days=90", headers=auth(world["owner"]))
    assert response.status_code == 200
    body = response.json()

    assert body["window_days"] == 90
    row = next(item for item in body["items"] if item["member_id"] == member.id)
    assert row["member_name"] == "Aditya Rao"
    assert row["plan_name"] == "Annual"
    assert row["status"] == "active"


def test_a_member_registered_outside_the_window_is_excluded(client, world, auth, db):
    member = world["member_ngk"]
    _register(db, member, days_ago=200)

    response = client.get(f"{API}?days=90", headers=auth(world["owner"]))
    assert response.status_code == 200
    assert all(item["member_id"] != member.id for item in response.json()["items"])


def test_a_member_never_registered_is_excluded(client, world, auth):
    # world["member_ngk"] has no registered_on by default from the fixture.
    response = client.get(f"{API}?days=90", headers=auth(world["owner"]))
    assert response.status_code == 200
    assert response.json()["items"] == []


def test_the_source_and_assigned_trainer_come_through_when_present(client, db, world, auth):
    from app.db.models import MarketingSource

    member = world["member_ngk"]
    source = MarketingSource(key="instagram", label="Instagram", sort_order=1)
    db.add(source)
    db.flush()
    member.marketing_source_id = source.id
    _register(db, member, days_ago=5)

    response = client.get(f"{API}?days=90", headers=auth(world["owner"]))
    row = next(item for item in response.json()["items"] if item["member_id"] == member.id)
    assert row["source_label"] == "Instagram"
    assert row["assigned_trainer_name"] == "Vikas Menon"


def test_an_expired_membership_reports_the_self_healed_status(client, db, world, auth):
    member = world["member_ngk"]
    membership = member.memberships[0]
    membership.ends_on = date.today() - timedelta(days=5)
    db.commit()
    _register(db, member, days_ago=5)

    response = client.get(f"{API}?days=90", headers=auth(world["owner"]))
    row = next(item for item in response.json()["items"] if item["member_id"] == member.id)
    assert row["status"] == "expired"


def test_a_branch_manager_sees_only_their_own_branch(client, db, world, auth):
    from conftest import make_member

    other, _ = make_member(db, world["roles"], world["branches"]["bgh"], "Someone Else")
    db.commit()
    _register(db, world["member_ngk"], days_ago=1)
    _register(db, other, days_ago=1)

    response = client.get(f"{API}?days=90", headers=auth(world["manager_ngk"]))
    assert response.status_code == 200
    ids = {item["member_id"] for item in response.json()["items"]}
    assert world["member_ngk"].id in ids
    assert other.id not in ids


def test_a_trainer_cannot_read_new_members(client, world, auth):
    response = client.get(f"{API}?days=90", headers=auth(world["trainer_ngk_user"]))
    assert response.status_code == 403

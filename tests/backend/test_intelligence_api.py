"""The intelligence endpoint and its authorization boundary.

Same rule as the journey/workout reads: own record for a member, same-branch
members for a trainer, in-scope branches for management. No arbitrary-id path
around it, and nothing role-specific leaks through the shared payload.
"""

from __future__ import annotations

from datetime import date, timedelta

from conftest import make_member
from intelligence_helpers import add_weekly_workouts, add_workout

API = "/api/v1/intelligence"
TODAY = date(2026, 6, 1)


def _seed_history(db, member):
    add_weekly_workouts(db, member, ending=TODAY, weeks=4, per_week=3)
    db.commit()


# --------------------------------------------------------------- happy paths


def test_member_reads_their_own_intelligence_via_me(client, db, world, auth):
    _seed_history(db, world["member_ngk"])
    r = client.get(f"{API}/me?on={TODAY.isoformat()}", headers=auth(world["member_ngk_user"]))
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["member_id"] == world["member_ngk"].id
    assert body["state"] == "ok"
    assert body["insights"]
    assert "narration_source" in body


def test_member_reads_their_own_intelligence_by_id(client, db, world, auth):
    _seed_history(db, world["member_ngk"])
    member = world["member_ngk"]
    r = client.get(
        f"{API}/members/{member.id}?on={TODAY.isoformat()}",
        headers=auth(world["member_ngk_user"]),
    )
    assert r.status_code == 200


def test_trainer_reads_a_member_at_their_branch(client, db, world, auth):
    _seed_history(db, world["member_ngk"])
    r = client.get(
        f"{API}/members/{world['member_ngk'].id}?on={TODAY.isoformat()}",
        headers=auth(world["trainer_ngk_user"]),
    )
    assert r.status_code == 200


def test_owner_reads_any_member(client, db, world, auth):
    _seed_history(db, world["member_ngk"])
    r = client.get(f"{API}/members/{world['member_ngk'].id}", headers=auth(world["owner"]))
    assert r.status_code == 200


# --------------------------------------------------------------- rejections


def test_member_cannot_read_another_members_intelligence(client, db, world, auth):
    other, _ = make_member(db, world["roles"], world["branches"]["ngk"], "Other Member")
    db.commit()
    r = client.get(f"{API}/members/{other.id}", headers=auth(world["member_ngk_user"]))
    assert r.status_code == 403


def test_trainer_at_another_branch_is_refused(client, db, world, auth):
    _seed_history(db, world["member_ngk"])
    r = client.get(
        f"{API}/members/{world['member_ngk'].id}",
        headers=auth(world["trainer_bgh_user"]),
    )
    assert r.status_code == 403


def test_branch_manager_cannot_reach_a_member_outside_their_branch(client, db, world, auth):
    r = client.get(
        f"{API}/members/{world['member_ngk'].id}",
        headers=auth(world["manager_bgh"]),
    )
    assert r.status_code == 403


def test_unauthenticated_is_401(client, world):
    r = client.get(f"{API}/members/{world['member_ngk'].id}")
    assert r.status_code == 401


def test_unknown_member_is_404(client, world, auth):
    r = client.get(f"{API}/members/999999", headers=auth(world["owner"]))
    assert r.status_code == 404


def test_staff_account_has_no_me_record(client, world, auth):
    r = client.get(f"{API}/me", headers=auth(world["owner"]))
    assert r.status_code == 404


# --------------------------------------------------------------- states


def test_insufficient_data_state_over_http(client, db, world, auth):
    add_workout(db, world["member_ngk"], on=TODAY - timedelta(days=2))
    db.commit()
    r = client.get(f"{API}/me?on={TODAY.isoformat()}", headers=auth(world["member_ngk_user"]))
    assert r.status_code == 200
    body = r.json()
    assert body["state"] == "insufficient_data"
    assert body["insights"] == []
    assert body["coverage"]["completed_sessions"] == 1


def test_no_pii_beyond_ids_in_the_payload(client, db, world, auth):
    _seed_history(db, world["member_ngk"])
    r = client.get(f"{API}/me?on={TODAY.isoformat()}", headers=auth(world["member_ngk_user"]))
    blob = r.text.lower()
    # The narration context and evidence are figures, not personal details.
    assert "aditya" not in blob
    assert world["member_ngk_user"].email.lower() not in blob

"""Memberships approaching expiry, as a number an owner can act on.

The expiry alert already existed — one per member, raised by the automation
sweep — but there was no way to ask how many there are, which is what a
dashboard tile needs. These rows are the ones the alerts come from, so the
tile and the alert list cannot disagree.
"""

from __future__ import annotations

from datetime import timedelta

from app.core.clock import branch_today
from app.db.models import MembershipStatus

API = "/api/v1"


def _membership(db, world, *, ends_in_days: int, status=MembershipStatus.ACTIVE):
    from app.db.models import Membership

    member = world["member_ngk"]
    today = branch_today(None)
    row = Membership(
        member_id=member.id,
        branch_id=member.branch_id,
        plan_name="Annual",
        status=status,
        starts_on=today - timedelta(days=300),
        ends_on=today + timedelta(days=ends_in_days),
        pt_sessions_total=0,
        pt_sessions_used=0,
    )
    db.add(row)
    db.commit()
    return row


def test_a_membership_inside_the_window_is_counted(client, db, world, auth):
    _membership(db, world, ends_in_days=10)
    response = client.get(f"{API}/reports/renewals?days=30", headers=auth(world["admin"]))
    assert response.status_code == 200

    body = response.json()
    assert body["count"] >= 1
    row = next(item for item in body["items"] if item["member_id"] == world["member_ngk"].id)
    assert row["days_remaining"] == 10
    assert row["plan_name"] == "Annual"


def test_a_membership_beyond_the_window_is_not(client, db, world, auth):
    _membership(db, world, ends_in_days=90)
    body = client.get(f"{API}/reports/renewals?days=30", headers=auth(world["admin"])).json()
    assert all(item["member_id"] != world["member_ngk"].id for item in body["items"])


def test_an_already_expired_membership_is_not_a_renewal(client, db, world, auth):
    """A lapsed member is a different problem from one about to lapse."""
    _membership(db, world, ends_in_days=-5)
    body = client.get(f"{API}/reports/renewals?days=30", headers=auth(world["admin"])).json()
    assert all(item["member_id"] != world["member_ngk"].id for item in body["items"])


def test_renewals_are_ordered_by_how_soon_they_expire(client, db, world, auth):
    body = client.get(f"{API}/reports/renewals?days=180", headers=auth(world["admin"])).json()
    days = [item["days_remaining"] for item in body["items"]]
    assert days == sorted(days)


def test_a_member_cannot_read_the_renewals_report(client, world, auth):
    response = client.get(f"{API}/reports/renewals", headers=auth(world["member_ngk_user"]))
    assert response.status_code == 403

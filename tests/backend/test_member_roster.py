"""The owner Members roster — GET /api/v1/members/roster.

The canonical way into member detail. It must work for every member, not
only those on a journey, in a PT package, or currently checked in — which is
exactly the shape of a real Yoactiv import (thousands of members, almost
none with a GymFlow journey).
"""

from __future__ import annotations

from datetime import UTC, date, datetime, timedelta

import pytest
from conftest import make_member

from app.db.models import (
    AttendanceEvent,
    CaptureMethod,
    EventType,
    Membership,
    MembershipStatus,
    PersonType,
)

API = "/api/v1/members/roster"


def _member(db, world, name, *, branch="ngk", active=True, phone=None, external_ref=None):
    m, u = make_member(db, world["roles"], world["branches"][branch], name)
    m.is_active = active
    m.is_demo = False
    if phone is not None:
        u.phone = phone
    if external_ref is not None:
        m.external_ref = external_ref
    db.flush()
    return m, u


def _membership(db, member, *, plan, ends_on, status=MembershipStatus.ACTIVE):
    db.add(
        Membership(
            member_id=member.id,
            branch_id=member.branch_id,
            plan_name=plan,
            status=status,
            starts_on=ends_on - timedelta(days=300),
            ends_on=ends_on,
        )
    )
    db.flush()


def _visit(db, user_id, branch_id, on):
    db.add(
        AttendanceEvent(
            branch_id=branch_id,
            user_id=user_id,
            person_type=PersonType.MEMBER,
            event_type=EventType.CHECK_IN,
            method=CaptureMethod.QR,
            occurred_at=datetime(on.year, on.month, on.day, 8, tzinfo=UTC),
            work_date=on,
        )
    )
    db.flush()


# --------------------------------------------------------------- shape


def test_a_bare_member_with_no_journey_or_pt_is_still_in_the_roster(client, db, world, auth):
    """The whole point: an imported member with only a membership row shows
    up and can be opened."""
    member, _ = _member(db, world, "Imported Person", external_ref="2443723")
    _membership(db, member, plan="gym workout 14 months", ends_on=date(2028, 6, 1))
    db.commit()

    body = client.get(API, headers=auth(world["owner"])).json()
    row = next(r for r in body["members"] if r["member_id"] == member.id)
    assert row["full_name"] == "Imported Person"
    assert row["membership_plan"] == "gym workout 14 months"
    assert row["membership_status"] == "active"
    assert row["membership_ends_on"] == "2028-06-01"
    assert row["days_remaining"] is not None
    assert row["branch_name"] == "SLAM Nagalkeni"

    # …and that id opens the existing member-detail endpoint.
    detail = client.get(f"/api/v1/members/{member.id}", headers=auth(world["owner"]))
    assert detail.status_code == 200
    assert detail.json()["client"]["full_name"] == "Imported Person"


def test_total_counts_all_matches_not_just_the_page(client, db, world, auth):
    for i in range(7):
        _member(db, world, f"Roster Filler {i}")
    db.commit()
    body = client.get(f"{API}?limit=3", headers=auth(world["owner"])).json()
    assert body["total"] >= 8  # 7 + world's Aditya
    assert len(body["members"]) == 3


# --------------------------------------------------------------- search


def test_search_by_name_fragment(client, db, world, auth):
    _member(db, world, "Meenakshi Sundaram")
    _member(db, world, "Sundar Raj")
    db.commit()
    names = [
        r["full_name"]
        for r in client.get(f"{API}?q=sundar", headers=auth(world["owner"])).json()["members"]
    ]
    assert "Meenakshi Sundaram" in names
    assert "Sundar Raj" in names
    assert "Aditya Rao" not in names


def test_search_by_mobile_digits(client, db, world, auth):
    _member(db, world, "Phone Person", phone="9003122550")
    db.commit()
    rows = client.get(f"{API}?q=9003122550", headers=auth(world["owner"])).json()["members"]
    assert [r["full_name"] for r in rows] == ["Phone Person"]
    # A partial run of digits also matches.
    rows = client.get(f"{API}?q=31225", headers=auth(world["owner"])).json()["members"]
    assert any(r["full_name"] == "Phone Person" for r in rows)  # partial digits also match


def test_search_by_yoactiv_id(client, db, world, auth):
    member, _ = _member(db, world, "External Ref Person", external_ref="778812")
    db.commit()
    rows = client.get(f"{API}?q=778812", headers=auth(world["owner"])).json()["members"]
    assert [r["member_id"] for r in rows] == [member.id]


def test_search_by_member_code(client, db, world, auth):
    member, _ = _member(db, world, "Code Person")
    db.commit()
    rows = client.get(f"{API}?q={member.member_code}", headers=auth(world["owner"])).json()[
        "members"
    ]
    assert [r["member_id"] for r in rows] == [member.id]


# --------------------------------------------------------------- filters


def test_status_filter(client, db, world, auth):
    active_m, _ = _member(db, world, "Still Active", active=True)
    expired_m, _ = _member(db, world, "Lapsed", active=False)
    db.commit()

    active = {
        r["member_id"]
        for r in client.get(f"{API}?status=active", headers=auth(world["owner"])).json()["members"]
    }
    expired = {
        r["member_id"]
        for r in client.get(f"{API}?status=expired", headers=auth(world["owner"])).json()["members"]
    }
    every = {
        r["member_id"]
        for r in client.get(f"{API}?status=all", headers=auth(world["owner"])).json()["members"]
    }

    assert active_m.id in active and active_m.id not in expired
    assert expired_m.id in expired and expired_m.id not in active
    assert {active_m.id, expired_m.id} <= every


def test_default_status_is_active_only(client, db, world, auth):
    expired_m, _ = _member(db, world, "Default Hidden", active=False)
    db.commit()
    ids = {r["member_id"] for r in client.get(API, headers=auth(world["owner"])).json()["members"]}
    assert expired_m.id not in ids


def test_branch_filter_and_scope(client, db, world, auth):
    ngk_m, _ = _member(db, world, "NGK Member", branch="ngk")
    bgh_m, _ = _member(db, world, "BGH Member", branch="bgh")
    db.commit()

    ngk_only = {
        r["member_id"]
        for r in client.get(
            f"{API}?branch_id={world['branches']['ngk'].id}", headers=auth(world["owner"])
        ).json()["members"]
    }
    assert ngk_m.id in ngk_only and bgh_m.id not in ngk_only

    # A branch manager only ever sees their own branch, with or without the filter.
    mgr_rows = client.get(API, headers=auth(world["manager_ngk"])).json()["members"]
    assert all(r["branch_id"] == world["branches"]["ngk"].id for r in mgr_rows)
    denied = client.get(
        f"{API}?branch_id={world['branches']['bgh'].id}", headers=auth(world["manager_ngk"])
    )
    assert denied.status_code == 403


# --------------------------------------------------------------- ordering


def test_ordered_by_most_recent_visit_then_name(client, db, world, auth):
    old, old_u = _member(db, world, "Visited Long Ago")
    recent, recent_u = _member(db, world, "Visited Yesterday")
    never, _ = _member(db, world, "Never Visited")
    _visit(db, old_u.id, old.branch_id, date.today() - timedelta(days=40))
    _visit(db, recent_u.id, recent.branch_id, date.today() - timedelta(days=1))
    db.commit()

    rows = client.get(f"{API}?q=visited", headers=auth(world["owner"])).json()["members"]
    order = [r["full_name"] for r in rows]
    assert order.index("Visited Yesterday") < order.index("Visited Long Ago")
    assert order.index("Visited Long Ago") < order.index("Never Visited")
    assert rows[0]["last_visit_on"] == (date.today() - timedelta(days=1)).isoformat()
    assert rows[-1]["last_visit_on"] is None


# --------------------------------------------------------------- authorization


@pytest.mark.parametrize("actor", ["member_ngk_user", "trainer_ngk_user"])
def test_members_and_trainers_cannot_read_the_roster(client, world, auth, actor):
    assert client.get(API, headers=auth(world[actor])).status_code == 403


def test_roster_needs_authentication(client):
    assert client.get(API).status_code == 401

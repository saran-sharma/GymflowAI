"""Who is in the gym right now.

The rule is the same one occupancy already used — a person is inside when their
most recent event today is a check-in — so the count and the list are derived
together and cannot disagree. That definition is also what makes a duplicate
scan harmless, which is the case worth pinning.
"""

from __future__ import annotations

from app.core.clock import branch_today, now_utc
from app.db.models import AttendanceEvent, EventType, PersonType

API = "/api/v1"


def _event(db, member, branch, kind, minutes_ago):
    from datetime import timedelta

    db.add(
        AttendanceEvent(
            branch_id=branch.id,
            person_type=PersonType.MEMBER,
            user_id=member.user_id,
            event_type=kind,
            method="qr",
            occurred_at=now_utc() - timedelta(minutes=minutes_ago),
            work_date=branch_today(branch.timezone),
        )
    )
    db.commit()


def test_an_empty_gym_says_so_rather_than_erroring(client, world, auth):
    branch = world["branches"]["ngk"]
    body = client.get(
        f"{API}/attendance/inside?branch_id={branch.id}", headers=auth(world["admin"])
    ).json()
    assert body["count"] == 0
    assert body["members"] == []
    assert body["branch_id"] == branch.id


def test_a_checked_in_member_appears_with_their_arrival_time(client, db, world, auth):
    member, branch = world["member_ngk"], world["branches"]["ngk"]
    _event(db, member, branch, EventType.CHECK_IN, 45)

    body = client.get(
        f"{API}/attendance/inside?branch_id={branch.id}", headers=auth(world["admin"])
    ).json()
    assert body["count"] == 1

    row = body["members"][0]
    assert row["member_id"] == member.id
    assert row["full_name"] == "Aditya Rao"
    # Duration is derived from the arrival, so it tracks the clock rather than
    # being stored and going stale.
    assert 44 <= row["minutes_inside"] <= 46


def test_checking_out_removes_them(client, db, world, auth):
    member, branch = world["member_ngk"], world["branches"]["ngk"]
    _event(db, member, branch, EventType.CHECK_IN, 60)
    _event(db, member, branch, EventType.CHECK_OUT, 5)

    body = client.get(
        f"{API}/attendance/inside?branch_id={branch.id}", headers=auth(world["admin"])
    ).json()
    assert body["count"] == 0


def test_a_stale_check_in_with_no_checkout_is_treated_as_left(client, db, world, auth):
    """The access hardware only scans on entry — a visit never gets a
    check-out. Without a freshness cutoff every member who entered this
    morning would show as present until midnight."""
    from app.core.config import settings

    member, branch = world["member_ngk"], world["branches"]["ngk"]
    _event(db, member, branch, EventType.CHECK_IN, settings.occupancy_presence_minutes + 30)

    body = client.get(
        f"{API}/attendance/inside?branch_id={branch.id}", headers=auth(world["admin"])
    ).json()
    assert body["count"] == 0
    assert body["members"] == []

    # The visit still happened today — entries_today is unaffected.
    occ = client.get(f"{API}/branches/occupancy", headers=auth(world["owner"])).json()
    ngk = next(b for b in occ if b["branch_id"] == branch.id)
    assert ngk["inside"] == 0
    assert ngk["entries_today"] == 1


def test_a_check_in_just_inside_the_window_still_counts(client, db, world, auth):
    from app.core.config import settings

    member, branch = world["member_ngk"], world["branches"]["ngk"]
    _event(db, member, branch, EventType.CHECK_IN, settings.occupancy_presence_minutes - 10)
    body = client.get(
        f"{API}/attendance/inside?branch_id={branch.id}", headers=auth(world["admin"])
    ).json()
    assert body["count"] == 1


def test_a_duplicate_check_in_is_still_one_person(client, db, world, auth):
    """Two scans in a row must not read as two people in the building."""
    member, branch = world["member_ngk"], world["branches"]["ngk"]
    _event(db, member, branch, EventType.CHECK_IN, 30)
    _event(db, member, branch, EventType.CHECK_IN, 29)

    body = client.get(
        f"{API}/attendance/inside?branch_id={branch.id}", headers=auth(world["admin"])
    ).json()
    assert body["count"] == 1
    assert len(body["members"]) == 1


def test_returning_after_a_checkout_counts_again(client, db, world, auth):
    member, branch = world["member_ngk"], world["branches"]["ngk"]
    _event(db, member, branch, EventType.CHECK_IN, 300)
    _event(db, member, branch, EventType.CHECK_OUT, 200)
    _event(db, member, branch, EventType.CHECK_IN, 20)

    body = client.get(
        f"{API}/attendance/inside?branch_id={branch.id}", headers=auth(world["admin"])
    ).json()
    assert body["count"] == 1
    assert 19 <= body["members"][0]["minutes_inside"] <= 21


def test_a_trainer_sees_their_own_branch(client, db, world, auth):
    member, branch = world["member_ngk"], world["branches"]["ngk"]
    _event(db, member, branch, EventType.CHECK_IN, 10)

    body = client.get(f"{API}/attendance/inside", headers=auth(world["trainer_ngk_user"])).json()
    assert body["branch_id"] == branch.id
    assert body["count"] == 1


def test_a_member_cannot_see_who_else_is_in_the_gym(client, world, auth):
    """The roster of who is in the building is not a member's business."""
    response = client.get(f"{API}/attendance/inside", headers=auth(world["member_ngk_user"]))
    assert response.status_code == 403


def test_asking_for_another_branch_is_refused_not_filtered(client, world, auth):
    other = world["branches"]["bgh"]
    response = client.get(
        f"{API}/attendance/inside?branch_id={other.id}",
        headers=auth(world["trainer_ngk_user"]),
    )
    assert response.status_code == 403


def test_a_members_visit_at_another_branch_does_not_leak(client, db, world, auth):
    member = world["member_ngk"]
    elsewhere = world["branches"]["bgh"]
    _event(db, member, elsewhere, EventType.CHECK_IN, 15)

    body = client.get(f"{API}/attendance/inside", headers=auth(world["trainer_ngk_user"])).json()
    assert body["count"] == 0


def test_someone_who_sees_every_branch_must_choose_one(client, world, auth):
    """ "The gym" is not a question with one answer for an admin."""
    response = client.get(f"{API}/attendance/inside", headers=auth(world["admin"]))
    assert response.status_code == 400

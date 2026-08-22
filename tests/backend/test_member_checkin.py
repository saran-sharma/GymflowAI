"""The member's own daily "how are you feeling" check-in.

One row per member per day is the whole contract here — a resubmit within
the same day must update, not duplicate, and one member must never be able
to read or write another's answer.
"""

from __future__ import annotations

from datetime import date

from conftest import make_member
from sqlalchemy import select

from app.db.models import MemberCheckIn

API = "/api/v1"


def test_submitting_a_feeling_records_it_for_today(client, world, auth, db):
    headers = auth(world["member_ngk_user"])
    response = client.post(f"{API}/members/me/checkin", json={"feeling": "good"}, headers=headers)
    assert response.status_code == 200
    body = response.json()
    assert body["feeling"] == "good"
    assert body["work_date"] == date.today().isoformat()


def test_a_same_day_resubmit_updates_the_one_row_rather_than_duplicating(client, world, auth, db):
    headers = auth(world["member_ngk_user"])
    client.post(f"{API}/members/me/checkin", json={"feeling": "low"}, headers=headers)
    response = client.post(f"{API}/members/me/checkin", json={"feeling": "great"}, headers=headers)
    assert response.status_code == 200
    assert response.json()["feeling"] == "great"

    rows = db.scalars(
        select(MemberCheckIn).where(MemberCheckIn.member_id == world["member_ngk"].id)
    ).all()
    assert len(rows) == 1
    assert rows[0].feeling.value == "great"


def test_an_unrecognised_feeling_is_rejected(client, world, auth):
    headers = auth(world["member_ngk_user"])
    response = client.post(
        f"{API}/members/me/checkin", json={"feeling": "ecstatic"}, headers=headers
    )
    assert response.status_code == 422


def test_submitting_without_a_token_is_refused(client):
    response = client.post(f"{API}/members/me/checkin", json={"feeling": "good"})
    assert response.status_code == 401


def test_a_non_member_account_is_refused(client, world, auth):
    headers = auth(world["trainer_ngk_user"])
    response = client.post(f"{API}/members/me/checkin", json={"feeling": "good"}, headers=headers)
    assert response.status_code == 403


def test_home_reflects_the_days_answer_once_submitted(client, world, auth):
    headers = auth(world["member_ngk_user"])
    before = client.get(f"{API}/members/me/home", headers=headers).json()
    assert before["today_checkin"] is None

    client.post(f"{API}/members/me/checkin", json={"feeling": "okay"}, headers=headers)

    after = client.get(f"{API}/members/me/home", headers=headers).json()
    assert after["today_checkin"]["feeling"] == "okay"


def test_one_member_cannot_see_or_overwrite_another_members_checkin(client, world, auth, db):
    other, other_user = make_member(db, world["roles"], world["branches"]["ngk"], "Priya Nair")
    db.commit()

    a_headers = auth(world["member_ngk_user"])
    b_headers = auth(other_user)

    client.post(f"{API}/members/me/checkin", json={"feeling": "tired"}, headers=a_headers)

    # B has not answered yet — must not see A's answer as their own.
    b_home = client.get(f"{API}/members/me/home", headers=b_headers).json()
    assert b_home["today_checkin"] is None

    client.post(f"{API}/members/me/checkin", json={"feeling": "great"}, headers=b_headers)

    # Each member's own row is untouched by the other's submission.
    a_home = client.get(f"{API}/members/me/home", headers=a_headers).json()
    assert a_home["today_checkin"]["feeling"] == "tired"
    b_home = client.get(f"{API}/members/me/home", headers=b_headers).json()
    assert b_home["today_checkin"]["feeling"] == "great"

    rows = db.scalars(select(MemberCheckIn)).all()
    assert {r.member_id for r in rows} == {world["member_ngk"].id, other.id}

"""The trainer's own client list and published availability.

Before these endpoints a trainer had no way to see the people they coach:
`/journeys` and `/pt/packages` are both management-only, and a trainer is not
management. What matters most here is the scope — a trainer sees the members
assigned to *them*, not everyone who trains in the same building.
"""

from __future__ import annotations

from datetime import timedelta

import pytest

from app.core.clock import branch_today

API = "/api/v1"


def test_a_trainer_sees_the_clients_assigned_to_them(client, db, world, auth):
    headers = auth(world["trainer_ngk_user"])
    response = client.get(f"{API}/trainers/me/clients", headers=headers)
    assert response.status_code == 200

    rows = response.json()
    assert rows, "the seeded trainer has at least one assigned member"
    names = {row["full_name"] for row in rows}
    assert "Aditya Rao" in names

    for row in rows:
        assert row["member_id"]
        assert row["member_code"]


def test_a_trainer_does_not_see_a_member_who_is_not_theirs(client, db, world, auth):
    """Sharing a branch is not a coaching relationship."""
    member = world["member_ngk"]
    member.assigned_trainer_id = None
    db.commit()

    headers = auth(world["trainer_ngk_user"])
    listed = client.get(f"{API}/trainers/me/clients", headers=headers).json()
    assert all(row["member_id"] != member.id for row in listed)

    detail = client.get(f"{API}/trainers/me/clients/{member.id}", headers=headers)
    assert detail.status_code == 403


def test_a_member_cannot_open_the_trainer_client_list(client, world, auth):
    response = client.get(f"{API}/trainers/me/clients", headers=auth(world["member_ngk_user"]))
    assert response.status_code == 403


def test_client_detail_carries_the_history_a_trainer_needs(client, world, auth):
    member = world["member_ngk"]
    headers = auth(world["trainer_ngk_user"])
    response = client.get(f"{API}/trainers/me/clients/{member.id}", headers=headers)
    assert response.status_code == 200

    body = response.json()
    assert body["client"]["member_id"] == member.id
    # Present as keys even when empty — the screen renders sections, not guesses.
    assert isinstance(body["recent_sessions"], list)
    assert isinstance(body["recent_workouts"], list)
    assert isinstance(body["activity"], list)


def test_client_detail_404s_for_a_member_that_does_not_exist(client, world, auth):
    response = client.get(
        f"{API}/trainers/me/clients/99999", headers=auth(world["trainer_ngk_user"])
    )
    assert response.status_code == 404


# ------------------------------------------------------------- availability


def _publish(client, headers, slot_date, slots):
    return client.post(
        f"{API}/trainers/me/availability",
        headers=headers,
        json={"slot_date": slot_date.isoformat(), "slots": slots},
    )


def test_publishing_availability_returns_the_day(client, world, auth, tomorrow):
    headers = auth(world["trainer_ngk_user"])
    response = _publish(
        client,
        headers,
        tomorrow,
        [
            {"start_time": "06:00:00", "end_time": "07:00:00"},
            {"start_time": "18:00:00", "end_time": "19:00:00", "note": "Evening"},
        ],
    )
    assert response.status_code == 200

    slots = response.json()
    assert [s["start_time"] for s in slots] == ["06:00:00", "18:00:00"]
    assert slots[1]["note"] == "Evening"


def test_publishing_a_day_replaces_it_rather_than_merging(client, world, auth, tomorrow):
    """A trainer editing Tuesday is describing Tuesday, not adding to it."""
    headers = auth(world["trainer_ngk_user"])
    _publish(client, headers, tomorrow, [{"start_time": "06:00:00", "end_time": "07:00:00"}])
    second = _publish(
        client, headers, tomorrow, [{"start_time": "18:00:00", "end_time": "19:00:00"}]
    )

    slots = second.json()
    assert [s["start_time"] for s in slots] == ["18:00:00"]


def test_a_slot_must_end_after_it_starts(client, world, auth, tomorrow):
    headers = auth(world["trainer_ngk_user"])
    response = _publish(
        client, headers, tomorrow, [{"start_time": "18:00:00", "end_time": "18:00:00"}]
    )
    assert response.status_code == 422


def test_a_trainer_can_withdraw_an_unbooked_slot(client, world, auth, tomorrow):
    headers = auth(world["trainer_ngk_user"])
    published = _publish(
        client, headers, tomorrow, [{"start_time": "06:00:00", "end_time": "07:00:00"}]
    ).json()

    removed = client.delete(f"{API}/trainers/me/availability/{published[0]['id']}", headers=headers)
    assert removed.status_code == 200

    remaining = client.get(f"{API}/trainers/me/availability", headers=headers).json()
    assert all(slot["id"] != published[0]["id"] for slot in remaining)


def test_a_member_cannot_publish_availability(client, world, auth, tomorrow):
    response = _publish(
        client,
        auth(world["member_ngk_user"]),
        tomorrow,
        [{"start_time": "06:00:00", "end_time": "07:00:00"}],
    )
    assert response.status_code == 403


@pytest.fixture
def tomorrow():
    """A date the trainer can still publish for — today is already half spent."""
    return branch_today(None) + timedelta(days=1)

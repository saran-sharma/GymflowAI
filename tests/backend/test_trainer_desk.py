"""The trainer's own client list and published availability.

Before these endpoints a trainer had no way to see the people they coach:
`/journeys` and `/pt/packages` are both management-only, and a trainer is not
management. What matters most here is the scope — a trainer sees the members
assigned to *them*, not everyone who trains in the same building.
"""

from __future__ import annotations

from datetime import timedelta

import pytest

from app.core.clock import branch_today, now_utc
from app.services import pt_service

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
    # The member's onboarding answers ride along for the "Fitness profile"
    # section; null until they fill it in.
    assert "intake" in body
    assert body["intake"] is None


def test_client_detail_carries_the_member_intake_when_it_exists(client, db, world, auth):
    from app.db.models import MemberIntake

    member = world["member_ngk"]
    db.add(
        MemberIntake(
            member_id=member.id,
            fitness_goal="Build muscle",
            experience_level="beginner",
            training_frequency_per_week=3,
            preferred_style="strength",
            wants_pt=True,
        )
    )
    db.commit()

    body = client.get(
        f"{API}/trainers/me/clients/{member.id}", headers=auth(world["trainer_ngk_user"])
    ).json()
    assert body["intake"]["fitness_goal"] == "Build muscle"
    assert body["intake"]["experience_level"] == "beginner"
    assert body["intake"]["training_frequency_per_week"] == 3
    assert body["intake"]["preferred_style"] == "strength"
    assert body["intake"]["wants_pt"] is True

    # The owner's generalised member-detail reader carries it too.
    owner_body = client.get(f"{API}/members/{member.id}", headers=auth(world["owner"])).json()
    assert owner_body["intake"]["fitness_goal"] == "Build muscle"


def test_next_pt_session_skips_a_stale_scheduled_session_in_the_past(client, db, world, auth):
    """The trainer's own client-detail view built `next_pt_session` from the
    earliest row still marked SCHEDULED, with no lower bound on its start
    time — so a session that was never transitioned out of SCHEDULED (a
    no-show nobody closed, or just old demo data) sorted first forever, and
    "next session" quietly became "earliest scheduled session ever", however
    far in the past. It must prefer a session that is actually still ahead.
    """
    member = world["member_ngk"]
    package = pt_service.create_package(db, member=member, sessions_total=12)
    stale = pt_service.schedule_session(
        db,
        package=package,
        trainer_id=world["trainer_ngk"].id,
        scheduled_start=now_utc() - timedelta(days=6),
    )
    upcoming = pt_service.schedule_session(
        db,
        package=package,
        trainer_id=world["trainer_ngk"].id,
        scheduled_start=now_utc() + timedelta(days=2),
    )
    db.commit()

    headers = auth(world["trainer_ngk_user"])
    body = client.get(f"{API}/trainers/me/clients/{member.id}", headers=headers).json()

    next_session = body["client"]["next_pt_session"]
    assert next_session is not None
    assert next_session["id"] == upcoming.id
    assert next_session["id"] != stale.id


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

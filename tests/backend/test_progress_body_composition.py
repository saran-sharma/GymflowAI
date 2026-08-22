"""Body composition history: the read model behind Progress and Member
Intelligence, and the API surface built on top of it.

Nothing here imports the real InBody export — rows are inserted directly,
the same way `test_workout_sets.py` builds past sessions, standing in for
whatever a human eventually runs `import_inbody.py --import` against. The
service and API must be correct regardless of how a row got there.
"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

from app.db.models import BodyComposition
from app.services import body_composition_service

API = "/api/v1"


def _reading(db, member, *, days_ago: int, external_ref: str | None = None, **overrides):
    fields = {
        "weight_kg": 80.0,
        "body_fat_pct": 20.0,
        "muscle_mass_kg": 32.0,
        "bmi": 25.0,
        "visceral_fat": 8.0,
        "bmr_kcal": 1700,
        "body_water_pct": 55.0,
    }
    fields.update(overrides)
    row = BodyComposition(
        member_id=member.id,
        branch_id=member.branch_id,
        measured_at=datetime.now(UTC) - timedelta(days=days_ago),
        source="inbody",
        external_ref=external_ref,
        **fields,
    )
    db.add(row)
    db.flush()
    return row


# --------------------------------------------------------------- read model


def test_no_measurements_is_an_empty_history_and_no_latest(db, world):
    member = world["member_ngk"]
    assert body_composition_service.get_body_composition_history(db, member_id=member.id) == []
    assert body_composition_service.get_latest_body_composition(db, member_id=member.id) is None


def test_one_measurement_is_both_the_history_and_the_latest(db, world):
    member = world["member_ngk"]
    _reading(db, member, days_ago=5, external_ref="scan-1")
    db.commit()

    history = body_composition_service.get_body_composition_history(db, member_id=member.id)
    latest = body_composition_service.get_latest_body_composition(db, member_id=member.id)
    assert len(history) == 1
    assert latest is not None
    assert latest.weight_kg == 80.0
    assert history[0].measured_at == latest.measured_at


def test_multiple_measurements_are_chronological_oldest_first(db, world):
    member = world["member_ngk"]
    _reading(db, member, days_ago=20, external_ref="scan-1", weight_kg=82.0)
    _reading(db, member, days_ago=10, external_ref="scan-2", weight_kg=80.5)
    _reading(db, member, days_ago=1, external_ref="scan-3", weight_kg=79.0)
    db.commit()

    history = body_composition_service.get_body_composition_history(db, member_id=member.id)
    assert [r.weight_kg for r in history] == [82.0, 80.5, 79.0]
    assert history[0].measured_at < history[1].measured_at < history[2].measured_at


def test_latest_measurement_is_the_most_recent_by_date_not_insertion_order(db, world):
    member = world["member_ngk"]
    _reading(db, member, days_ago=1, external_ref="scan-recent", weight_kg=79.0)
    _reading(db, member, days_ago=30, external_ref="scan-old", weight_kg=90.0)
    db.commit()

    latest = body_composition_service.get_latest_body_composition(db, member_id=member.id)
    assert latest.weight_kg == 79.0


def test_nullable_fields_pass_through_as_none_not_zero(db, world):
    member = world["member_ngk"]
    _reading(
        db,
        member,
        days_ago=1,
        external_ref="scan-partial",
        body_fat_pct=None,
        visceral_fat=None,
        bmr_kcal=None,
        body_water_pct=None,
    )
    db.commit()

    latest = body_composition_service.get_latest_body_composition(db, member_id=member.id)
    assert latest.weight_kg == 80.0
    assert latest.body_fat_pct is None
    assert latest.visceral_fat is None
    assert latest.bmr_kcal is None
    assert latest.body_water_pct is None


def test_history_limit_returns_the_newest_n_not_the_oldest_n(db, world):
    member = world["member_ngk"]
    for i in range(5):
        _reading(db, member, days_ago=50 - i * 10, external_ref=f"scan-{i}", weight_kg=70.0 + i)
    db.commit()

    history = body_composition_service.get_body_composition_history(
        db, member_id=member.id, limit=2
    )
    assert len(history) == 2
    # Newest two, still oldest-first within that window.
    assert [r.weight_kg for r in history] == [73.0, 74.0]


def test_never_crosses_members(db, world):
    from conftest import make_member

    other, _ = make_member(db, world["roles"], world["branches"]["ngk"], "Someone Else")
    db.commit()
    _reading(db, world["member_ngk"], days_ago=1, external_ref="scan-1")
    db.commit()

    assert body_composition_service.get_body_composition_history(db, member_id=other.id) == []
    assert body_composition_service.get_latest_body_composition(db, member_id=other.id) is None


# --------------------------------------------------------- duplicate handling


def test_a_reimport_with_the_same_external_ref_is_rejected_at_the_db_level(db, world):
    import pytest
    from sqlalchemy.exc import IntegrityError

    member = world["member_ngk"]
    _reading(db, member, days_ago=1, external_ref="dup-scan")
    db.commit()

    # The insert itself fails at ``flush()`` — the duplicate is caught before
    # a second commit is even attempted, exactly the guard a re-run of the
    # same InBody export relies on.
    with pytest.raises(IntegrityError):
        _reading(db, member, days_ago=1, external_ref="dup-scan")
    db.rollback()


# ------------------------------------------------------------------------ API


def test_member_reads_their_own_body_composition_history(client, db, world, auth):
    member = world["member_ngk"]
    _reading(db, member, days_ago=1, external_ref="scan-1")
    db.commit()

    response = client.get(
        f"{API}/journeys/me/progress/body-composition", headers=auth(world["member_ngk_user"])
    )
    assert response.status_code == 200
    body = response.json()
    assert body["latest"]["weight_kg"] == 80.0
    assert len(body["measurements"]) == 1


def test_member_with_no_scans_gets_an_honest_empty_body(client, world, auth):
    response = client.get(
        f"{API}/journeys/me/progress/body-composition", headers=auth(world["member_ngk_user"])
    )
    assert response.status_code == 200
    body = response.json()
    assert body["latest"] is None
    assert body["measurements"] == []


def test_a_trainer_reads_their_clients_body_composition(client, db, world, auth):
    member = world["member_ngk"]
    _reading(db, member, days_ago=1, external_ref="scan-1")
    db.commit()

    response = client.get(
        f"{API}/journeys/members/{member.id}/progress/body-composition",
        headers=auth(world["trainer_ngk_user"]),
    )
    assert response.status_code == 200
    assert response.json()["latest"]["weight_kg"] == 80.0


def test_an_owner_reads_any_members_body_composition(client, db, world, auth):
    member = world["member_ngk"]
    _reading(db, member, days_ago=1, external_ref="scan-1")
    db.commit()

    response = client.get(
        f"{API}/journeys/members/{member.id}/progress/body-composition",
        headers=auth(world["owner"]),
    )
    assert response.status_code == 200
    assert response.json()["latest"]["weight_kg"] == 80.0


def test_a_trainer_at_another_branch_is_refused(client, db, world, auth):
    member = world["member_ngk"]
    _reading(db, member, days_ago=1, external_ref="scan-1")
    db.commit()

    from conftest import make_trainer

    other_trainer, other_trainer_user = make_trainer(
        db, world["roles"], world["branches"]["bgh"], "Someone Else"
    )
    db.commit()

    response = client.get(
        f"{API}/journeys/members/{member.id}/progress/body-composition",
        headers=auth(other_trainer_user),
    )
    assert response.status_code == 403


def test_a_member_cannot_read_another_members_body_composition(client, db, world, auth):
    from conftest import make_member

    other, _ = make_member(db, world["roles"], world["branches"]["ngk"], "Someone Else")
    db.commit()
    _reading(db, other, days_ago=1, external_ref="scan-1")
    db.commit()

    response = client.get(
        f"{API}/journeys/members/{other.id}/progress/body-composition",
        headers=auth(world["member_ngk_user"]),
    )
    assert response.status_code == 403


def test_units_and_values_round_trip_unchanged(client, db, world, auth):
    member = world["member_ngk"]
    _reading(
        db,
        member,
        days_ago=1,
        external_ref="scan-1",
        weight_kg=78.4,
        body_fat_pct=18.7,
        muscle_mass_kg=32.1,
        bmi=24.6,
        visceral_fat=8.0,
        bmr_kcal=1650,
        body_water_pct=54.3,
    )
    db.commit()

    response = client.get(
        f"{API}/journeys/me/progress/body-composition", headers=auth(world["member_ngk_user"])
    )
    latest = response.json()["latest"]
    assert latest["weight_kg"] == 78.4
    assert latest["body_fat_pct"] == 18.7
    assert latest["muscle_mass_kg"] == 32.1
    assert latest["bmi"] == 24.6
    assert latest["visceral_fat"] == 8.0
    assert latest["bmr_kcal"] == 1650
    assert latest["body_water_pct"] == 54.3
    assert latest["source"] == "inbody"

"""General Training → PT: eligibility, the trainer's decision, and the record of it.

The rule this file exists to hold is that **nothing converts a member
automatically**. Reaching the end of General Training raises an alert and stops.
A member's programme changes because a trainer decided it should, after a
conversation the system did not witness — so the conversion is an explicit,
confirmed, attributed act, and the tests below are mostly about what does *not*
happen without one.
"""

from __future__ import annotations

from datetime import date, timedelta

import pytest
from conftest import make_member
from sqlalchemy import select

from app.db.models import Alert, AlertStatus, AuditLog, PackageStatus, PTPackage
from app.services import alert_service, journey_service, pt_service

BASE = "/api/v1"


@pytest.fixture
def finished(db, world):
    """A member who has finished General Training and has no PT package."""
    member = world["member_ngk"]
    journey = journey_service.start_journey(
        db, member=member, start_date=date.today() - timedelta(days=50)
    )
    journey_service.settle_journey(db, journey)
    db.commit()
    return journey


def review_alerts(db, *, status=AlertStatus.OPEN):
    return list(
        db.scalars(
            select(Alert).where(
                Alert.key == alert_service.JOURNEY_PT_REVIEW, Alert.status == status
            )
        ).all()
    )


# ------------------------------------------------------------- eligibility


def test_finishing_general_training_alerts_the_members_own_trainer(db, world, finished):
    """The trainer owns the decision, so the trainer gets the alert."""
    alerts = review_alerts(db)
    assert len(alerts) == 1
    alert = alerts[0]

    assert alert.target_user_id == world["trainer_ngk_user"].id
    assert "Aditya Rao" in alert.title
    assert alert.action_route == f"/trainer/client/{world['member_ngk'].id}"


def test_the_alert_carries_the_facts_the_trainer_needs_to_decide(db, world, finished):
    payload = review_alerts(db)[0].payload

    assert payload["member_id"] == world["member_ngk"].id
    assert payload["member_name"] == "Aditya Rao"
    assert payload["training_type"] == "general_training"
    assert payload["reason"] == "general_training_complete"
    # Real progress, not a placeholder.
    assert "workouts_completed" in payload
    assert "consistency_pct" in payload


def test_a_member_still_training_is_not_offered_for_review(db, world):
    journey_service.start_journey(
        db, member=world["member_ngk"], start_date=date.today() - timedelta(days=5)
    )
    db.commit()
    assert review_alerts(db) == []


def test_a_member_with_no_trainer_raises_nothing_rather_than_alerting_nobody(db, world):
    member, _ = make_member(db, world["roles"], world["branches"]["ngk"], "Unassigned Member")
    journey = journey_service.start_journey(
        db, member=member, start_date=date.today() - timedelta(days=50)
    )
    journey_service.settle_journey(db, journey)
    db.commit()

    assert [a for a in review_alerts(db) if a.entity_id == str(member.id)] == []


def test_a_member_already_on_pt_is_not_offered_for_review(db, world, finished):
    """And an alert raised before their package existed is withdrawn."""
    assert len(review_alerts(db)) == 1

    pt_service.create_package(
        db, member=world["member_ngk"], sessions_total=12, journey_id=finished.id
    )
    db.commit()

    assert review_alerts(db) == []


# --------------------------------------------------------------- authority


def test_a_member_cannot_convert_themselves(client, world, auth, finished):
    response = client.post(
        f"{BASE}/pt/members/{world['member_ngk'].id}/convert",
        json={"sessions_total": 12, "confirm": True},
        headers=auth(world["member_ngk_user"]),
    )
    assert response.status_code == 403


def test_a_trainer_at_another_branch_cannot_convert(client, world, auth, finished):
    response = client.post(
        f"{BASE}/pt/members/{world['member_ngk'].id}/convert",
        json={"sessions_total": 12, "confirm": True},
        headers=auth(world["trainer_bgh_user"]),
    )
    assert response.status_code == 403


def test_conversion_requires_an_explicit_confirmation(client, db, world, auth, finished):
    """A mistyped route or a double-tap must not change a member's programme."""
    response = client.post(
        f"{BASE}/pt/members/{world['member_ngk'].id}/convert",
        json={"sessions_total": 12, "confirm": False},
        headers=auth(world["trainer_ngk_user"]),
    )
    assert response.status_code == 400
    assert response.json()["detail"]["code"] == "confirmation_required"
    assert db.scalar(select(PTPackage)) is None


def test_nothing_converts_a_member_on_its_own(db, world, finished):
    """The whole product rule, in one assertion: finishing is not converting."""
    from app.services import automation_service

    automation_service.run_all(db)
    db.commit()

    assert db.scalar(select(PTPackage)) is None
    assert finished.pt_converted is False


# -------------------------------------------------------------- converting


def test_a_trainer_converts_their_member(client, db, world, auth, finished):
    response = client.post(
        f"{BASE}/pt/members/{world['member_ngk'].id}/convert",
        json={"sessions_total": 12, "confirm": True, "note": "Ready for a strength block."},
        headers=auth(world["trainer_ngk_user"]),
    )
    assert response.status_code == 201, response.text
    body = response.json()

    assert body["member_name"] == "Aditya Rao"
    assert body["trainer_name"] == "Vikas Menon"
    assert body["from_training_type"] == "general_training"
    assert body["to_training_type"] == "pt"
    assert body["package"]["sessions_total"] == 12
    assert body["package"]["status"] == "active"


def test_conversion_is_persisted_against_the_journey(client, db, world, auth, finished):
    client.post(
        f"{BASE}/pt/members/{world['member_ngk'].id}/convert",
        json={"sessions_total": 12, "confirm": True},
        headers=auth(world["trainer_ngk_user"]),
    )
    db.expire_all()

    package = db.scalar(select(PTPackage))
    assert package is not None
    assert package.origin == "trainer_conversion"
    assert package.journey_id == finished.id
    assert package.status is PackageStatus.ACTIVE
    assert db.get(type(finished), finished.id).pt_converted is True


def test_a_package_size_the_branch_does_not_sell_is_refused(client, db, world, auth, finished):
    """Conversion goes through the same package rules as every other sale —
    a trainer cannot invent a package size at the point of converting."""
    allowed = pt_service.package_options(db, world["member_ngk"].branch_id)
    unsupported = next(n for n in range(1, 101) if n not in allowed)

    response = client.post(
        f"{BASE}/pt/members/{world['member_ngk'].id}/convert",
        json={"sessions_total": unsupported, "confirm": True},
        headers=auth(world["trainer_ngk_user"]),
    )
    assert response.status_code == 400
    assert db.scalar(select(PTPackage)) is None


def test_the_relationship_with_the_trainer_survives_the_conversion(
    client, db, world, auth, finished
):
    client.post(
        f"{BASE}/pt/members/{world['member_ngk'].id}/convert",
        json={"sessions_total": 12, "confirm": True},
        headers=auth(world["trainer_ngk_user"]),
    )
    db.expire_all()

    package = db.scalar(select(PTPackage))
    assert package.trainer_id == world["trainer_ngk"].id
    assert db.get(type(world["member_ngk"]), world["member_ngk"].id).assigned_trainer_id == (
        world["trainer_ngk"].id
    )


def test_converting_twice_is_refused_rather_than_silently_ignored(
    client, db, world, auth, finished
):
    """Two callers converting the same member means one is on a stale screen."""
    first = client.post(
        f"{BASE}/pt/members/{world['member_ngk'].id}/convert",
        json={"sessions_total": 12, "confirm": True},
        headers=auth(world["trainer_ngk_user"]),
    )
    assert first.status_code == 201

    second = client.post(
        f"{BASE}/pt/members/{world['member_ngk'].id}/convert",
        json={"sessions_total": 12, "confirm": True},
        headers=auth(world["trainer_ngk_user"]),
    )
    assert second.status_code == 409
    assert second.json()["detail"]["code"] == "already_pt"
    assert len(db.scalars(select(PTPackage)).all()) == 1


def test_the_review_alert_closes_once_it_has_been_acted_on(client, db, world, auth, finished):
    assert len(review_alerts(db)) == 1

    client.post(
        f"{BASE}/pt/members/{world['member_ngk'].id}/convert",
        json={"sessions_total": 12, "confirm": True},
        headers=auth(world["trainer_ngk_user"]),
    )
    db.expire_all()

    assert review_alerts(db) == []


# ------------------------------------------------------------ owner update


def test_the_owner_is_told_who_moved_whom(client, db, world, auth, finished):
    client.post(
        f"{BASE}/pt/members/{world['member_ngk'].id}/convert",
        json={"sessions_total": 12, "confirm": True, "note": "Strength block."},
        headers=auth(world["trainer_ngk_user"]),
    )
    db.expire_all()

    alert = db.scalar(select(Alert).where(Alert.key == alert_service.PT_CONVERTED))
    assert alert is not None
    assert "Aditya Rao" in alert.title
    assert "Vikas Menon" in alert.body

    payload = alert.payload
    assert payload["member_id"] == world["member_ngk"].id
    assert payload["trainer_id"] == world["trainer_ngk"].id
    assert payload["from_training_type"] == "general_training"
    assert payload["to_training_type"] == "pt"
    assert payload["converted_at"]


def test_the_owner_can_read_the_conversion_over_http(client, db, world, auth, finished):
    client.post(
        f"{BASE}/pt/members/{world['member_ngk'].id}/convert",
        json={"sessions_total": 12, "confirm": True},
        headers=auth(world["trainer_ngk_user"]),
    )

    alerts = client.get(f"{BASE}/alerts", headers=auth(world["owner"])).json()
    converted = [a for a in alerts if a["key"] == alert_service.PT_CONVERTED]
    assert len(converted) == 1
    assert "Aditya Rao" in converted[0]["title"]


def test_the_conversion_is_audited_against_the_trainer(client, db, world, auth, finished):
    client.post(
        f"{BASE}/pt/members/{world['member_ngk'].id}/convert",
        json={"sessions_total": 12, "confirm": True},
        headers=auth(world["trainer_ngk_user"]),
    )
    db.expire_all()

    entry = db.scalar(select(AuditLog).where(AuditLog.action == "pt.convert"))
    assert entry is not None
    assert entry.actor_user_id == world["trainer_ngk_user"].id
    assert entry.details["from"] == "general_training"
    assert entry.details["to"] == "pt"


# ------------------------------------------------- what the member is told


def test_the_member_is_never_told_about_the_45_days(db, world, finished):
    """The 45 is a business rule about trainer review, not a member's goal."""
    member_alerts = db.scalars(
        select(Alert).where(Alert.target_user_id == world["member_ngk_user"].id)
    ).all()

    for alert in member_alerts:
        assert "45" not in alert.title
        assert "45" not in alert.body

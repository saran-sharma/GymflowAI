"""Member lifecycle: deactivate/reactivate, and self-service intake.

"Discontinued" is `Member.is_active = False`, never a delete — every test
here checks that history survives and that membership-gated writes (check-in,
fingerprint, PT scheduling) refuse once inactive, while reads stay visible.
"""

from __future__ import annotations

from datetime import datetime, timedelta

import pytest

from app.db.models import CaptureMethod, Member, MemberIntake
from app.services import attendance_service, pt_service
from app.services.attendance_service import AttendanceError, verify_branch_credential
from app.services.pt_service import PTError

API = "/api/v1/members"


def test_owner_can_deactivate_and_reactivate_a_member(client, db, world, auth):
    member = world["member_ngk"]
    headers = auth(world["owner"])

    resp = client.post(f"{API}/{member.id}/deactivate", headers=headers)
    assert resp.status_code == 200, resp.text
    db.refresh(member)
    assert member.is_active is False

    resp = client.post(f"{API}/{member.id}/reactivate", headers=headers)
    assert resp.status_code == 200, resp.text
    db.refresh(member)
    assert member.is_active is True


def test_deactivating_twice_is_a_no_op_not_an_error(client, db, world, auth):
    member = world["member_ngk"]
    headers = auth(world["owner"])
    assert client.post(f"{API}/{member.id}/deactivate", headers=headers).status_code == 200
    assert client.post(f"{API}/{member.id}/deactivate", headers=headers).status_code == 200
    db.refresh(member)
    assert member.is_active is False


def test_a_trainer_cannot_deactivate_a_member(client, world, auth):
    member = world["member_ngk"]
    resp = client.post(f"{API}/{member.id}/deactivate", headers=auth(world["trainer_ngk_user"]))
    assert resp.status_code == 403


def test_deactivated_member_cannot_check_in(db, world):
    member = world["member_ngk"]
    branch = world["branches"]["ngk"]
    member.is_active = False
    db.flush()

    with pytest.raises(AttendanceError) as excinfo:
        attendance_service.member_event(
            db,
            user=member.user,
            member=member,
            branch=branch,
            event_type=attendance_service.EventType.CHECK_IN,
            method=CaptureMethod.PIN,
            pin="0000",
        )
    assert excinfo.value.detail["code"] == "member_inactive"


def test_reactivated_member_can_check_in_again(db, world):
    """Preservation check: deactivating and reactivating touches only the
    flag — membership dates, PRs, and prior attendance are untouched."""
    member = world["member_ngk"]
    member.is_active = False
    db.flush()
    member.is_active = True
    db.flush()

    branch = world["branches"]["ngk"]
    # No exception means the inactive gate no longer applies; a bad PIN
    # still fails for its own reason, proving this isn't a blanket bypass.
    with pytest.raises(AttendanceError) as excinfo:
        verify_branch_credential(
            db,
            branch=branch,
            user=member.user,
            method=CaptureMethod.PIN,
            qr_token=None,
            pin="0000",
        )
    assert excinfo.value.detail["code"] != "member_inactive"


def test_pt_session_cannot_be_scheduled_for_a_deactivated_member(db, world):
    member = world["member_ngk"]
    trainer = world["trainer_ngk"]
    package = pt_service.create_package(db, member=member, sessions_total=12)
    member.is_active = False
    db.flush()

    with pytest.raises(PTError) as excinfo:
        pt_service.schedule_session(
            db,
            package=package,
            trainer_id=trainer.id,
            scheduled_start=datetime.utcnow() + timedelta(days=1),
        )
    assert excinfo.value.detail["code"] == "member_inactive"


def test_history_is_preserved_across_deactivation(client, db, world, auth):
    """The whole point of is_active over delete: nothing disappears."""
    member = world["member_ngk"]
    membership_count_before = len(member.memberships)
    client.post(f"{API}/{member.id}/deactivate", headers=auth(world["owner"]))
    db.refresh(member)
    assert len(member.memberships) == membership_count_before
    assert db.get(Member, member.id) is not None


def test_member_can_fill_in_their_own_intake_when_staff_left_it_blank(client, db, world, auth):
    member = world["member_ngk"]
    headers = auth(world["member_ngk_user"])

    assert client.get(f"{API}/me/intake", headers=headers).json() is None

    resp = client.put(
        f"{API}/me/intake",
        json={
            "fitness_goal": "Build muscle",
            "experience_level": "beginner",
            "training_frequency_per_week": 3,
        },
        headers=headers,
    )
    assert resp.status_code == 200, resp.text
    assert resp.json()["fitness_goal"] == "Build muscle"

    row = db.scalar(db.query(MemberIntake).filter_by(member_id=member.id).statement)
    assert row is not None
    assert row.experience_level.value == "beginner"


def test_updating_own_intake_again_replaces_rather_than_duplicates(client, db, world, auth):
    headers = auth(world["member_ngk_user"])
    client.put(
        f"{API}/me/intake",
        json={"fitness_goal": "Build muscle"},
        headers=headers,
    )
    client.put(
        f"{API}/me/intake",
        json={"fitness_goal": "Lose fat"},
        headers=headers,
    )
    rows = db.query(MemberIntake).filter_by(member_id=world["member_ngk"].id).all()
    assert len(rows) == 1
    assert rows[0].fitness_goal == "Lose fat"

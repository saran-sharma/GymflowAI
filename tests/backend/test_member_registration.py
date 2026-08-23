"""POST /members — registering a new member.

Before this, GymFlow had no runtime way to create a member at all: only the
demo seeder ever produced one. This is the one staff-facing exception to the
"members are self-service only" shape of `app/api/v1/members.py`.
"""

from __future__ import annotations

from app.db.models import Member, MemberIntake, Membership

API = "/api/v1/members"


def _payload(**overrides):
    body = {
        "full_name": "Neha Kulkarni",
        "email": "neha.kulkarni@example.com",
        "phone": "+91 98765 43210",
        "password": "FreshStart2026!",
        "branch_id": None,
        "plan_name": "Monthly",
    }
    body.update(overrides)
    return body


def test_owner_registers_a_member_with_a_complete_intake(client, db, world, auth):
    branch = world["branches"]["ngk"]
    payload = _payload(
        branch_id=branch.id,
        plan_name="Elite Annual + PT",
        intake={
            "fitness_goal": "Lose fat, keep strength",
            "experience_level": "intermediate",
            "training_frequency_per_week": 4,
            "preferred_style": "strength",
            "preferred_time": "evening",
            "wants_pt": True,
            "limitations": "Old knee injury, avoid deep squats",
            "contact_preference": "whatsapp",
        },
    )
    response = client.post(API, json=payload, headers=auth(world["owner"]))
    assert response.status_code == 201, response.text
    body = response.json()

    assert body["full_name"] == "Neha Kulkarni"
    assert body["email"] == "neha.kulkarni@example.com"
    assert body["member_code"].startswith(branch.code)
    assert body["membership"]["plan_name"] == "Elite Annual + PT"
    assert body["membership"]["pt_sessions_total"] == 12
    assert body["membership"]["status"] == "active"
    assert body["intake"]["experience_level"] == "intermediate"
    assert body["intake"]["wants_pt"] is True
    assert body["intake"]["limitations"] == "Old knee injury, avoid deep squats"

    member = db.get(Member, body["member_id"])
    assert member is not None
    assert member.branch_id == branch.id
    membership = db.query(Membership).filter(Membership.member_id == member.id).one()
    assert (membership.ends_on - membership.starts_on).days == 365
    intake = db.query(MemberIntake).filter(MemberIntake.member_id == member.id).one()
    assert intake.preferred_style.value == "strength"


def test_registration_without_intake_leaves_it_null(client, world, auth):
    branch = world["branches"]["ngk"]
    response = client.post(
        API,
        json=_payload(branch_id=branch.id, email="no.intake@example.com"),
        headers=auth(world["owner"]),
    )
    assert response.status_code == 201, response.text
    assert response.json()["intake"] is None


def test_monthly_plan_gets_a_thirty_day_membership_with_no_pt(client, world, auth):
    branch = world["branches"]["ngk"]
    response = client.post(
        API,
        json=_payload(branch_id=branch.id, email="monthly.plan@example.com", plan_name="Monthly"),
        headers=auth(world["owner"]),
    )
    assert response.status_code == 201, response.text
    membership = response.json()["membership"]
    assert membership["pt_sessions_total"] == 0


def test_an_unknown_plan_is_rejected(client, world, auth):
    branch = world["branches"]["ngk"]
    response = client.post(
        API,
        json=_payload(branch_id=branch.id, email="badplan@example.com", plan_name="Lifetime VIP"),
        headers=auth(world["owner"]),
    )
    assert response.status_code == 400
    assert "Unknown plan" in response.json()["detail"]


def test_a_duplicate_email_is_rejected(client, world, auth):
    branch = world["branches"]["ngk"]
    existing_email = world["member_ngk_user"].email
    response = client.post(
        API,
        json=_payload(branch_id=branch.id, email=existing_email),
        headers=auth(world["owner"]),
    )
    assert response.status_code == 409


def test_a_branch_manager_can_register_a_member_at_their_own_branch(client, world, auth):
    branch = world["branches"]["ngk"]
    response = client.post(
        API,
        json=_payload(branch_id=branch.id, email="ngk.manager.reg@example.com"),
        headers=auth(world["manager_ngk"]),
    )
    assert response.status_code == 201, response.text


def test_a_branch_manager_cannot_register_a_member_at_another_branch(client, world, auth):
    other_branch = world["branches"]["bgh"]
    response = client.post(
        API,
        json=_payload(branch_id=other_branch.id, email="cross.branch@example.com"),
        headers=auth(world["manager_ngk"]),
    )
    assert response.status_code == 403


def test_a_trainer_cannot_register_a_member(client, world, auth):
    branch = world["branches"]["ngk"]
    response = client.post(
        API,
        json=_payload(branch_id=branch.id, email="trainer.attempt@example.com"),
        headers=auth(world["trainer_ngk_user"]),
    )
    assert response.status_code == 403


def test_the_new_member_can_immediately_log_in(client, world, auth):
    branch = world["branches"]["ngk"]
    payload = _payload(branch_id=branch.id, email="login.check@example.com")
    response = client.post(API, json=payload, headers=auth(world["owner"]))
    assert response.status_code == 201, response.text

    login = client.post(
        "/api/v1/auth/login",
        json={"email": payload["email"], "password": payload["password"]},
    )
    assert login.status_code == 200, login.text

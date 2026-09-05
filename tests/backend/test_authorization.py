"""Role permissions and branch isolation.

Branch isolation is the property most worth protecting: a Boganhalli manager
must never see a Nagalkeni trainer, whichever endpoint they come in through.
"""

from __future__ import annotations

import pytest


def ids(payload) -> set:
    return {row["id"] for row in payload}


# ------------------------------------------------------------------- owner


def test_owner_sees_every_branch(client, world, auth):
    response = client.get("/api/v1/branches", headers=auth(world["owner"]))
    assert response.status_code == 200
    assert {b["code"] for b in response.json()} == {"SLAM-NGK", "SLAM-BGH", "SLAM-KDG"}


def test_owner_sees_every_trainer(client, world, auth):
    response = client.get("/api/v1/trainers", headers=auth(world["owner"]))
    assert {t["full_name"] for t in response.json()} == {"Vikas Menon", "Sneha Iyer"}


def test_owner_dashboard_covers_all_three_branches(client, world, auth):
    body = client.get("/api/v1/reports/dashboard", headers=auth(world["owner"])).json()
    assert len(body["branches"]) == 3
    assert body["total_trainers"] == 2


# --------------------------------------------------------- branch manager


def test_manager_sees_only_their_own_branch(client, world, auth):
    response = client.get("/api/v1/branches", headers=auth(world["manager_bgh"]))
    assert [b["code"] for b in response.json()] == ["SLAM-BGH"]


def test_manager_cannot_read_another_branch_directly(client, world, auth):
    other = world["branches"]["ngk"].id
    response = client.get(f"/api/v1/branches/{other}", headers=auth(world["manager_bgh"]))
    assert response.status_code == 403


def test_manager_cannot_read_another_branchs_trainer(client, world, auth):
    foreign = world["trainer_ngk"].id
    response = client.get(f"/api/v1/trainers/{foreign}", headers=auth(world["manager_bgh"]))
    assert response.status_code == 403


def test_manager_cannot_filter_their_way_into_another_branch(client, world, auth):
    """A ?branch_id= pointing outside the manager's branch is refused, not ignored."""
    other = world["branches"]["ngk"].id
    response = client.get(f"/api/v1/trainers?branch_id={other}", headers=auth(world["manager_bgh"]))
    assert response.status_code == 403


def test_manager_dashboard_shows_only_their_branch(client, world, auth):
    body = client.get("/api/v1/reports/dashboard", headers=auth(world["manager_bgh"])).json()
    assert [b["branch_code"] for b in body["branches"]] == ["SLAM-BGH"]


def test_manager_cannot_change_incentive_rules(client, world, auth, db):
    from sqlalchemy import select

    from app.db.models import IncentiveRule

    rule = db.scalar(select(IncentiveRule))
    response = client.patch(
        f"/api/v1/incentives/rules/{rule.id}",
        json={"min_punctuality_pct": 50},
        headers=auth(world["manager_bgh"]),
    )
    assert response.status_code == 403


def test_manager_cannot_read_the_audit_trail(client, world, auth):
    assert (
        client.get("/api/v1/reports/audit", headers=auth(world["manager_bgh"])).status_code == 403
    )


# ----------------------------------------------------------------- trainer


def test_trainer_sees_only_their_own_row(client, world, auth):
    response = client.get("/api/v1/trainers", headers=auth(world["trainer_ngk_user"]))
    assert [t["full_name"] for t in response.json()] == ["Vikas Menon"]


def test_trainer_cannot_open_another_trainer(client, world, auth):
    other = world["trainer_bgh"].id
    response = client.get(f"/api/v1/trainers/{other}", headers=auth(world["trainer_ngk_user"]))
    assert response.status_code == 403


def test_trainer_cannot_read_another_trainers_attendance(client, world, auth):
    other = world["trainer_bgh"].id
    response = client.get(
        f"/api/v1/trainers/{other}/attendance", headers=auth(world["trainer_ngk_user"])
    )
    assert response.status_code == 403


def test_trainer_can_read_their_own_record(client, world, auth):
    own = world["trainer_ngk"].id
    response = client.get(f"/api/v1/trainers/{own}", headers=auth(world["trainer_ngk_user"]))
    assert response.status_code == 200
    assert response.json()["trainer"]["full_name"] == "Vikas Menon"


def test_trainer_cannot_open_the_owner_dashboard(client, world, auth):
    response = client.get("/api/v1/reports/dashboard", headers=auth(world["trainer_ngk_user"]))
    assert response.status_code == 403


def test_trainer_cannot_display_the_branch_qr(client, world, auth):
    """The QR proves presence at the branch; a trainer's own phone must not serve it."""
    branch = world["branches"]["ngk"].id
    response = client.get(
        f"/api/v1/branches/{branch}/checkin-qr", headers=auth(world["trainer_ngk_user"])
    )
    assert response.status_code == 403


def test_trainer_cannot_edit_their_own_roster(client, world, auth):
    own = world["trainer_ngk"].id
    response = client.put(
        f"/api/v1/trainers/{own}/shifts",
        json=[{"weekday": 0, "start_time": "06:00:00", "end_time": "23:00:00"}],
        headers=auth(world["trainer_ngk_user"]),
    )
    assert response.status_code == 403


def test_trainer_cannot_correct_attendance(client, world, auth, db):
    from app.core.clock import branch_today
    from app.services import attendance_service

    branch = world["branches"]["ngk"]
    record = attendance_service.get_or_create_day(
        db, world["trainer_ngk"], branch, branch_today(branch.timezone)
    )
    db.commit()

    response = client.post(
        f"/api/v1/attendance/{record.id}/correct",
        json={"check_in_at": "2026-08-12T12:30:00Z", "reason": "self-serve"},
        headers=auth(world["trainer_ngk_user"]),
    )
    assert response.status_code == 403


# ------------------------------------------------------------------ member


def test_member_sees_only_their_own_membership(client, world, auth):
    response = client.get("/api/v1/members/me", headers=auth(world["member_ngk_user"]))
    assert response.status_code == 200
    assert response.json()["full_name"] == "Aditya Rao"


def test_member_cannot_open_the_owner_dashboard(client, world, auth):
    assert (
        client.get("/api/v1/reports/dashboard", headers=auth(world["member_ngk_user"])).status_code
        == 403
    )


def test_member_cannot_list_users(client, world, auth):
    assert client.get("/api/v1/users", headers=auth(world["member_ngk_user"])).status_code == 403


def test_member_cannot_use_the_trainer_check_in(client, world, auth):
    response = client.post(
        "/api/v1/attendance/check-in",
        json={"branch_id": world["branches"]["ngk"].id, "method": "pin", "pin": "135790"},
        headers=auth(world["member_ngk_user"]),
    )
    assert response.status_code == 403


def test_member_sees_only_their_own_branchs_trainers(client, world, auth):
    """A member's trainer list is their branch's, never the whole chain."""
    response = client.get("/api/v1/trainers", headers=auth(world["member_ngk_user"]))
    assert response.status_code == 200
    assert {t["branch_name"] for t in response.json()} == {"SLAM Nagalkeni"}


@pytest.mark.parametrize(
    "path",
    [
        "/api/v1/trainers/{tid}",
        "/api/v1/trainers/{tid}/shifts",
        "/api/v1/trainers/{tid}/attendance",
    ],
)
def test_member_cannot_read_trainer_discipline_data(client, world, auth, path):
    """A same-branch member must not reach a trainer's punctuality / absence /
    incentive figures or roster — the parallel performance.py and sessions.py
    endpoints already refuse members, and these carry the same class of data.
    """
    tid = world["trainer_ngk"].id
    response = client.get(path.format(tid=tid), headers=auth(world["member_ngk_user"]))
    assert response.status_code == 403


# ------------------------------------------------------------ super admin


def test_super_admin_can_administer_settings(client, world, auth):
    response = client.put(
        "/api/v1/users/settings/shift.grace_minutes",
        json={"value": 15},
        headers=auth(world["admin"]),
    )
    assert response.status_code == 200
    assert response.json()["value"] == 15


@pytest.mark.parametrize("actor", ["manager_bgh", "trainer_ngk_user", "member_ngk_user"])
def test_only_admins_can_change_settings(client, world, auth, actor):
    response = client.put(
        "/api/v1/users/settings/shift.grace_minutes",
        json={"value": 60},
        headers=auth(world[actor]),
    )
    assert response.status_code == 403

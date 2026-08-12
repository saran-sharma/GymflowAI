"""End-to-end journeys, walked exactly as the mobile app walks them.

These are the two flows V1 is judged on. They go through HTTP only — no service
functions are called directly — so a break anywhere between the router and the
database shows up here.
"""

from __future__ import annotations

from datetime import datetime
from zoneinfo import ZoneInfo

from app.core import clock
from app.core.clock import UTC

IST = ZoneInfo("Asia/Kolkata")
PIN = "135790"


def ist(hour: int, minute: int, day: int = 12) -> datetime:
    return datetime(2026, 8, day, hour, minute, tzinfo=IST).astimezone(UTC)


def test_trainer_journey_login_shift_check_in_history_check_out(client, world, auth):
    """Login → view shift → check in → view attendance → check out."""
    headers = auth(world["trainer_ngk_user"])
    branch_id = world["branches"]["ngk"].id

    # 1. Open the app just before the shift.
    clock.freeze(ist(17, 55))
    today = client.get("/api/v1/attendance/me/today", headers=headers)
    assert today.status_code == 200
    home = today.json()
    assert home["trainer"]["full_name"] == "Vikas Menon"
    assert home["trainer"]["branch_name"] == "SLAM Nagalkeni"
    assert home["shift_label"] == "18:00 – 21:00"
    assert home["can_check_in"] is True

    # 2. Check in, four minutes past the hour and inside the grace window.
    clock.freeze(ist(18, 4))
    checked_in = client.post(
        "/api/v1/attendance/check-in",
        json={"branch_id": branch_id, "method": "pin", "pin": PIN},
        headers=headers,
    )
    assert checked_in.status_code == 200
    assert checked_in.json()["status"] == "on_time"
    assert checked_in.json()["message"] == "Checked in on time."

    # 3. The home screen now offers check-out instead.
    home = client.get("/api/v1/attendance/me/today", headers=headers).json()
    assert (home["can_check_in"], home["can_check_out"]) == (False, True)

    # 4. Own attendance history shows today.
    clock.freeze(ist(19, 0))
    history = client.get("/api/v1/attendance/me/history", headers=headers).json()
    assert len(history) == 1
    assert history[0]["status"] == "on_time"
    assert history[0]["check_out_at"] is None

    # 5. Check out at the end of the shift.
    clock.freeze(ist(21, 0))
    checked_out = client.post(
        "/api/v1/attendance/check-out",
        json={"branch_id": branch_id, "method": "pin", "pin": PIN},
        headers=headers,
    )
    assert checked_out.status_code == 200
    body = checked_out.json()
    assert body["status"] == "completed"
    assert body["worked_minutes"] == 176

    # 6. And their month reads back with the shift counted.
    incentive = client.get("/api/v1/incentives/me", headers=headers).json()
    assert incentive["completed_shifts"] == 1
    assert incentive["punctuality_pct"] == 100.0
    assert incentive["disclaimer"].startswith("Final payroll")


def test_owner_journey_branches_to_trainer_to_incentive(client, world, auth):
    """Login → all branches → open branch → open trainer → attendance → incentive."""
    trainer_headers = auth(world["trainer_ngk_user"])
    owner_headers = auth(world["owner"])
    branch_id = world["branches"]["ngk"].id

    # Give the owner something to look at: one on-time day, one late day.
    clock.freeze(ist(18, 3, day=11))
    client.post(
        "/api/v1/attendance/check-in",
        json={"branch_id": branch_id, "method": "pin", "pin": PIN},
        headers=trainer_headers,
    )
    clock.freeze(ist(21, 0, day=11))
    client.post(
        "/api/v1/attendance/check-out",
        json={"branch_id": branch_id, "method": "pin", "pin": PIN},
        headers=trainer_headers,
    )

    clock.freeze(ist(18, 35, day=12))
    client.post(
        "/api/v1/attendance/check-in",
        json={"branch_id": branch_id, "method": "pin", "pin": PIN},
        headers=trainer_headers,
    )

    # 1. Chain-level dashboard.
    clock.freeze(ist(19, 0, day=12))
    dashboard = client.get("/api/v1/reports/dashboard", headers=owner_headers)
    assert dashboard.status_code == 200
    top = dashboard.json()
    assert top["total_trainers"] == 2
    assert len(top["branches"]) == 3
    assert top["late"] == 1

    # 2. Drill into a branch.
    ngk = next(b for b in top["branches"] if b["branch_code"] == "SLAM-NGK")
    assert ngk["scheduled"] == 1
    assert ngk["present"] == 1
    assert ngk["late"] == 1
    assert ngk["punctuality_pct"] == 0.0
    assert ngk["occupancy"]["capacity"] == 90

    # 3. Branch comparison shows all three side by side.
    comparison = client.get("/api/v1/reports/branches", headers=owner_headers).json()
    assert {b["branch_code"] for b in comparison} == {"SLAM-NGK", "SLAM-BGH", "SLAM-ALD"}

    # 4. Open the trainer.
    trainer_id = world["trainer_ngk"].id
    detail = client.get(f"/api/v1/trainers/{trainer_id}", headers=owner_headers).json()
    assert detail["trainer"]["full_name"] == "Vikas Menon"
    assert detail["trainer"]["branch_name"] == "SLAM Nagalkeni"
    assert detail["current_status"] == "late"
    assert detail["shift_label"] == "18:00 – 21:00"
    assert detail["late_count"] == 1
    assert detail["completed_shifts"] == 1
    assert detail["month_punctuality_pct"] == 50.0

    # 5. Their attendance history.
    history = client.get(f"/api/v1/trainers/{trainer_id}/attendance", headers=owner_headers).json()
    assert [row["status"] for row in history] == ["late", "completed"]

    # 6. And the incentive verdict, with its disclaimer.
    incentives = client.get("/api/v1/incentives", headers=owner_headers).json()
    vikas = next(i for i in incentives if i["trainer_name"] == "Vikas Menon")
    assert vikas["status"] == "not_eligible"
    assert vikas["late_count"] == 1
    assert vikas["disclaimer"] == ("Final payroll/incentive calculation is subject to SLAM policy.")
    failed = [c for c in vikas["checks"] if not c["passed"]]
    assert any(c["key"] == "punctuality" for c in failed)


def test_member_journey_login_membership_visits_occupancy(client, world, auth):
    """Member V1: log in, see the plan, see visits, see how busy the gym is."""
    headers = auth(world["member_ngk_user"])
    branch_id = world["branches"]["ngk"].id

    clock.freeze(ist(19, 0))
    me = client.get("/api/v1/members/me", headers=headers)
    assert me.status_code == 200
    body = me.json()
    assert body["full_name"] == "Aditya Rao"
    assert body["branch"]["name"] == "SLAM Nagalkeni"
    assert body["membership"]["status"] == "active"
    assert body["days_remaining"] > 0
    assert body["assigned_trainer"]["full_name"] == "Vikas Menon"
    assert body["is_inside"] is False

    # Enter the gym.
    entered = client.post(
        "/api/v1/members/me/attendance",
        json={"branch_id": branch_id, "event_type": "check_in", "method": "pin", "pin": PIN},
        headers=headers,
    )
    # This member has no PIN set, so PIN entry is correctly refused.
    assert entered.status_code == 401

    from app.domain import qr as qr_domain

    branch = world["branches"]["ngk"]
    token = qr_domain.issue_token(branch.id, branch.qr_secret)
    entered = client.post(
        "/api/v1/members/me/attendance",
        json={"branch_id": branch_id, "event_type": "check_in", "method": "qr", "qr_token": token},
        headers=headers,
    )
    assert entered.status_code == 200

    body = client.get("/api/v1/members/me", headers=headers).json()
    assert body["is_inside"] is True
    assert body["visits_this_month"] == 1

    occupancy = client.get("/api/v1/members/me/occupancy", headers=headers).json()
    assert occupancy["inside"] == 1
    assert occupancy["capacity"] == 90
    assert occupancy["crowd_level"] == "Low"

    # Leave again.
    clock.freeze(ist(20, 15))
    token = qr_domain.issue_token(branch.id, branch.qr_secret)
    left = client.post(
        "/api/v1/members/me/attendance",
        json={"branch_id": branch_id, "event_type": "check_out", "method": "qr", "qr_token": token},
        headers=headers,
    )
    assert left.status_code == 200
    assert client.get("/api/v1/members/me/occupancy", headers=headers).json()["inside"] == 0

    visits = client.get("/api/v1/members/me/visits", headers=headers).json()
    assert len(visits) == 1
    assert visits[0]["minutes"] == 75

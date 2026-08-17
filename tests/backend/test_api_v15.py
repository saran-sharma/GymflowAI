"""The V1.5 API surface, exercised over HTTP the way the app uses it.

Includes the permission cases that matter most: a member must not be able to
read another member's programme, complete their own PT session, or reach a
branch they do not belong to.
"""

from __future__ import annotations

from datetime import date, datetime, timedelta

from conftest import make_member
from sqlalchemy import select

from app.core import clock
from app.core.clock import UTC, branch_today, now_utc
from app.db.models import MarketingSource, Member, TrainerAttendance
from app.services import journey_service, pt_service

API = "/api/v1"


def _start_journey(db, member, days_ago=0):
    return journey_service.start_journey(
        db, member=member, start_date=date.today() - timedelta(days=days_ago)
    )


# ------------------------------------------------------------ member view


def test_member_sees_their_journey_workout_and_progress(client, db, world, auth):
    member = world["member_ngk"]
    _start_journey(db, member, days_ago=5)  # day 6 — a legs day
    db.commit()

    headers = auth(world["member_ngk_user"])

    journey = client.get(f"{API}/journeys/me", headers=headers)
    assert journey.status_code == 200
    body = journey.json()
    assert body["current_day"] == 6
    assert body["phase"] == "training"
    assert body["split_today"] == "legs"

    started = client.post(f"{API}/journeys/me/workout/start", json={}, headers=headers)
    assert started.status_code == 200
    workout = started.json()
    assert workout["split_label"] == "Legs"
    assert workout["total_items"] > 0

    item_id = workout["items"][0]["id"]
    ticked = client.patch(
        f"{API}/journeys/workouts/{workout['id']}/items/{item_id}",
        json={"done": True},
        headers=headers,
    )
    assert ticked.status_code == 200
    assert ticked.json()["status"] == "completed"

    done = client.post(f"{API}/journeys/workouts/{workout['id']}/complete", headers=headers)
    assert done.status_code == 200
    assert done.json()["status"] == "completed"


def test_member_cannot_read_another_members_journey(client, db, world, auth):
    other, _user = make_member(db, world["roles"], world["branches"]["ngk"], "Other Member")
    _start_journey(db, other)
    db.commit()

    headers = auth(world["member_ngk_user"])
    response = client.get(f"{API}/journeys/members/{other.id}", headers=headers)
    assert response.status_code == 403


def test_member_cannot_record_their_own_assessment(client, db, world, auth):
    journey = _start_journey(db, world["member_ngk"])
    db.commit()

    headers = auth(world["member_ngk_user"])
    response = client.post(
        f"{API}/journeys/{journey.id}/assessment", json={"completed": True}, headers=headers
    )
    assert response.status_code == 403


def test_trainer_records_the_assessment_and_cardio(client, db, world, auth):
    journey = _start_journey(db, world["member_ngk"], days_ago=1)  # day 2
    db.commit()

    headers = auth(world["trainer_ngk_user"])
    assessment = client.post(
        f"{API}/journeys/{journey.id}/assessment",
        json={"goal": "Fat loss", "completed": True},
        headers=headers,
    )
    assert assessment.status_code == 200
    assert assessment.json()["status"] == "completed"

    cardio = client.post(
        f"{API}/journeys/{journey.id}/cardio",
        json={"day_number": 2, "duration_minutes": 25, "machine": "Treadmill"},
        headers=headers,
    )
    assert cardio.status_code == 201
    assert cardio.json()["duration_minutes"] == 25


def test_a_trainer_at_another_branch_cannot_touch_the_journey(client, db, world, auth):
    journey = _start_journey(db, world["member_ngk"])
    db.commit()

    headers = auth(world["trainer_bgh_user"])
    response = client.post(
        f"{API}/journeys/{journey.id}/assessment", json={"completed": True}, headers=headers
    )
    assert response.status_code == 403


def test_day_45_completion_happens_on_read_without_any_manual_step(client, db, world, auth):
    _start_journey(db, world["member_ngk"], days_ago=44)  # day 45
    db.commit()

    headers = auth(world["member_ngk_user"])
    body = client.get(f"{API}/journeys/me", headers=headers).json()

    assert body["status"] == "completed"
    assert body["completion_summary"] is not None

    offer = client.get(f"{API}/pt/me/offer", headers=headers).json()
    assert offer["eligible"] is True
    assert offer["headline"].startswith("Your 45-Day")
    assert [o["sessions"] for o in offer["options"]] == [12, 20, 30]
    # No price is invented anywhere in the offer.
    assert all(o["price_amount"] is None for o in offer["options"])


def test_the_pt_offer_is_not_made_to_a_member_mid_journey(client, db, world, auth):
    _start_journey(db, world["member_ngk"], days_ago=10)
    db.commit()

    headers = auth(world["member_ngk_user"])
    offer = client.get(f"{API}/pt/me/offer", headers=headers).json()
    assert offer["eligible"] is False


# ---------------------------------------------------------------- PT flow


def _package_with_session(db, world):
    package = pt_service.create_package(db, member=world["member_ngk"], sessions_total=12)
    session = pt_service.schedule_session(
        db,
        package=package,
        trainer_id=world["trainer_ngk"].id,
        scheduled_start=now_utc() + timedelta(hours=1),
    )
    db.commit()
    return package, session


def test_the_split_view_needs_both_people_before_a_session_can_be_completed(
    client, db, world, auth
):
    _package, session = _package_with_session(db, world)
    trainer_headers = auth(world["trainer_ngk_user"])
    member_headers = auth(world["member_ngk_user"])

    early = client.post(
        f"{API}/pt/sessions/{session.id}/complete", json={}, headers=trainer_headers
    )
    assert early.status_code == 409
    assert early.json()["detail"]["code"] == "attendance_incomplete"

    member_side = client.post(
        f"{API}/pt/sessions/{session.id}/arrival", json={"who": "member"}, headers=member_headers
    )
    assert member_side.status_code == 200
    assert member_side.json()["member_checked_in"] is True
    assert member_side.json()["can_complete"] is False

    trainer_side = client.post(
        f"{API}/pt/sessions/{session.id}/arrival", json={"who": "trainer"}, headers=trainer_headers
    )
    assert trainer_side.json()["can_complete"] is True

    completed = client.post(
        f"{API}/pt/sessions/{session.id}/complete", json={}, headers=trainer_headers
    )
    assert completed.status_code == 200
    assert completed.json()["status"] == "completed"

    balance = client.get(f"{API}/pt/me/package", headers=member_headers).json()
    assert balance["sessions_used"] == 1
    assert balance["sessions_remaining"] == 11


def test_a_member_cannot_confirm_the_trainers_arrival_or_close_the_session(client, db, world, auth):
    _package, session = _package_with_session(db, world)
    headers = auth(world["member_ngk_user"])

    assert (
        client.post(
            f"{API}/pt/sessions/{session.id}/arrival", json={"who": "trainer"}, headers=headers
        ).status_code
        == 403
    )
    assert (
        client.post(
            f"{API}/pt/sessions/{session.id}/complete", json={}, headers=headers
        ).status_code
        == 403
    )


def test_a_trainer_cannot_see_another_trainers_pt_session(client, db, world, auth):
    _package, session = _package_with_session(db, world)
    headers = auth(world["trainer_bgh_user"])
    assert client.get(f"{API}/pt/sessions/{session.id}", headers=headers).status_code == 403


def test_the_trainers_day_lists_pt_group_classes_and_supported_workouts(client, db, world, auth):
    # Frozen mid-morning in Asia/Kolkata. `session_date` is a *branch* date and
    # the endpoint below asks for the branch's today, so pinning it to the UTC
    # date makes this fail for every run after 18:30 UTC, when the two diverge.
    clock.freeze(datetime(2026, 8, 17, 4, 0, tzinfo=UTC))

    package = pt_service.create_package(db, member=world["member_ngk"], sessions_total=12)
    pt_service.schedule_session(
        db,
        package=package,
        trainer_id=world["trainer_ngk"].id,
        scheduled_start=now_utc() + timedelta(hours=2),
        session_date=branch_today(world["branches"]["ngk"].timezone),
    )
    db.commit()

    headers = auth(world["trainer_ngk_user"])
    schedule = client.get(f"{API}/sessions/me/today", headers=headers)
    assert schedule.status_code == 200
    kinds = {item["kind"] for item in schedule.json()}
    assert "pt" in kinds


# ------------------------------------------------------------ classes API


def test_a_member_rsvps_and_the_class_reflects_it(client, db, world, auth):
    manager_headers = auth(world["manager_ngk"])
    created = client.post(
        f"{API}/classes",
        json={
            "branch_id": world["branches"]["ngk"].id,
            "name": "Zumba",
            "starts_at": (now_utc() + timedelta(days=1)).isoformat(),
            "capacity": 20,
        },
        headers=manager_headers,
    )
    assert created.status_code == 201
    class_id = created.json()["id"]

    member_headers = auth(world["member_ngk_user"])
    listed = client.get(f"{API}/classes", headers=member_headers).json()
    assert [c["id"] for c in listed] == [class_id]

    answered = client.post(
        f"{API}/classes/{class_id}/rsvp", json={"response": "yes"}, headers=member_headers
    )
    assert answered.status_code == 200
    assert answered.json()["yes_count"] == 1
    assert answered.json()["my_response"] == "yes"

    # The roster is staff-only.
    assert client.get(f"{API}/classes/{class_id}/roster", headers=member_headers).status_code == 403
    roster = client.get(f"{API}/classes/{class_id}/roster", headers=manager_headers)
    assert roster.status_code == 200
    assert roster.json()[0]["response"] == "yes"
    assert roster.json()[0]["attended"] is None, "an RSVP is not attendance"


def test_a_member_cannot_create_a_class(client, world, auth):
    headers = auth(world["member_ngk_user"])
    response = client.post(
        f"{API}/classes",
        json={
            "branch_id": world["branches"]["ngk"].id,
            "name": "Rogue class",
            "starts_at": (now_utc() + timedelta(days=1)).isoformat(),
        },
        headers=headers,
    )
    assert response.status_code == 403


# ---------------------------------------------------------- owner surfaces


def test_owner_sees_needs_attention_marketing_and_branch_performance(client, db, world, auth):
    _start_journey(db, world["member_ngk"], days_ago=44)
    db.commit()
    headers = auth(world["owner"])

    client.post(f"{API}/settings/automations/run", headers=headers)

    attention = client.get(f"{API}/reports/needs-attention", headers=headers)
    assert attention.status_code == 200
    assert attention.json()["pt_ready_count"] >= 1

    marketing = client.get(f"{API}/marketing/dashboard", headers=headers)
    assert marketing.status_code == 200
    assert "sources" in marketing.json()

    performance = client.get(f"{API}/performance/branches?period=week", headers=headers)
    assert performance.status_code == 200
    body = performance.json()
    assert len(body["branches"]) == 3
    for branch in body["branches"]:
        # With no comparison window, no trend is invented.
        if not body["has_comparison"]:
            assert branch["punctuality"]["previous"] is None
            assert branch["punctuality"]["delta"] is None


def test_a_manager_only_sees_their_own_branch_in_the_comparison(client, world, auth):
    headers = auth(world["manager_ngk"])
    body = client.get(f"{API}/performance/branches", headers=headers).json()
    assert [b["branch_code"] for b in body["branches"]] == ["SLAM-NGK"]


def test_a_member_cannot_reach_the_marketing_dashboard(client, world, auth):
    headers = auth(world["member_ngk_user"])
    assert client.get(f"{API}/marketing/dashboard", headers=headers).status_code == 403


def test_a_trainer_cannot_reach_the_marketing_dashboard(client, world, auth):
    headers = auth(world["trainer_ngk_user"])
    assert client.get(f"{API}/marketing/dashboard", headers=headers).status_code == 403


def test_the_busy_period_forecast_is_withheld_until_there_is_enough_history(client, world, auth):
    headers = auth(world["member_ngk_user"])
    body = client.get(
        f"{API}/performance/occupancy/{world['branches']['ngk'].id}/forecast", headers=headers
    ).json()

    assert body["has_enough_history"] is False
    assert body["busiest_hours"] == []
    assert "days of check-in history" in body["note"]


def test_marketing_acquisition_can_be_recorded_by_a_manager_only(client, db, world, auth):
    from app.services import marketing_service

    marketing_service.ensure_sources(db)
    source = db.scalar(select(MarketingSource).where(MarketingSource.key == "instagram"))
    db.commit()

    member_id = world["member_ngk"].id
    payload = {"source_id": source.id, "registered_on": date.today().isoformat()}

    assert (
        client.post(
            f"{API}/marketing/members/{member_id}/acquisition",
            json=payload,
            headers=auth(world["member_ngk_user"]),
        ).status_code
        == 403
    )

    ok = client.post(
        f"{API}/marketing/members/{member_id}/acquisition",
        json=payload,
        headers=auth(world["manager_ngk"]),
    )
    assert ok.status_code == 200
    db.expire_all()
    assert db.get(Member, member_id).marketing_source_id == source.id


def test_a_manager_cannot_record_acquisition_for_another_branch(client, db, world, auth):
    other, _user = make_member(db, world["roles"], world["branches"]["bgh"], "BGH Member")
    db.commit()

    response = client.post(
        f"{API}/marketing/members/{other.id}/acquisition",
        json={"source_id": None},
        headers=auth(world["manager_ngk"]),
    )
    assert response.status_code == 403


# ----------------------------------------------------- corrections over HTTP


def test_the_correction_workflow_end_to_end(client, db, world, auth):
    row = TrainerAttendance(
        trainer_id=world["trainer_ngk"].id,
        branch_id=world["branches"]["ngk"].id,
        work_date=date.today() - timedelta(days=1),
        scheduled_start=now_utc() - timedelta(days=1, hours=6),
        scheduled_end=now_utc() - timedelta(days=1, hours=3),
        grace_minutes=10,
        early_exit_grace_minutes=0,
        check_in_at=now_utc() - timedelta(days=1, hours=6),
    )
    db.add(row)
    db.commit()

    trainer_headers = auth(world["trainer_ngk_user"])
    requested = client.post(
        f"{API}/attendance/corrections",
        json={
            "attendance_id": row.id,
            "correction_type": "missing_checkout",
            "reason": "My phone died before I could scan out.",
            "requested_check_out_at": row.scheduled_end.isoformat(),
        },
        headers=trainer_headers,
    )
    assert requested.status_code == 201
    correction_id = requested.json()["id"]
    assert requested.json()["status"] == "pending"

    # A trainer cannot approve their own request.
    assert (
        client.post(
            f"{API}/attendance/corrections/{correction_id}/review",
            json={"approve": True},
            headers=trainer_headers,
        ).status_code
        == 403
    )

    approved = client.post(
        f"{API}/attendance/corrections/{correction_id}/review",
        json={"approve": True, "note": "Confirmed with the front desk."},
        headers=auth(world["manager_ngk"]),
    )
    assert approved.status_code == 200
    assert approved.json()["status"] == "approved"
    assert approved.json()["new_status"] == "completed"


def test_a_trainer_cannot_appeal_someone_elses_attendance(client, db, world, auth):
    row = TrainerAttendance(
        trainer_id=world["trainer_bgh"].id,
        branch_id=world["branches"]["bgh"].id,
        work_date=date.today() - timedelta(days=1),
        grace_minutes=10,
        early_exit_grace_minutes=0,
        check_in_at=now_utc() - timedelta(days=1),
    )
    db.add(row)
    db.commit()

    response = client.post(
        f"{API}/attendance/corrections",
        json={
            "attendance_id": row.id,
            "correction_type": "missing_checkout",
            "reason": "Not my shift, but let me try.",
        },
        headers=auth(world["trainer_ngk_user"]),
    )
    assert response.status_code == 403


# ------------------------------------------------------------------ alerts


def test_alerts_are_scoped_to_the_person_they_are_addressed_to(client, db, world, auth):
    _start_journey(db, world["member_ngk"], days_ago=44)
    db.commit()
    client.get(f"{API}/journeys/me", headers=auth(world["member_ngk_user"]))

    member_alerts = client.get(f"{API}/alerts", headers=auth(world["member_ngk_user"])).json()
    assert member_alerts, "the member should hear that their journey finished"
    assert {a["key"] for a in member_alerts} == {"journey.pt_ready"}

    owner_alerts = client.get(f"{API}/alerts", headers=auth(world["owner"])).json()
    assert "journey.day45_complete" in {a["key"] for a in owner_alerts}


def test_a_member_cannot_acknowledge_someone_elses_alert(client, db, world, auth):
    _start_journey(db, world["member_ngk"], days_ago=44)
    db.commit()
    client.get(f"{API}/journeys/me", headers=auth(world["member_ngk_user"]))

    owner_alerts = client.get(f"{API}/alerts", headers=auth(world["owner"])).json()
    branch_alert = next(a for a in owner_alerts if a["key"] == "journey.day45_complete")

    response = client.post(
        f"{API}/alerts/{branch_alert['id']}/ack",
        json={"dismiss": False},
        headers=auth(world["member_ngk_user"]),
    )
    assert response.status_code == 403


# ---------------------------------------------------------------- settings


def test_business_rules_are_configurable_and_audited(client, world, auth):
    admin_headers = auth(world["admin"])

    listed = client.get(f"{API}/settings", headers=admin_headers)
    assert listed.status_code == 200
    keys = {row["key"] for row in listed.json()}
    assert {"journey.duration_days", "pt.package_options", "shift.grace_minutes"} <= keys

    updated = client.put(
        f"{API}/settings/pt.package_options",
        json={"value": [10, 24]},
        headers=admin_headers,
    )
    assert updated.status_code == 200
    assert updated.json()["value"] == [10, 24]

    options = client.get(f"{API}/pt/options", headers=admin_headers).json()
    assert options == [10, 24]


def test_an_unknown_setting_key_is_rejected(client, world, auth):
    response = client.put(
        f"{API}/settings/not.a.real.setting", json={"value": 1}, headers=auth(world["admin"])
    )
    assert response.status_code == 404


def test_a_trainer_cannot_change_business_rules(client, world, auth):
    response = client.put(
        f"{API}/settings/journey.duration_days",
        json={"value": 10},
        headers=auth(world["trainer_ngk_user"]),
    )
    assert response.status_code == 403


def test_the_member_home_screen_arrives_in_one_request(client, db, world, auth):
    member = world["member_ngk"]
    _start_journey(db, member, days_ago=5)
    pt_service.create_package(db, member=member, sessions_total=12)
    db.commit()

    headers = auth(world["member_ngk_user"])
    home = client.get(f"{API}/members/me/home", headers=headers)
    assert home.status_code == 200

    body = home.json()
    assert body["full_name"] == "Aditya Rao"
    assert body["branch_name"] == "SLAM Nagalkeni"
    assert body["journey"]["current_day"] == 6
    assert body["pt_package"]["sessions_remaining"] == 12
    assert body["occupancy"]["crowd_level"] in {"Low", "Medium", "High"}
    assert body["membership_plan"] == "Annual"


def test_the_activity_timeline_keeps_the_four_kinds_apart(client, db, world, auth):
    from app.db.models import AttendanceEvent, EventType, PersonType
    from app.services import class_service, journey_service

    member = world["member_ngk"]
    branch = world["branches"]["ngk"]
    _start_journey(db, member, days_ago=5)

    # A gym visit.
    db.add(
        AttendanceEvent(
            branch_id=branch.id,
            person_type=PersonType.MEMBER,
            user_id=member.user_id,
            event_type=EventType.CHECK_IN,
            method="qr",
            occurred_at=now_utc(),
            work_date=date.today(),
        )
    )
    # An own workout.
    workout = journey_service.start_workout(db, member=member)
    journey_service.complete_workout(db, workout)

    # A PT session.
    package = pt_service.create_package(db, member=member, sessions_total=12)
    session = pt_service.schedule_session(
        db,
        package=package,
        trainer_id=world["trainer_ngk"].id,
        scheduled_start=now_utc(),
    )
    pt_service.mark_arrival(db, session=session, who="member")
    pt_service.mark_arrival(db, session=session, who="trainer")
    pt_service.complete_session(db, session=session, completed_by_user_id=None)

    # A group class.
    group_class = class_service.create_class(db, branch=branch, name="Zumba", starts_at=now_utc())
    class_service.record_attendance(
        db,
        group_class=group_class,
        member_ids=[member.id],
        attended=True,
        recorded_by_user_id=None,
    )
    db.commit()

    timeline = client.get(f"{API}/members/me/activity", headers=auth(world["member_ngk_user"]))
    assert timeline.status_code == 200
    kinds = {entry["kind"] for entry in timeline.json()}
    assert kinds == {"gym_visit", "own_workout", "pt_session", "group_class"}

    own = next(e for e in timeline.json() if e["kind"] == "own_workout")
    assert own["detail"] == "LEGS", "the timeline names the split, not just 'workout'"

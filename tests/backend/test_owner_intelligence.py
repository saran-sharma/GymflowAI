"""The Owner Command Center's new backend surface.

Three things, all reusing existing builders and services rather than
inventing new ones: a member-detail read open to any staff member allowed to
see that member (not just their own trainer), a marketing source's member
list, and a broadcast that fans out through the existing alert channel.
"""

from __future__ import annotations

from datetime import date, timedelta

from conftest import make_member
from sqlalchemy import select

from app.db.models import MarketingSource
from app.services import journey_service, marketing_service, pt_service

API = "/api/v1"


# ------------------------------------------------------------ member detail


def test_owner_can_open_any_member(client, world, auth):
    member = world["member_ngk"]
    response = client.get(f"{API}/members/{member.id}", headers=auth(world["owner"]))
    assert response.status_code == 200
    body = response.json()
    assert body["client"]["member_id"] == member.id
    assert body["client"]["full_name"] == "Aditya Rao"
    assert isinstance(body["recent_workouts"], list)
    assert isinstance(body["activity"], list)


def test_a_trainer_can_open_a_member_at_their_own_branch_not_just_their_clients(
    client, db, world, auth
):
    """Different from `/trainers/me/clients/{id}`: this is branch-wide staff
    read access, the same rule `/journeys/members/{id}` already applies."""
    member = world["member_ngk"]
    member.assigned_trainer_id = None
    db.commit()

    response = client.get(f"{API}/members/{member.id}", headers=auth(world["trainer_ngk_user"]))
    assert response.status_code == 200


def test_a_trainer_at_another_branch_cannot_open_the_member(client, world, auth):
    member = world["member_ngk"]
    response = client.get(f"{API}/members/{member.id}", headers=auth(world["trainer_bgh_user"]))
    assert response.status_code == 403


def test_a_member_cannot_open_someone_elses_record(client, db, world, auth):
    other, _ = make_member(db, world["roles"], world["branches"]["ngk"], "Someone Else")
    db.commit()
    response = client.get(f"{API}/members/{other.id}", headers=auth(world["member_ngk_user"]))
    assert response.status_code == 403


def test_member_detail_404s_for_a_member_that_does_not_exist(client, world, auth):
    response = client.get(f"{API}/members/99999", headers=auth(world["owner"]))
    assert response.status_code == 404


def test_member_detail_shows_pt_when_converted_not_just_the_journey_flag(client, db, world, auth):
    """The same generalised `client_out` the trainer desk uses: PT package and
    the member's next session with *whichever* trainer, not scoped to one."""
    member = world["member_ngk"]
    journey = journey_service.start_journey(
        db, member=member, start_date=date.today() - timedelta(days=44)
    )
    journey_service.settle_journey(db, journey)
    pt_service.create_package(
        db, member=member, sessions_total=12, journey_id=journey.id, origin="journey_conversion"
    )
    db.commit()

    response = client.get(f"{API}/members/{member.id}", headers=auth(world["owner"]))
    body = response.json()["client"]
    assert body["pt_package"] is not None
    assert body["pt_package"]["sessions_total"] == 12
    assert body["journey"]["pt_converted"] is True


# ----------------------------------------------------------- marketing drilldown


def test_source_members_lists_who_a_source_actually_brought_in(client, db, world, auth):
    marketing_service.ensure_sources(db)
    instagram = db.scalar(select(MarketingSource).where(MarketingSource.key == "instagram"))
    branch = world["branches"]["ngk"]

    acquired, _ = make_member(db, world["roles"], branch, "Instagram Lead")
    marketing_service.record_acquisition(
        db, member=acquired, source_id=instagram.id, registered_on=date.today()
    )
    db.commit()

    response = client.get(
        f"{API}/marketing/sources/instagram/members", headers=auth(world["owner"])
    )
    assert response.status_code == 200
    names = {row["full_name"] for row in response.json()}
    assert "Instagram Lead" in names
    # The seeded fixture member has no acquisition recorded, so is not here.
    assert "Aditya Rao" not in names


def test_source_members_unrecorded_bucket_matches_members_with_no_source(client, world, auth):
    response = client.get(
        f"{API}/marketing/sources/unrecorded/members", headers=auth(world["owner"])
    )
    assert response.status_code == 200
    names = {row["full_name"] for row in response.json()}
    assert "Aditya Rao" in names


def test_an_unknown_source_key_404s(client, world, auth):
    response = client.get(
        f"{API}/marketing/sources/not-a-real-source/members", headers=auth(world["owner"])
    )
    assert response.status_code == 404


def test_a_trainer_cannot_open_the_marketing_drilldown(client, world, auth):
    response = client.get(
        f"{API}/marketing/sources/unrecorded/members", headers=auth(world["trainer_ngk_user"])
    )
    assert response.status_code == 403


# --------------------------------------------------------------- broadcast


def test_broadcast_reaches_members_and_lands_in_their_own_alert_inbox(client, db, world, auth):
    response = client.post(
        f"{API}/alerts/broadcast",
        headers=auth(world["owner"]),
        json={
            "audience": "members",
            "branch_id": world["branches"]["ngk"].id,
            "broadcast_type": "announcement",
            "title": "New Zumba class",
            "message": "Friday 6:30pm at SLAM Nagalkeni.",
        },
    )
    assert response.status_code == 200
    body = response.json()
    assert body["recipients"] == 1
    assert body["audience"] == "members"

    # It is real: the recipient's own alert feed shows it, through the same
    # `visible_alerts` every other alert in the product already uses.
    inbox = client.get(f"{API}/alerts", headers=auth(world["member_ngk_user"]))
    titles = {row["title"] for row in inbox.json()}
    assert "New Zumba class" in titles


def test_broadcast_scopes_to_audience_not_everyone(client, db, world, auth):
    """A "members" broadcast must not also page the branch's trainer."""
    client.post(
        f"{API}/alerts/broadcast",
        headers=auth(world["owner"]),
        json={
            "audience": "members",
            "branch_id": None,
            "broadcast_type": "announcement",
            "title": "Members only",
            "message": "This is for members.",
        },
    )
    inbox = client.get(f"{API}/alerts", headers=auth(world["trainer_ngk_user"]))
    titles = {row["title"] for row in inbox.json()}
    assert "Members only" not in titles


def test_broadcast_scopes_to_branch_when_one_is_given(client, db, world, auth):
    client.post(
        f"{API}/alerts/broadcast",
        headers=auth(world["owner"]),
        json={
            "audience": "trainers",
            "branch_id": world["branches"]["bgh"].id,
            "broadcast_type": "urgent",
            "title": "Boganhalli only",
            "message": "Branch-specific message.",
        },
    )
    ngk_inbox = client.get(f"{API}/alerts", headers=auth(world["trainer_ngk_user"]))
    assert "Boganhalli only" not in {row["title"] for row in ngk_inbox.json()}

    bgh_inbox = client.get(f"{API}/alerts", headers=auth(world["trainer_bgh_user"]))
    bgh_alert = next(row for row in bgh_inbox.json() if row["title"] == "Boganhalli only")
    assert bgh_alert["severity"] == "critical"


def test_only_management_can_send_a_broadcast(client, world, auth):
    response = client.post(
        f"{API}/alerts/broadcast",
        headers=auth(world["trainer_ngk_user"]),
        json={
            "audience": "everyone",
            "branch_id": None,
            "broadcast_type": "announcement",
            "title": "Not allowed",
            "message": "A trainer should not be able to do this.",
        },
    )
    assert response.status_code == 403


def test_pt_members_audience_reaches_only_members_with_an_active_package(client, db, world, auth):
    member = world["member_ngk"]
    pt_service.create_package(db, member=member, sessions_total=12)
    db.commit()

    _, other_user = make_member(db, world["roles"], world["branches"]["ngk"], "No PT Yet")
    db.commit()

    response = client.post(
        f"{API}/alerts/broadcast",
        headers=auth(world["owner"]),
        json={
            "audience": "pt_members",
            "branch_id": None,
            "broadcast_type": "training",
            "title": "PT slot opened up",
            "message": "Friday 6pm is now free.",
        },
    )
    assert response.status_code == 200
    assert response.json()["recipients"] == 1

    inbox = client.get(f"{API}/alerts", headers=auth(world["member_ngk_user"]))
    assert "PT slot opened up" in {row["title"] for row in inbox.json()}

    other_inbox = client.get(f"{API}/alerts", headers=auth(other_user))
    assert "PT slot opened up" not in {row["title"] for row in other_inbox.json()}


def test_a_specific_member_can_be_targeted_directly(client, db, world, auth):
    response = client.post(
        f"{API}/alerts/broadcast",
        headers=auth(world["owner"]),
        json={
            "audience": "member",
            "member_id": world["member_ngk"].id,
            "branch_id": None,
            "broadcast_type": "membership",
            "title": "About your renewal",
            "message": "Let's talk about your plan.",
        },
    )
    assert response.status_code == 200
    assert response.json()["recipients"] == 1

    inbox = client.get(f"{API}/alerts", headers=auth(world["member_ngk_user"]))
    assert "About your renewal" in {row["title"] for row in inbox.json()}


def test_member_audience_without_a_member_id_is_rejected(client, world, auth):
    response = client.post(
        f"{API}/alerts/broadcast",
        headers=auth(world["owner"]),
        json={
            "audience": "member",
            "branch_id": None,
            "broadcast_type": "announcement",
            "title": "x",
            "message": "y",
        },
    )
    assert response.status_code == 422


def test_member_id_is_rejected_outside_the_member_audience(client, world, auth):
    response = client.post(
        f"{API}/alerts/broadcast",
        headers=auth(world["owner"]),
        json={
            "audience": "everyone",
            "member_id": world["member_ngk"].id,
            "branch_id": None,
            "broadcast_type": "announcement",
            "title": "x",
            "message": "y",
        },
    )
    assert response.status_code == 422


def test_a_branch_manager_cannot_target_a_member_outside_their_branch(client, world, auth):
    """`branch_id` is optional on a `member` broadcast — access must still be
    checked against the target member's own branch, not the omitted field."""
    response = client.post(
        f"{API}/alerts/broadcast",
        headers=auth(world["manager_bgh"]),
        json={
            "audience": "member",
            "member_id": world["member_ngk"].id,  # at NGK, not BGH
            "branch_id": None,
            "broadcast_type": "announcement",
            "title": "Should be blocked",
            "message": "This should not send.",
        },
    )
    assert response.status_code == 403


# ------------------------------------------------------------ dashboard counts


def test_dashboard_reports_total_members_and_per_branch_counts(client, db, world, auth):
    ald = world["branches"]["ald"]
    # `world` seeds one member at NGK only; Kandigai starts at zero.
    response = client.get(f"{API}/reports/dashboard", headers=auth(world["owner"]))
    body = response.json()
    assert body["total_members"] >= 1
    ald_row = next(b for b in body["branches"] if b["branch_id"] == ald.id)
    assert ald_row["member_count"] == 0

    ngk_row = next(b for b in body["branches"] if b["branch_id"] == world["branches"]["ngk"].id)
    assert ngk_row["member_count"] >= 1

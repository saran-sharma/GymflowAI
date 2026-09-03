"""Weekly summaries — one reusable shape, member and owner metrics."""

from __future__ import annotations

from datetime import date

from intelligence_helpers import add_attendance, add_workout

from app.db.models import AttendanceStatus
from app.services.intelligence.weekly import member_weekly_summary, owner_weekly_summary

API = "/api/v1/intelligence"
# A Sunday. Week = 2026-06-01 (Mon) .. 2026-06-07 (Sun); prior = 05-25 .. 05-31.
WEEK_END = date(2026, 6, 7)


def _m(m: object, label: str):
    return next(row for row in m.metrics if row.label == label)


# --------------------------------------------------------------- member


def test_member_week_ahead_on_more_sessions(db, world):
    member = world["member_ngk"]
    # Prior week: 1 session. This week: 3.
    add_workout(db, member, on=date(2026, 5, 27), sets=[(50, 8)])
    for d in (1, 3, 5):
        add_workout(db, member, on=date(2026, 6, d), sets=[(50, 8)])
    db.commit()

    s = member_weekly_summary(db, member, week_ending=WEEK_END)
    assert s.audience == "member"
    assert (s.week_start, s.week_end) == (date(2026, 6, 1), date(2026, 6, 7))
    assert _m(s, "Training sessions").value == "3"
    assert _m(s, "Training sessions").previous == "1"
    assert _m(s, "Training sessions").direction == "up"
    assert s.movement == "ahead"


def test_member_week_behind_on_fewer_sessions(db, world):
    member = world["member_ngk"]
    for d in (25, 27, 29):
        add_workout(db, member, on=date(2026, 5, d), sets=[(50, 8)])
    add_workout(db, member, on=date(2026, 6, 2), sets=[(50, 8)])
    db.commit()

    s = member_weekly_summary(db, member, week_ending=WEEK_END)
    assert s.movement == "behind"
    assert "Quieter week" in s.headline or "down from" in s.headline


def test_member_week_with_no_sessions_is_behind_and_says_so(db, world):
    member = world["member_ngk"]
    add_workout(db, member, on=date(2026, 5, 26), sets=[(50, 8)])
    db.commit()
    s = member_weekly_summary(db, member, week_ending=WEEK_END)
    assert _m(s, "Training sessions").value == "0"
    assert s.movement == "behind"
    assert "restarts the habit" in s.headline


def test_member_weekly_defaults_to_the_last_complete_week(db, world):
    """No week_ending → the Monday–Sunday before the current week."""
    s = member_weekly_summary(db, world["member_ngk"])
    assert s.week_end.weekday() == 6  # Sunday
    assert (s.week_end - s.week_start).days == 6


# --------------------------------------------------------------- owner


def test_owner_week_reports_punctuality_movement(db, world):
    t = world["trainer_ngk"]
    b = world["branches"]["ngk"].id
    # Prior week all on time; this week half late → downward.
    add_attendance(db, t.id, b, on=date(2026, 5, 31), status=AttendanceStatus.COMPLETED, n=5)
    add_attendance(db, t.id, b, on=date(2026, 6, 3), status=AttendanceStatus.COMPLETED, n=3)
    add_attendance(db, t.id, b, on=date(2026, 6, 6), status=AttendanceStatus.LATE, n=3)
    db.commit()

    s = owner_weekly_summary(db, branch_ids=[b], scope_label="SLAM Nagalkeni", week_ending=WEEK_END)
    assert s.audience == "owner"
    assert s.scope == "SLAM Nagalkeni"
    punct = _m(s, "Trainer punctuality")
    assert punct.value == "50%"
    assert punct.previous == "100%"
    assert punct.direction == "down"
    assert s.movement == "behind"


def test_owner_week_counts_absences_and_new_members(db, world):
    from conftest import make_member

    t = world["trainer_ngk"]
    b = world["branches"]["ngk"]
    add_attendance(db, t.id, b.id, on=date(2026, 6, 4), status=AttendanceStatus.ABSENT, n=3)
    joined, _ = make_member(db, world["roles"], b, "Newcomer")
    joined.registered_on = date(2026, 6, 3)
    db.commit()

    s = owner_weekly_summary(db, branch_ids=[b.id], week_ending=WEEK_END)
    assert _m(s, "Unworked shifts").value == "3"
    assert _m(s, "New members").value == "1"
    assert s.movement == "behind"  # 3 absences forces it


# --------------------------------------------------------------- endpoints


def test_weekly_endpoints_and_their_gates(client, db, world, auth):
    member = world["member_ngk"]
    for d in (2, 4):
        add_workout(db, member, on=date(2026, 6, d), sets=[(50, 8)])
    db.commit()

    me = client.get(
        f"{API}/me/weekly?week_ending={WEEK_END.isoformat()}",
        headers=auth(world["member_ngk_user"]),
    )
    assert me.status_code == 200
    assert me.json()["audience"] == "member"

    by_trainer = client.get(
        f"{API}/members/{member.id}/weekly", headers=auth(world["trainer_ngk_user"])
    )
    assert by_trainer.status_code == 200

    cross = client.get(f"{API}/members/{member.id}/weekly", headers=auth(world["trainer_bgh_user"]))
    assert cross.status_code == 403

    owner = client.get(f"{API}/owner/weekly", headers=auth(world["owner"]))
    assert owner.status_code == 200
    assert owner.json()["audience"] == "owner"

    denied = client.get(f"{API}/owner/weekly", headers=auth(world["member_ngk_user"]))
    assert denied.status_code == 403

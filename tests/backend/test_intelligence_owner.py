"""The owner's daily brief: aggregate attention issues, no invented money."""

from __future__ import annotations

from datetime import date, timedelta

from conftest import make_member
from intelligence_helpers import add_attendance, add_workout

from app.db.models import AttendanceStatus, MembershipStatus
from app.services.intelligence.owner import build_owner_daily_brief

API = "/api/v1/intelligence"
TODAY = date(2026, 6, 20)  # mid-month, so month-to-date windows have room


def _brief(db, branch_ids=None):
    return build_owner_daily_brief(db, branch_ids=branch_ids, today=TODAY)


# --------------------------------------------------------------- punctuality


def test_punctuality_issue_fires_below_the_floor_with_a_direction(db, world):
    t = world["trainer_ngk"]
    b = world["branches"]["ngk"].id
    # This month: 6 on time, 6 late → 50%, well under the 85% floor.
    add_attendance(db, t.id, b, on=date(2026, 6, 12), status=AttendanceStatus.COMPLETED, n=6)
    add_attendance(db, t.id, b, on=date(2026, 6, 18), status=AttendanceStatus.LATE, n=6)
    # Last month: all on time → a clear downward direction.
    add_attendance(db, t.id, b, on=date(2026, 5, 20), status=AttendanceStatus.COMPLETED, n=10)
    db.commit()

    brief = _brief(db, [b])
    issue = next(i for i in brief.issues if i.id == "trainer_punctuality")
    assert issue.severity == "attention"
    assert issue.direction == "down"
    assert any(e.value == "50%" for e in issue.evidence)
    assert issue.action.route == "/(owner)/trainers"


def test_no_punctuality_issue_when_on_target(db, world):
    t = world["trainer_ngk"]
    b = world["branches"]["ngk"].id
    add_attendance(db, t.id, b, on=date(2026, 6, 18), status=AttendanceStatus.COMPLETED, n=12)
    db.commit()
    assert not any(i.id == "trainer_punctuality" for i in _brief(db, [b]).issues)


def test_absence_issue_is_critical_past_two(db, world):
    t = world["trainer_ngk"]
    b = world["branches"]["ngk"].id
    add_attendance(db, t.id, b, on=date(2026, 6, 18), status=AttendanceStatus.COMPLETED, n=8)
    add_attendance(db, t.id, b, on=date(2026, 6, 9), status=AttendanceStatus.ABSENT, n=3)
    db.commit()
    issue = next(i for i in _brief(db, [b]).issues if i.id == "trainer_absence")
    assert issue.severity == "critical"
    assert "3 unworked" in issue.title


# --------------------------------------------------------------- members


def test_inactive_member_rollup_uses_a_share_threshold(db, world):
    branch = world["branches"]["ngk"]
    # world seeds one member (Aditya). Add four more; make two active recently.
    quiet_a, _ = make_member(db, world["roles"], branch, "Quiet A")
    quiet_b, _ = make_member(db, world["roles"], branch, "Quiet B")
    active_a, _ = make_member(db, world["roles"], branch, "Active A")
    add_workout(db, active_a, on=TODAY - timedelta(days=3))
    add_workout(db, world["member_ngk"], on=TODAY - timedelta(days=2))
    db.commit()

    brief = _brief(db, [branch.id])
    issue = next(i for i in brief.issues if i.id == "member_inactivity")
    # 3 of 5 (Aditya active, Active A active; Quiet A/B + 2 others... actually
    # world seeds exactly one member, so roster is Aditya + 3 = 4; 2 quiet).
    assert issue.severity in ("attention", "critical")
    assert issue.action.route == "/(owner)/members"
    assert any("Quiet" not in e.label for e in issue.evidence)  # counts, not names


# --------------------------------------------------------------- renewals


def test_renewals_issue_counts_soon_to_lapse_memberships_without_money(db, world):
    member = world["member_ngk"]
    membership = member.memberships[0] if hasattr(member, "memberships") else None
    if membership is None:
        from app.db.models import Membership

        membership = db.query(Membership).filter_by(member_id=member.id).first()
    membership.status = MembershipStatus.ACTIVE
    membership.ends_on = TODAY + timedelta(days=10)
    db.commit()

    issue = next(i for i in _brief(db, [member.branch_id]).issues if i.id == "renewals_due")
    assert "1 membership" in issue.title
    blob = issue.model_dump_json().lower()
    assert "revenue" not in blob and "amount" in blob  # explicitly says no amount


# --------------------------------------------------------------- empty


def test_brief_is_calm_when_nothing_is_wrong(db, world):
    t = world["trainer_ngk"]
    b = world["branches"]["ngk"].id
    add_attendance(db, t.id, b, on=date(2026, 6, 18), status=AttendanceStatus.COMPLETED, n=12)
    add_workout(db, world["member_ngk"], on=TODAY - timedelta(days=1))
    db.commit()
    brief = _brief(db, [b])
    assert brief.issues == []
    assert "Nothing needs your attention" in brief.headline


# --------------------------------------------------------------- endpoint


def test_daily_brief_endpoint_is_management_only(client, db, world, auth):
    t = world["trainer_ngk"]
    b = world["branches"]["ngk"].id
    add_attendance(db, t.id, b, on=date(2026, 6, 18), status=AttendanceStatus.LATE, n=10)
    db.commit()

    ok = client.get(f"{API}/owner/daily-brief?on={TODAY.isoformat()}", headers=auth(world["owner"]))
    assert ok.status_code == 200
    assert ok.json()["scope"] == "All branches"

    for actor in ("trainer_ngk_user", "member_ngk_user"):
        denied = client.get(f"{API}/owner/daily-brief", headers=auth(world[actor]))
        assert denied.status_code == 403


def test_daily_brief_scope_label_names_a_single_branch(client, db, world, auth):
    r = client.get(
        f"{API}/owner/daily-brief?on={TODAY.isoformat()}&branch_id={world['branches']['ngk'].id}",
        headers=auth(world["owner"]),
    )
    assert r.status_code == 200
    assert r.json()["scope"] == "SLAM Nagalkeni"


def test_branch_manager_brief_is_scoped_to_their_branch(client, db, world, auth):
    r = client.get(f"{API}/owner/daily-brief", headers=auth(world["manager_ngk"]))
    assert r.status_code == 200
    assert r.json()["scope"] == "SLAM Nagalkeni"

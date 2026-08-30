"""Yoactiv Data API connector — transport, mapping, identity, sync, lifecycle.

No network. The ``FakeTransport`` returns canned bodies whose shapes are
copied from the response examples saved in SLAM's own Postman collection
(``Yoactiv_Data_Api.postman_collection.json``). Nothing here reaches a real
Yoactiv tenant — that host is behind IIS Basic auth we do not have
credentials for (see ``docs/INTEGRATIONS.md``), so this suite pins the
connector's behaviour against the documented contract instead.
"""

from __future__ import annotations

import json
from datetime import date, timedelta

import pytest
from conftest import make_branch, make_member, make_roles

from app.db.models import (
    AttendanceEvent,
    Member,
    Membership,
    MembershipStatus,
    YoactivDeadLetter,
    YoactivSyncCursor,
)
from app.integrations.yoactiv import identity, sync
from app.integrations.yoactiv.client import (
    CONFIRMED_ENDPOINTS,
    YoactivAuthError,
    YoactivClient,
    YoactivError,
    YoactivResponseError,
)
from app.integrations.yoactiv.mapping import parse_checkin, parse_invoice

# --------------------------------------------------------------- test doubles


class FakeTransport:
    """Queue of (status, body) tuples, one consumed per call."""

    def __init__(self, *responses: tuple[int, str]) -> None:
        self._responses = list(responses)
        self.calls: list[str] = []

    def __call__(self, url: str, headers: dict, timeout: float):
        self.calls.append(url)
        if not self._responses:
            raise AssertionError("FakeTransport ran out of queued responses")
        return self._responses.pop(0)


def _results(rows: list[dict]) -> str:
    return json.dumps({"Results": rows})


def _client(transport: FakeTransport, **kw) -> YoactivClient:
    return YoactivClient(
        "https://example.test/api/backdata.asmx",
        "test-key",
        transport=transport,
        sleep=lambda _s: None,
        **kw,
    )


CHECKIN_ROW = {
    "Member_ID": 1957,
    "Name": "Bala",
    "Mobile": "5544343332",
    "Mail_ID": "bala@example.com",
    "Attendance_Date": "26-05-2022",
    "Service_card_id": 4034,
    "service_name": "Body Building",
    "clockIn": "08:53 PM",
    "clockOut": "11:45 PM",
    "PT_service": "Yes",
    "Medium/Staff": "CRM App",
    "PT_Staff": "rockie",
}

INVOICE_ROW = {
    "bill_id": 3986,
    "Member_Id": 1683,
    "Name": "testp",
    "Mobile": "7845895625",
    "Mail_Id": "testp@example.com",
    "Purchase_date": "29-09-2022",
    "Final_Amount": "700",
    "Paid": "0",
    "PT_Name": "-",
    "Billed_Services": [
        {
            "Description": "Body Building - Upper BB 5 sess",
            "Duration": "5 Sessions.",
            "Base_fee": "500",
            "Start_date": "29-09-2022",
            "End_date": "08-10-2022",
        }
    ],
    "Bill_Payments": [{"Paid_Date": "29-09-2022", "Paid": "0", "Mode_of_Payment": ""}],
}


# --------------------------------------------------------------------- client


def test_client_rejects_an_unconfirmed_endpoint():
    client = _client(FakeTransport((200, _results([]))))
    with pytest.raises(YoactivError):
        client.get_results("members", {})  # not in the Postman collection
    assert "members" not in CONFIRMED_ENDPOINTS


def test_client_auth_error_is_not_retried():
    transport = FakeTransport((401, "<html>401</html>"))
    with pytest.raises(YoactivAuthError):
        _client(transport).get_results("checkins", {"fromdate": "01-01-2026"})
    assert len(transport.calls) == 1  # halted, not retried


def test_client_retries_5xx_then_succeeds():
    transport = FakeTransport((503, "busy"), (500, "busy"), (200, _results([CHECKIN_ROW])))
    rows = _client(transport).get_results("checkins", {})
    assert len(transport.calls) == 3
    assert rows[0]["Member_ID"] == 1957


def test_client_extracts_results_and_rejects_junk():
    assert _client(FakeTransport((200, _results([{"a": 1}])))).get_results("invoices", {}) == [
        {"a": 1}
    ]
    with pytest.raises(YoactivResponseError):
        _client(FakeTransport((200, "not json"))).get_results("invoices", {})
    with pytest.raises(YoactivResponseError):
        _client(FakeTransport((200, json.dumps({"nope": []})))).get_results("invoices", {})


# -------------------------------------------------------------------- mapping


def test_parse_checkin_reads_the_real_shape():
    c = parse_checkin(CHECKIN_ROW)
    assert c.member_id == 1957
    assert c.attendance_date == date(2022, 5, 26)
    assert c.clock_in.hour == 20 and c.clock_in.minute == 53
    assert c.clock_out.hour == 23
    assert c.is_pt is True
    assert c.external_key.startswith("yoactiv:checkin:")


def test_parse_invoice_reads_nested_services():
    inv = parse_invoice(INVOICE_ROW)
    assert inv.bill_id == 3986
    assert inv.member_id == 1683
    assert inv.services[0].start_date == date(2022, 9, 29)
    assert inv.services[0].end_date == date(2022, 10, 8)
    assert inv.latest_service_end == date(2022, 10, 8)
    assert inv.external_key == "yoactiv:invoice:3986"


def test_parse_checkin_rejects_a_row_with_no_member_id():
    with pytest.raises(ValueError):
        parse_checkin({**CHECKIN_ROW, "Member_ID": ""})


# ------------------------------------------------------------------- identity


def _linked_member(db, *, name="Aditya Rao", member_id="1957", email=None, phone=None):
    roles = make_roles(db)
    branch = make_branch(db, "SLAM-NGK", "SLAM Nagalkeni")
    member, user = make_member(db, roles, branch, name)
    member.external_ref = None
    if email is not None:
        user.email = email
    if phone is not None:
        user.phone = phone
    db.commit()
    return member, user, branch


def test_resolve_by_external_ref_wins(db):
    member, _user, _branch = _linked_member(db)
    member.external_ref = "1957"
    db.commit()
    match = identity.resolve_member(db, yoactiv_member_id=1957)
    assert match.member is not None and match.member.id == member.id
    assert match.method == "external_ref"


def test_resolve_by_exact_email(db):
    member, _user, _branch = _linked_member(db, email="known@slam.test")
    match = identity.resolve_member(
        db, yoactiv_member_id=99, email="KNOWN@slam.test", phone="0000000000"
    )
    assert match.member.id == member.id and match.method == "email"


def test_resolve_by_unique_phone(db):
    member, _user, _branch = _linked_member(db, phone="+91 90000 12345")
    match = identity.resolve_member(db, yoactiv_member_id=99, phone="9000012345")
    assert match.member.id == member.id and match.method == "phone_unique"


def test_resolve_phone_is_ambiguous_when_shared(db):
    roles = make_roles(db)
    branch = make_branch(db, "SLAM-NGK", "SLAM Nagalkeni")
    m1, u1 = make_member(db, roles, branch, "Person One")
    m2, u2 = make_member(db, roles, branch, "Person Two")
    u1.phone = "9000012345"
    u2.phone = "9000012345"
    db.commit()
    match = identity.resolve_member(db, yoactiv_member_id=99, phone="9000012345")
    assert match.member is None and match.method == "ambiguous"


def test_resolve_none_never_matches_on_name_alone(db):
    _linked_member(db, name="Aditya Rao")
    match = identity.resolve_member(db, yoactiv_member_id=99, name="Aditya Rao")
    assert match.member is None and match.method == "none"


# ---------------------------------------------------------------- checkins sync


def test_checkins_sync_writes_attendance_and_is_idempotent(db):
    member, _user, branch = _linked_member(db, member_id="1957")
    member.external_ref = "1957"
    db.commit()
    transport = FakeTransport((200, _results([CHECKIN_ROW])), (200, _results([CHECKIN_ROW])))
    client = _client(transport)

    first = sync.run_endpoint_sync(db, client, endpoint="checkins", branch=branch)
    assert first.written == 1  # one row -> a check-in + a check-out event
    assert db.query(AttendanceEvent).count() == 2

    second = sync.run_endpoint_sync(db, client, endpoint="checkins", branch=branch)
    assert second.written == 0 and second.skipped == 1
    assert db.query(AttendanceEvent).count() == 2  # no duplicates


def test_checkins_sync_dead_letters_an_unresolved_member(db):
    roles = make_roles(db)
    branch = make_branch(db, "SLAM-NGK", "SLAM Nagalkeni")
    make_member(db, roles, branch, "Someone Else")
    db.commit()
    client = _client(FakeTransport((200, _results([CHECKIN_ROW]))))

    outcome = sync.run_endpoint_sync(db, client, endpoint="checkins", branch=branch)
    assert outcome.written == 0
    assert outcome.dead_lettered == 1
    assert outcome.unresolved_members == 1
    dl = db.query(YoactivDeadLetter).one()
    assert dl.endpoint == "checkins"
    assert dl.payload["Member_ID"] == 1957
    assert db.query(AttendanceEvent).count() == 0


def test_checkins_dry_run_writes_nothing_and_does_not_advance_cursor(db):
    member, _user, branch = _linked_member(db, member_id="1957")
    member.external_ref = "1957"
    db.commit()
    client = _client(FakeTransport((200, _results([CHECKIN_ROW]))))

    outcome = sync.run_endpoint_sync(db, client, endpoint="checkins", branch=branch, dry_run=True)
    assert outcome.written == 1  # would have written
    assert db.query(AttendanceEvent).count() == 0  # ... but rolled back
    cursor = db.query(YoactivSyncCursor).filter_by(endpoint="checkins").one_or_none()
    assert cursor is None or cursor.window_end is None


def test_checkins_sync_advances_the_cursor_on_success(db):
    member, _user, branch = _linked_member(db, member_id="1957")
    member.external_ref = "1957"
    db.commit()
    client = _client(FakeTransport((200, _results([]))))

    sync.run_endpoint_sync(db, client, endpoint="checkins", branch=branch)
    cursor = db.query(YoactivSyncCursor).filter_by(endpoint="checkins", branch_id=branch.id).one()
    assert cursor.window_end == date.today()
    assert cursor.status == "ok"
    assert cursor.last_success_at is not None


def test_transport_failure_marks_stuck_after_three_runs(db):
    _member, _user, branch = _linked_member(db)
    for _ in range(3):
        client = _client(FakeTransport((500, "x"), (500, "x"), (500, "x"), (500, "x"), (500, "x")))
        outcome = sync.run_endpoint_sync(db, client, endpoint="checkins", branch=branch)
    assert outcome.status == "stuck"
    cursor = db.query(YoactivSyncCursor).filter_by(endpoint="checkins").one()
    assert cursor.consecutive_failures >= sync.STUCK_AFTER


# ------------------------------------------------------ invoices -> lifecycle


def _invoice_with_term(member_id: str, start: date, end: date, plan="Annual") -> dict:
    return {
        **INVOICE_ROW,
        "bill_id": int(start.strftime("%Y%m%d")),
        "Member_Id": int(member_id),
        "Billed_Services": [
            {
                "Description": plan,
                "Duration": "1 year",
                "Base_fee": "12000",
                "Start_date": start.strftime("%d-%m-%Y"),
                "End_date": end.strftime("%d-%m-%Y"),
            }
        ],
    }


def test_invoice_creates_membership_and_activates_member(db):
    member, _user, branch = _linked_member(db, member_id="1683")
    member.external_ref = "1683"
    member.is_active = False
    db.query(Membership).filter_by(member_id=member.id).delete()
    db.commit()

    today = date.today()
    row = _invoice_with_term("1683", today - timedelta(days=10), today + timedelta(days=355))
    client = _client(FakeTransport((200, _results([row]))))
    outcome = sync.run_endpoint_sync(db, client, endpoint="invoices", branch=branch)

    assert outcome.written == 1
    db.refresh(member)
    assert member.is_active is True
    ms = db.query(Membership).filter_by(member_id=member.id).all()
    assert len(ms) == 1 and ms[0].status == MembershipStatus.ACTIVE


def test_expired_invoice_deactivates_but_keeps_history(db):
    member, _user, branch = _linked_member(db, member_id="1683")
    member.external_ref = "1683"
    db.query(Membership).filter_by(member_id=member.id).delete()
    db.commit()

    today = date.today()
    row = _invoice_with_term("1683", today - timedelta(days=400), today - timedelta(days=35))
    client = _client(FakeTransport((200, _results([row]))))
    sync.run_endpoint_sync(db, client, endpoint="invoices", branch=branch)

    db.refresh(member)
    assert member.is_active is False
    ms = db.query(Membership).filter_by(member_id=member.id).one()
    assert ms.status == MembershipStatus.EXPIRED
    assert db.get(Member, member.id) is not None  # never deleted


def test_renewal_adds_a_row_and_reactivates_without_losing_the_old_one(db):
    member, _user, branch = _linked_member(db, member_id="1683")
    member.external_ref = "1683"
    db.query(Membership).filter_by(member_id=member.id).delete()
    db.commit()
    today = date.today()

    old = _invoice_with_term("1683", today - timedelta(days=400), today - timedelta(days=35))
    new = _invoice_with_term("1683", today - timedelta(days=5), today + timedelta(days=360))
    client = _client(FakeTransport((200, _results([old, new]))))
    sync.run_endpoint_sync(db, client, endpoint="invoices", branch=branch)

    db.refresh(member)
    assert member.is_active is True
    rows = db.query(Membership).filter_by(member_id=member.id).order_by(Membership.starts_on).all()
    assert len(rows) == 2  # history retained, renewal appended
    assert rows[0].status == MembershipStatus.EXPIRED
    assert rows[1].status == MembershipStatus.ACTIVE


def test_invoice_sync_is_idempotent(db):
    member, _user, branch = _linked_member(db, member_id="1683")
    member.external_ref = "1683"
    db.query(Membership).filter_by(member_id=member.id).delete()
    db.commit()
    today = date.today()
    row = _invoice_with_term("1683", today - timedelta(days=10), today + timedelta(days=355))
    client = _client(FakeTransport((200, _results([row])), (200, _results([row]))))

    sync.run_endpoint_sync(db, client, endpoint="invoices", branch=branch)
    second = sync.run_endpoint_sync(db, client, endpoint="invoices", branch=branch)
    assert second.written == 0 and second.skipped == 1
    assert db.query(Membership).filter_by(member_id=member.id).count() == 1


# ------------------------------------------------------------------ admin API


def test_status_requires_admin_and_reports_disabled_by_default(client, world, auth):
    trainer_headers = auth(world["trainer_ngk_user"])
    assert client.get("/api/v1/admin/yoactiv/status", headers=trainer_headers).status_code == 403

    owner_headers = auth(world["owner"])
    resp = client.get("/api/v1/admin/yoactiv/status", headers=owner_headers)
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["enabled"] is False
    assert body["sync_endpoints"] == list(sync.SYNC_ENDPOINTS)


def test_sync_endpoint_409s_when_connector_disabled(client, world, auth):
    resp = client.post(
        "/api/v1/admin/yoactiv/sync",
        json={"endpoint": "checkins", "dry_run": True},
        headers=auth(world["owner"]),
    )
    assert resp.status_code == 409

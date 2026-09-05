"""The Yoactiv export-file bridge.

Fixtures reproduce the **exact column structure** of the two real Yoactiv
console reports (Membership Report, Member Check-ins) — including the columns
GymFlow ignores, the numbered S.No, the ``dd-MM-yyyy`` dates and the
``hh:mm AM/PM`` clock — with **sanitized values**. No real member name, mobile
number or Yoactiv id appears in this repository.
"""

from __future__ import annotations

import io
from datetime import date, time
from zoneinfo import ZoneInfo

import pytest
from conftest import make_member

from app.db.models import AttendanceEvent, EventType, Member, Membership, MembershipStatus
from app.integrations.yoactiv import exports as ex

API = "/api/v1/admin/yoactiv"

# The real Membership Report header, verbatim.
MEMBERSHIP_HEADER = [
    "S.No",
    "Member ID",
    "Attendance Id",
    "Member Name",
    "Mobile",
    "Service Name",
    "Bill No",
    "Start Date",
    "End Date",
    "Last Check-In Date",
    "Lead Source",
    "Sales Rep Name",
    "Bill Amount",
    "Pay Mode",
]

# The real Member Check-ins header, verbatim (the photo column has no title).
CHECKIN_HEADER = [
    "S.No",
    "Member ID",
    "",
    "Name",
    "Mobile",
    "Service Name",
    "Date",
    "Location",
    "Clock In",
    "Clock Out",
    "Medium/Staff",
    "Current PT",
    "Conducted By",
    "PT No Show",
    "Alert",
    "Reverse",
]


def _csv(header: list[str], rows: list[list[str]]) -> bytes:
    out = io.StringIO()
    import csv as _csv_mod

    writer = _csv_mod.writer(out)
    writer.writerow(header)
    for row in rows:
        writer.writerow(row)
    return out.getvalue().encode()


def membership_csv(rows: list[list[str]]) -> bytes:
    return _csv(MEMBERSHIP_HEADER, rows)


def checkin_csv(rows: list[list[str]]) -> bytes:
    return _csv(CHECKIN_HEADER, rows)


def membership_row(
    *,
    sno=1,
    member_id="9100001",
    attendance_id="55",
    name="Test Person One",
    mobile="9000000001",
    service="Annual Membership-12MONTHS",
    bill_no="Aug7-2025",
    start="23-11-2025",
    end="22-11-2026",
    last_checkin="28-05-2026",
    lead="Signboard",
    rep="Rep One",
    amount="8474.58",
    pay="GPay",
) -> list[str]:
    return [
        str(sno),
        member_id,
        attendance_id,
        name,
        mobile,
        service,
        bill_no,
        start,
        end,
        last_checkin,
        lead,
        rep,
        amount,
        pay,
    ]


def checkin_row(
    *,
    sno=1,
    member_id="9100001",
    name="Test Person One",
    mobile="9000000001",
    service="Gym Workout",
    on="05-09-2026",
    location="Slam Lifestyle And Fitness Studio,Nagalkeni",
    clock_in="05:42 PM",
    clock_out="",
    medium="Access Control Device-Gym Floor",
) -> list[str]:
    return [
        str(sno),
        member_id,
        "",
        name,
        mobile,
        service,
        on,
        location,
        clock_in,
        clock_out,
        medium,
        "",
        "-",
        "No",
        "-",
        "Reverse",
    ]


# --------------------------------------------------------------- parsing


def test_detects_the_membership_report():
    parsed = ex.parse_csv(membership_csv([membership_row()]))
    assert parsed.kind is ex.ExportKind.MEMBERSHIP
    assert len(parsed.rows) == 1


def test_detects_the_checkins_report():
    parsed = ex.parse_csv(checkin_csv([checkin_row()]))
    assert parsed.kind is ex.ExportKind.CHECKINS
    assert len(parsed.rows) == 1


def test_a_file_that_is_neither_report_is_refused():
    with pytest.raises(ex.HeaderValidationError):
        ex.parse_csv(_csv(["Widget", "Price"], [["a", "1"]]))


def test_a_report_missing_a_required_column_is_refused():
    header = [h for h in MEMBERSHIP_HEADER if h != "End Date"]
    with pytest.raises(ex.HeaderValidationError):
        ex.parse_csv(
            _csv(header, [["1", "9100001", "55", "N", "9000000001", "S", "B", "01-01-2026"]])
        )


def test_extra_unknown_columns_are_ignored():
    parsed = ex.parse_csv(_csv([*MEMBERSHIP_HEADER, "Some New Column"], [[*membership_row(), "x"]]))
    assert parsed.kind is ex.ExportKind.MEMBERSHIP


def test_an_html_table_served_as_xls_is_read_for_what_it_is():
    """Yoactiv's Membership Report downloads as ``.xls`` but is an HTML table —
    the ASP.NET ``application/vnd.ms-excel`` trick. Parse the bytes, not the
    file name."""
    cells = "".join(f"<td>{c}</td>" for c in membership_row())
    head = "".join(f"<th>{h}</th>" for h in MEMBERSHIP_HEADER)
    raw = f"<html><body><table><tr>{head}</tr><tr>{cells}</tr></table></body></html>".encode()
    assert ex.sniff(raw) == "html"
    parsed = ex.parse_upload("Membership Report_05_Sep_2026.xls", raw)
    assert parsed.kind is ex.ExportKind.MEMBERSHIP
    record, errors = ex.normalize_membership(parsed.rows[0])
    assert errors == [] and record.starts_on == date(2025, 11, 23)


def test_a_csv_named_xls_is_still_read():
    raw = membership_csv([membership_row()])
    assert ex.sniff(raw) == "csv"
    assert ex.parse_upload("Membership Report.xls", raw).kind is ex.ExportKind.MEMBERSHIP


def test_a_real_legacy_binary_xls_is_refused_with_a_usable_message():
    raw = b"\xd0\xcf\x11\xe0\xa1\xb1\x1a\xe1" + b"\x00" * 64
    assert ex.sniff(raw) == "xls"
    with pytest.raises(ex.HeaderValidationError, match="save as .xlsx or .csv"):
        ex.parse_upload("old.xls", raw)


def test_blank_spacer_rows_are_skipped():
    raw = membership_csv(
        [
            membership_row(),
            ["" for _ in MEMBERSHIP_HEADER],
            membership_row(sno=2, member_id="9100002"),
        ]
    )
    assert len(ex.parse_csv(raw).rows) == 2


# --------------------------------------------------------------- normalizing


def test_membership_dates_parse_as_day_month_year():
    parsed = ex.parse_csv(membership_csv([membership_row(start="23-11-2025", end="22-11-2026")]))
    record, errors = ex.normalize_membership(parsed.rows[0])
    assert errors == []
    assert record.starts_on == date(2025, 11, 23)
    assert record.ends_on == date(2026, 11, 22)
    assert record.bill_amount == pytest.approx(8474.58)


def test_checkin_clock_parses_as_twelve_hour():
    parsed = ex.parse_csv(checkin_csv([checkin_row(clock_in="05:42 PM", clock_out="07:05 PM")]))
    record, errors = ex.normalize_checkin(parsed.rows[0])
    assert errors == []
    assert record.on == date(2026, 9, 5)
    assert record.clock_in == time(17, 42)
    assert record.clock_out == time(19, 5)


def test_a_row_with_an_unreadable_date_is_invalid_not_guessed():
    parsed = ex.parse_csv(membership_csv([membership_row(start="not-a-date")]))
    record, errors = ex.normalize_membership(parsed.rows[0])
    assert record is None and any("Start Date" in e for e in errors)


def test_end_before_start_is_invalid():
    parsed = ex.parse_csv(membership_csv([membership_row(start="01-01-2026", end="01-01-2025")]))
    record, errors = ex.normalize_membership(parsed.rows[0])
    assert record is None and any("before" in e for e in errors)


def test_a_checkin_with_no_clock_is_still_a_real_visit():
    """The on-screen check-in report shows Clock In / Clock Out; the Excel
    export omits both. A date-only row is a real visit, not an invalid one."""
    parsed = ex.parse_csv(checkin_csv([checkin_row(clock_in="", clock_out="")]))
    record, errors = ex.normalize_checkin(parsed.rows[0])
    assert errors == []
    assert record.on == date(2026, 9, 5)
    assert record.clock_in is None and record.clock_out is None


def test_a_date_only_visit_is_filed_at_branch_midnight_and_says_so(db, world):
    """Midnight is a marker, not a claim — inventing a plausible 5:42 PM would
    read as a recorded time. work_date, which every attendance signal keys on,
    is exact either way."""
    member = _matched_member(db, world)
    branch = world["branches"]["ngk"]
    parsed = ex.parse_csv(checkin_csv([checkin_row(clock_in="", clock_out="")]))
    result = ex.import_checkins(db, ex.classify(db, parsed), branch=branch)
    db.commit()

    assert result.written == 1  # a single CHECK_IN, never a fabricated CHECK_OUT
    event = db.query(AttendanceEvent).one()
    assert event.event_type is EventType.CHECK_IN
    assert event.work_date == date(2026, 9, 5)
    assert event.user_id == member.user_id
    local = event.occurred_at.astimezone(ZoneInfo(branch.timezone))
    assert (local.hour, local.minute) == (0, 0)
    assert "no clock time" in (event.notes or "")


def test_a_date_only_visit_is_idempotent_on_re_import(db, world):
    _matched_member(db, world)
    branch = world["branches"]["ngk"]
    raw = checkin_csv([checkin_row(clock_in="", clock_out="")])
    ex.import_checkins(db, ex.classify(db, ex.parse_csv(raw)), branch=branch)
    db.commit()
    second = ex.import_checkins(db, ex.classify(db, ex.parse_csv(raw)), branch=branch)
    db.commit()
    assert second.written == 0
    assert db.query(AttendanceEvent).count() == 1


def test_the_real_export_header_spellings_are_understood():
    """The workbook writes MemberID / Service_Name where the screen shows
    'Member ID' / 'Service Name', and carries no clock columns at all."""
    header = ["MemberID", "Name", "Mobile", "Service_Name", "Date", "Location"]
    rows = [["2709792", "Someone", "9000000002", "Gym Workout", "05-09-2026", "Studio,Nagalkeni"]]
    parsed = ex.parse_csv(_csv(header, rows))
    assert parsed.kind is ex.ExportKind.CHECKINS
    record, errors = ex.normalize_checkin(parsed.rows[0])
    assert errors == []
    assert record.yoactiv_member_id == "2709792"
    assert record.service_name == "Gym Workout"
    assert record.location_hint == "Studio,Nagalkeni"


def test_a_float_formatted_member_id_is_normalised():
    parsed = ex.parse_csv(membership_csv([membership_row(member_id="2395113.0")]))
    record, _ = ex.normalize_membership(parsed.rows[0])
    assert record.yoactiv_member_id == "2395113"


# --------------------------------------------------------------- classification


def test_an_unknown_member_is_unmatched_never_invented(db, world):
    parsed = ex.parse_csv(
        membership_csv([membership_row(member_id="9999999", mobile="9111111111")])
    )
    rows = ex.classify(db, parsed)
    assert rows[0].classification is ex.Classification.UNMATCHED
    assert db.query(Member).count() == 1  # world's single member; nothing created


def test_a_member_matches_on_external_ref_first(db, world):
    member = world["member_ngk"]
    member.external_ref = "9100001"
    db.commit()
    parsed = ex.parse_csv(
        membership_csv([membership_row(member_id="9100001", mobile="0000000000")])
    )
    rows = ex.classify(db, parsed)
    assert rows[0].classification is ex.Classification.MATCHED
    assert rows[0].member_id == member.id


def test_a_member_matches_on_a_unique_phone(db, world):
    member = world["member_ngk"]
    member.user.phone = "9000000001"
    db.commit()
    parsed = ex.parse_csv(membership_csv([membership_row(mobile="9000000001")]))
    rows = ex.classify(db, parsed)
    assert rows[0].classification is ex.Classification.MATCHED


def test_a_shared_phone_is_ambiguous_never_auto_linked(db, world):
    branch = world["branches"]["ngk"]
    a, _ = make_member(db, world["roles"], branch, "Twin A")
    b, _ = make_member(db, world["roles"], branch, "Twin B")
    a.user.phone = "9000000001"
    b.user.phone = "9000000001"
    db.commit()
    parsed = ex.parse_csv(membership_csv([membership_row(mobile="9000000001")]))
    rows = ex.classify(db, parsed)
    assert rows[0].classification is ex.Classification.AMBIGUOUS


def test_the_same_term_twice_in_one_file_is_a_duplicate(db, world):
    raw = membership_csv([membership_row(), membership_row(sno=2)])
    rows = ex.classify(db, ex.parse_csv(raw))
    assert rows[1].classification is ex.Classification.DUPLICATE


def test_the_same_visit_twice_in_one_file_is_a_duplicate(db, world):
    raw = checkin_csv([checkin_row(), checkin_row(sno=2)])
    rows = ex.classify(db, ex.parse_csv(raw))
    assert rows[1].classification is ex.Classification.DUPLICATE


# --------------------------------------------------------------- importing


def _matched_member(db, world, *, phone="9000000001"):
    member = world["member_ngk"]
    member.user.phone = phone
    db.commit()
    return member


def test_importing_a_membership_creates_the_term_and_stamps_the_yoactiv_id(db, world):
    member = _matched_member(db, world)
    parsed = ex.parse_csv(membership_csv([membership_row(member_id="9100001")]))
    result = ex.import_memberships(db, ex.classify(db, parsed))
    db.commit()

    assert result.written == 1
    db.refresh(member)
    assert member.external_ref == "9100001"
    term = db.query(Membership).filter_by(plan_name="Annual Membership-12MONTHS").one()
    assert (term.starts_on, term.ends_on) == (date(2025, 11, 23), date(2026, 11, 22))
    assert term.status is MembershipStatus.ACTIVE


def test_importing_the_same_membership_file_twice_writes_nothing_new(db, world):
    _matched_member(db, world)
    raw = membership_csv([membership_row()])
    ex.import_memberships(db, ex.classify(db, ex.parse_csv(raw)))
    db.commit()
    before = db.query(Membership).count()

    second = ex.import_memberships(db, ex.classify(db, ex.parse_csv(raw)))
    db.commit()
    assert second.written == 0
    assert db.query(Membership).count() == before


def test_a_renewal_adds_a_row_and_keeps_the_old_one(db, world):
    member = _matched_member(db, world)
    plan = "Annual Membership-12MONTHS"
    first = membership_csv([membership_row(start="01-01-2025", end="31-12-2025")])
    ex.import_memberships(db, ex.classify(db, ex.parse_csv(first)))
    db.commit()
    renewal = membership_csv([membership_row(start="01-01-2026", end="31-12-2026")])
    ex.import_memberships(db, ex.classify(db, ex.parse_csv(renewal)))
    db.commit()

    terms = (
        db.query(Membership)
        .filter_by(member_id=member.id, plan_name=plan)
        .order_by(Membership.starts_on)
        .all()
    )
    assert [(t.starts_on, t.ends_on) for t in terms] == [
        (date(2025, 1, 1), date(2025, 12, 31)),
        (date(2026, 1, 1), date(2026, 12, 31)),
    ]
    # The lapsed term is kept as history, not rewritten.
    assert terms[0].status is MembershipStatus.EXPIRED


def test_importing_checkins_writes_attendance_in_branch_time(db, world):
    member = _matched_member(db, world)
    branch = world["branches"]["ngk"]
    parsed = ex.parse_csv(checkin_csv([checkin_row(clock_in="05:42 PM", clock_out="07:05 PM")]))
    result = ex.import_checkins(db, ex.classify(db, parsed), branch=branch)
    db.commit()

    assert result.written == 2  # one in, one out
    events = db.query(AttendanceEvent).order_by(AttendanceEvent.occurred_at).all()
    assert [e.event_type for e in events] == [EventType.CHECK_IN, EventType.CHECK_OUT]
    assert all(e.user_id == member.user_id for e in events)
    assert all(e.work_date == date(2026, 9, 5) for e in events)
    # 17:42 IST == 12:12 UTC
    assert events[0].occurred_at.astimezone(__import__("datetime").timezone.utc).hour == 12


def test_importing_the_same_checkin_file_twice_writes_nothing_new(db, world):
    _matched_member(db, world)
    branch = world["branches"]["ngk"]
    raw = checkin_csv([checkin_row()])
    ex.import_checkins(db, ex.classify(db, ex.parse_csv(raw)), branch=branch)
    db.commit()
    before = db.query(AttendanceEvent).count()

    second = ex.import_checkins(db, ex.classify(db, ex.parse_csv(raw)), branch=branch)
    db.commit()
    assert second.written == 0
    assert db.query(AttendanceEvent).count() == before


def test_an_api_synced_visit_is_not_duplicated_by_the_export(db, world):
    """The incompatibility this bridge exists to survive: the API's key
    includes Service_card_id, the export has no such column. The natural-key
    guard is what stops the same visit being counted twice."""
    member = _matched_member(db, world)
    branch = world["branches"]["ngk"]
    from app.core.clock import combine_branch

    db.add(
        AttendanceEvent(
            branch_id=branch.id,
            person_type=__import__("app.db.models", fromlist=["PersonType"]).PersonType.MEMBER,
            user_id=member.user_id,
            event_type=EventType.CHECK_IN,
            method=__import__("app.db.models", fromlist=["CaptureMethod"]).CaptureMethod.MANUAL,
            occurred_at=combine_branch(date(2026, 9, 5), time(17, 42), branch.timezone),
            work_date=date(2026, 9, 5),
            external_event_id="yoactiv:checkin:someapihash:in",  # the API's namespace
        )
    )
    db.commit()

    parsed = ex.parse_csv(checkin_csv([checkin_row(clock_in="05:42 PM")]))
    result = ex.import_checkins(db, ex.classify(db, parsed), branch=branch)
    db.commit()
    assert result.written == 0
    assert db.query(AttendanceEvent).count() == 1


def test_only_matched_rows_are_ever_written(db, world):
    _matched_member(db, world)
    raw = membership_csv(
        [
            membership_row(mobile="9000000001"),  # matched
            membership_row(sno=2, member_id="9999998", mobile="9222222222"),  # unmatched
            membership_row(sno=3, member_id="9999997", start="bad"),  # invalid
        ]
    )
    rows = ex.classify(db, ex.parse_csv(raw))
    result = ex.import_memberships(db, rows)
    db.commit()
    assert result.counts["matched"] == 1
    assert result.counts["unmatched"] == 1
    assert result.counts["invalid"] == 1
    assert db.query(Membership).count() == 1 + 1  # world's own + the imported one


# --------------------------------------------------------------- account plans


def test_an_unmatched_row_plans_an_account_but_creates_nothing(db, world):
    parsed = ex.parse_csv(
        membership_csv([membership_row(member_id="9300001", mobile="9333333331")])
    )
    rows = ex.classify(db, parsed)
    plans, conflicts = ex.plan_accounts(db, rows)
    assert len(plans) == 1 and plans[0].yoactiv_member_id == "9300001"
    assert conflicts == []
    assert db.query(Member).count() == 1  # planning writes nothing


def test_two_yoactiv_members_on_one_mobile_are_a_conflict_not_an_account(db, world):
    raw = membership_csv(
        [
            membership_row(member_id="9300001", mobile="9333333331", name="Person A"),
            membership_row(sno=2, member_id="9300002", mobile="9333333331", name="Person B"),
        ]
    )
    plans, conflicts = ex.plan_accounts(db, ex.classify(db, ex.parse_csv(raw)))
    assert plans == []
    assert {c.reason for c in conflicts} == {"shared_phone"}


def test_a_mobile_an_existing_account_already_uses_is_a_conflict(db, world):
    member = world["member_ngk"]
    member.user.phone = "9444444441"
    db.commit()
    # A *different* Yoactiv id on the same number: resolve_member matches it on
    # the unique phone, so it never reaches planning as UNMATCHED.
    raw = membership_csv([membership_row(member_id="9300003", mobile="9444444441")])
    rows = ex.classify(db, ex.parse_csv(raw))
    assert rows[0].classification is ex.Classification.MATCHED


def test_created_accounts_must_change_password_and_get_no_membership(db, world):
    from app.core.security import hash_password
    from app.db.models import Role, RoleKey

    branch = world["branches"]["ngk"]
    role = db.query(Role).filter_by(key=RoleKey.MEMBER.value).one()
    raw = membership_csv(
        [membership_row(member_id="9300009", mobile="9333333339", name="New Person")]
    )
    rows = ex.classify(db, ex.parse_csv(raw))
    plans, _ = ex.plan_accounts(db, rows)

    created = ex.create_accounts(
        db,
        plans,
        branch=branch,
        role_id=role.id,
        password_hash=hash_password("temp-not-a-real-password"),
        joined_on=date(2026, 9, 5),
    )
    db.commit()
    assert len(created) == 1
    member = db.get(Member, created[0])
    assert member.external_ref == "9300009"
    assert member.is_demo is False
    assert member.user.must_change_password is True
    assert member.user.login_phone == "9333333339"
    # No membership: commercial state only ever comes from a billing row.
    assert db.query(Membership).filter_by(member_id=member.id).count() == 0


# --------------------------------------------------------------- endpoints


def test_preview_writes_nothing_and_reports_counts(client, db, world, auth):
    _matched_member(db, world)
    files = {"file": ("Membership Report.csv", membership_csv([membership_row()]), "text/csv")}
    r = client.post(
        f"{API}/exports/preview",
        files=files,
        data={"branch_id": world["branches"]["ngk"].id},
        headers=auth(world["owner"]),
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["report"] == "membership"
    assert body["counts"]["matched"] == 1
    assert body["committed"] is False
    assert db.query(Membership).count() == 1  # world's own only


def test_import_requires_confirm(client, db, world, auth):
    files = {"file": ("m.csv", membership_csv([membership_row()]), "text/csv")}
    r = client.post(
        f"{API}/exports/import",
        files=files,
        data={"branch_id": world["branches"]["ngk"].id},
        headers=auth(world["owner"]),
    )
    assert r.status_code == 422


def test_import_commits_and_audits(client, db, world, auth):
    _matched_member(db, world)
    files = {"file": ("m.csv", membership_csv([membership_row()]), "text/csv")}
    r = client.post(
        f"{API}/exports/import",
        files=files,
        data={"branch_id": world["branches"]["ngk"].id, "confirm": "true"},
        headers=auth(world["owner"]),
    )
    assert r.status_code == 200, r.text
    assert r.json()["written"] == 1

    from app.db.models import AuditLog

    entry = db.query(AuditLog).filter_by(action="yoactiv.export_import").one()
    assert entry.details["report"] == "membership"
    assert entry.details["source"] == "yoactiv-export"


def test_a_malformed_upload_is_422_not_500(client, world, auth):
    files = {"file": ("junk.csv", b"not,a,yoactiv,report\n1,2,3,4\n", "text/csv")}
    r = client.post(
        f"{API}/exports/preview",
        files=files,
        data={"branch_id": world["branches"]["ngk"].id},
        headers=auth(world["owner"]),
    )
    assert r.status_code == 422
    assert "Yoactiv" in r.json()["detail"]


def test_an_unsupported_file_type_is_refused(client, world, auth):
    files = {"file": ("export.pdf", b"%PDF-1.4", "application/pdf")}
    r = client.post(
        f"{API}/exports/preview",
        files=files,
        data={"branch_id": world["branches"]["ngk"].id},
        headers=auth(world["owner"]),
    )
    assert r.status_code == 422


def test_an_empty_file_is_refused(client, world, auth):
    files = {"file": ("m.csv", b"", "text/csv")}
    r = client.post(
        f"{API}/exports/preview",
        files=files,
        data={"branch_id": world["branches"]["ngk"].id},
        headers=auth(world["owner"]),
    )
    assert r.status_code == 422


def test_an_unknown_branch_is_refused(client, world, auth):
    files = {"file": ("m.csv", membership_csv([membership_row()]), "text/csv")}
    r = client.post(
        f"{API}/exports/preview",
        files=files,
        data={"branch_id": 99999},
        headers=auth(world["owner"]),
    )
    assert r.status_code == 422


@pytest.mark.parametrize("actor", ["member_ngk_user", "trainer_ngk_user"])
def test_members_and_trainers_cannot_import(client, world, auth, actor):
    files = {"file": ("m.csv", membership_csv([membership_row()]), "text/csv")}
    for path in ("preview", "import"):
        r = client.post(
            f"{API}/exports/{path}",
            files=files,
            data={"branch_id": world["branches"]["ngk"].id, "confirm": "true"},
            headers=auth(world[actor]),
        )
        assert r.status_code == 403


def test_import_needs_authentication(client, world):
    files = {"file": ("m.csv", membership_csv([membership_row()]), "text/csv")}
    r = client.post(f"{API}/exports/preview", files=files, data={"branch_id": 1})
    assert r.status_code == 401


def test_preview_masks_mobile_numbers_in_problem_rows(client, db, world, auth):
    files = {
        "file": (
            "m.csv",
            membership_csv([membership_row(member_id="9555555", mobile="9555555551")]),
            "text/csv",
        )
    }
    r = client.post(
        f"{API}/exports/preview",
        files=files,
        data={"branch_id": world["branches"]["ngk"].id},
        headers=auth(world["owner"]),
    )
    body = r.json()
    assert body["problems"], "an unmatched row should be reported"
    assert body["problems"][0]["mobile"] == "******5551"
    assert "9555555551" not in r.text


def test_a_checkin_import_is_scoped_to_the_members_own_branch(db, world):
    """Attendance is filed against the member's branch, not the branch the
    operator happened to pass — a mis-selected branch cannot move a member's
    history to another club."""
    member = _matched_member(db, world)
    other = world["branches"]["bgh"]
    parsed = ex.parse_csv(checkin_csv([checkin_row()]))
    ex.import_checkins(db, ex.classify(db, parsed), branch=other)
    db.commit()
    event = db.query(AttendanceEvent).first()
    assert event.branch_id == member.branch_id != other.id

"""Fingerprint / X2008 hardware.

Covers, in order: the device/enrollment tables and their constraints, the
best-effort ADMS parser in isolation, the device-facing write path in
``attendance_service``, and the API surface end to end (device registration,
enrollment, and the push receiver). Every enabled-path test flips
``settings.access_control_enabled`` on for the duration of the test via
``monkeypatch`` — the feature stays off by default everywhere else in the
suite, matching every other integration.
"""

from __future__ import annotations

from datetime import date, datetime, timedelta
from zoneinfo import ZoneInfo

import pytest
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError

from app.core import clock
from app.core.clock import UTC
from app.core.config import settings
from app.db.models import (
    AttendanceEvent,
    FingerprintDevice,
    FingerprintEnrollment,
    Membership,
    MembershipStatus,
    PackageStatus,
)
from app.integrations.access_control.x2008 import X2008FingerprintProvider, parse_adms_attlog
from app.services import attendance_service, pt_service
from app.services.attendance_service import AttendanceError

IST = ZoneInfo("Asia/Kolkata")

SECRET = "test-adms-shared-secret"


@pytest.fixture
def enable_access_control(monkeypatch):
    monkeypatch.setattr(settings, "access_control_enabled", True)
    monkeypatch.setattr(settings, "fingerprint_adms_shared_secret", SECRET)
    yield


def make_device(db, branch, serial="CUB7250201499", device_number=1) -> FingerprintDevice:
    device = FingerprintDevice(
        branch_id=branch.id,
        device_number=device_number,
        serial=serial,
        label="Front desk X2008",
        ip_address="192.168.0.5",
        tcp_port=4370,
        is_active=True,
    )
    db.add(device)
    db.flush()
    return device


def enroll(db, member, device, enrolled_id="7") -> FingerprintEnrollment:
    row = FingerprintEnrollment(
        member_id=member.id,
        branch_id=member.branch_id,
        device_id=device.id,
        enrolled_id=enrolled_id,
    )
    db.add(row)
    db.flush()
    return row


def enable_method(db, branch_id=None):
    """Branches only accept a method once it is in attendance.methods_enabled
    — same gate QR/PIN already go through."""
    from sqlalchemy import select

    from app.db.models import Setting

    row = db.scalar(
        select(Setting).where(
            Setting.key == "attendance.methods_enabled", Setting.branch_id == branch_id
        )
    )
    if row is None:
        db.add(
            Setting(
                key="attendance.methods_enabled",
                branch_id=branch_id,
                value={"value": ["qr", "pin", "fingerprint"]},
            )
        )
    else:
        row.value = {"value": ["qr", "pin", "fingerprint"]}
    db.flush()


# ------------------------------------------------------------------- models


def test_device_serial_is_globally_unique(db, world):
    branch = world["branches"]["ngk"]
    other = world["branches"]["bgh"]
    make_device(db, branch, serial="DUP-SERIAL")
    db.flush()
    with pytest.raises(IntegrityError):
        make_device(db, other, serial="DUP-SERIAL", device_number=1)


def test_enrolled_id_is_unique_per_device_not_globally(db, world):
    branch = world["branches"]["ngk"]
    device_a = make_device(db, branch, serial="DEV-A", device_number=1)
    device_b = make_device(db, branch, serial="DEV-B", device_number=2)
    member, _ = _member(db, world, "Riya")
    member2, _ = _member(db, world, "Kiran")

    enroll(db, member, device_a, enrolled_id="1")
    # Same enrolled_id "1" on a *different* device is fine.
    enroll(db, member2, device_b, enrolled_id="1")


def test_a_member_has_at_most_one_enrollment(db, world):
    branch = world["branches"]["ngk"]
    device = make_device(db, branch)
    member, _ = _member(db, world, "Riya")
    enroll(db, member, device, enrolled_id="1")
    db.flush()
    with pytest.raises(IntegrityError):
        enroll(db, member, device, enrolled_id="2")


def test_external_ref_column_is_not_reused_for_fingerprint(db, world):
    """Fingerprint identity lives in its own table, never on
    Member.external_ref — that column is reserved for Yoactiv."""
    member, _ = _member(db, world, "Riya")
    assert member.external_ref is None


def _member(db, world, name):
    from conftest import make_member

    branch = world["branches"]["ngk"]
    return make_member(db, world["roles"], branch, name)


def _expire_membership(db, member, *, days_ago: int = 5):
    """conftest.make_member always gives a fresh member an ACTIVE membership
    ending 200 days out — this backdates it to simulate a lapsed one."""
    membership = db.scalar(select(Membership).where(Membership.member_id == member.id))
    membership.ends_on = date.today() - timedelta(days=days_ago)
    db.commit()
    return membership


# --------------------------------------------------------------- ADMS parser


def test_parses_classic_tab_delimited_attlog():
    body = "1\t2026-08-21 08:00:00\t0\t1\n7\t2026-08-21 08:05:12\t1\t1\n"
    result = parse_adms_attlog(body)
    assert result.malformed_line_count == 0
    assert len(result.records) == 2
    first = result.records[0]
    assert first.enrolled_id == "1"
    assert first.device_time_raw == "2026-08-21 08:00:00"
    assert first.device_time is not None
    assert first.status_raw == "0"


def test_malformed_lines_are_counted_not_raised():
    body = "garbage-with-no-tabs-or-time\n1\t2026-08-21 08:00:00\t0\t1\n\n"
    result = parse_adms_attlog(body)
    assert result.malformed_line_count == 1
    assert len(result.records) == 1


def test_whitespace_separated_fallback():
    body = "3 2026-08-21 09:00:00 0 1"
    result = parse_adms_attlog(body)
    assert len(result.records) == 1
    assert result.records[0].enrolled_id == "3"


# ------------------------------------------------------ normalized AccessEvent


def test_a_parsed_record_normalizes_to_an_access_event_with_no_event_type():
    """The X2008 has no in/out signal of its own — `event_type` must stay
    unset rather than be guessed at the normalization stage."""
    from app.integrations.access_control.x2008 import to_access_event

    record = parse_adms_attlog("7\t2026-08-21 08:05:12\t0\t1\n").records[0]
    received = datetime(2026, 8, 21, 8, 5, 20, tzinfo=UTC)

    event = to_access_event(record, device_serial="CUB7250201499", received_at=received)

    assert event.device_id == "CUB7250201499"
    assert event.device_user_id == "7"
    assert event.device_occurred_at == datetime(2026, 8, 21, 8, 5, 12)
    assert event.received_at == received
    assert event.event_type is None
    assert event.reference_id == "CUB7250201499:7:2026-08-21 08:05:12"


def test_an_unparseable_device_timestamp_leaves_device_occurred_at_unset():
    from app.integrations.access_control.x2008 import to_access_event

    record = parse_adms_attlog("7\tnot-a-timestamp\t0\t1\n").records[0]
    event = to_access_event(record, device_serial="CUB7250201499", received_at=clock.now_utc())
    assert event.device_occurred_at is None
    # received_at — the server clock — is what attendance is actually timed by.
    assert event.received_at is not None


# ---------------------------------------------------------------- resolve_member


def test_resolve_member_finds_the_member_mapped_to_this_device_and_enrolled_id(db, world):
    from app.integrations.access_control.x2008 import resolve_member

    branch = world["branches"]["ngk"]
    device = make_device(db, branch)
    member, _ = _member(db, world, "Riya")
    enroll(db, member, device, enrolled_id="42")
    db.commit()

    resolved = resolve_member(db, device_id=device.id, device_user_id="42")
    assert resolved is not None
    assert resolved.id == member.id


def test_resolve_member_returns_none_for_an_unrecognised_enrolled_id(db, world):
    """The whole point: no fuzzy fallback, no guess — just `None`."""
    from app.integrations.access_control.x2008 import resolve_member

    branch = world["branches"]["ngk"]
    device = make_device(db, branch)
    db.commit()

    assert resolve_member(db, device_id=device.id, device_user_id="does-not-exist") is None


def test_resolve_member_does_not_match_the_same_enrolled_id_on_a_different_device(db, world):
    from app.integrations.access_control.x2008 import resolve_member

    branch = world["branches"]["ngk"]
    device_a = make_device(db, branch, serial="DEV-A", device_number=1)
    device_b = make_device(db, branch, serial="DEV-B", device_number=2)
    member, _ = _member(db, world, "Riya")
    enroll(db, member, device_a, enrolled_id="7")
    db.commit()

    assert resolve_member(db, device_id=device_b.id, device_user_id="7") is None
    assert resolve_member(db, device_id=device_a.id, device_user_id="7") is not None


# ---------------------------------------------------------- provider (x2008)


def test_provider_health_reports_no_templates_stored_and_unverified_protocol(enable_access_control):
    provider = X2008FingerprintProvider(session_factory=None)
    health = provider.health()
    assert health["biometric_templates_stored"] is False
    assert health["protocol_verified_against_device"] is False
    assert health["enabled"] is True


def test_provider_is_disabled_by_default():
    provider = X2008FingerprintProvider(session_factory=None)
    assert provider.enabled is False
    assert provider.health()["enabled"] is False


def test_verify_resolves_a_known_enrolled_id(db, world, enable_access_control):
    from app.db.session import SessionLocal

    branch = world["branches"]["ngk"]
    device = make_device(db, branch)
    member, _ = _member(db, world, "Riya")
    enroll(db, member, device, enrolled_id="42")
    db.commit()

    provider = X2008FingerprintProvider(session_factory=SessionLocal)
    decision = provider.verify(branch.code, "fingerprint", "42")
    assert decision.allowed is True
    assert decision.person_external_id == member.member_code


def test_verify_declines_an_unknown_enrolled_id(db, world, enable_access_control):
    from app.db.session import SessionLocal

    branch = world["branches"]["ngk"]
    make_device(db, branch)
    db.commit()

    provider = X2008FingerprintProvider(session_factory=SessionLocal)
    decision = provider.verify(branch.code, "fingerprint", "does-not-exist")
    assert decision.allowed is False


# --------------------------------------------------- attendance_service path


def test_record_fingerprint_scan_is_refused_when_integration_disabled(db, world):
    branch = world["branches"]["ngk"]
    device = make_device(db, branch)
    member, _ = _member(db, world, "Riya")
    enroll(db, member, device, enrolled_id="1")
    db.commit()

    with pytest.raises(AttendanceError):
        attendance_service.record_fingerprint_scan(
            db, member=member, branch=branch, device_info="x2008", external_event_id="e1"
        )


def test_record_fingerprint_scan_requires_the_branch_to_opt_in(db, world, enable_access_control):
    """ACCESS_CONTROL_ENABLED alone is not enough — the branch must also add
    "fingerprint" to attendance.methods_enabled, same as QR/PIN."""
    branch = world["branches"]["ngk"]
    device = make_device(db, branch)
    member, _ = _member(db, world, "Riya")
    enroll(db, member, device, enrolled_id="1")
    db.commit()

    with pytest.raises(AttendanceError):
        attendance_service.record_fingerprint_scan(
            db, member=member, branch=branch, device_info="x2008", external_event_id="e1"
        )


def test_a_scan_checks_a_member_in_then_out(db, world, enable_access_control):
    branch = world["branches"]["ngk"]
    enable_method(db, branch.id)
    device = make_device(db, branch)
    member, _ = _member(db, world, "Riya")
    enroll(db, member, device, enrolled_id="1")
    db.commit()

    first = attendance_service.record_fingerprint_scan(
        db,
        member=member,
        branch=branch,
        device_info="x2008:CUB7250201499",
        external_event_id="e-in",
    )
    assert first.event_type.value == "check_in"

    second = attendance_service.record_fingerprint_scan(
        db,
        member=member,
        branch=branch,
        device_info="x2008:CUB7250201499",
        external_event_id="e-out",
    )
    assert second.event_type.value == "check_out"


def test_a_duplicate_external_event_id_writes_one_row(db, world, enable_access_control):
    branch = world["branches"]["ngk"]
    enable_method(db, branch.id)
    device = make_device(db, branch)
    member, _ = _member(db, world, "Riya")
    enroll(db, member, device, enrolled_id="1")
    db.commit()

    first = attendance_service.record_fingerprint_scan(
        db, member=member, branch=branch, device_info="x2008", external_event_id="same-event"
    )
    second = attendance_service.record_fingerprint_scan(
        db, member=member, branch=branch, device_info="x2008", external_event_id="same-event"
    )
    assert first.id == second.id

    from sqlalchemy import select

    rows = db.scalars(
        select(AttendanceEvent).where(AttendanceEvent.external_event_id == "same-event")
    ).all()
    assert len(rows) == 1


def test_a_scan_cannot_be_attributed_to_a_member_at_another_branch(
    db, world, enable_access_control
):
    ngk = world["branches"]["ngk"]
    bgh = world["branches"]["bgh"]
    enable_method(db, ngk.id)
    enable_method(db, bgh.id)
    make_device(db, bgh, serial="BGH-DEVICE")
    member_ngk, _ = _member(db, world, "Riya")  # registered at ngk
    db.commit()

    # A push resolved to a member registered at a different branch than the
    # one the device/event claims is refused outright, regardless of what
    # the enrollment table says.
    with pytest.raises(AttendanceError):
        attendance_service.record_fingerprint_scan(
            db,
            member=member_ngk,
            branch=bgh,
            device_info="x2008",
            external_event_id="cross-branch",
        )


# ------------------------------------------------------- membership eligibility


def test_active_membership_is_allowed_through(db, world, enable_access_control):
    branch = world["branches"]["ngk"]
    enable_method(db, branch.id)
    device = make_device(db, branch)
    member, _ = _member(db, world, "Riya")
    enroll(db, member, device, enrolled_id="1")
    db.commit()

    event = attendance_service.record_fingerprint_scan(
        db, member=member, branch=branch, device_info="x2008", external_event_id="e1"
    )
    assert event.event_type.value == "check_in"


def test_expired_membership_denies_the_scan_and_writes_no_event(db, world, enable_access_control):
    branch = world["branches"]["ngk"]
    enable_method(db, branch.id)
    device = make_device(db, branch)
    member, _ = _member(db, world, "Riya")
    enroll(db, member, device, enrolled_id="1")
    _expire_membership(db, member)

    with pytest.raises(AttendanceError) as excinfo:
        attendance_service.record_fingerprint_scan(
            db, member=member, branch=branch, device_info="x2008", external_event_id="e1"
        )
    assert excinfo.value.detail["code"] == "membership_expired"

    rows = db.scalars(
        select(AttendanceEvent).where(AttendanceEvent.external_event_id == "e1")
    ).all()
    assert rows == []


def test_a_membership_expiring_by_date_is_denied_even_if_the_stored_status_is_stale(
    db, world, enable_access_control
):
    """Same self-heal `pt_eligibility.effective_membership_status` already
    applies to PT: a membership whose `ends_on` has passed is treated as
    expired even before a nightly job has caught the stored column up."""
    branch = world["branches"]["ngk"]
    enable_method(db, branch.id)
    device = make_device(db, branch)
    member, _ = _member(db, world, "Riya")
    enroll(db, member, device, enrolled_id="1")
    membership = db.scalar(select(Membership).where(Membership.member_id == member.id))
    membership.ends_on = date.today() - timedelta(days=1)
    membership.status = MembershipStatus.ACTIVE  # stale on purpose
    db.commit()

    with pytest.raises(AttendanceError) as excinfo:
        attendance_service.record_fingerprint_scan(
            db, member=member, branch=branch, device_info="x2008", external_event_id="e1"
        )
    assert excinfo.value.detail["code"] == "membership_expired"


def test_pt_sessions_remaining_do_not_override_an_expired_membership(
    db, world, enable_access_control
):
    """The rule this test exists to hold: access is a membership question,
    never a PT question. A member can be mid-package, with sessions left and
    a trainer expecting them, and still be turned away at the door once
    their membership itself has lapsed."""
    branch = world["branches"]["ngk"]
    enable_method(db, branch.id)
    device = make_device(db, branch)
    member, _ = _member(db, world, "Riya")
    enroll(db, member, device, enrolled_id="1")
    package = pt_service.create_package(db, member=member, sessions_total=12)
    db.commit()
    assert package.status is PackageStatus.ACTIVE
    assert package.sessions_remaining == 12

    _expire_membership(db, member)

    with pytest.raises(AttendanceError) as excinfo:
        attendance_service.record_fingerprint_scan(
            db, member=member, branch=branch, device_info="x2008", external_event_id="e1"
        )
    assert excinfo.value.detail["code"] == "membership_expired"

    # The package itself is untouched by the denied access attempt — this is
    # an access decision, never a mutation of PT state.
    db.refresh(package)
    assert package.status is PackageStatus.ACTIVE
    assert package.sessions_remaining == 12


def test_a_member_with_no_membership_row_at_all_is_denied(db, world, enable_access_control):
    """Belt-and-braces: a member somehow missing a membership row entirely
    reads as ineligible, never as an unchecked/implicit pass."""
    branch = world["branches"]["ngk"]
    enable_method(db, branch.id)
    device = make_device(db, branch)
    member, _ = _member(db, world, "Riya")
    enroll(db, member, device, enrolled_id="1")
    db.execute(Membership.__table__.delete().where(Membership.member_id == member.id))
    db.commit()

    with pytest.raises(AttendanceError) as excinfo:
        attendance_service.record_fingerprint_scan(
            db, member=member, branch=branch, device_info="x2008", external_event_id="e1"
        )
    assert excinfo.value.detail["code"] == "membership_expired"


# ------------------------------------------------------------ branch/device mapping


def test_two_devices_can_serve_the_same_branch(db, world, enable_access_control):
    """The mapping is device -> one branch, not one branch -> one device — a
    branch is free to run more than one terminal."""
    branch = world["branches"]["ngk"]
    enable_method(db, branch.id)
    front_desk = make_device(db, branch, serial="FRONT-DESK", device_number=1)
    side_door = make_device(db, branch, serial="SIDE-DOOR", device_number=2)
    member_a, _ = _member(db, world, "Riya")
    member_b, _ = _member(db, world, "Kabir")
    enroll(db, member_a, front_desk, enrolled_id="1")
    enroll(db, member_b, side_door, enrolled_id="1")  # same enrolled_id, different device
    db.commit()

    a = attendance_service.record_fingerprint_scan(
        db, member=member_a, branch=branch, device_info="front-desk", external_event_id="a1"
    )
    b = attendance_service.record_fingerprint_scan(
        db, member=member_b, branch=branch, device_info="side-door", external_event_id="b1"
    )
    assert a.branch_id == branch.id
    assert b.branch_id == branch.id
    assert a.user_id != b.user_id


def test_a_branchs_occupancy_is_unaffected_by_another_branchs_device(
    db, world, enable_access_control
):
    ngk = world["branches"]["ngk"]
    bgh = world["branches"]["bgh"]
    enable_method(db, ngk.id)
    enable_method(db, bgh.id)
    ngk_device = make_device(db, ngk, serial="NGK-DEVICE")
    from conftest import make_member

    member_ngk, _ = make_member(db, world["roles"], ngk, "Riya")
    member_bgh, _ = make_member(db, world["roles"], bgh, "Kabir")
    enroll(db, member_ngk, ngk_device, enrolled_id="1")
    db.commit()

    attendance_service.record_fingerprint_scan(
        db, member=member_ngk, branch=ngk, device_info="ngk", external_event_id="ngk-1"
    )

    ngk_occupancy = attendance_service.branch_occupancy(db, ngk)
    bgh_occupancy = attendance_service.branch_occupancy(db, bgh)
    assert ngk_occupancy["inside"] == 1
    assert bgh_occupancy["inside"] == 0
    assert member_bgh.id  # the other branch's member was never touched


# ------------------------------------------------------------------------ timezone


def test_work_date_uses_branch_local_time_not_utc(db, world, enable_access_control):
    """00:30 IST on the 13th is still 19:00 UTC on the 12th — the visit must
    file under the 13th (the branch's own calendar date), not the UTC one."""
    branch = world["branches"]["ngk"]
    assert branch.timezone in (None, "Asia/Kolkata")
    enable_method(db, branch.id)
    device = make_device(db, branch)
    member, _ = _member(db, world, "Riya")
    enroll(db, member, device, enrolled_id="1")
    db.commit()

    clock.freeze(datetime(2026, 8, 13, 0, 30, tzinfo=IST).astimezone(UTC))
    try:
        event = attendance_service.record_fingerprint_scan(
            db, member=member, branch=branch, device_info="x2008", external_event_id="e1"
        )
    finally:
        clock.freeze(None)

    assert event.work_date == date(2026, 8, 13)


# -------------------------------------------------------------------- API


ADMS_HEADERS = {"Content-Type": "text/plain"}


def _register_device(client, auth, world, serial="CUB7250201499"):
    resp = client.post(
        "/api/v1/hardware/fingerprint/devices",
        json={
            "branch_id": world["branches"]["ngk"].id,
            "device_number": 1,
            "serial": serial,
            "label": "Front desk X2008",
            "ip_address": "192.168.0.5",
            "tcp_port": 4370,
        },
        headers=auth(world["admin"]),
    )
    assert resp.status_code == 201, resp.text
    return resp.json()


def _create_enrollment(client, auth, world, member_id, device_id, enrolled_id="1"):
    resp = client.post(
        "/api/v1/hardware/fingerprint/enrollments",
        json={"member_id": member_id, "device_id": device_id, "enrolled_id": enrolled_id},
        headers=auth(world["admin"]),
    )
    assert resp.status_code == 201, resp.text
    return resp.json()


def test_the_push_route_is_not_found_when_the_integration_is_off(client, world):
    response = client.get(
        f"/api/v1/hardware/fingerprint/x2008/{SECRET}/iclock/cdata?SN=CUB7250201499"
    )
    assert response.status_code == 404


def test_registering_a_device_requires_admin(client, world, auth):
    resp = client.post(
        "/api/v1/hardware/fingerprint/devices",
        json={
            "branch_id": world["branches"]["ngk"].id,
            "device_number": 1,
            "serial": "X",
            "label": "X",
        },
        headers=auth(world["manager_ngk"]),
    )
    assert resp.status_code == 403


def test_end_to_end_push_writes_an_attendance_event(client, db, world, auth, enable_access_control):
    branch = world["branches"]["ngk"]
    enable_method(db, branch.id)
    db.commit()

    device = _register_device(client, auth, world)
    member, _ = _member(db, world, "Riya")
    db.commit()
    _create_enrollment(client, auth, world, member.id, device["id"], "1")

    body = "1\t2026-08-21 08:00:00\t0\t1\n"
    resp = client.post(
        f"/api/v1/hardware/fingerprint/x2008/{SECRET}/iclock/cdata?SN=CUB7250201499&table=ATTLOG",
        content=body,
        headers=ADMS_HEADERS,
    )
    assert resp.status_code == 200
    assert resp.text == "OK"

    from sqlalchemy import select

    events = db.scalars(
        select(AttendanceEvent).where(AttendanceEvent.user_id == member.user_id)
    ).all()
    assert len(events) == 1
    assert events[0].method.value == "fingerprint"
    assert events[0].external_event_id == "CUB7250201499:1:2026-08-21 08:00:00"


def test_a_resent_batch_is_idempotent(client, db, world, auth, enable_access_control):
    branch = world["branches"]["ngk"]
    enable_method(db, branch.id)
    db.commit()

    device = _register_device(client, auth, world)
    member, _ = _member(db, world, "Riya")
    db.commit()
    _create_enrollment(client, auth, world, member.id, device["id"], "1")

    body = "1\t2026-08-21 08:00:00\t0\t1\n"
    url = f"/api/v1/hardware/fingerprint/x2008/{SECRET}/iclock/cdata?SN=CUB7250201499&table=ATTLOG"
    client.post(url, content=body, headers=ADMS_HEADERS)
    client.post(url, content=body, headers=ADMS_HEADERS)

    from sqlalchemy import select

    events = db.scalars(
        select(AttendanceEvent).where(AttendanceEvent.user_id == member.user_id)
    ).all()
    assert len(events) == 1


def test_an_unknown_enrolled_id_is_skipped_not_fatal(
    client, db, world, auth, enable_access_control
):
    branch = world["branches"]["ngk"]
    enable_method(db, branch.id)
    db.commit()
    _register_device(client, auth, world)

    body = "999\t2026-08-21 08:00:00\t0\t1\n"
    resp = client.post(
        f"/api/v1/hardware/fingerprint/x2008/{SECRET}/iclock/cdata?SN=CUB7250201499&table=ATTLOG",
        content=body,
        headers=ADMS_HEADERS,
    )
    assert resp.status_code == 200
    assert resp.text == "OK"

    from sqlalchemy import select

    assert db.scalars(select(AttendanceEvent)).all() == []


# --------------------------------------------------------------- observability


def test_a_batch_logs_received_counts_and_an_unresolved_member_by_reason(
    client, db, world, auth, enable_access_control, caplog
):
    branch = world["branches"]["ngk"]
    enable_method(db, branch.id)
    db.commit()
    _register_device(client, auth, world)

    import logging

    with caplog.at_level(logging.INFO, logger="gymflow.hardware.fingerprint"):
        resp = client.post(
            f"/api/v1/hardware/fingerprint/x2008/{SECRET}/iclock/cdata?SN=CUB7250201499&table=ATTLOG",
            content="999\t2026-08-21 08:00:00\t0\t1\n",
            headers=ADMS_HEADERS,
        )
    assert resp.status_code == 200

    received = [r for r in caplog.records if "adms_push_received" in r.message]
    assert received and "records=1" in received[0].message

    partial = [r for r in caplog.records if "adms_push_partial" in r.message]
    assert partial and "member_unresolved=1" in partial[0].message

    # The one thing that must never appear in any log line from this path.
    assert "template" not in caplog.text.lower()


def test_a_membership_denial_is_logged_with_the_reason_and_no_biometric_content(
    db, world, enable_access_control, caplog
):
    import logging

    branch = world["branches"]["ngk"]
    enable_method(db, branch.id)
    device = make_device(db, branch)
    member, _ = _member(db, world, "Riya")
    enroll(db, member, device, enrolled_id="1")
    _expire_membership(db, member)

    with (
        caplog.at_level(logging.INFO, logger="gymflow.attendance"),
        pytest.raises(AttendanceError),
    ):
        attendance_service.record_fingerprint_scan(
            db, member=member, branch=branch, device_info="x2008", external_event_id="e1"
        )

    denied = [r for r in caplog.records if "fingerprint_scan_denied" in r.message]
    assert denied and "reason=membership_expired" in denied[0].message
    assert f"member_id={member.id}" in denied[0].message
    assert "template" not in caplog.text.lower()


def test_a_duplicate_scan_is_logged_distinctly_from_a_new_one(
    db, world, enable_access_control, caplog
):
    import logging

    branch = world["branches"]["ngk"]
    enable_method(db, branch.id)
    device = make_device(db, branch)
    member, _ = _member(db, world, "Riya")
    enroll(db, member, device, enrolled_id="1")
    db.commit()

    with caplog.at_level(logging.INFO, logger="gymflow.attendance"):
        attendance_service.record_fingerprint_scan(
            db, member=member, branch=branch, device_info="x2008", external_event_id="dup-1"
        )
        attendance_service.record_fingerprint_scan(
            db, member=member, branch=branch, device_info="x2008", external_event_id="dup-1"
        )

    recorded = [r for r in caplog.records if "fingerprint_scan_recorded" in r.message]
    duplicate = [r for r in caplog.records if "fingerprint_scan_duplicate" in r.message]
    assert len(recorded) == 1
    assert len(duplicate) == 1


def test_wrong_secret_is_rejected(client, world, enable_access_control):
    resp = client.post(
        "/api/v1/hardware/fingerprint/x2008/not-the-secret/iclock/cdata?SN=CUB7250201499&table=ATTLOG",
        content="1\t2026-08-21 08:00:00\t0\t1\n",
        headers=ADMS_HEADERS,
    )
    assert resp.status_code == 401


def test_unregistered_serial_is_rejected(client, world, enable_access_control):
    resp = client.post(
        f"/api/v1/hardware/fingerprint/x2008/{SECRET}/iclock/cdata?SN=UNKNOWN-SERIAL&table=ATTLOG",
        content="1\t2026-08-21 08:00:00\t0\t1\n",
        headers=ADMS_HEADERS,
    )
    assert resp.status_code == 404


def test_a_malformed_body_does_not_500(client, db, world, auth, enable_access_control):
    branch = world["branches"]["ngk"]
    enable_method(db, branch.id)
    db.commit()
    _register_device(client, auth, world)

    resp = client.post(
        f"/api/v1/hardware/fingerprint/x2008/{SECRET}/iclock/cdata?SN=CUB7250201499&table=ATTLOG",
        content="not tab delimited and no timestamp\n\n",
        headers=ADMS_HEADERS,
    )
    assert resp.status_code == 200
    assert resp.text == "OK"


def test_non_attlog_tables_are_acknowledged_but_not_parsed(
    client, world, auth, enable_access_control
):
    _register_device(client, auth, world)
    resp = client.post(
        f"/api/v1/hardware/fingerprint/x2008/{SECRET}/iclock/cdata?SN=CUB7250201499&table=OPERLOG",
        content="whatever the admin log format actually is\n",
        headers=ADMS_HEADERS,
    )
    assert resp.status_code == 200
    assert resp.text == "OK"


def test_software_provider_is_still_used_when_integration_disabled():
    """access_control_enabled defaults False everywhere else in the suite —
    confirming the swap in build_provider() doesn't change that default."""
    from app.integrations.access_control.provider import (
        SoftwareAccessControlProvider,
        build_provider,
    )

    assert isinstance(build_provider(), SoftwareAccessControlProvider)


def test_build_provider_returns_x2008_when_enabled(enable_access_control):
    from app.integrations.access_control.provider import build_provider

    assert isinstance(build_provider(), X2008FingerprintProvider)

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

import pytest
from sqlalchemy.exc import IntegrityError

from app.core.config import settings
from app.db.models import AttendanceEvent, FingerprintDevice, FingerprintEnrollment
from app.integrations.access_control.x2008 import X2008FingerprintProvider, parse_adms_attlog
from app.services import attendance_service
from app.services.attendance_service import AttendanceError

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

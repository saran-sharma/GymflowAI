"""Fingerprint hardware: device registry, member enrollment, and the X2008
ADMS push receiver.

Two very different trust models live in this one router:

* Device/enrollment administration (`/hardware/fingerprint/devices`,
  `/hardware/fingerprint/enrollments`) is normal staff API — a bearer token,
  branch-scoped, same as every other admin surface.
* The push receiver (`/hardware/fingerprint/x2008/{secret_token}/iclock/cdata`)
  is called by the terminal itself, which has no GymFlow account and cannot
  carry a bearer token. It is authenticated by a shared secret GymFlow
  controls, embedded in the URL the device is configured to push to — see
  `docs/INTEGRATIONS.md` for exactly how that is meant to be set up, and the
  module docstring in `app/integrations/access_control/x2008.py` for what is
  and is not verified about the wire format it parses.

A third, deliberately narrower route lives here too: ``dev_ip_mode_router``,
mounted at the bare path (no ``/api/v1/hardware/fingerprint`` prefix) because
that is the only shape the X2008's IP-address ADMS mode can request — that
mode carries no path at all, so the shared-secret scheme above is physically
unreachable from it. It is a fallback for the one real-device test where
Domain Name mode produced no request at all after a reboot, gated behind
``FINGERPRINT_ADMS_DEV_IP_MODE`` (off by default, refused in production/
staging) and authenticated by source IP + device serial instead of a secret
— see the field's docstring in ``core/config.py`` for exactly what that
does and does not guarantee.
"""

from __future__ import annotations

import hmac
import logging
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from fastapi.responses import PlainTextResponse
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.clock import now_utc
from app.core.config import settings
from app.core.deps import assert_branch_access, require_admin, require_management, sees_all_branches
from app.core.rate_limit import hardware_push_rate_limit
from app.db.models import Branch, FingerprintDevice, FingerprintEnrollment, Member, User
from app.db.session import get_db
from app.integrations.access_control.x2008 import (
    ParseResult,
    parse_adms_attlog,
    resolve_member,
    to_access_event,
)
from app.schemas.hardware import (
    FingerprintDeviceCreate,
    FingerprintDeviceOut,
    FingerprintEnrollmentCreate,
    FingerprintEnrollmentOut,
)
from app.services import attendance_service

router = APIRouter(prefix="/hardware/fingerprint", tags=["hardware"])
logger = logging.getLogger("gymflow.hardware.fingerprint")
debug_logger = logging.getLogger("gymflow.hardware.fingerprint.debug")

#: Header names (substring match, case-insensitive) never included in a debug
#: capture, even though today's device push carries none of them — a future
#: firmware or a reverse proxy in front of it might add one.
_SENSITIVE_HEADER_SUBSTRINGS = ("authorization", "cookie", "secret", "token", "key")


# ------------------------------------------------------------------ devices


@router.post("/devices", response_model=FingerprintDeviceOut, status_code=status.HTTP_201_CREATED)
def register_device(
    payload: FingerprintDeviceCreate,
    db: Session = Depends(get_db),
    user: User = Depends(require_admin),
) -> FingerprintDevice:
    """Register a terminal. Chain-level (ADMIN_ROLES): a device serial
    number and its branch is infrastructure, not a per-branch decision."""
    assert_branch_access(user, payload.branch_id)
    branch = db.get(Branch, payload.branch_id)
    if branch is None:
        raise HTTPException(status_code=404, detail="Branch not found")

    existing = db.scalar(
        select(FingerprintDevice).where(FingerprintDevice.serial == payload.serial)
    )
    if existing is not None:
        raise HTTPException(
            status_code=409, detail="A device with this serial is already registered"
        )

    device = FingerprintDevice(
        branch_id=payload.branch_id,
        device_number=payload.device_number,
        serial=payload.serial,
        label=payload.label,
        ip_address=payload.ip_address,
        tcp_port=payload.tcp_port,
        is_active=True,
    )
    db.add(device)
    db.flush()
    return device


@router.get("/devices", response_model=list[FingerprintDeviceOut])
def list_devices(
    branch_id: int | None = Query(default=None),
    db: Session = Depends(get_db),
    user: User = Depends(require_management),
) -> list[FingerprintDevice]:
    stmt = select(FingerprintDevice)
    if branch_id is not None:
        assert_branch_access(user, branch_id)
        stmt = stmt.where(FingerprintDevice.branch_id == branch_id)
    elif not sees_all_branches(user) and user.branch_id is not None:
        stmt = stmt.where(FingerprintDevice.branch_id == user.branch_id)
    return list(db.scalars(stmt.order_by(FingerprintDevice.branch_id)).all())


# -------------------------------------------------------------- enrollments


@router.post(
    "/enrollments", response_model=FingerprintEnrollmentOut, status_code=status.HTTP_201_CREATED
)
def create_enrollment(
    payload: FingerprintEnrollmentCreate,
    db: Session = Depends(get_db),
    user: User = Depends(require_management),
) -> FingerprintEnrollment:
    """Map a member to the enroll-ID staff assigned them on the terminal
    itself. GymFlow never sees or asks for a fingerprint here — only the
    small integer/string the device already uses for that person."""
    member = db.get(Member, payload.member_id)
    if member is None:
        raise HTTPException(status_code=404, detail="Member not found")
    device = db.get(FingerprintDevice, payload.device_id)
    if device is None:
        raise HTTPException(status_code=404, detail="Device not found")
    assert_branch_access(user, member.branch_id)
    assert_branch_access(user, device.branch_id)
    if member.branch_id != device.branch_id:
        raise HTTPException(
            status_code=400,
            detail="Member and device belong to different branches",
        )

    existing = db.scalar(
        select(FingerprintEnrollment).where(FingerprintEnrollment.member_id == member.id)
    )
    if existing is not None:
        raise HTTPException(status_code=409, detail="This member already has an enrollment")

    enrollment = FingerprintEnrollment(
        member_id=member.id,
        branch_id=member.branch_id,
        device_id=device.id,
        enrolled_id=payload.enrolled_id,
    )
    db.add(enrollment)
    db.flush()
    return enrollment


@router.get("/enrollments", response_model=list[FingerprintEnrollmentOut])
def list_enrollments(
    branch_id: int | None = Query(default=None),
    db: Session = Depends(get_db),
    user: User = Depends(require_management),
) -> list[FingerprintEnrollment]:
    stmt = select(FingerprintEnrollment)
    if branch_id is not None:
        assert_branch_access(user, branch_id)
        stmt = stmt.where(FingerprintEnrollment.branch_id == branch_id)
    elif not sees_all_branches(user) and user.branch_id is not None:
        stmt = stmt.where(FingerprintEnrollment.branch_id == user.branch_id)
    return list(db.scalars(stmt).all())


@router.delete(
    "/enrollments/{enrollment_id}", status_code=status.HTTP_204_NO_CONTENT, response_model=None
)
def delete_enrollment(
    enrollment_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(require_management),
) -> None:
    enrollment = db.get(FingerprintEnrollment, enrollment_id)
    if enrollment is None:
        raise HTTPException(status_code=404, detail="Enrollment not found")
    assert_branch_access(user, enrollment.branch_id)
    db.delete(enrollment)
    db.flush()


# ------------------------------------------------------------- push receiver


def _authenticate_push(secret_token: str, request: Request, db: Session) -> FingerprintDevice:
    """Everything that must be true before a byte of the push body is parsed.

    Not tied to the device's own Communication Key (see module docstring in
    ``core/config.py``) — this authenticates the HTTP request to *us*, which
    is a decision GymFlow controls regardless of what the terminal's own
    comm-key setting is.
    """
    if not settings.access_control_enabled:
        # 404, not 403: an unenabled integration should not confirm this
        # route exists at all to an unauthenticated caller.
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND)

    configured = settings.fingerprint_adms_shared_secret
    if not configured or not hmac.compare_digest(secret_token, configured):
        # Never log the token itself, valid or not — it is the one secret
        # this whole path exists to protect.
        logger.warning("adms_push_auth_failed reason=bad_shared_secret")
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="unauthorized")

    serial = request.query_params.get("SN") or request.query_params.get("sn")
    if not serial:
        logger.warning("adms_push_auth_failed reason=missing_serial")
        raise HTTPException(status_code=400, detail="missing device serial (SN query param)")

    device = db.scalar(select(FingerprintDevice).where(FingerprintDevice.serial == serial))
    if device is None or not device.is_active:
        logger.warning("adms_push_auth_failed reason=device_not_registered serial=%s", serial)
        raise HTTPException(status_code=404, detail="device not registered")
    return device


def _debug_capture(
    *,
    device: FingerprintDevice,
    request: Request,
    raw_body: str | None,
    parsed: ParseResult | None,
) -> None:
    """Opt-in, non-production capture for the real X2008 test session.

    Gated by ``settings.fingerprint_adms_debug_capture`` (default off, and
    refused at boot in production/staging by ``assert_production_safe``).
    Only runs *after* ``_authenticate_push`` has succeeded, so this never logs
    an unauthenticated attempt's path/secret. Captures exactly what the Phase
    1 test plan asked for and nothing else: method, path with the secret path
    segment redacted, an allow-listed header subset, content-type, the raw
    ATTLOG body, the parsed record fields, and the resolved device identity.
    Never logs the shared secret, an Authorization/Cookie header, or anything
    resembling a fingerprint template — the device never sends one.
    """
    if not settings.fingerprint_adms_debug_capture:
        return

    secret_segment = request.path_params.get("secret_token", "")
    safe_path = (
        request.url.path.replace(f"/{secret_segment}", "/***", 1)
        if secret_segment
        else request.url.path
    )
    headers = {
        name: value
        for name, value in request.headers.items()
        if not any(bad in name.lower() for bad in _SENSITIVE_HEADER_SUBSTRINGS)
    }
    payload: dict[str, Any] = {
        "method": request.method,
        "path": safe_path,
        "query": dict(request.query_params),
        "headers": headers,
        "content_type": request.headers.get("content-type"),
        "device_serial": device.serial,
        "device_id": device.id,
        "branch_id": device.branch_id,
    }
    if raw_body is not None:
        payload["raw_body"] = raw_body
    if parsed is not None:
        payload["malformed_line_count"] = parsed.malformed_line_count
        payload["parsed_records"] = [
            {
                "enrolled_id": r.enrolled_id,
                "device_time_raw": r.device_time_raw,
                "device_time_parsed": r.device_time.isoformat() if r.device_time else None,
                "status_raw": r.status_raw,
                "verify_type_raw": r.verify_type_raw,
            }
            for r in parsed.records
        ]
    debug_logger.debug("adms_debug_capture %s", payload)


@router.get("/x2008/{secret_token}/iclock/cdata")
def adms_handshake(
    secret_token: str,
    request: Request,
    db: Session = Depends(get_db),
    _rl: None = Depends(hardware_push_rate_limit),
) -> PlainTextResponse:
    """ADMS option-negotiation GET.

    NOT verified against this device's firmware — some ZKTeco/ADMS firmware
    expects a specific `key=value` line format here (stamp counters, option
    echoes) before it will proceed to POST attendance data at all. This
    responds "OK" and nothing more, which is deliberately the limit of what
    is implemented; see the module docstring in
    ``app/integrations/access_control/x2008.py``. If the X2008 needs more
    than this to start pushing, that must be confirmed against real device
    traffic and this handler extended — it is not safe to guess the exact
    handshake fields.
    """
    device = _authenticate_push(secret_token, request, db)
    _debug_capture(device=device, request=request, raw_body=None, parsed=None)
    return PlainTextResponse("OK")


@router.post("/x2008/{secret_token}/iclock/cdata")
async def adms_push(
    secret_token: str,
    request: Request,
    table: str | None = Query(default=None),
    db: Session = Depends(get_db),
    _rl: None = Depends(hardware_push_rate_limit),
) -> PlainTextResponse:
    """Receive one ADMS batch.

    Only `table=ATTLOG` (attendance punches) is processed. Any other table
    (e.g. `OPERLOG`, used for on-device admin actions like enrollment) is
    acknowledged but not parsed — building that out was out of scope here
    and guessing its shape would risk silently mis-filing an unrelated event
    as attendance.

    One malformed or unrecognised record never fails the whole batch: the
    terminal has no user in front of it to retry a rejected batch
    intelligently, so a single "OK" here means "stop resending this batch",
    and partial acceptance is better than the terminal looping on a batch
    that will never fully succeed.
    """
    device = _authenticate_push(secret_token, request, db)
    return await _handle_adms_push(device=device, request=request, table=table, db=db)


async def _handle_adms_push(
    *, device: FingerprintDevice, request: Request, table: str | None, db: Session
) -> PlainTextResponse:
    """Everything after authentication — shared verbatim by the secret-path
    route above and the dev IP-mode fallback route below, so the two entry
    points can never drift apart on branch scoping, idempotency, membership
    gating or logging. Only how ``device`` was authenticated differs between
    callers; what happens with it here does not.
    """
    if table and table.upper() != "ATTLOG":
        logger.info("adms_push_ignored device=%s table=%s", device.serial, table)
        return PlainTextResponse("OK")

    branch = db.get(Branch, device.branch_id)
    if branch is None or not branch.is_active:
        logger.warning(
            "adms_push_no_branch device=%s branch_id=%s", device.serial, device.branch_id
        )
        return PlainTextResponse("OK")

    raw = (await request.body()).decode("utf-8", errors="replace")
    result = parse_adms_attlog(raw)
    _debug_capture(device=device, request=request, raw_body=raw, parsed=result)

    # Never logged at the INFO level below: the request body itself, or any field beyond counts and
    # the small identifiers already listed above — the device never sends a
    # fingerprint template in the first place, but this is also a hard rule
    # of what this handler is allowed to write to logs.
    logger.info(
        "adms_push_received device=%s branch_id=%s records=%d malformed_lines=%d",
        device.serial,
        branch.id,
        len(result.records),
        result.malformed_line_count,
    )

    accepted = 0
    member_unresolved = 0
    denied_by_reason: dict[str, int] = {}
    received_at = now_utc()

    for record in result.records:
        # Normalized-event stage: the parser's ADMS-specific record becomes
        # the device-agnostic `AccessEvent` shape before anything asks "who
        # is this" — see the module docstring in
        # `app/integrations/access_control/x2008.py`.
        event = to_access_event(record, device_serial=device.serial, received_at=received_at)

        # Member Resolver stage: an enrolled-id this device has never had
        # registered to anyone comes back `None` here, never a guess.
        member = resolve_member(db, device_id=device.id, device_user_id=event.device_user_id)
        if member is None:
            member_unresolved += 1
            continue

        try:
            attendance_service.record_fingerprint_scan(
                db,
                member=member,
                branch=branch,
                device_info=f"x2008:{device.serial}",
                external_event_id=event.reference_id,
                request=request,
            )
            accepted += 1
        except attendance_service.AttendanceError as exc:
            code = exc.detail.get("code", "unknown") if isinstance(exc.detail, dict) else "unknown"
            denied_by_reason[code] = denied_by_reason.get(code, 0) + 1

    rejected = sum(denied_by_reason.values())
    if result.malformed_line_count or member_unresolved or rejected:
        logger.warning(
            "adms_push_partial device=%s branch_id=%s accepted=%d malformed=%d "
            "member_unresolved=%d rejected=%d denied_by_reason=%s",
            device.serial,
            branch.id,
            accepted,
            result.malformed_line_count,
            member_unresolved,
            rejected,
            denied_by_reason,
        )
    elif result.records:
        logger.info(
            "adms_push_complete device=%s branch_id=%s accepted=%d",
            device.serial,
            branch.id,
            accepted,
        )

    return PlainTextResponse("OK")


# ------------------------------------------ dev-only IP-mode fallback route
#
# See the module docstring and `settings.fingerprint_adms_dev_ip_mode`'s own
# docstring in `core/config.py` for why this exists and what it does and does
# not guarantee. Mounted separately, at the bare path, in `app/main.py` —
# `router` above keeps its `/hardware/fingerprint` prefix untouched.

dev_ip_mode_router = APIRouter()


def _authenticate_dev_ip_mode(request: Request, db: Session) -> FingerprintDevice:
    """Source IP + device serial, both compared against explicit allowlist
    config values — not a weaker version of `_authenticate_push`, a
    different, narrower mechanism for the one case that route cannot reach
    at all: the X2008's IP-address ADMS mode, which carries no path and so
    has nowhere to put the shared secret.

    All three checks below are required, matching the real-device test's own
    requirement: source IP, device serial, and device-registry membership
    (active, registered) — never any one alone.
    """
    if not settings.access_control_enabled:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND)
    if not settings.fingerprint_adms_dev_ip_mode:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND)

    allowed_ip = settings.fingerprint_adms_dev_ip_mode_allowed_ip
    client_ip = request.client.host if request.client else None
    if not allowed_ip or client_ip != allowed_ip:
        logger.warning("adms_dev_ip_mode_auth_failed reason=source_ip_not_allowlisted")
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="forbidden")

    allowed_serial = settings.fingerprint_adms_dev_ip_mode_allowed_serial
    serial = request.query_params.get("SN") or request.query_params.get("sn")
    if not allowed_serial or serial != allowed_serial:
        logger.warning("adms_dev_ip_mode_auth_failed reason=serial_not_allowlisted")
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="forbidden")

    device = db.scalar(select(FingerprintDevice).where(FingerprintDevice.serial == serial))
    if device is None or not device.is_active:
        logger.warning(
            "adms_dev_ip_mode_auth_failed reason=device_not_registered serial=%s", serial
        )
        raise HTTPException(status_code=404, detail="device not registered")
    return device


@dev_ip_mode_router.get("/iclock/cdata")
def adms_handshake_dev_ip_mode(
    request: Request,
    db: Session = Depends(get_db),
    _rl: None = Depends(hardware_push_rate_limit),
) -> PlainTextResponse:
    device = _authenticate_dev_ip_mode(request, db)
    _debug_capture(device=device, request=request, raw_body=None, parsed=None)
    return PlainTextResponse("OK")


@dev_ip_mode_router.post("/iclock/cdata")
async def adms_push_dev_ip_mode(
    request: Request,
    table: str | None = Query(default=None),
    db: Session = Depends(get_db),
    _rl: None = Depends(hardware_push_rate_limit),
) -> PlainTextResponse:
    device = _authenticate_dev_ip_mode(request, db)
    return await _handle_adms_push(device=device, request=request, table=table, db=db)


__all__ = ["router", "dev_ip_mode_router"]

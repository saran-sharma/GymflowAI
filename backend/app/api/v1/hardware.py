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
"""

from __future__ import annotations

import hmac
import logging

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from fastapi.responses import PlainTextResponse
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.deps import assert_branch_access, require_admin, require_management, sees_all_branches
from app.core.rate_limit import hardware_push_rate_limit
from app.db.models import Branch, FingerprintDevice, FingerprintEnrollment, Member, User
from app.db.session import get_db
from app.integrations.access_control.x2008 import parse_adms_attlog
from app.schemas.hardware import (
    FingerprintDeviceCreate,
    FingerprintDeviceOut,
    FingerprintEnrollmentCreate,
    FingerprintEnrollmentOut,
)
from app.services import attendance_service

router = APIRouter(prefix="/hardware/fingerprint", tags=["hardware"])
logger = logging.getLogger("gymflow.hardware.fingerprint")


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
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="unauthorized")

    serial = request.query_params.get("SN") or request.query_params.get("sn")
    if not serial:
        raise HTTPException(status_code=400, detail="missing device serial (SN query param)")

    device = db.scalar(select(FingerprintDevice).where(FingerprintDevice.serial == serial))
    if device is None or not device.is_active:
        raise HTTPException(status_code=404, detail="device not registered")
    return device


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
    _authenticate_push(secret_token, request, db)
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

    if table and table.upper() != "ATTLOG":
        return PlainTextResponse("OK")

    branch = db.get(Branch, device.branch_id)
    if branch is None or not branch.is_active:
        return PlainTextResponse("OK")

    raw = (await request.body()).decode("utf-8", errors="replace")
    result = parse_adms_attlog(raw)

    accepted = 0
    unknown_enrolled_id = 0
    rejected = 0

    for record in result.records:
        enrollment = db.scalar(
            select(FingerprintEnrollment).where(
                FingerprintEnrollment.device_id == device.id,
                FingerprintEnrollment.enrolled_id == record.enrolled_id,
            )
        )
        if enrollment is None:
            unknown_enrolled_id += 1
            continue

        member = db.get(Member, enrollment.member_id)
        if member is None:
            unknown_enrolled_id += 1
            continue

        external_event_id = f"{device.serial}:{record.enrolled_id}:{record.device_time_raw}"
        try:
            attendance_service.record_fingerprint_scan(
                db,
                member=member,
                branch=branch,
                device_info=f"x2008:{device.serial}",
                external_event_id=external_event_id,
                request=request,
            )
            accepted += 1
        except attendance_service.AttendanceError:
            rejected += 1

    if result.malformed_line_count or unknown_enrolled_id or rejected:
        logger.warning(
            "adms_push partial: device=%s accepted=%d malformed=%d unknown_enrolled_id=%d rejected=%d",
            device.serial,
            accepted,
            result.malformed_line_count,
            unknown_enrolled_id,
            rejected,
        )

    return PlainTextResponse("OK")


__all__ = ["router"]

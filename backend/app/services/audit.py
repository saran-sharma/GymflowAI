"""Audit trail.

Every login, attendance event, correction and configuration change lands here.
Values are scrubbed on the way in so a token, password or PIN can never reach
the log even if a caller passes one by accident.
"""

from __future__ import annotations

from typing import Any

from fastapi import Request
from sqlalchemy.orm import Session

from app.core.clock import now_utc
from app.db.models import AuditLog, User

# Actions the product commits to recording. Strings, not an enum, so an
# integration can add its own without a migration.
ACTION_LOGIN = "auth.login"
ACTION_LOGIN_FAILED = "auth.login_failed"
ACTION_LOGOUT = "auth.logout"
ACTION_TOKEN_REFRESH = "auth.token_refresh"
ACTION_CHECK_IN = "attendance.check_in"
ACTION_CHECK_OUT = "attendance.check_out"
ACTION_ATTENDANCE_CORRECTION = "attendance.correction"
ACTION_SHIFT_CHANGE = "shift.change"
ACTION_TRAINER_CHANGE = "trainer.change"
ACTION_INCENTIVE_RULE_CHANGE = "incentive.rule_change"
ACTION_INCENTIVE_RECOMPUTE = "incentive.recompute"
ACTION_BRANCH_CHANGE = "branch.change"
ACTION_ADMIN_ACTION = "admin.action"
ACTION_SETTING_CHANGE = "settings.change"
ACTION_ACCESS_DENIED = "auth.access_denied"

_REDACTED = "[redacted]"
_SENSITIVE_HINTS = ("password", "pin", "token", "secret", "authorization", "otp")


def _scrub(details: dict[str, Any] | None) -> dict[str, Any]:
    if not details:
        return {}
    clean: dict[str, Any] = {}
    for key, value in details.items():
        if any(hint in key.lower() for hint in _SENSITIVE_HINTS):
            clean[key] = _REDACTED
        elif isinstance(value, dict):
            clean[key] = _scrub(value)
        else:
            clean[key] = value
    return clean


def client_ip(request: Request | None) -> str | None:
    if request is None:
        return None
    # X-Forwarded-For is only meaningful behind a proxy we control; the first
    # hop is the one the load balancer appended.
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",")[0].strip()[:64]
    return request.client.host if request.client else None


def record(
    db: Session,
    *,
    action: str,
    actor: User | None = None,
    actor_user_id: int | None = None,
    actor_role: str | None = None,
    entity_type: str | None = None,
    entity_id: str | int | None = None,
    branch_id: int | None = None,
    request: Request | None = None,
    details: dict[str, Any] | None = None,
) -> AuditLog:
    if actor is not None:
        actor_user_id = actor.id
        actor_role = actor_role or (actor.role.key if actor.role else None)

    entry = AuditLog(
        actor_user_id=actor_user_id,
        actor_role=actor_role,
        action=action,
        entity_type=entity_type,
        entity_id=str(entity_id) if entity_id is not None else None,
        branch_id=branch_id,
        source_ip=client_ip(request),
        user_agent=(
            request.headers.get("user-agent")[:255]
            if request and request.headers.get("user-agent")
            else None
        ),
        details=_scrub(details),
        created_at=now_utc(),
    )
    db.add(entry)
    db.flush()
    return entry


__all__ = [
    "ACTION_ACCESS_DENIED",
    "ACTION_ADMIN_ACTION",
    "ACTION_ATTENDANCE_CORRECTION",
    "ACTION_BRANCH_CHANGE",
    "ACTION_CHECK_IN",
    "ACTION_CHECK_OUT",
    "ACTION_INCENTIVE_RECOMPUTE",
    "ACTION_INCENTIVE_RULE_CHANGE",
    "ACTION_LOGIN",
    "ACTION_LOGIN_FAILED",
    "ACTION_LOGOUT",
    "ACTION_SETTING_CHANGE",
    "ACTION_SHIFT_CHANGE",
    "ACTION_TOKEN_REFRESH",
    "ACTION_TRAINER_CHANGE",
    "client_ip",
    "record",
]

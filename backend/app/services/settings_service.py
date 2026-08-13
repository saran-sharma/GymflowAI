"""Reads configurable business rules out of the ``settings`` table.

Resolution order is branch row → global row → code default. Nothing in the
attendance, punctuality or incentive path reads a hardcoded number; they all
come through here.
"""

from __future__ import annotations

from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.models import Setting

# Keys and their code-level fallbacks. The seeder writes global rows for all of
# them; the fallbacks exist so a fresh database is never unusable.
DEFAULTS: dict[str, Any] = {
    "shift.grace_minutes": 10,
    "shift.early_exit_grace_minutes": 0,
    "punctuality.punctuality_weight": 0.6,
    "punctuality.attendance_weight": 0.4,
    "attendance.allow_checkin_before_shift_minutes": 60,
    "attendance.allow_checkin_after_shift_minutes": 120,
    "attendance.methods_enabled": ["qr", "pin"],
    "occupancy.count_members_only": True,
    # Busy-period estimates are withheld until this many days of history exist,
    # so the app never presents a guess as a prediction.
    "occupancy.busy_period_min_days": 14,
    # ---------------------------------------------------------- 45-day journey
    "journey.duration_days": 45,
    "journey.assessment_days": 3,
    "journey.cardio_sessions_required": 3,
    "journey.split_pattern": ["push", "pull", "legs"],
    # ------------------------------------------------------------------- PT
    "pt.package_options": [12, 20, 30],
    "pt.low_balance_threshold": 4,
    "pt.default_validity_days": 120,
    # -------------------------------------------------------- group classes
    "classes.default_capacity": 20,
    "classes.rsvp_reminder_hours": 24,
    # ---------------------------------------------------------------- alerts
    "alerts.late_trainer": True,
    "alerts.missing_checkout": True,
    "alerts.journey_day45": True,
    "alerts.pt_low_balance": True,
    "alerts.membership_expiry_days": 14,
    "alerts.low_class_attendance_pct": 50,
}


def get_setting(db: Session, key: str, branch_id: int | None = None) -> Any:
    if branch_id is not None:
        row = db.scalar(select(Setting).where(Setting.key == key, Setting.branch_id == branch_id))
        if row is not None:
            return row.value.get("value") if isinstance(row.value, dict) else row.value

    row = db.scalar(select(Setting).where(Setting.key == key, Setting.branch_id.is_(None)))
    if row is not None:
        return row.value.get("value") if isinstance(row.value, dict) else row.value

    return DEFAULTS.get(key)


def get_int(db: Session, key: str, branch_id: int | None = None) -> int:
    return int(get_setting(db, key, branch_id))


def get_float(db: Session, key: str, branch_id: int | None = None) -> float:
    return float(get_setting(db, key, branch_id))


def get_list(db: Session, key: str, branch_id: int | None = None) -> list:
    """A list-valued setting, tolerating a scalar written by hand in the DB."""
    value = get_setting(db, key, branch_id)
    if value is None:
        return []
    return list(value) if isinstance(value, list | tuple) else [value]


def get_bool(db: Session, key: str, branch_id: int | None = None) -> bool:
    value = get_setting(db, key, branch_id)
    if isinstance(value, str):
        return value.strip().lower() in {"1", "true", "yes", "on"}
    return bool(value)


def set_setting(
    db: Session,
    key: str,
    value: Any,
    *,
    branch_id: int | None = None,
    updated_by_user_id: int | None = None,
    description: str | None = None,
) -> Setting:
    row = db.scalar(
        select(Setting).where(
            Setting.key == key,
            Setting.branch_id.is_(None) if branch_id is None else Setting.branch_id == branch_id,
        )
    )
    if row is None:
        row = Setting(key=key, branch_id=branch_id, value={"value": value})
        db.add(row)
    else:
        row.value = {"value": value}
    if description:
        row.description = description
    row.updated_by_user_id = updated_by_user_id
    db.flush()
    return row


__all__ = [
    "DEFAULTS",
    "get_bool",
    "get_float",
    "get_int",
    "get_list",
    "get_setting",
    "set_setting",
]

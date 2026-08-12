"""Shift rules.

Pure functions over explicit inputs. Nothing here reads the database or the
clock directly, so every rule can be exercised in a unit test with no fixture,
and so the owner can retune the rules without touching this file — the values
arrive as arguments, sourced from ``settings`` rows.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime, time

from app.core.clock import shift_window
from app.db.models import AttendanceStatus

# Fallbacks used only when no setting row exists at any scope.
DEFAULT_GRACE_MINUTES = 10
DEFAULT_EARLY_EXIT_GRACE_MINUTES = 0


@dataclass(frozen=True)
class ShiftRules:
    """The rule snapshot applied to one trainer on one day."""

    grace_minutes: int = DEFAULT_GRACE_MINUTES
    early_exit_grace_minutes: int = DEFAULT_EARLY_EXIT_GRACE_MINUTES


@dataclass(frozen=True)
class ScheduledShift:
    work_date: date
    start_at: datetime
    end_at: datetime
    rules: ShiftRules
    shift_id: int | None = None


def resolve_shift(
    work_date: date,
    start_time: time,
    end_time: time,
    timezone_name: str | None,
    rules: ShiftRules,
    shift_id: int | None = None,
) -> ScheduledShift:
    start_at, end_at = shift_window(work_date, start_time, end_time, timezone_name)
    return ScheduledShift(
        work_date=work_date,
        start_at=start_at,
        end_at=end_at,
        rules=rules,
        shift_id=shift_id,
    )


def minutes_between(a: datetime, b: datetime) -> int:
    """Whole minutes from ``a`` to ``b``, truncated toward zero."""
    return int((b - a).total_seconds() // 60)


def late_minutes(check_in_at: datetime, shift: ScheduledShift) -> int:
    """Minutes past the grace window. 0 while still inside it.

    18:00 start with a 10 minute grace means 18:00–18:10 is on time and 18:11 is
    the first late minute, which is exactly what ``//`` truncation gives here.
    """
    delta = minutes_between(shift.start_at, check_in_at)
    over = delta - shift.rules.grace_minutes
    return max(0, over)


def early_exit_minutes(check_out_at: datetime, shift: ScheduledShift) -> int:
    delta = minutes_between(check_out_at, shift.end_at)
    over = delta - shift.rules.early_exit_grace_minutes
    return max(0, over)


def worked_minutes(check_in_at: datetime | None, check_out_at: datetime | None) -> int:
    if not check_in_at or not check_out_at:
        return 0
    return max(0, minutes_between(check_in_at, check_out_at))


def classify(
    *,
    shift: ScheduledShift | None,
    check_in_at: datetime | None,
    check_out_at: datetime | None,
    day_is_over: bool,
) -> tuple[AttendanceStatus, int, int]:
    """Return (status, late_minutes, early_exit_minutes) for one trainer-day.

    ``day_is_over`` distinguishes "has not arrived yet" from "never arrived":
    an empty record mid-shift is still SCHEDULED, and only becomes ABSENT once
    the shift window has closed.
    """
    if shift is None:
        # No roster for the day — a check-in still counts, it just cannot be
        # judged against a start time.
        if check_in_at and check_out_at:
            return AttendanceStatus.COMPLETED, 0, 0
        if check_in_at:
            return (
                AttendanceStatus.MISSING_CHECKOUT if day_is_over else AttendanceStatus.ON_TIME,
                0,
                0,
            )
        return AttendanceStatus.SCHEDULED, 0, 0

    if check_in_at is None:
        return (AttendanceStatus.ABSENT if day_is_over else AttendanceStatus.SCHEDULED, 0, 0)

    late = late_minutes(check_in_at, shift)

    if check_out_at is None:
        if day_is_over:
            return AttendanceStatus.MISSING_CHECKOUT, late, 0
        return (AttendanceStatus.LATE if late else AttendanceStatus.ON_TIME, late, 0)

    early = early_exit_minutes(check_out_at, shift)
    if late and early:
        return AttendanceStatus.LATE_AND_EARLY_EXIT, late, early
    if late:
        return AttendanceStatus.LATE, late, early
    if early:
        return AttendanceStatus.EARLY_EXIT, late, early
    return AttendanceStatus.COMPLETED, 0, 0


#: Statuses that count as the trainer having turned up at all.
PRESENT_STATUSES = {
    AttendanceStatus.ON_TIME,
    AttendanceStatus.LATE,
    AttendanceStatus.EARLY_EXIT,
    AttendanceStatus.LATE_AND_EARLY_EXIT,
    AttendanceStatus.COMPLETED,
    AttendanceStatus.MISSING_CHECKOUT,
}

#: Statuses where the trainer arrived within the grace window.
ON_TIME_STATUSES = {
    AttendanceStatus.ON_TIME,
    AttendanceStatus.EARLY_EXIT,
    AttendanceStatus.COMPLETED,
    AttendanceStatus.MISSING_CHECKOUT,
}

LATE_STATUSES = {AttendanceStatus.LATE, AttendanceStatus.LATE_AND_EARLY_EXIT}
EARLY_EXIT_STATUSES = {AttendanceStatus.EARLY_EXIT, AttendanceStatus.LATE_AND_EARLY_EXIT}


__all__ = [
    "DEFAULT_EARLY_EXIT_GRACE_MINUTES",
    "DEFAULT_GRACE_MINUTES",
    "EARLY_EXIT_STATUSES",
    "LATE_STATUSES",
    "ON_TIME_STATUSES",
    "PRESENT_STATUSES",
    "ScheduledShift",
    "ShiftRules",
    "classify",
    "early_exit_minutes",
    "late_minutes",
    "minutes_between",
    "resolve_shift",
    "worked_minutes",
]

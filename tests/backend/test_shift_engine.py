"""Shift rules: late, early exit, absent, missing checkout.

These are pure-function tests — no database, no HTTP — because the rules are
the part of GymFlow that must never quietly change.
"""

from __future__ import annotations

from datetime import date, datetime, time, timedelta

import pytest

from app.core.clock import UTC
from app.db.models import AttendanceStatus
from app.domain.shift_engine import (
    ShiftRules,
    classify,
    early_exit_minutes,
    late_minutes,
    resolve_shift,
    worked_minutes,
)

TZ = "Asia/Kolkata"
WORK_DATE = date(2026, 8, 12)


def shift(grace: int = 10, early_grace: int = 0, start=time(18, 0), end=time(21, 0)):
    return resolve_shift(WORK_DATE, start, end, TZ, ShiftRules(grace, early_grace))


def at(hour: int, minute: int, second: int = 0, day: int = 12) -> datetime:
    """A local Asia/Kolkata wall-clock time as an absolute instant."""
    from zoneinfo import ZoneInfo

    return datetime(2026, 8, day, hour, minute, second, tzinfo=ZoneInfo(TZ)).astimezone(UTC)


# ------------------------------------------------------------------- late


@pytest.mark.parametrize(
    ("arrival", "expected"),
    [
        (at(17, 45), 0),  # early
        (at(18, 0), 0),  # exactly on the hour
        (at(18, 10), 0),  # last second of the grace window
        (at(18, 10, 59), 0),
        (at(18, 11), 1),  # first late minute
        (at(18, 40), 30),
    ],
)
def test_late_minutes_respect_the_grace_window(arrival, expected):
    assert late_minutes(arrival, shift(grace=10)) == expected


def test_grace_is_configurable():
    assert late_minutes(at(18, 20), shift(grace=10)) == 10
    assert late_minutes(at(18, 20), shift(grace=30)) == 0
    assert late_minutes(at(18, 20), shift(grace=0)) == 20


# ------------------------------------------------------------- early exit


def test_early_exit_measured_against_shift_end():
    assert early_exit_minutes(at(21, 0), shift()) == 0
    assert early_exit_minutes(at(21, 30), shift()) == 0  # staying late is not an exit
    assert early_exit_minutes(at(20, 30), shift()) == 30


def test_early_exit_grace_is_configurable():
    assert early_exit_minutes(at(20, 55), shift(early_grace=0)) == 5
    assert early_exit_minutes(at(20, 55), shift(early_grace=10)) == 0


# --------------------------------------------------------- classification


def test_on_time_check_in_and_full_shift_is_completed():
    status, late, early = classify(
        shift=shift(), check_in_at=at(18, 5), check_out_at=at(21, 0), day_is_over=True
    )
    assert (status, late, early) == (AttendanceStatus.COMPLETED, 0, 0)


def test_late_check_in_is_late():
    status, late, _ = classify(
        shift=shift(), check_in_at=at(18, 25), check_out_at=at(21, 0), day_is_over=True
    )
    assert status is AttendanceStatus.LATE
    assert late == 15


def test_early_checkout_is_early_exit():
    status, _, early = classify(
        shift=shift(), check_in_at=at(18, 2), check_out_at=at(20, 15), day_is_over=True
    )
    assert status is AttendanceStatus.EARLY_EXIT
    assert early == 45


def test_late_and_early_is_reported_as_both():
    status, late, early = classify(
        shift=shift(), check_in_at=at(18, 30), check_out_at=at(20, 0), day_is_over=True
    )
    assert status is AttendanceStatus.LATE_AND_EARLY_EXIT
    assert (late, early) == (20, 60)


def test_no_check_in_after_the_shift_is_absent():
    status, _, _ = classify(shift=shift(), check_in_at=None, check_out_at=None, day_is_over=True)
    assert status is AttendanceStatus.ABSENT


def test_no_check_in_during_the_shift_is_still_scheduled():
    """Mid-shift silence is "not arrived yet", not "never arrived"."""
    status, _, _ = classify(shift=shift(), check_in_at=None, check_out_at=None, day_is_over=False)
    assert status is AttendanceStatus.SCHEDULED


def test_check_in_without_check_out_after_the_shift_is_missing_checkout():
    status, _, _ = classify(
        shift=shift(), check_in_at=at(18, 3), check_out_at=None, day_is_over=True
    )
    assert status is AttendanceStatus.MISSING_CHECKOUT


def test_check_in_without_check_out_during_the_shift_is_on_time():
    status, _, _ = classify(
        shift=shift(), check_in_at=at(18, 3), check_out_at=None, day_is_over=False
    )
    assert status is AttendanceStatus.ON_TIME


# ------------------------------------------------------------- edge cases


def test_overnight_shift_ends_on_the_following_day():
    overnight = shift(start=time(22, 0), end=time(6, 0))
    assert overnight.end_at - overnight.start_at == timedelta(hours=8)

    status, late, early = classify(
        shift=overnight,
        check_in_at=at(22, 5),
        check_out_at=at(6, 0, day=13),
        day_is_over=True,
    )
    assert (status, late, early) == (AttendanceStatus.COMPLETED, 0, 0)


def test_worked_minutes_needs_both_ends():
    assert worked_minutes(at(18, 0), at(21, 0)) == 180
    assert worked_minutes(at(18, 0), None) == 0
    assert worked_minutes(None, at(21, 0)) == 0


def test_a_day_with_no_roster_is_never_marked_absent():
    status, _, _ = classify(shift=None, check_in_at=None, check_out_at=None, day_is_over=True)
    assert status is AttendanceStatus.SCHEDULED

"""Server time.

Every attendance decision in GymFlow is made against this clock and never
against a value supplied by a phone. The indirection exists so tests can freeze
time without any production code path learning about test doubles.
"""

from __future__ import annotations

from datetime import UTC, date, datetime, time, timedelta
from zoneinfo import ZoneInfo

DEFAULT_TZ = "Asia/Kolkata"

_frozen: datetime | None = None


def now_utc() -> datetime:
    """Authoritative current instant, always timezone-aware UTC."""
    if _frozen is not None:
        return _frozen
    return datetime.now(UTC)


def freeze(at: datetime | None) -> None:
    """Test hook. Passing None returns the clock to the real one."""
    global _frozen
    if at is not None and at.tzinfo is None:
        at = at.replace(tzinfo=UTC)
    _frozen = at


def branch_tz(tz_name: str | None) -> ZoneInfo:
    return ZoneInfo(tz_name or DEFAULT_TZ)


def to_branch_time(moment: datetime, tz_name: str | None) -> datetime:
    if moment.tzinfo is None:
        moment = moment.replace(tzinfo=UTC)
    return moment.astimezone(branch_tz(tz_name))


def branch_today(tz_name: str | None) -> date:
    """The business date at a branch right now."""
    return to_branch_time(now_utc(), tz_name).date()


def combine_branch(work_date: date, at: time, tz_name: str | None) -> datetime:
    """Turn a scheduled local wall-clock time into an absolute instant."""
    return datetime.combine(work_date, at, tzinfo=branch_tz(tz_name)).astimezone(UTC)


def shift_window(
    work_date: date, start: time, end: time, tz_name: str | None
) -> tuple[datetime, datetime]:
    """Absolute start/end for a shift, handling shifts that cross midnight.

    A 22:00–06:00 shift ends on the following calendar day; treating it
    otherwise would mark every night trainer as leaving eight hours early.
    """
    start_at = combine_branch(work_date, start, tz_name)
    end_at = combine_branch(work_date, end, tz_name)
    if end <= start:
        end_at += timedelta(days=1)
    return start_at, end_at


__all__ = [
    "UTC",
    "DEFAULT_TZ",
    "branch_today",
    "branch_tz",
    "combine_branch",
    "freeze",
    "now_utc",
    "shift_window",
    "to_branch_time",
]

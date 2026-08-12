"""Punctuality scoring over a set of trainer-days."""

from __future__ import annotations

from collections.abc import Iterable
from dataclasses import asdict, dataclass

from app.db.models import AttendanceStatus, TrainerAttendance
from app.domain.shift_engine import (
    EARLY_EXIT_STATUSES,
    LATE_STATUSES,
    ON_TIME_STATUSES,
    PRESENT_STATUSES,
)


@dataclass(frozen=True)
class PunctualitySummary:
    scheduled_shifts: int = 0
    present_count: int = 0
    on_time_count: int = 0
    late_count: int = 0
    early_exit_count: int = 0
    absent_count: int = 0
    missing_checkout_count: int = 0
    completed_shifts: int = 0
    punctuality_pct: float = 0.0
    attendance_pct: float = 0.0
    completion_pct: float = 0.0
    score: float = 0.0

    def as_dict(self) -> dict:
        return asdict(self)


def _pct(numerator: int, denominator: int) -> float:
    if denominator <= 0:
        return 0.0
    return round(numerator * 100 / denominator, 2)


def summarise(
    records: Iterable[TrainerAttendance],
    *,
    punctuality_weight: float = 0.6,
    attendance_weight: float = 0.4,
) -> PunctualitySummary:
    """Roll a trainer's days into the numbers the owner screen shows.

    Weights are arguments rather than constants because the overall score is a
    policy decision SLAM may want to retune; they arrive from ``settings``.
    """
    scheduled = present = on_time = late = early = absent = missing = completed = 0

    for row in records:
        status = row.status
        # A day with no roster is not something the trainer can be scored
        # against, so it does not enter the denominator.
        if row.scheduled_start is not None:
            scheduled += 1
        if status in PRESENT_STATUSES:
            present += 1
        if status in ON_TIME_STATUSES:
            on_time += 1
        if status in LATE_STATUSES:
            late += 1
        if status in EARLY_EXIT_STATUSES:
            early += 1
        if status is AttendanceStatus.ABSENT:
            absent += 1
        if status is AttendanceStatus.MISSING_CHECKOUT:
            missing += 1
        if status is AttendanceStatus.COMPLETED:
            completed += 1

    punctuality_pct = _pct(on_time, present)
    attendance_pct = _pct(present, scheduled)
    completion_pct = _pct(completed, present)

    total_weight = punctuality_weight + attendance_weight
    score = (
        round(
            (punctuality_pct * punctuality_weight + attendance_pct * attendance_weight)
            / total_weight,
            2,
        )
        if total_weight
        else 0.0
    )

    return PunctualitySummary(
        scheduled_shifts=scheduled,
        present_count=present,
        on_time_count=on_time,
        late_count=late,
        early_exit_count=early,
        absent_count=absent,
        missing_checkout_count=missing,
        completed_shifts=completed,
        punctuality_pct=punctuality_pct,
        attendance_pct=attendance_pct,
        completion_pct=completion_pct,
        score=score,
    )


__all__ = ["PunctualitySummary", "summarise"]

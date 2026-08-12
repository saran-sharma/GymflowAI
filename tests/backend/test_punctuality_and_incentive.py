"""Punctuality rollups and incentive eligibility."""

from __future__ import annotations

from datetime import date, datetime

import pytest

from app.core.clock import UTC
from app.db.models import AttendanceStatus, IncentiveRule, IncentiveStatus, TrainerAttendance
from app.domain.incentive import DISCLAIMER, evaluate
from app.domain.punctuality import summarise


def day(status: AttendanceStatus, rostered: bool = True) -> TrainerAttendance:
    return TrainerAttendance(
        trainer_id=1,
        branch_id=1,
        work_date=date(2026, 8, 1),
        status=status,
        scheduled_start=datetime(2026, 8, 1, 12, 30, tzinfo=UTC) if rostered else None,
        scheduled_end=datetime(2026, 8, 1, 15, 30, tzinfo=UTC) if rostered else None,
    )


def rule(**overrides) -> IncentiveRule:
    defaults = {
        "name": "Test",
        "branch_id": None,
        "min_punctuality_pct": 90,
        "min_attendance_pct": 95,
        "max_late_count": 2,
        "max_early_exit_count": 1,
        "max_missing_checkout_count": 2,
        "review_band_pct": 5,
    }
    defaults.update(overrides)
    return IncentiveRule(**defaults)


# ------------------------------------------------------------ punctuality


def test_perfect_month():
    summary = summarise([day(AttendanceStatus.COMPLETED) for _ in range(20)])
    assert summary.scheduled_shifts == 20
    assert summary.present_count == 20
    assert summary.punctuality_pct == 100.0
    assert summary.attendance_pct == 100.0
    assert summary.score == 100.0


def test_punctuality_is_on_time_over_present_not_over_scheduled():
    """A trainer who was absent is not also counted as "late that day"."""
    rows = [day(AttendanceStatus.COMPLETED) for _ in range(8)]
    rows += [day(AttendanceStatus.LATE) for _ in range(2)]
    rows += [day(AttendanceStatus.ABSENT)]
    summary = summarise(rows)

    assert summary.present_count == 10
    assert summary.on_time_count == 8
    assert summary.punctuality_pct == 80.0
    assert summary.attendance_pct == pytest.approx(90.91, abs=0.01)
    assert summary.absent_count == 1


def test_late_and_early_counts_toward_both_tallies():
    summary = summarise([day(AttendanceStatus.LATE_AND_EARLY_EXIT)])
    assert summary.late_count == 1
    assert summary.early_exit_count == 1
    assert summary.punctuality_pct == 0.0


def test_missing_checkout_still_counts_as_turning_up_on_time():
    summary = summarise([day(AttendanceStatus.MISSING_CHECKOUT)])
    assert summary.present_count == 1
    assert summary.on_time_count == 1
    assert summary.missing_checkout_count == 1


def test_unrostered_days_do_not_enter_the_denominator():
    summary = summarise([day(AttendanceStatus.COMPLETED, rostered=False)])
    assert summary.scheduled_shifts == 0
    assert summary.attendance_pct == 0.0


def test_score_weights_are_configurable():
    rows = [day(AttendanceStatus.LATE) for _ in range(1)] + [
        day(AttendanceStatus.COMPLETED) for _ in range(1)
    ]
    punctual_heavy = summarise(rows, punctuality_weight=1, attendance_weight=0)
    attendance_heavy = summarise(rows, punctuality_weight=0, attendance_weight=1)
    assert punctual_heavy.score == 50.0
    assert attendance_heavy.score == 100.0


def test_empty_month_does_not_divide_by_zero():
    summary = summarise([])
    assert (summary.punctuality_pct, summary.attendance_pct, summary.score) == (0.0, 0.0, 0.0)


# -------------------------------------------------------------- incentive


def test_clean_month_is_eligible():
    summary = summarise([day(AttendanceStatus.COMPLETED) for _ in range(22)])
    outcome = evaluate(summary, rule())
    assert outcome.status is IncentiveStatus.ELIGIBLE
    assert all(check.passed for check in outcome.checks)
    assert outcome.disclaimer == DISCLAIMER


def test_a_clear_miss_is_not_eligible():
    rows = [day(AttendanceStatus.COMPLETED) for _ in range(10)]
    rows += [day(AttendanceStatus.LATE) for _ in range(10)]
    outcome = evaluate(summarise(rows), rule())
    assert outcome.status is IncentiveStatus.NOT_ELIGIBLE


def test_a_near_miss_lands_in_needs_review():
    """89.5% against a 90% bar is a conversation, not a denial."""
    rows = [day(AttendanceStatus.COMPLETED) for _ in range(18)]
    rows += [day(AttendanceStatus.LATE) for _ in range(2)]
    summary = summarise(rows)
    assert summary.punctuality_pct == 90.0

    outcome = evaluate(summary, rule(min_punctuality_pct=93))
    assert outcome.status is IncentiveStatus.NEEDS_REVIEW
    punctuality = next(c for c in outcome.checks if c.key == "punctuality")
    assert punctuality.near_miss is True


def test_an_empty_roster_is_reviewed_not_denied():
    outcome = evaluate(summarise([]), rule())
    assert outcome.status is IncentiveStatus.NEEDS_REVIEW


def test_thresholds_are_not_hardcoded():
    rows = [day(AttendanceStatus.COMPLETED) for _ in range(15)]
    rows += [day(AttendanceStatus.LATE) for _ in range(5)]
    summary = summarise(rows)  # 75% punctuality, 5 late

    assert evaluate(summary, rule()).status is IncentiveStatus.NOT_ELIGIBLE
    relaxed = rule(min_punctuality_pct=70, min_attendance_pct=70, max_late_count=6)
    assert evaluate(summary, relaxed).status is IncentiveStatus.ELIGIBLE


def test_counts_over_the_bar_are_reported_per_rule():
    rows = [day(AttendanceStatus.COMPLETED) for _ in range(19)]
    rows += [day(AttendanceStatus.EARLY_EXIT) for _ in range(3)]
    outcome = evaluate(summarise(rows), rule())
    early = next(c for c in outcome.checks if c.key == "early_exit")
    assert early.passed is False
    assert early.actual == 3
    assert early.threshold == 1


def test_outcome_serialises_with_its_disclaimer():
    payload = evaluate(summarise([day(AttendanceStatus.COMPLETED)]), rule()).as_dict()
    assert payload["disclaimer"] == DISCLAIMER
    assert {c["key"] for c in payload["checks"]} == {
        "punctuality",
        "attendance",
        "late",
        "early_exit",
        "missing_checkout",
    }

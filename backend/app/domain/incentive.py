"""Incentive eligibility.

This is deliberately *not* payroll. It answers one question — does this
trainer's month clear the thresholds the owner configured — and every threshold
arrives from an ``incentive_rules`` row rather than a constant in code.
"""

from __future__ import annotations

from dataclasses import dataclass

from app.db.models import IncentiveRule, IncentiveStatus
from app.domain.punctuality import PunctualitySummary

DISCLAIMER = "Final payroll/incentive calculation is subject to SLAM policy."


@dataclass(frozen=True)
class RuleCheck:
    key: str
    label: str
    passed: bool
    near_miss: bool
    actual: float
    threshold: float


@dataclass(frozen=True)
class IncentiveOutcome:
    status: IncentiveStatus
    checks: list[RuleCheck]
    disclaimer: str = DISCLAIMER

    def as_dict(self) -> dict:
        return {
            "status": self.status.value,
            "disclaimer": self.disclaimer,
            "checks": [
                {
                    "key": c.key,
                    "label": c.label,
                    "passed": c.passed,
                    "near_miss": c.near_miss,
                    "actual": c.actual,
                    "threshold": c.threshold,
                }
                for c in self.checks
            ],
        }


def _at_least(key: str, label: str, actual: float, threshold: float, band: float) -> RuleCheck:
    passed = actual >= threshold
    return RuleCheck(
        key=key,
        label=label,
        passed=passed,
        near_miss=not passed and actual >= threshold - band,
        actual=round(float(actual), 2),
        threshold=round(float(threshold), 2),
    )


def _at_most(key: str, label: str, actual: float, threshold: float) -> RuleCheck:
    passed = actual <= threshold
    return RuleCheck(
        key=key,
        label=label,
        passed=passed,
        # One over a count threshold is a conversation; two over is a no.
        near_miss=not passed and actual <= threshold + 1,
        actual=round(float(actual), 2),
        threshold=round(float(threshold), 2),
    )


def evaluate(summary: PunctualitySummary, rule: IncentiveRule) -> IncentiveOutcome:
    band = float(rule.review_band_pct or 0)
    checks = [
        _at_least(
            "punctuality",
            f"Punctuality ≥ {float(rule.min_punctuality_pct):g}%",
            summary.punctuality_pct,
            float(rule.min_punctuality_pct),
            band,
        ),
        _at_least(
            "attendance",
            f"Attendance ≥ {float(rule.min_attendance_pct):g}%",
            summary.attendance_pct,
            float(rule.min_attendance_pct),
            band,
        ),
        _at_most(
            "late",
            f"Late marks ≤ {rule.max_late_count}",
            summary.late_count,
            rule.max_late_count,
        ),
        _at_most(
            "early_exit",
            f"Early exits ≤ {rule.max_early_exit_count}",
            summary.early_exit_count,
            rule.max_early_exit_count,
        ),
        _at_most(
            "missing_checkout",
            f"Missing checkouts ≤ {rule.max_missing_checkout_count}",
            summary.missing_checkout_count,
            rule.max_missing_checkout_count,
        ),
    ]

    if summary.scheduled_shifts == 0:
        # Nothing rostered means nothing to judge. Flagging this as "not
        # eligible" would punish a trainer for the owner's empty roster.
        return IncentiveOutcome(IncentiveStatus.NEEDS_REVIEW, checks)

    failed = [c for c in checks if not c.passed]
    if not failed:
        return IncentiveOutcome(IncentiveStatus.ELIGIBLE, checks)
    if all(c.near_miss for c in failed):
        return IncentiveOutcome(IncentiveStatus.NEEDS_REVIEW, checks)
    return IncentiveOutcome(IncentiveStatus.NOT_ELIGIBLE, checks)


__all__ = ["DISCLAIMER", "IncentiveOutcome", "RuleCheck", "evaluate"]

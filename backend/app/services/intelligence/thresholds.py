"""Every number the intelligence layer argues about, in one place.

A "member is inactive after 10 days" or "a plateau needs at least four
sessions" is a product decision, not an implementation detail, and scattering
those constants through the signal calculators is how two screens end up
disagreeing about what "consistent" means. Import ``THRESHOLDS`` and read the
field; never inline the literal at the call site.

These are deliberately not settings-table rows yet: SLAM has one gym and no
appetite for per-branch tuning of a training heuristic. When that changes, this
dataclass is what a settings loader populates.
"""

from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class IntelligenceThresholds:
    # -- coverage: how much history a member needs before we say anything ----
    #: Below this many completed own-workout sessions ever, the member gets the
    #: "keep training and GymFlow will start showing trends" empty state rather
    #: than insights built on two data points.
    min_sessions_for_insights: int = 3
    #: A trend (this window vs the previous one) needs at least this many
    #: sessions in *each* window or it is reported as insufficient data, never
    #: as "declining".
    min_sessions_per_trend_window: int = 3

    # -- training consistency ----------------------------------------------
    consistency_window_weeks: int = 4
    #: Sessions per week the journey/PT cadence is built around.
    consistency_target_per_week: float = 3.0
    #: At or above target * this ratio → "strong".
    consistency_strong_ratio: float = 0.85
    #: Below target * this ratio → "low" (an attention signal).
    consistency_low_ratio: float = 0.5

    # -- inactivity ------------------------------------------------------
    #: No training session in this many days → "slipping" (attention).
    inactivity_attention_days: int = 10
    #: No training session in this many days → "inactive" (critical).
    inactivity_critical_days: int = 21

    # -- personal records ----------------------------------------------
    #: A heaviest-ever set inside this window counts as a "recent" PR.
    recent_pr_window_days: int = 30

    # -- training trend (volume + frequency) --------------------------
    trend_window_days: int = 28
    #: A volume change smaller than this (either direction) is "steady", not a
    #: trend — training varies week to week and we do not cry wolf.
    trend_meaningful_change_pct: float = 12.0

    # -- plateau (conservative, explainable) -------------------------
    #: Fewer than this many sessions of the lift → no plateau call at all.
    plateau_min_sessions: int = 4
    #: How many of the most recent sessions of the lift the check looks at.
    plateau_lookback_sessions: int = 5
    #: Top-set weight range across those sessions must sit inside this band.
    plateau_weight_tolerance_kg: float = 1.0
    #: …and those sessions must span at least this many days, so a busy fortnight
    #: of identical loads is not mistaken for a stall.
    plateau_min_span_days: int = 21

    # -- journey / programme ----------------------------------------
    #: "Finishing soon" once the active journey is within this many days of its
    #: end date.
    journey_finishing_soon_days: int = 5
    #: This many missed journey days is an attention signal for a trainer.
    journey_missed_days_attention: int = 3

    # -- membership ------------------------------------------------
    #: Membership ending within this many days is surfaced on the member's own
    #: intelligence (and the trainer/owner views) as something to act on.
    membership_expiry_attention_days: int = 14


THRESHOLDS = IntelligenceThresholds()

__all__ = ["THRESHOLDS", "IntelligenceThresholds"]

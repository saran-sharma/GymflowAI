"""Ties the incentive rules to stored attendance and persists the outcome."""

from __future__ import annotations

import calendar
from datetime import date

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.clock import branch_today, now_utc
from app.db.models import IncentiveResult, IncentiveRule, Trainer, TrainerAttendance
from app.domain import incentive as incentive_domain
from app.domain.punctuality import PunctualitySummary, summarise
from app.services import settings_service


def month_bounds(any_day: date) -> tuple[date, date]:
    start = any_day.replace(day=1)
    end = any_day.replace(day=calendar.monthrange(any_day.year, any_day.month)[1])
    return start, end


def active_rule(db: Session, branch_id: int) -> IncentiveRule:
    """Branch rule if configured, otherwise the chain-wide default."""
    rule = db.scalar(
        select(IncentiveRule)
        .where(IncentiveRule.branch_id == branch_id, IncentiveRule.is_active.is_(True))
        .order_by(IncentiveRule.effective_from.desc().nullslast(), IncentiveRule.id.desc())
    )
    if rule is not None:
        return rule
    rule = db.scalar(
        select(IncentiveRule)
        .where(IncentiveRule.branch_id.is_(None), IncentiveRule.is_active.is_(True))
        .order_by(IncentiveRule.effective_from.desc().nullslast(), IncentiveRule.id.desc())
    )
    if rule is not None:
        return rule
    # A database with no rules at all still answers, using the model defaults.
    return IncentiveRule(name="Default", branch_id=None)


def attendance_rows(
    db: Session, trainer_id: int, period_start: date, period_end: date
) -> list[TrainerAttendance]:
    return list(
        db.scalars(
            select(TrainerAttendance).where(
                TrainerAttendance.trainer_id == trainer_id,
                TrainerAttendance.work_date >= period_start,
                TrainerAttendance.work_date <= period_end,
            )
        ).all()
    )


def summarise_trainer(
    db: Session, trainer: Trainer, period_start: date, period_end: date
) -> PunctualitySummary:
    return summarise(
        attendance_rows(db, trainer.id, period_start, period_end),
        punctuality_weight=settings_service.get_float(
            db, "punctuality.punctuality_weight", trainer.branch_id
        ),
        attendance_weight=settings_service.get_float(
            db, "punctuality.attendance_weight", trainer.branch_id
        ),
    )


def evaluate_trainer(
    db: Session, trainer: Trainer, period_start: date, period_end: date
) -> tuple[PunctualitySummary, incentive_domain.IncentiveOutcome, IncentiveRule]:
    summary = summarise_trainer(db, trainer, period_start, period_end)
    rule = active_rule(db, trainer.branch_id)
    return summary, incentive_domain.evaluate(summary, rule), rule


def persist_result(
    db: Session,
    trainer: Trainer,
    period_start: date,
    period_end: date,
    summary: PunctualitySummary,
    outcome: incentive_domain.IncentiveOutcome,
    rule: IncentiveRule,
) -> IncentiveResult:
    row = db.scalar(
        select(IncentiveResult).where(
            IncentiveResult.trainer_id == trainer.id,
            IncentiveResult.period_start == period_start,
        )
    )
    if row is None:
        row = IncentiveResult(
            trainer_id=trainer.id, branch_id=trainer.branch_id, period_start=period_start
        )
        db.add(row)

    row.branch_id = trainer.branch_id
    row.rule_id = rule.id
    row.period_end = period_end
    row.punctuality_pct = summary.punctuality_pct
    row.attendance_pct = summary.attendance_pct
    row.late_count = summary.late_count
    row.early_exit_count = summary.early_exit_count
    row.absent_count = summary.absent_count
    row.missing_checkout_count = summary.missing_checkout_count
    row.completed_shifts = summary.completed_shifts
    row.scheduled_shifts = summary.scheduled_shifts
    row.score = summary.score
    row.status = outcome.status
    row.reasons = outcome.as_dict()
    row.computed_at = now_utc()
    db.flush()
    return row


def recompute_branch(db: Session, branch_id: int, tz: str, month: date | None = None) -> int:
    period = month or branch_today(tz)
    period_start, period_end = month_bounds(period)
    trainers = db.scalars(
        select(Trainer).where(Trainer.branch_id == branch_id, Trainer.is_active.is_(True))
    ).all()
    for trainer in trainers:
        summary, outcome, rule = evaluate_trainer(db, trainer, period_start, period_end)
        persist_result(db, trainer, period_start, period_end, summary, outcome, rule)
    return len(trainers)


__all__ = [
    "active_rule",
    "attendance_rows",
    "evaluate_trainer",
    "month_bounds",
    "persist_result",
    "recompute_branch",
    "summarise_trainer",
]

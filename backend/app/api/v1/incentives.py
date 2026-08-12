"""Incentive eligibility and the rules behind it.

This module never produces a payout figure. It answers "does this month clear
the configured bars", and every response carries the SLAM policy disclaimer.
"""

from __future__ import annotations

from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy import select
from sqlalchemy.orm import Session, joinedload

from app.core.clock import branch_today
from app.core.deps import (
    assert_branch_access,
    get_current_user,
    require_admin,
    scoped_branch_filter,
)
from app.db.models import Branch, IncentiveRule, Trainer, User
from app.db.session import get_db
from app.domain.incentive import DISCLAIMER
from app.schemas.common import (
    IncentiveResultOut,
    IncentiveRuleOut,
    IncentiveRuleUpdate,
    MessageOut,
)
from app.services import audit, incentive_service

router = APIRouter(prefix="/incentives", tags=["incentives"])


def _result_out(
    db: Session, trainer: Trainer, period_start: date, period_end: date
) -> IncentiveResultOut:
    summary, outcome, rule = incentive_service.evaluate_trainer(
        db, trainer, period_start, period_end
    )
    incentive_service.persist_result(db, trainer, period_start, period_end, summary, outcome, rule)
    return IncentiveResultOut(
        trainer_id=trainer.id,
        trainer_name=trainer.user.full_name,
        branch_id=trainer.branch_id,
        branch_name=trainer.branch.name,
        period_start=period_start,
        period_end=period_end,
        punctuality_pct=summary.punctuality_pct,
        attendance_pct=summary.attendance_pct,
        late_count=summary.late_count,
        early_exit_count=summary.early_exit_count,
        absent_count=summary.absent_count,
        missing_checkout_count=summary.missing_checkout_count,
        completed_shifts=summary.completed_shifts,
        scheduled_shifts=summary.scheduled_shifts,
        score=summary.score,
        status=outcome.status,
        checks=outcome.as_dict()["checks"],
        disclaimer=DISCLAIMER,
    )


@router.get("", response_model=list[IncentiveResultOut])
def list_incentives(
    branch_id: int | None = Query(default=None),
    month: date | None = Query(default=None, description="Any day inside the month"),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> list[IncentiveResultOut]:
    stmt = (
        select(Trainer)
        .options(joinedload(Trainer.user), joinedload(Trainer.branch))
        .where(Trainer.is_active.is_(True))
        .order_by(Trainer.employee_code)
    )
    if user.role.key == "trainer":
        stmt = stmt.where(Trainer.user_id == user.id)
    else:
        allowed = scoped_branch_filter(user, branch_id)
        if allowed is not None:
            stmt = stmt.where(Trainer.branch_id.in_(allowed))

    out: list[IncentiveResultOut] = []
    for trainer in db.scalars(stmt).all():
        period = month or branch_today(trainer.branch.timezone)
        period_start, period_end = incentive_service.month_bounds(period)
        out.append(_result_out(db, trainer, period_start, period_end))
    return out


@router.get("/me", response_model=IncentiveResultOut)
def my_incentive(
    month: date | None = Query(default=None),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> IncentiveResultOut:
    trainer = db.scalar(
        select(Trainer)
        .options(joinedload(Trainer.user), joinedload(Trainer.branch))
        .where(Trainer.user_id == user.id)
    )
    if trainer is None:
        raise HTTPException(status_code=403, detail="This account is not a trainer")
    period = month or branch_today(trainer.branch.timezone)
    period_start, period_end = incentive_service.month_bounds(period)
    return _result_out(db, trainer, period_start, period_end)


@router.get("/rules", response_model=list[IncentiveRuleOut])
def list_rules(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> list[IncentiveRule]:
    stmt = select(IncentiveRule).order_by(IncentiveRule.branch_id.nullsfirst(), IncentiveRule.id)
    allowed = scoped_branch_filter(user, None)
    if allowed is not None:
        # A branch manager sees their branch's rule and the chain default it
        # may be overriding, so a threshold is never unexplained.
        stmt = stmt.where(
            (IncentiveRule.branch_id.is_(None)) | (IncentiveRule.branch_id.in_(allowed))
        )
    return list(db.scalars(stmt).all())


@router.patch("/rules/{rule_id}", response_model=IncentiveRuleOut)
def update_rule(
    rule_id: int,
    payload: IncentiveRuleUpdate,
    request: Request,
    db: Session = Depends(get_db),
    user: User = Depends(require_admin),
) -> IncentiveRule:
    rule = db.get(IncentiveRule, rule_id)
    if rule is None:
        raise HTTPException(status_code=404, detail="Rule not found")
    assert_branch_access(user, rule.branch_id)

    changes = payload.model_dump(exclude_unset=True)
    before = {k: getattr(rule, k) for k in changes}
    for key, value in changes.items():
        setattr(rule, key, value)
    db.flush()

    audit.record(
        db,
        action=audit.ACTION_INCENTIVE_RULE_CHANGE,
        actor=user,
        entity_type="incentive_rule",
        entity_id=rule.id,
        branch_id=rule.branch_id,
        request=request,
        details={
            "before": {k: str(v) for k, v in before.items()},
            "after": {k: str(v) for k, v in changes.items()},
        },
    )
    return rule


@router.post("/recompute", response_model=MessageOut)
def recompute(
    request: Request,
    branch_id: int | None = Query(default=None),
    month: date | None = Query(default=None),
    db: Session = Depends(get_db),
    user: User = Depends(require_admin),
) -> MessageOut:
    allowed = scoped_branch_filter(user, branch_id)
    stmt = select(Branch).where(Branch.is_active.is_(True))
    if allowed is not None:
        stmt = stmt.where(Branch.id.in_(allowed))

    total = 0
    for branch in db.scalars(stmt).all():
        total += incentive_service.recompute_branch(db, branch.id, branch.timezone, month)

    audit.record(
        db,
        action=audit.ACTION_INCENTIVE_RECOMPUTE,
        actor=user,
        request=request,
        details={"trainers": total},
    )
    return MessageOut(message=f"Recomputed {total} trainer result(s). {DISCLAIMER}")


__all__ = ["router"]

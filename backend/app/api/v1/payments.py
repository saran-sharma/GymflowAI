"""Payments: recording a charge, settling it, and asking what came in.

GymFlow had no money model at all before this. PT packages carried an optional
price and nothing recorded what was collected, so every revenue figure in the
product was blocked. This is the smallest schema that answers the questions the
owner, trainer and member screens actually ask — what is outstanding, what came
in this period, and what do I owe.

Nothing here computes a price. SLAM sets the amount; this records it.
"""

from __future__ import annotations

from datetime import timedelta

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy import select
from sqlalchemy.orm import Session, joinedload

from app.core.clock import branch_today, now_utc
from app.core.deps import (
    assert_branch_access,
    get_current_user,
    require_management,
    scoped_branch_filter,
)
from app.db.models import (
    Member,
    Payment,
    PaymentKind,
    PaymentStatus,
    Trainer,
    User,
)
from app.db.session import get_db
from app.schemas.payments import (
    PaymentOut,
    RecordPaymentRequest,
    RevenueLine,
    RevenueSummaryOut,
    SettlePaymentRequest,
)
from app.services import audit

from .journeys import current_member

router = APIRouter(prefix="/payments", tags=["payments"])


def payment_out(db: Session, payment: Payment) -> PaymentOut:
    trainer_name = None
    if payment.trainer_id:
        trainer = db.get(Trainer, payment.trainer_id)
        trainer_name = trainer.user.full_name if trainer else None
    return PaymentOut(
        id=payment.id,
        branch_id=payment.branch_id,
        member_id=payment.member_id,
        member_name=payment.member.user.full_name if payment.member else None,
        kind=payment.kind,
        status=payment.status,
        method=payment.method,
        amount=payment.amount,
        discount=payment.discount,
        tax=payment.tax,
        currency=payment.currency,
        membership_id=payment.membership_id,
        pt_package_id=payment.pt_package_id,
        group_class_id=payment.group_class_id,
        trainer_id=payment.trainer_id,
        trainer_name=trainer_name,
        due_on=payment.due_on,
        paid_at=payment.paid_at,
        collected_by_user_id=payment.collected_by_user_id,
        receipt_no=payment.receipt_no,
        notes=payment.notes,
    )


@router.post("", response_model=PaymentOut, status_code=201)
def record_payment(
    payload: RecordPaymentRequest,
    request: Request,
    db: Session = Depends(get_db),
    user: User = Depends(require_management),
) -> PaymentOut:
    """Raise a charge against a member, or record one already settled."""
    member = db.scalar(
        select(Member).options(joinedload(Member.user)).where(Member.id == payload.member_id)
    )
    if member is None:
        raise HTTPException(status_code=404, detail="Member not found")
    assert_branch_access(user, member.branch_id)

    if payload.receipt_no and db.scalar(
        select(Payment).where(Payment.receipt_no == payload.receipt_no)
    ):
        raise HTTPException(status_code=409, detail="That receipt number is already recorded")

    settled = payload.status is PaymentStatus.PAID
    payment = Payment(
        branch_id=member.branch_id,
        member_id=member.id,
        kind=payload.kind,
        status=payload.status,
        method=payload.method,
        amount=payload.amount,
        discount=payload.discount,
        tax=payload.tax,
        membership_id=payload.membership_id,
        pt_package_id=payload.pt_package_id,
        group_class_id=payload.group_class_id,
        trainer_id=payload.trainer_id,
        due_on=payload.due_on,
        paid_at=now_utc() if settled else None,
        collected_by_user_id=user.id if settled else None,
        receipt_no=payload.receipt_no,
        notes=payload.notes,
    )
    db.add(payment)
    db.commit()
    db.refresh(payment)

    audit.record(
        db,
        action="payment.recorded",
        actor=user,
        entity_type="payment",
        entity_id=payment.id,
        branch_id=payment.branch_id,
        request=request,
        details={
            "member_id": member.id,
            "kind": payload.kind.value,
            "amount": payload.amount,
            "status": payload.status.value,
        },
    )
    return payment_out(db, payment)


@router.post("/{payment_id}/settle", response_model=PaymentOut)
def settle_payment(
    payment_id: int,
    payload: SettlePaymentRequest,
    request: Request,
    db: Session = Depends(get_db),
    user: User = Depends(require_management),
) -> PaymentOut:
    """Mark a pending charge as collected, recording who took it."""
    payment = db.get(Payment, payment_id)
    if payment is None:
        raise HTTPException(status_code=404, detail="Payment not found")
    assert_branch_access(user, payment.branch_id)
    if payment.status is not PaymentStatus.PENDING:
        raise HTTPException(
            status_code=409, detail=f"That payment is already {payment.status.value}"
        )

    previous = payment.status
    payment.status = PaymentStatus.PAID
    payment.method = payload.method
    payment.paid_at = now_utc()
    payment.collected_by_user_id = user.id
    if payload.receipt_no:
        payment.receipt_no = payload.receipt_no
    if payload.notes:
        payment.notes = payload.notes
    db.commit()
    db.refresh(payment)

    audit.record(
        db,
        action="payment.settled",
        actor=user,
        entity_type="payment",
        entity_id=payment.id,
        branch_id=payment.branch_id,
        request=request,
        details={"from": previous.value, "to": "paid", "method": payload.method.value},
    )
    return payment_out(db, payment)


@router.get("", response_model=list[PaymentOut])
def list_payments(
    branch_id: int | None = Query(default=None),
    member_id: int | None = Query(default=None),
    status_filter: PaymentStatus | None = Query(default=None, alias="status"),
    kind: PaymentKind | None = Query(default=None),
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
    user: User = Depends(require_management),
) -> list[PaymentOut]:
    allowed = scoped_branch_filter(user, branch_id)
    stmt = (
        select(Payment)
        .options(joinedload(Payment.member).joinedload(Member.user))
        .order_by(Payment.created_at.desc())
        .offset(offset)
        .limit(limit)
    )
    if allowed is not None:
        stmt = stmt.where(Payment.branch_id.in_(allowed))
    if member_id is not None:
        stmt = stmt.where(Payment.member_id == member_id)
    if status_filter is not None:
        stmt = stmt.where(Payment.status == status_filter)
    if kind is not None:
        stmt = stmt.where(Payment.kind == kind)
    return [payment_out(db, row) for row in db.scalars(stmt).all()]


@router.get("/summary", response_model=RevenueSummaryOut)
def revenue_summary(
    days: int = Query(default=30, ge=1, le=366),
    branch_id: int | None = Query(default=None),
    db: Session = Depends(get_db),
    user: User = Depends(require_management),
) -> RevenueSummaryOut:
    """Collected inside the window, and everything still outstanding.

    Pending deliberately ignores the window: an invoice raised in March that is
    still unpaid is this month's problem, and hiding it because it is old is
    how a debt stops being chased.
    """
    allowed = scoped_branch_filter(user, branch_id)
    end = branch_today(None)
    start = end - timedelta(days=days)

    stmt = select(Payment)
    if allowed is not None:
        stmt = stmt.where(Payment.branch_id.in_(allowed))
    rows = list(db.scalars(stmt).all())

    lines: list[RevenueLine] = []
    collected_total = 0.0
    pending_total = 0.0

    for kind in PaymentKind:
        of_kind = [row for row in rows if row.kind is kind]
        collected = sum(
            row.amount
            for row in of_kind
            if row.status is PaymentStatus.PAID
            and row.paid_at is not None
            and start <= row.paid_at.date() <= end
        )
        pending = sum(row.amount for row in of_kind if row.status is PaymentStatus.PENDING)
        if not collected and not pending and not of_kind:
            continue
        collected_total += collected
        pending_total += pending
        lines.append(
            RevenueLine(kind=kind, collected=collected, pending=pending, count=len(of_kind))
        )

    return RevenueSummaryOut(
        period_start=start,
        period_end=end,
        currency="INR",
        collected_total=collected_total,
        pending_total=pending_total,
        lines=lines,
    )


@router.get("/me", response_model=list[PaymentOut])
def my_payments(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> list[PaymentOut]:
    """A member's own charges. Read-only — nobody settles their own bill here."""
    member = current_member(db, user)
    rows = db.scalars(
        select(Payment)
        .options(joinedload(Payment.member).joinedload(Member.user))
        .where(Payment.member_id == member.id)
        .order_by(Payment.created_at.desc())
        .limit(50)
    ).all()
    return [payment_out(db, row) for row in rows]

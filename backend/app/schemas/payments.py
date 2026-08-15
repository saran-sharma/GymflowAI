"""Payments: what SLAM charged, and whether it arrived."""

from __future__ import annotations

from datetime import date, datetime

from pydantic import BaseModel, ConfigDict, Field

from app.db.models import PaymentKind, PaymentMethod, PaymentStatus


class ORMModel(BaseModel):
    model_config = ConfigDict(from_attributes=True)


class PaymentOut(ORMModel):
    id: int
    branch_id: int
    member_id: int
    member_name: str | None = None
    kind: PaymentKind
    status: PaymentStatus
    method: PaymentMethod | None = None
    amount: float
    discount: float
    tax: float
    currency: str
    membership_id: int | None = None
    pt_package_id: int | None = None
    group_class_id: int | None = None
    trainer_id: int | None = None
    trainer_name: str | None = None
    due_on: date | None = None
    paid_at: datetime | None = None
    collected_by_user_id: int | None = None
    receipt_no: str | None = None
    notes: str | None = None


class RecordPaymentRequest(BaseModel):
    """Raise a charge, or record one that has already been settled.

    `status` defaults to pending: a charge exists the moment SLAM asks for it,
    and marking it paid is a separate act by whoever took the money.
    """

    member_id: int
    kind: PaymentKind
    amount: float = Field(gt=0)
    discount: float = Field(default=0, ge=0)
    tax: float = Field(default=0, ge=0)
    method: PaymentMethod | None = None
    status: PaymentStatus = PaymentStatus.PENDING
    membership_id: int | None = None
    pt_package_id: int | None = None
    group_class_id: int | None = None
    trainer_id: int | None = None
    due_on: date | None = None
    receipt_no: str | None = None
    notes: str | None = None


class SettlePaymentRequest(BaseModel):
    method: PaymentMethod
    receipt_no: str | None = None
    notes: str | None = None


class RevenueLine(BaseModel):
    kind: PaymentKind
    collected: float
    pending: float
    count: int


class RevenueSummaryOut(BaseModel):
    """Collected versus outstanding, split by what was being sold.

    Collected counts `paid_at` inside the window; pending counts everything
    still owed regardless of when it was raised, because an invoice from March
    that is still unpaid is this month's problem.
    """

    period_start: date
    period_end: date
    currency: str
    collected_total: float
    pending_total: float
    lines: list[RevenueLine]


__all__ = [name for name in dir() if name[0].isupper()]

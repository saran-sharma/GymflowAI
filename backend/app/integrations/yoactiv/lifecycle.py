"""Yoactiv invoice -> GymFlow membership lifecycle.

Yoactiv is the operational source of truth for memberships, but its Data API
has no membership-status endpoint. What it does expose is ``/invoices``, and
each invoice's ``Billed_Services[]`` carry a ``Start_date`` / ``End_date`` per
purchased service — that *is* the membership record, so this module derives
GymFlow's ``Membership`` rows and ``Member.is_active`` from it.

Hard rules (mirrors ``docs/INTEGRATIONS.md`` and the member-lifecycle tests):

* A membership row is **upserted**, never deleted. A renewal is a *new* row
  with a later ``ends_on``; the old one stays as history.
* ``Member.is_active`` is recomputed from the membership rows — ACTIVE if any
  membership has not yet ended, INACTIVE once every one has. Reactivation is
  automatic: the next renewal invoice flips it back.
* Nothing here ever touches workout programs, logged sets, PRs, body
  compositions, attendance, or PT execution. Deactivation gates *actions*
  (the membership-gate lives elsewhere), not *data*.
"""

from __future__ import annotations

from dataclasses import dataclass

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.clock import branch_today
from app.db.models import Branch, Member, Membership, MembershipStatus
from app.integrations.yoactiv.mapping import YoactivInvoice


@dataclass(frozen=True)
class LifecycleChange:
    memberships_created: int
    memberships_updated: int
    member_active_before: bool
    member_active_after: bool

    @property
    def changed(self) -> bool:
        return bool(
            self.memberships_created
            or self.memberships_updated
            or self.member_active_before != self.member_active_after
        )


def apply_invoice(db: Session, member: Member, invoice: YoactivInvoice) -> LifecycleChange:
    """Reconcile ``member``'s GymFlow membership state with one Yoactiv invoice.

    Idempotent: a billed service already represented by a membership row with
    the same ``(plan_name, starts_on)`` updates that row's ``ends_on`` /
    ``status`` in place rather than inserting a duplicate.
    """
    branch = db.get(Branch, member.branch_id)
    today = branch_today(branch.timezone if branch else None)

    existing = list(db.scalars(select(Membership).where(Membership.member_id == member.id)).all())
    by_key = {(m.plan_name, m.starts_on): m for m in existing}

    created = 0
    updated = 0
    for service in invoice.services:
        if service.start_date is None or service.end_date is None:
            continue  # a one-off charge with no term is not a membership
        plan_name = service.description or invoice.pt_name or "Membership"
        status = MembershipStatus.ACTIVE if service.end_date >= today else MembershipStatus.EXPIRED
        key = (plan_name, service.start_date)
        row = by_key.get(key)
        if row is None:
            db.add(
                Membership(
                    member_id=member.id,
                    branch_id=member.branch_id,
                    plan_name=plan_name,
                    status=status,
                    starts_on=service.start_date,
                    ends_on=service.end_date,
                    is_demo=member.is_demo,
                )
            )
            created += 1
        elif (row.ends_on, row.status) != (service.end_date, status):
            row.ends_on = service.end_date
            row.status = status
            updated += 1

    db.flush()
    active_before = member.is_active
    _recompute_member_active(db, member, today)
    return LifecycleChange(created, updated, active_before, member.is_active)


def recompute_active(db: Session, member: Member) -> bool:
    """Recompute ``member.is_active`` from membership rows alone. Returns the
    new value. Used by the periodic expiry sweep as well as by ``apply_invoice``.
    """
    branch = db.get(Branch, member.branch_id)
    today = branch_today(branch.timezone if branch else None)
    _recompute_member_active(db, member, today)
    return member.is_active


def _recompute_member_active(db: Session, member: Member, today) -> None:
    memberships = db.scalars(select(Membership).where(Membership.member_id == member.id)).all()
    if not memberships:
        return  # no Yoactiv membership signal yet — leave GymFlow's own flag alone
    has_current = any(
        m.ends_on >= today and m.status in (MembershipStatus.ACTIVE, MembershipStatus.FROZEN)
        for m in memberships
    )
    # Only flip rows that have crossed their end date to EXPIRED; never
    # rewrite a CANCELLED/FROZEN one, that is an operational decision Yoactiv
    # owns.
    for m in memberships:
        if m.status == MembershipStatus.ACTIVE and m.ends_on < today:
            m.status = MembershipStatus.EXPIRED
    member.is_active = has_current
    db.flush()


__all__ = ["LifecycleChange", "apply_invoice", "recompute_active"]

"""The member's own daily "how are you feeling" check-in.

Personalisation and motivation, not a clinical or readiness score — see
``MemberCheckIn`` for the constraint this rests on: one row per member per
day, keyed on the branch's own server-derived date.
"""

from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.clock import branch_today
from app.db.models import Branch, CheckInFeeling, Member, MemberCheckIn


def today_checkin(db: Session, member: Member, branch: Branch) -> MemberCheckIn | None:
    today = branch_today(branch.timezone)
    return db.scalar(
        select(MemberCheckIn).where(
            MemberCheckIn.member_id == member.id, MemberCheckIn.work_date == today
        )
    )


def submit_checkin(
    db: Session, member: Member, branch: Branch, feeling: CheckInFeeling
) -> MemberCheckIn:
    """Record today's feeling. A same-day resubmit updates the one row rather
    than stacking a second — the member changed their mind, not their day."""
    row = today_checkin(db, member, branch)
    if row is not None:
        row.feeling = feeling
        db.flush()
        return row

    row = MemberCheckIn(
        member_id=member.id,
        branch_id=branch.id,
        work_date=branch_today(branch.timezone),
        feeling=feeling,
    )
    db.add(row)
    db.flush()
    return row


__all__ = ["submit_checkin", "today_checkin"]

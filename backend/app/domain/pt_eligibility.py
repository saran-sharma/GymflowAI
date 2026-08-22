"""Effective PT eligibility — membership truth and PT package truth, combined.

Pure functions only — no database, no clock. This is the one place that
answers "can this member actually train PT right now," because the two
underlying facts live on two unrelated rows (``Membership``, ``PTPackage``)
and every screen that has ever rendered "PT ACTIVE" from ``PTPackage.status``
alone was answering a narrower question than the one members, trainers and
the owner actually care about.

The business rule (never delete a PT package to reflect an expired
membership — only its *eligibility* changes):

    membership ACTIVE   + package ACTIVE + sessions remaining -> PT_ACTIVE
    membership EXPIRED  + package ACTIVE                      -> PT_PAUSED_MEMBERSHIP_EXPIRED
    package COMPLETED                                         -> PT_COMPLETED
    package EXPIRED / CANCELLED                                -> PT_EXPIRED
    no package at all                                          -> NO_PT

Membership status itself is read fresh from ``ends_on`` rather than trusted
as stored, mirroring the self-heal already applied at
``GET /members/me`` (``app/api/v1/members.py``) — a lapsed membership is
EXPIRED the moment ``ends_on`` has passed, whether or not a nightly job has
caught up with the stored column yet.
"""

from __future__ import annotations

from datetime import date
from enum import Enum

from app.db.models import MembershipStatus, PackageStatus


class EffectivePtStatus(str, Enum):
    PT_ACTIVE = "pt_active"
    PT_PAUSED_MEMBERSHIP_EXPIRED = "pt_paused_membership_expired"
    PT_EXPIRED = "pt_expired"
    PT_COMPLETED = "pt_completed"
    NO_PT = "no_pt"


def effective_membership_status(
    stored_status: MembershipStatus, ends_on: date, today: date
) -> MembershipStatus:
    """The membership status honest as of ``today``, regardless of what a
    stale stored column says.

    Only ever *tightens* ACTIVE into EXPIRED when the date has passed — never
    the reverse, and never touches FROZEN/CANCELLED, which are deliberate
    staff actions this function has no basis to override.
    """
    if stored_status is MembershipStatus.ACTIVE and ends_on < today:
        return MembershipStatus.EXPIRED
    return stored_status


def effective_pt_status(
    *,
    package_status: PackageStatus | None,
    sessions_remaining: int | None,
    membership_status: MembershipStatus | None,
) -> EffectivePtStatus:
    """Combine membership truth with PT package truth into one answer.

    ``package_status=None`` means the member has never had a PT package.
    ``membership_status=None`` means the member has no membership row at all
    (treated the same as expired — there is nothing "active" to be eligible
    against).
    """
    if package_status is None:
        return EffectivePtStatus.NO_PT

    if package_status is PackageStatus.COMPLETED:
        return EffectivePtStatus.PT_COMPLETED

    if package_status in (PackageStatus.EXPIRED, PackageStatus.CANCELLED):
        return EffectivePtStatus.PT_EXPIRED

    # package_status is ACTIVE from here on.
    membership_active = membership_status is MembershipStatus.ACTIVE
    has_sessions_left = sessions_remaining is None or sessions_remaining > 0

    if not membership_active:
        return EffectivePtStatus.PT_PAUSED_MEMBERSHIP_EXPIRED
    if not has_sessions_left:
        return EffectivePtStatus.PT_EXPIRED
    return EffectivePtStatus.PT_ACTIVE


#: Copy for each state, shared by every surface that renders it (trainer
#: roster, Member Intelligence, the member's own PT screen) so the wording
#: cannot drift between screens the way the raw ``PackageStatus`` did.
EFFECTIVE_PT_STATUS_LABELS: dict[EffectivePtStatus, str] = {
    EffectivePtStatus.PT_ACTIVE: "PT active",
    EffectivePtStatus.PT_PAUSED_MEMBERSHIP_EXPIRED: "PT paused — membership expired",
    EffectivePtStatus.PT_EXPIRED: "PT package expired",
    EffectivePtStatus.PT_COMPLETED: "PT package completed",
    EffectivePtStatus.NO_PT: "No PT package",
}


__all__ = [
    "EffectivePtStatus",
    "EFFECTIVE_PT_STATUS_LABELS",
    "effective_membership_status",
    "effective_pt_status",
]

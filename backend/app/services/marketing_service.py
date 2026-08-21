"""Acquisition: where members came from, and what happened next.

Everything here is counted from rows GymFlow recorded — a member's source
column, their journey and their PT package. Nothing is modelled, smoothed or
estimated: if a source has no members, it reports zero rather than a plausible
number.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date

from fastapi import HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.db.models import (
    Campaign,
    Journey,
    JourneyStatus,
    MarketingSource,
    Member,
    PTPackage,
    Referral,
)

#: The funnel bucket for a member with no recorded acquisition source.
UNRECORDED_SOURCE_KEY = "unrecorded"

#: The sources SLAM asks about at registration. Seeded into the table, and
#: editable from settings — the app never hardcodes this list.
DEFAULT_SOURCES: list[tuple[str, str, bool]] = [
    ("instagram", "Instagram", False),
    ("facebook", "Facebook", False),
    ("google", "Google", False),
    ("banner", "Banner", False),
    ("referral", "Referral", True),
    ("walk_in", "Walk-in", False),
    ("website", "Website", False),
    ("whatsapp", "WhatsApp", False),
    ("other", "Other", False),
]


class MarketingError(HTTPException):
    def __init__(self, detail: str, code: str, status_code: int = status.HTTP_400_BAD_REQUEST):
        super().__init__(status_code=status_code, detail={"code": code, "message": detail})


def ensure_sources(db: Session) -> list[MarketingSource]:
    """Make sure the standard source list exists. Idempotent."""
    existing = {s.key: s for s in db.scalars(select(MarketingSource)).all()}
    for index, (key, label, requires_referrer) in enumerate(DEFAULT_SOURCES):
        if key in existing:
            continue
        source = MarketingSource(
            key=key,
            label=label,
            requires_referrer=requires_referrer,
            sort_order=index,
            is_active=True,
        )
        db.add(source)
        existing[key] = source
    db.flush()
    return sorted(existing.values(), key=lambda s: s.sort_order)


def list_sources(db: Session, include_inactive: bool = False) -> list[MarketingSource]:
    stmt = select(MarketingSource).order_by(MarketingSource.sort_order, MarketingSource.label)
    if not include_inactive:
        stmt = stmt.where(MarketingSource.is_active.is_(True))
    return list(db.scalars(stmt).all())


def record_acquisition(
    db: Session,
    *,
    member: Member,
    source_id: int | None,
    campaign_id: int | None = None,
    referrer_member_id: int | None = None,
    registered_on: date | None = None,
    note: str | None = None,
) -> Member:
    """Attach acquisition detail to a member.

    A referral source without a referring member is rejected rather than
    silently stored — an unattributed referral is the one thing this feature
    exists to prevent.
    """
    source = db.get(MarketingSource, source_id) if source_id else None
    if source_id is not None and source is None:
        raise MarketingError("Unknown marketing source.", "unknown_source")

    if source is not None and source.requires_referrer and referrer_member_id is None:
        raise MarketingError(
            "Tell us who referred this member.", "referrer_required", status.HTTP_400_BAD_REQUEST
        )

    if campaign_id is not None and db.get(Campaign, campaign_id) is None:
        raise MarketingError("Unknown campaign.", "unknown_campaign")

    member.marketing_source_id = source.id if source else None
    member.campaign_id = campaign_id
    member.registered_on = registered_on or member.joined_on
    db.flush()

    if referrer_member_id is not None:
        link_referral(db, referrer_member_id=referrer_member_id, referred_member=member, note=note)
    return member


def link_referral(
    db: Session, *, referrer_member_id: int, referred_member: Member, note: str | None = None
) -> Referral:
    referrer = db.get(Member, referrer_member_id)
    if referrer is None:
        raise MarketingError("Unknown referring member.", "unknown_referrer")
    if referrer.id == referred_member.id:
        raise MarketingError("A member cannot refer themselves.", "self_referral")

    existing = db.scalar(select(Referral).where(Referral.referred_member_id == referred_member.id))
    if existing is not None:
        existing.referrer_member_id = referrer.id
        existing.note = note or existing.note
        db.flush()
        return existing

    referral = Referral(
        referrer_member_id=referrer.id,
        referred_member_id=referred_member.id,
        branch_id=referred_member.branch_id,
        note=note,
        is_demo=referred_member.is_demo,
    )
    db.add(referral)
    db.flush()
    return referral


# ---------------------------------------------------------------- reporting


@dataclass
class SourceFunnel:
    source_key: str
    source_label: str
    joined: int = 0
    reached_day_45: int = 0
    pt_conversions: int = 0
    referrals: int = 0
    campaigns: list[str] = field(default_factory=list)

    @property
    def day45_pct(self) -> float:
        return round(self.reached_day_45 * 100 / self.joined, 1) if self.joined else 0.0

    @property
    def pt_conversion_pct(self) -> float:
        return round(self.pt_conversions * 100 / self.joined, 1) if self.joined else 0.0


def funnel(
    db: Session,
    branch_ids: list[int] | None,
    *,
    start: date | None = None,
    end: date | None = None,
) -> list[SourceFunnel]:
    """SOURCE → MEMBERS → DAY 45 → PT CONVERSION, counted from real rows."""
    member_stmt = select(Member)
    if branch_ids is not None:
        member_stmt = member_stmt.where(Member.branch_id.in_(branch_ids))
    if start is not None:
        member_stmt = member_stmt.where(
            func.coalesce(Member.registered_on, Member.joined_on) >= start
        )
    if end is not None:
        member_stmt = member_stmt.where(
            func.coalesce(Member.registered_on, Member.joined_on) <= end
        )
    members = list(db.scalars(member_stmt).all())
    member_ids = [m.id for m in members]

    sources = {s.id: s for s in db.scalars(select(MarketingSource)).all()}
    buckets: dict[str, SourceFunnel] = {}

    def bucket_for(member: Member) -> SourceFunnel:
        source = sources.get(member.marketing_source_id) if member.marketing_source_id else None
        key = source.key if source else UNRECORDED_SOURCE_KEY
        label = source.label if source else "Not recorded"
        return buckets.setdefault(key, SourceFunnel(source_key=key, source_label=label))

    completed_journey_members: set[int] = set()
    if member_ids:
        completed_journey_members = set(
            db.scalars(
                select(Journey.member_id).where(
                    Journey.member_id.in_(member_ids),
                    Journey.status == JourneyStatus.COMPLETED,
                )
            ).all()
        )
    pt_members: set[int] = set()
    if member_ids:
        pt_members = set(
            db.scalars(select(PTPackage.member_id).where(PTPackage.member_id.in_(member_ids))).all()
        )
    referred_members: set[int] = set()
    if member_ids:
        referred_members = set(
            db.scalars(
                select(Referral.referred_member_id).where(
                    Referral.referred_member_id.in_(member_ids)
                )
            ).all()
        )

    campaigns = {c.id: c.name for c in db.scalars(select(Campaign)).all()}

    for member in members:
        entry = bucket_for(member)
        entry.joined += 1
        if member.id in completed_journey_members:
            entry.reached_day_45 += 1
        if member.id in pt_members:
            entry.pt_conversions += 1
        if member.id in referred_members:
            entry.referrals += 1
        name = campaigns.get(member.campaign_id) if member.campaign_id else None
        if name and name not in entry.campaigns:
            entry.campaigns.append(name)

    return sorted(buckets.values(), key=lambda b: (-b.joined, b.source_label))


def campaign_performance(
    db: Session,
    branch_ids: list[int] | None,
    *,
    start: date | None = None,
    end: date | None = None,
) -> list[dict]:
    stmt = select(Campaign).order_by(Campaign.starts_on.desc().nullslast(), Campaign.name)
    if branch_ids is not None:
        stmt = stmt.where(Campaign.branch_id.in_(branch_ids) | Campaign.branch_id.is_(None))
    out: list[dict] = []
    for campaign in db.scalars(stmt).all():
        member_stmt = select(Member.id).where(Member.campaign_id == campaign.id)
        if branch_ids is not None:
            member_stmt = member_stmt.where(Member.branch_id.in_(branch_ids))
        if start is not None:
            member_stmt = member_stmt.where(
                func.coalesce(Member.registered_on, Member.joined_on) >= start
            )
        if end is not None:
            member_stmt = member_stmt.where(
                func.coalesce(Member.registered_on, Member.joined_on) <= end
            )
        member_ids = list(db.scalars(member_stmt).all())

        pt = 0
        day45 = 0
        if member_ids:
            pt = int(
                db.scalar(
                    select(func.count(func.distinct(PTPackage.member_id))).where(
                        PTPackage.member_id.in_(member_ids)
                    )
                )
                or 0
            )
            day45 = int(
                db.scalar(
                    select(func.count(func.distinct(Journey.member_id))).where(
                        Journey.member_id.in_(member_ids),
                        Journey.status == JourneyStatus.COMPLETED,
                    )
                )
                or 0
            )
        out.append(
            {
                "campaign_id": campaign.id,
                "name": campaign.name,
                "code": campaign.code,
                "branch_id": campaign.branch_id,
                "starts_on": campaign.starts_on,
                "ends_on": campaign.ends_on,
                "is_active": campaign.is_active,
                "members": len(member_ids),
                "reached_day_45": day45,
                "pt_conversions": pt,
            }
        )
    return out


def referral_leaderboard(db: Session, branch_ids: list[int] | None, limit: int = 10) -> list[dict]:
    stmt = (
        select(Referral.referrer_member_id, func.count().label("n"))
        .group_by(Referral.referrer_member_id)
        .order_by(func.count().desc())
        .limit(limit)
    )
    if branch_ids is not None:
        stmt = stmt.where(Referral.branch_id.in_(branch_ids))

    out = []
    for member_id, count in db.execute(stmt).all():
        member = db.get(Member, member_id)
        out.append(
            {
                "member_id": member_id,
                "member_name": member.user.full_name if member and member.user else "Member",
                "branch_id": member.branch_id if member else None,
                "referrals": int(count),
            }
        )
    return out


__all__ = [
    "DEFAULT_SOURCES",
    "MarketingError",
    "SourceFunnel",
    "campaign_performance",
    "ensure_sources",
    "funnel",
    "link_referral",
    "list_sources",
    "record_acquisition",
    "referral_leaderboard",
]

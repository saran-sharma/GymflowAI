"""Acquisition sources, campaigns, referrals and the owner's marketing view.

Every number here is a count of rows GymFlow recorded. Where a branch has no
data the response says so with ``has_data: false`` rather than filling the
screen with a plausible-looking zero-shaped story.
"""

from __future__ import annotations

from datetime import date, timedelta

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy import func, select
from sqlalchemy.orm import Session, joinedload

from app.core.clock import branch_today
from app.core.deps import (
    assert_branch_access,
    get_current_user,
    require_admin,
    require_management,
    scoped_branch_filter,
)
from app.db.models import Campaign, MarketingSource, Member, Referral, User
from app.db.session import get_db
from app.schemas.common import MessageOut
from app.schemas.operations import (
    AcquisitionRequest,
    CampaignCreate,
    CampaignOut,
    MarketingDashboardOut,
    MarketingSourceOut,
    ReferralOut,
    SourceFunnelOut,
)
from app.schemas.training import TrainerClientOut
from app.services import audit, marketing_service

from .trainers import client_out

router = APIRouter(prefix="/marketing", tags=["marketing"])

#: How far back the acquisition report looks when no range is given.
DEFAULT_WINDOW_DAYS = 90


@router.get("/sources", response_model=list[MarketingSourceOut])
def list_sources(
    include_inactive: bool = Query(default=False),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> list[MarketingSource]:
    """The "how did you hear about SLAM?" options. Configurable, not hardcoded."""
    sources = marketing_service.list_sources(db, include_inactive=include_inactive)
    if not sources:
        sources = marketing_service.ensure_sources(db)
    return sources


@router.post("/members/{member_id}/acquisition", response_model=MessageOut)
def record_acquisition(
    member_id: int,
    payload: AcquisitionRequest,
    request: Request,
    db: Session = Depends(get_db),
    user: User = Depends(require_management),
) -> MessageOut:
    """Record how SLAM acquired this member.

    Captured at registration in the normal flow; this endpoint also lets a
    manager fill in a member whose source was never recorded, which is the
    only way the funnel stops showing "Not recorded".
    """
    member = db.get(Member, member_id)
    if member is None:
        raise HTTPException(status_code=404, detail="Member not found")
    assert_branch_access(user, member.branch_id)

    marketing_service.record_acquisition(
        db,
        member=member,
        source_id=payload.source_id,
        campaign_id=payload.campaign_id,
        referrer_member_id=payload.referrer_member_id,
        registered_on=payload.registered_on,
        note=payload.note,
    )
    audit.record(
        db,
        action="marketing.source_change",
        actor=user,
        entity_type="member",
        entity_id=member.id,
        branch_id=member.branch_id,
        request=request,
        details={
            "source_id": payload.source_id,
            "campaign_id": payload.campaign_id,
            "referrer_member_id": payload.referrer_member_id,
        },
    )
    return MessageOut(message="Acquisition recorded.")


@router.get("/campaigns", response_model=list[CampaignOut])
def list_campaigns(
    branch_id: int | None = Query(default=None),
    db: Session = Depends(get_db),
    user: User = Depends(require_management),
) -> list[Campaign]:
    allowed = scoped_branch_filter(user, branch_id)
    stmt = select(Campaign).order_by(Campaign.starts_on.desc().nullslast(), Campaign.name)
    if allowed is not None:
        stmt = stmt.where(Campaign.branch_id.in_(allowed) | Campaign.branch_id.is_(None))
    return list(db.scalars(stmt).all())


@router.post("/campaigns", response_model=CampaignOut, status_code=201)
def create_campaign(
    payload: CampaignCreate,
    request: Request,
    db: Session = Depends(get_db),
    user: User = Depends(require_management),
) -> Campaign:
    if payload.branch_id is not None:
        assert_branch_access(user, payload.branch_id)
    if db.scalar(select(Campaign).where(Campaign.code == payload.code)) is not None:
        raise HTTPException(status_code=409, detail="A campaign with that code already exists")

    campaign = Campaign(
        branch_id=payload.branch_id,
        name=payload.name,
        code=payload.code,
        description=payload.description,
        starts_on=payload.starts_on,
        ends_on=payload.ends_on,
        is_active=True,
    )
    db.add(campaign)
    db.flush()
    audit.record(
        db,
        action="marketing.campaign_create",
        actor=user,
        entity_type="campaign",
        entity_id=campaign.id,
        branch_id=payload.branch_id,
        request=request,
        details={"code": campaign.code, "name": campaign.name},
    )
    return campaign


@router.get("/dashboard", response_model=MarketingDashboardOut)
def dashboard(
    branch_id: int | None = Query(default=None),
    start: date | None = Query(default=None),
    end: date | None = Query(default=None),
    db: Session = Depends(get_db),
    user: User = Depends(require_management),
) -> MarketingDashboardOut:
    """SOURCE → MEMBERS → DAY 45 → PT CONVERSION.

    Defaults to a rolling 90 days rather than the calendar month: a member who
    joined on Instagram in June and converted to PT in August belongs to the
    same story, and a month-to-date window would cut it in half.
    """
    allowed = scoped_branch_filter(user, branch_id)
    today = branch_today(None)
    period_start = start or (today - timedelta(days=DEFAULT_WINDOW_DAYS))
    period_end = end or today

    funnels = marketing_service.funnel(db, allowed, start=period_start, end=period_end)
    campaigns = marketing_service.campaign_performance(
        db, allowed, start=period_start, end=period_end
    )
    referrals = marketing_service.referral_leaderboard(db, allowed)

    referral_stmt = select(func.count()).select_from(Referral)
    if allowed is not None:
        referral_stmt = referral_stmt.where(Referral.branch_id.in_(allowed))
    total_referrals = int(db.scalar(referral_stmt) or 0)

    new_members = sum(f.joined for f in funnels)
    return MarketingDashboardOut(
        period_start=period_start,
        period_end=period_end,
        new_members=new_members,
        sources=[
            SourceFunnelOut(
                source_key=f.source_key,
                source_label=f.source_label,
                joined=f.joined,
                reached_day_45=f.reached_day_45,
                pt_conversions=f.pt_conversions,
                referrals=f.referrals,
                day45_pct=f.day45_pct,
                pt_conversion_pct=f.pt_conversion_pct,
                campaigns=f.campaigns,
            )
            for f in funnels
        ],
        campaigns=campaigns,
        referrals=referrals,
        total_referrals=total_referrals,
        has_data=new_members > 0,
    )


@router.get("/sources/{source_key}/members", response_model=list[TrainerClientOut])
def source_members(
    source_key: str,
    branch_id: int | None = Query(default=None),
    start: date | None = Query(default=None),
    end: date | None = Query(default=None),
    db: Session = Depends(get_db),
    user: User = Depends(require_management),
) -> list[TrainerClientOut]:
    """Who a source actually brought in — the drill-down under one funnel row.

    ``source_key`` matches what the dashboard funnel already hands back, so
    tapping a source needs no extra lookup. The date window and branch scope
    mirror :func:`marketing_service.funnel` — the same window, the same rows.
    """
    allowed = scoped_branch_filter(user, branch_id)

    stmt = select(Member).options(joinedload(Member.user), joinedload(Member.branch))
    if source_key == marketing_service.UNRECORDED_SOURCE_KEY:
        stmt = stmt.where(Member.marketing_source_id.is_(None))
    else:
        source = db.scalar(select(MarketingSource).where(MarketingSource.key == source_key))
        if source is None:
            raise HTTPException(status_code=404, detail="Marketing source not found")
        stmt = stmt.where(Member.marketing_source_id == source.id)

    if allowed is not None:
        stmt = stmt.where(Member.branch_id.in_(allowed))
    if start is not None:
        stmt = stmt.where(func.coalesce(Member.registered_on, Member.joined_on) >= start)
    if end is not None:
        stmt = stmt.where(func.coalesce(Member.registered_on, Member.joined_on) <= end)
    stmt = stmt.order_by(func.coalesce(Member.registered_on, Member.joined_on).desc())

    members = db.scalars(stmt).all()
    return [client_out(db, member) for member in members]


@router.get("/referrals", response_model=list[ReferralOut])
def list_referrals(
    branch_id: int | None = Query(default=None),
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
    user: User = Depends(require_management),
) -> list[ReferralOut]:
    allowed = scoped_branch_filter(user, branch_id)
    stmt = select(Referral).order_by(Referral.created_at.desc()).offset(offset).limit(limit)
    if allowed is not None:
        stmt = stmt.where(Referral.branch_id.in_(allowed))

    out = []
    for row in db.scalars(stmt).all():
        referrer = db.get(Member, row.referrer_member_id)
        referred = db.get(Member, row.referred_member_id)
        out.append(
            ReferralOut(
                id=row.id,
                referrer_member_id=row.referrer_member_id,
                referrer_name=(referrer.user.full_name if referrer and referrer.user else "Member"),
                referred_member_id=row.referred_member_id,
                referred_name=(referred.user.full_name if referred and referred.user else "Member"),
                branch_id=row.branch_id,
                created_at=row.created_at,
            )
        )
    return out


@router.patch("/sources/{source_id}", response_model=MarketingSourceOut)
def update_source(
    source_id: int,
    request: Request,
    label: str | None = Query(default=None, max_length=80),
    is_active: bool | None = Query(default=None),
    sort_order: int | None = Query(default=None, ge=0, le=999),
    db: Session = Depends(get_db),
    user: User = Depends(require_admin),
) -> MarketingSource:
    source = db.get(MarketingSource, source_id)
    if source is None:
        raise HTTPException(status_code=404, detail="Source not found")
    if label is not None:
        source.label = label
    if is_active is not None:
        source.is_active = is_active
    if sort_order is not None:
        source.sort_order = sort_order
    db.flush()
    audit.record(
        db,
        action="marketing.source_change",
        actor=user,
        entity_type="marketing_source",
        entity_id=source.id,
        request=request,
        details={"key": source.key, "label": source.label, "is_active": source.is_active},
    )
    return source


__all__ = ["DEFAULT_WINDOW_DAYS", "router"]

"""Admin surface for the Yoactiv Data API connector.

Ordinary staff API — bearer token, OWNER / SUPER_ADMIN only. Nothing here
returns the API key or the Basic-auth credential; the mobile app never calls
these routes. The connector itself lives in ``app/integrations/yoactiv/`` and
is off unless ``YOACTIV_ENABLED=true`` with a base URL, key and default
branch configured.

Routes:

* ``GET  /admin/yoactiv/status``        — config flags + every sync cursor + dead-letter count
* ``POST /admin/yoactiv/sync``          — run one endpoint for one window (``dry_run`` defaults true)
* ``POST /admin/yoactiv/reconcile``     — wide fixed-window re-pull of every endpoint
* ``GET  /admin/yoactiv/dead-letters``  — unresolved rows the connector could not apply
"""

from __future__ import annotations

from datetime import date
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.deps import require_admin
from app.db.models import Branch, User, YoactivDeadLetter, YoactivSyncCursor
from app.db.session import get_db
from app.integrations.yoactiv.client import YoactivClient
from app.integrations.yoactiv.sync import (
    SYNC_ENDPOINTS,
    run_endpoint_sync,
    run_reconciliation,
)

router = APIRouter(prefix="/admin/yoactiv", tags=["admin"], dependencies=[Depends(require_admin)])


class SyncRequest(BaseModel):
    endpoint: str = Field(description=f"one of: {', '.join(SYNC_ENDPOINTS)}")
    from_date: date | None = None
    to_date: date | None = None
    dry_run: bool = True


def _require_configured() -> tuple[str, str]:
    if not settings.yoactiv_enabled:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Yoactiv connector is disabled (YOACTIV_ENABLED=false).",
        )
    if not settings.yoactiv_base_url or not settings.yoactiv_api_key:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Yoactiv connector needs YOACTIV_BASE_URL and YOACTIV_API_KEY.",
        )
    if settings.yoactiv_default_branch_id is None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Yoactiv connector needs YOACTIV_DEFAULT_BRANCH_ID.",
        )
    return settings.yoactiv_base_url, settings.yoactiv_api_key


def _build_client() -> YoactivClient:
    base_url, api_key = _require_configured()
    basic = None
    if settings.yoactiv_basic_auth_user:
        basic = (settings.yoactiv_basic_auth_user, settings.yoactiv_basic_auth_password)
    return YoactivClient(
        base_url,
        api_key,
        basic_auth=basic,
        rate_limit_per_min=settings.yoactiv_rate_limit_per_min,
        timeout=float(settings.yoactiv_request_timeout_seconds),
    )


def _resolve_branch(db: Session) -> Branch:
    branch = db.get(Branch, settings.yoactiv_default_branch_id)
    if branch is None or not branch.is_active:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"YOACTIV_DEFAULT_BRANCH_ID={settings.yoactiv_default_branch_id} is not an active branch.",
        )
    return branch


@router.get("/status")
def yoactiv_status(db: Session = Depends(get_db)) -> dict[str, Any]:
    cursors = db.scalars(select(YoactivSyncCursor)).all()
    dead = db.scalar(
        select(func.count())
        .select_from(YoactivDeadLetter)
        .where(YoactivDeadLetter.resolved_at.is_(None))
    )
    return {
        "enabled": settings.yoactiv_enabled,
        "base_url_configured": bool(settings.yoactiv_base_url),
        "base_url_is_https": settings.yoactiv_base_url.startswith("https://"),
        "api_key_configured": bool(settings.yoactiv_api_key),
        "basic_auth_configured": bool(settings.yoactiv_basic_auth_user),
        "default_branch_id": settings.yoactiv_default_branch_id,
        "sync_endpoints": list(SYNC_ENDPOINTS),
        "window_days": settings.yoactiv_sync_window_days,
        "overlap_days": settings.yoactiv_sync_overlap_days,
        "unresolved_dead_letters": int(dead or 0),
        "cursors": [
            {
                "endpoint": c.endpoint,
                "branch_id": c.branch_id,
                "window_end": c.window_end.isoformat() if c.window_end else None,
                "status": c.status,
                "consecutive_failures": c.consecutive_failures,
                "last_run_at": c.last_run_at.isoformat() if c.last_run_at else None,
                "last_success_at": c.last_success_at.isoformat() if c.last_success_at else None,
                "last_error": c.last_error,
                "rows_seen": c.rows_seen,
                "rows_written": c.rows_written,
            }
            for c in cursors
        ],
    }


@router.post("/sync")
def yoactiv_sync(
    body: SyncRequest,
    _admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    if body.endpoint not in SYNC_ENDPOINTS:
        raise HTTPException(
            status_code=422, detail=f"endpoint must be one of: {', '.join(SYNC_ENDPOINTS)}"
        )
    client = _build_client()
    branch = _resolve_branch(db)
    outcome = run_endpoint_sync(
        db,
        client,
        endpoint=body.endpoint,
        branch=branch,
        from_date=body.from_date,
        to_date=body.to_date,
        dry_run=body.dry_run,
    )
    return outcome.as_dict()


@router.post("/reconcile")
def yoactiv_reconcile(
    _admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    client = _build_client()
    branch = _resolve_branch(db)
    outcomes = run_reconciliation(db, client, branch=branch)
    return {"branch_id": branch.id, "outcomes": [o.as_dict() for o in outcomes]}


@router.get("/dead-letters")
def yoactiv_dead_letters(
    resolved: bool = False,
    limit: int = 200,
    db: Session = Depends(get_db),
) -> list[dict[str, Any]]:
    q = (
        select(YoactivDeadLetter)
        .order_by(YoactivDeadLetter.last_seen_at.desc())
        .limit(min(limit, 500))
    )
    if resolved:
        q = q.where(YoactivDeadLetter.resolved_at.isnot(None))
    else:
        q = q.where(YoactivDeadLetter.resolved_at.is_(None))
    return [
        {
            "id": d.id,
            "endpoint": d.endpoint,
            "branch_id": d.branch_id,
            "external_key": d.external_key,
            "reason": d.reason,
            "occurrences": d.occurrences,
            "first_seen_at": d.first_seen_at.isoformat(),
            "last_seen_at": d.last_seen_at.isoformat(),
            "payload": d.payload,
        }
        for d in db.scalars(q).all()
    ]


__all__ = ["router"]

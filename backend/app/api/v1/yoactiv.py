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

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.deps import require_admin
from app.db.models import Branch, User, YoactivDeadLetter, YoactivSyncCursor
from app.db.session import get_db
from app.integrations.yoactiv import exports as export_bridge
from app.integrations.yoactiv.client import YoactivClient
from app.integrations.yoactiv.sync import (
    SYNC_ENDPOINTS,
    run_endpoint_sync,
    run_reconciliation,
)
from app.services import audit

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


# ------------------------------------------------- export-file bridge (temporary)
#
# While the Data API is blocked on credentials, the same operational facts are
# imported from the two Yoactiv console exports. Two steps on purpose:
# `preview` writes nothing and is what an operator reads; `import` repeats the
# upload and commits. The file is never staged server-side, so real member PII
# is never at rest in GymFlow outside the rows it legitimately becomes.

#: Refuse anything larger rather than reading an arbitrary upload into memory.
MAX_EXPORT_BYTES = 15 * 1024 * 1024

ACTION_EXPORT_IMPORT = "yoactiv.export_import"


def _mask(phone: str) -> str:
    return f"******{phone[-4:]}" if len(phone) >= 4 else "******"


async def _read_export(file: UploadFile) -> bytes:
    raw = await file.read()
    if not raw:
        raise HTTPException(status_code=422, detail="The uploaded file is empty.")
    if len(raw) > MAX_EXPORT_BYTES:
        raise HTTPException(
            status_code=413,
            detail=f"Export is larger than {MAX_EXPORT_BYTES // (1024 * 1024)} MB.",
        )
    return raw


def _require_branch(db: Session, branch_id: int) -> Branch:
    branch = db.get(Branch, branch_id)
    if branch is None or not branch.is_active:
        raise HTTPException(
            status_code=422, detail=f"branch_id {branch_id} is not an active branch."
        )
    return branch


def _parse_or_422(filename: str, raw: bytes):
    try:
        return export_bridge.parse_upload(filename or "export.xlsx", raw)
    except export_bridge.HeaderValidationError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from None


def _problem_rows(rows, limit: int = 100) -> list[dict[str, Any]]:
    """Rows a human must act on. Mobile numbers are masked — this response is
    read in a browser and may be pasted into a ticket."""
    out: list[dict[str, Any]] = []
    for row in rows:
        if row.classification in (
            export_bridge.Classification.MATCHED,
            export_bridge.Classification.DUPLICATE,
        ):
            continue
        record = row.membership or row.checkin
        out.append(
            {
                "row": row.row_number,
                "classification": row.classification.value,
                "detail": row.detail,
                "yoactiv_member_id": record.yoactiv_member_id if record else None,
                "name": (record.name[:40] if record else None),
                "mobile": _mask(record.mobile) if record and record.mobile else None,
            }
        )
        if len(out) >= limit:
            break
    return out


@router.post("/exports/preview")
async def preview_export(
    file: UploadFile = File(...),
    branch_id: int = Form(...),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    """Parse and classify a Yoactiv export. **Writes nothing.**

    Returns what an import would do: the report kind detected, row counts by
    classification, and the rows that need a human. Run this first, always.
    """
    raw = await _read_export(file)
    branch = _require_branch(db, branch_id)
    parsed = _parse_or_422(file.filename or "", raw)
    rows = export_bridge.classify(db, parsed)
    plans, conflicts = export_bridge.plan_accounts(db, rows)
    return {
        "file": file.filename,
        "report": parsed.kind.value,
        "branch": {"id": branch.id, "name": branch.name},
        "columns_detected": parsed.header,
        "counts": export_bridge.summarize(rows),
        "would_create_accounts": len(plans),
        "account_conflicts": [
            {"yoactiv_member_id": c.yoactiv_member_id, "reason": c.reason, "detail": c.detail}
            for c in conflicts[:50]
        ],
        "problems": _problem_rows(rows),
        "committed": False,
    }


@router.post("/exports/import")
async def import_export(
    file: UploadFile = File(...),
    branch_id: int = Form(...),
    confirm: bool = Form(False),
    db: Session = Depends(get_db),
    actor: User = Depends(require_admin),
) -> dict[str, Any]:
    """Commit a Yoactiv export's MATCHED rows.

    Idempotent: membership terms upsert on ``(plan_name, starts_on)`` and
    check-ins are guarded by both their own key and a natural-key check, so
    re-uploading the same file writes nothing new. Never creates member
    accounts — that is the CLI's ``--create-missing-members``, which requires
    an operator-supplied temporary password from the environment.
    """
    if not confirm:
        raise HTTPException(
            status_code=422,
            detail="Set confirm=true to write. Use /exports/preview first.",
        )
    raw = await _read_export(file)
    branch = _require_branch(db, branch_id)
    parsed = _parse_or_422(file.filename or "", raw)
    rows = export_bridge.classify(db, parsed)

    if parsed.kind is export_bridge.ExportKind.MEMBERSHIP:
        result = export_bridge.import_memberships(db, rows)
    else:
        result = export_bridge.import_checkins(db, rows, branch=branch)

    audit.record(
        db,
        action=ACTION_EXPORT_IMPORT,
        actor_user_id=actor.id,
        actor_role=actor.role.key,
        entity_type="yoactiv_export",
        entity_id=parsed.kind.value,
        branch_id=branch.id,
        details={
            "file": file.filename,
            "report": parsed.kind.value,
            "counts": result.counts,
            "written": result.written,
            "source": export_bridge.SOURCE,
        },
    )
    db.commit()
    return {
        "file": file.filename,
        "report": parsed.kind.value,
        "branch": {"id": branch.id, "name": branch.name},
        "counts": result.counts,
        "written": result.written,
        "problems": _problem_rows(rows),
        "committed": True,
    }


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

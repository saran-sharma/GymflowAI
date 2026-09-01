"""InBody automatic ingestion receiver.

LookinBody120's own "Export Data as CSV/Image Files" feature (Setup Menu)
writes one file per scan to a local folder on the gym PC — see the module
docstring in ``app/integrations/inbody/importer.py`` for what's confirmed vs.
unverified about that CSV's exact shape. This endpoint is the GymFlow side of
the intended production path:

    Gym PC (LookinBody120 auto-export)
        -> a small local agent watching that folder
        -> outbound HTTPS, this endpoint
        -> parse -> classify -> import
        -> body_compositions

Deliberately *not* the reverse: GymFlow never reaches into the gym PC's
filesystem, and the LookinBody folder is never exposed on any network the
gym PC listens on. The agent is the only thing that ever touches that
folder; this endpoint only ever receives a file it already decided to send.

Same trust model as the X2008 push receiver in ``hardware.py`` — a shared
secret GymFlow controls, embedded in the URL, because the caller (a script
on the gym PC) has no GymFlow account and cannot carry a bearer token.
"""

from __future__ import annotations

import hmac
import logging
import tempfile
from datetime import datetime, timedelta
from pathlib import Path

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile, status
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.clock import now_utc
from app.core.config import settings
from app.core.deps import require_management
from app.core.rate_limit import hardware_push_rate_limit
from app.db.models import Branch, Setting, User
from app.db.session import get_db
from app.integrations.inbody.importer import (
    HeaderValidationError,
    build_dry_run_rows,
    classify_rows,
    header_signature,
    import_matched,
    parse_csv_export,
    parse_workbook,
    summarize,
)
from app.services import audit

router = APIRouter(prefix="/inbody", tags=["inbody"])
logger = logging.getLogger("gymflow.inbody.ingest")

ACTION_INBODY_INGEST = "inbody.ingest"

# Per-branch operational snapshot the gym-PC agent POSTs on every heartbeat.
# Stored in the existing ``settings`` table (one row per branch, this key) so
# no schema change is needed — it is mutable operational state, exactly what
# that table is for.
AGENT_HEARTBEAT_SETTING_KEY = "inbody_agent_heartbeat"


def _authenticate(secret_token: str) -> None:
    if not settings.inbody_ingest_enabled:
        # 404, not 403 — same reasoning as the X2008 receiver: an unenabled
        # endpoint shouldn't confirm its own existence to an unauthenticated
        # caller.
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND)

    configured = settings.inbody_ingest_shared_secret
    if not configured or not hmac.compare_digest(secret_token, configured):
        logger.warning("inbody_ingest_auth_failed reason=bad_shared_secret")
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="unauthorized")


@router.post("/ingest/{secret_token}")
async def ingest_export(
    secret_token: str,
    branch_id: int = Query(...),
    dry_run: bool = Query(
        False,
        description="Classify and report only. Writes nothing, commits nothing. "
        "Used by the one-time historical back-fill before a reviewed real import.",
    ),
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    _rl: None = Depends(hardware_push_rate_limit),
) -> dict:
    """Receive one LookinBody120 export file — CSV (automatic) or XLSX
    (manual) — and run it through the same parse/classify/import pipeline
    either path already uses. Only MATCHED, non-duplicate rows are ever
    written; everything else (AMBIGUOUS/UNMATCHED/DUPLICATE/INVALID) is
    reported back, never silently dropped or silently guessed.

    ``dry_run=true`` stops after classification: it returns the same counts
    plus a PII-stripped per-row breakdown (member_code + Local ID + the
    branch-timezone-anchored measurement time — never the name or phone the
    CSV carries) and a column-layout fingerprint, and it neither writes a
    ``BodyComposition`` nor commits. Nothing about the filename is logged in
    this mode.
    """
    _authenticate(secret_token)

    branch = db.get(Branch, branch_id)
    if branch is None or not branch.is_active:
        raise HTTPException(status_code=404, detail="Branch not found")

    raw = await file.read()
    filename = file.filename or ""
    is_csv = filename.lower().endswith(".csv") or file.content_type in (
        "text/csv",
        "application/csv",
    )

    try:
        if is_csv:
            rows = parse_csv_export(raw)
        else:
            with tempfile.NamedTemporaryFile(suffix=".xlsx") as tmp:
                tmp.write(raw)
                tmp.flush()
                rows = parse_workbook(Path(tmp.name))
    except HeaderValidationError as exc:
        if not dry_run:
            logger.warning("inbody_ingest_rejected branch_id=%s reason=%s", branch_id, exc)
            audit.record(
                db,
                action=ACTION_INBODY_INGEST,
                actor_role="inbody-agent",
                entity_type="branch",
                entity_id=branch_id,
                branch_id=branch_id,
                details={"filename": filename, "result": "rejected", "reason": str(exc)},
            )
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:  # noqa: BLE001 - a malformed upload must 400, never 500
        if not dry_run:
            logger.warning("inbody_ingest_unreadable branch_id=%s filename=%s", branch_id, filename)
            audit.record(
                db,
                action=ACTION_INBODY_INGEST,
                actor_role="inbody-agent",
                entity_type="branch",
                entity_id=branch_id,
                branch_id=branch_id,
                details={"filename": filename, "result": "unreadable"},
            )
        raise HTTPException(
            status_code=400, detail="Could not read this file as a CSV or Excel export."
        ) from exc

    classified = classify_rows(db, rows)
    counts = summarize(classified)

    if dry_run:
        fingerprint, column_count = header_signature(rows)
        dry_rows = build_dry_run_rows(db, classified)
        # classify_rows is read-only, but make the no-write guarantee explicit.
        db.rollback()
        logger.info("inbody_dry_run branch_id=%s total_rows=%d %s", branch_id, len(rows), counts)
        return {
            "dry_run": True,
            "total_rows": len(rows),
            "counts": counts,
            "header_fingerprint": fingerprint,
            "column_count": column_count,
            "rows": [vars(r) for r in dry_rows],
        }
    # Only rows already resolved to *this* branch's members ever get written
    # here — `classify_rows` matches by phone against active members
    # regardless of branch, so a file uploaded against the wrong branch_id
    # mostly just produces UNMATCHED rows rather than cross-branch writes.
    result = import_matched(db, [row for row in classified if row.branch_id == branch_id])
    db.commit()

    logger.info(
        "inbody_ingest_complete branch_id=%s filename=%s written=%d %s",
        branch_id,
        filename,
        result.written,
        counts,
    )
    audit.record(
        db,
        action=ACTION_INBODY_INGEST,
        actor_role="inbody-agent",
        entity_type="branch",
        entity_id=branch_id,
        branch_id=branch_id,
        details={"filename": filename, "written": result.written, "counts": counts},
    )

    return {"written": result.written, "counts": counts}


# ------------------------------------------------------- gym-PC agent status
#
# The production agent (``app/scripts/inbody_agent.py``) runs unattended on the
# gym Windows PC. It POSTs a small heartbeat here every couple of minutes so a
# GymFlow owner/manager can see, without logging into that PC, whether the
# InBody link is alive and healthy. The heartbeat carries counts and
# timestamps only — never a filename (LookinBody names files after the
# member's phone), never the secret.


class AgentHeartbeatIn(BaseModel):
    branch_id: int
    agent_version: str = Field(max_length=32)
    pending_files: int = Field(ge=0)
    quarantined_files: int = Field(ge=0)
    failed_files: int = Field(ge=0)
    processed_total: int = Field(ge=0)
    last_successful_scan_at: datetime | None = None
    last_error: str | None = Field(default=None, max_length=500)


@router.post("/agent/heartbeat/{secret_token}")
async def agent_heartbeat(
    secret_token: str,
    payload: AgentHeartbeatIn,
    db: Session = Depends(get_db),
    _rl: None = Depends(hardware_push_rate_limit),
) -> dict:
    """Receive one heartbeat from the gym-PC agent and store it as this
    branch's current InBody-agent status. Same shared-secret trust model as
    ``/ingest`` — the caller has no GymFlow account."""
    _authenticate(secret_token)

    branch = db.get(Branch, payload.branch_id)
    if branch is None or not branch.is_active:
        raise HTTPException(status_code=404, detail="Branch not found")

    received = now_utc()
    record = {
        "agent_version": payload.agent_version[:32],
        "pending_files": payload.pending_files,
        "quarantined_files": payload.quarantined_files,
        "failed_files": payload.failed_files,
        "processed_total": payload.processed_total,
        "last_successful_scan_at": (
            payload.last_successful_scan_at.isoformat()
            if payload.last_successful_scan_at is not None
            else None
        ),
        "last_error": (payload.last_error or None) and payload.last_error[:500],
        "received_at": received.isoformat(),
    }
    row = db.scalar(
        select(Setting).where(
            Setting.key == AGENT_HEARTBEAT_SETTING_KEY,
            Setting.branch_id == payload.branch_id,
        )
    )
    if row is None:
        db.add(
            Setting(
                key=AGENT_HEARTBEAT_SETTING_KEY,
                branch_id=payload.branch_id,
                value={"value": record},
            )
        )
    else:
        row.value = {"value": record}
    db.commit()

    logger.info(
        "inbody_agent_heartbeat branch_id=%s version=%s pending=%s quarantined=%s failed=%s",
        payload.branch_id,
        record["agent_version"],
        payload.pending_files,
        payload.quarantined_files,
        payload.failed_files,
    )
    return {"ok": True, "received_at": received.isoformat()}


@router.get("/agent/status")
def agent_status(
    branch_id: int | None = Query(None),
    db: Session = Depends(get_db),
    actor: User = Depends(require_management),
) -> dict:
    """Current InBody-agent status per branch, for an owner/manager dashboard:
    connected, last successful scan, pending files, quarantined files, last
    error. A branch manager sees only their own branch."""
    scope_branch = actor.branch_id if actor.branch_id is not None else branch_id

    query = select(Setting).where(Setting.key == AGENT_HEARTBEAT_SETTING_KEY)
    if scope_branch is not None:
        query = query.where(Setting.branch_id == scope_branch)
    rows = db.scalars(query).all()

    offline_after = timedelta(seconds=settings.inbody_agent_offline_after_seconds)
    now = now_utc()
    agents = []
    for row in rows:
        rec = row.value.get("value", {}) if isinstance(row.value, dict) else {}
        received_raw = rec.get("received_at")
        received = None
        if received_raw:
            try:
                received = datetime.fromisoformat(received_raw)
            except ValueError:
                received = None
        branch = db.get(Branch, row.branch_id) if row.branch_id is not None else None
        agents.append(
            {
                "branch_id": row.branch_id,
                "branch_code": branch.code if branch else None,
                "connected": received is not None and (now - received) <= offline_after,
                "last_heartbeat_at": received_raw,
                "last_successful_scan_at": rec.get("last_successful_scan_at"),
                "pending_files": rec.get("pending_files"),
                "quarantined_files": rec.get("quarantined_files"),
                "failed_files": rec.get("failed_files"),
                "processed_total": rec.get("processed_total"),
                "last_error": rec.get("last_error"),
                "agent_version": rec.get("agent_version"),
            }
        )

    return {
        "ingest_enabled": settings.inbody_ingest_enabled,
        "offline_after_seconds": settings.inbody_agent_offline_after_seconds,
        "agents": sorted(agents, key=lambda a: (a["branch_id"] is None, a["branch_id"])),
    }


__all__ = ["router"]

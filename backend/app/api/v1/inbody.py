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
from pathlib import Path

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile, status
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.rate_limit import hardware_push_rate_limit
from app.db.models import Branch
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


__all__ = ["router"]

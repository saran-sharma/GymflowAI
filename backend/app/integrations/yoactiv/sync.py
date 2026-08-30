"""Yoactiv Data API connector — the sync orchestrator.

One public entry point, ``run_endpoint_sync``. It:

* computes an **overlapping incremental window** from the per-endpoint
  ``YoactivSyncCursor`` (``[window_end - overlap, today]``; a first run goes
  back ``sync_window_days``),
* pulls that window from the one confirmed operation via ``YoactivClient``,
* applies each row **idempotently** — a check-in maps onto
  ``attendance_events`` keyed by ``external_event_id``; an invoice drives the
  ``memberships`` / ``members.is_active`` lifecycle (``lifecycle.apply_invoice``),
* sends any row it cannot apply to ``yoactiv_dead_letters`` (kept, never
  dropped),
* advances the cursor **only on a clean run**, tracks ``consecutive_failures``
  and marks an endpoint ``stuck`` after 3 so it stops while the others keep
  going,
* writes one ``audit_logs`` row per run (the API key is never in it),
* supports ``dry_run`` (rolls everything back, reports what it would have
  done) and a fixed-window reconciliation pass that does not move the cursor.

Known Data API gaps, handled explicitly rather than papered over: no member
or staff master endpoint (so an unresolved ``Member_ID`` is a dead letter,
never a fabricated member); no membership-status endpoint (derived from
invoice service dates); no webhooks / no ``updatedSince`` (hence the window
overlap and the weekly reconciliation).
"""

from __future__ import annotations

import logging
from collections.abc import Callable
from dataclasses import asdict, dataclass, field
from datetime import date, timedelta
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.clock import branch_today, combine_branch, now_utc
from app.core.config import settings
from app.db.models import (
    AttendanceEvent,
    Branch,
    CaptureMethod,
    EventType,
    PersonType,
    YoactivDeadLetter,
    YoactivSyncCursor,
)
from app.integrations.yoactiv import identity, lifecycle
from app.integrations.yoactiv.client import YoactivAuthError, YoactivClient
from app.integrations.yoactiv.mapping import (
    parse_checkin,
    parse_enquiry,
    parse_followup,
    parse_invoice,
    parse_pt_trial,
)
from app.services import audit

logger = logging.getLogger("gymflow.yoactiv.sync")

ACTION_YOACTIV_SYNC = "yoactiv.sync"
STUCK_AFTER = 3

#: The five confirmed operations, each with how to build its query params for
#: a ``[from, to]`` window (Yoactiv dates are ``dd-MM-yyyy``) and which date
#: field the window is expressed against, for the audit trail.
_DMY = "%d-%m-%Y"


def _checkin_params(f: date, t: date) -> dict[str, str]:
    return {"fromdate": f.strftime(_DMY), "todate": t.strftime(_DMY), "filtersts": ""}


def _invoice_params(f: date, t: date) -> dict[str, str]:
    return {
        "fromdate": f.strftime(_DMY),
        "todate": t.strftime(_DMY),
        "activests": "",
        "ptservice": "",
    }


def _enquiry_params(f: date, t: date) -> dict[str, str]:
    return {"fromdate": f.strftime(_DMY), "todate": t.strftime(_DMY), "convertion": "0"}


def _plain_params(f: date, t: date) -> dict[str, str]:
    return {"fromdate": f.strftime(_DMY), "todate": t.strftime(_DMY)}


@dataclass
class _EndpointSpec:
    operation: str  # the exact Yoactiv operation name
    params: Callable[[date, date], dict[str, str]]
    apply: Callable[..., tuple[str, str]]


@dataclass
class SyncOutcome:
    endpoint: str
    window_from: date
    window_to: date
    dry_run: bool
    status: str  # "ok" | "error" | "stuck"
    rows_seen: int = 0
    written: int = 0
    skipped: int = 0
    dead_lettered: int = 0
    unresolved_members: int = 0
    error: str | None = None
    notes: list[str] = field(default_factory=list)

    def as_dict(self) -> dict[str, Any]:
        d = asdict(self)
        d["window_from"] = self.window_from.isoformat()
        d["window_to"] = self.window_to.isoformat()
        return d


# --------------------------------------------------------------- appliers
# Each returns (result, detail) where result is "written" | "skipped" | "dead".


def _apply_checkin(db: Session, *, row: dict, branch: Branch, seen: set[str]) -> tuple[str, str]:
    checkin = parse_checkin(row)
    match = identity.resolve_member(
        db,
        yoactiv_member_id=checkin.member_id,
        email=checkin.email or None,
        phone=checkin.mobile or None,
        name=checkin.name or None,
    )
    if match.member is None:
        raise _Unresolved(checkin.external_key, f"member: {match.detail}")

    member = match.member
    tz = branch.timezone
    wrote = False
    for suffix, clock_t, event_type in (
        ("in", checkin.clock_in, EventType.CHECK_IN),
        ("out", checkin.clock_out, EventType.CHECK_OUT),
    ):
        if clock_t is None:
            continue
        key = f"{checkin.external_key}:{suffix}"
        if key in seen or db.scalar(
            select(AttendanceEvent.id).where(AttendanceEvent.external_event_id == key)
        ):
            continue
        db.add(
            AttendanceEvent(
                branch_id=member.branch_id,
                person_type=PersonType.MEMBER,
                user_id=member.user_id,
                event_type=event_type,
                method=CaptureMethod.MANUAL,
                # Yoactiv is the operational source of truth for attendance,
                # so its timestamp is authoritative here — a deliberate,
                # documented exception to the "server clock only" rule that
                # governs GymFlow-originated events. See docs/INTEGRATIONS.md.
                occurred_at=combine_branch(checkin.attendance_date, clock_t, tz),
                work_date=checkin.attendance_date,
                device_info=f"yoactiv:{checkin.medium}"[:255] if checkin.medium else "yoactiv",
                notes=(
                    f"Yoactiv checkin (service {checkin.service_name or checkin.service_card_id}"
                    f"{', PT' if checkin.is_pt else ''})"
                )[:500],
                external_event_id=key,
            )
        )
        db.flush()
        seen.add(key)
        wrote = True
    return (
        ("written", f"matched {member.member_code} via {match.method}")
        if wrote
        else (
            "skipped",
            "already recorded",
        )
    )


def _apply_invoice(db: Session, *, row: dict, branch: Branch, seen: set[str]) -> tuple[str, str]:
    invoice = parse_invoice(row)
    match = identity.resolve_member(
        db,
        yoactiv_member_id=invoice.member_id,
        email=invoice.email or None,
        phone=invoice.mobile or None,
        name=invoice.name or None,
    )
    if match.member is None:
        raise _Unresolved(invoice.external_key, f"member: {match.detail}")

    change = lifecycle.apply_invoice(db, match.member, invoice)
    if not change.changed:
        return "skipped", f"{match.member.member_code}: membership already current"
    bits = []
    if change.memberships_created:
        bits.append(f"+{change.memberships_created} membership")
    if change.memberships_updated:
        bits.append(f"~{change.memberships_updated} membership")
    if change.member_active_before != change.member_active_after:
        bits.append(f"active {change.member_active_before}->{change.member_active_after}")
    return "written", f"{match.member.member_code}: {', '.join(bits)}"


def _apply_readonly_mirror(parse: Callable[[dict], Any]) -> Callable[..., tuple[str, str]]:
    """P1 secondary endpoints (enquiries / followups / PT trials).

    A dedicated mirror table for each is future work (see NEXT_STEPS.md). For
    now the connector *validates* the row shape end to end and records
    anything malformed as a dead letter, so turning the mirror on later is
    additive rather than a first encounter with real data.
    """

    def _apply(db: Session, *, row: dict, branch: Branch, seen: set[str]) -> tuple[str, str]:
        parsed = parse(row)  # raises -> dead letter
        return "skipped", f"validated {parsed.external_key} (mirror table not built yet)"

    return _apply


_SPECS: dict[str, _EndpointSpec] = {
    "checkins": _EndpointSpec("checkins", _checkin_params, _apply_checkin),
    "invoices": _EndpointSpec("invoices", _invoice_params, _apply_invoice),
    "enquiries": _EndpointSpec("enquires", _enquiry_params, _apply_readonly_mirror(parse_enquiry)),
    "followups": _EndpointSpec("followups", _plain_params, _apply_readonly_mirror(parse_followup)),
    "pt_trial_conversion": _EndpointSpec(
        "ptTrialConversion", _plain_params, _apply_readonly_mirror(parse_pt_trial)
    ),
}

SYNC_ENDPOINTS: tuple[str, ...] = tuple(_SPECS)


class _Unresolved(Exception):
    """A row that parsed fine but has no GymFlow home yet — a dead letter,
    not a crash."""

    def __init__(self, key: str, reason: str) -> None:
        super().__init__(reason)
        self.key = key
        self.reason = reason


# --------------------------------------------------------------- orchestration


def _get_cursor(db: Session, endpoint: str, branch_id: int) -> YoactivSyncCursor:
    cursor = db.scalar(
        select(YoactivSyncCursor).where(
            YoactivSyncCursor.endpoint == endpoint,
            YoactivSyncCursor.branch_id == branch_id,
        )
    )
    if cursor is None:
        cursor = YoactivSyncCursor(endpoint=endpoint, branch_id=branch_id, status="idle")
        db.add(cursor)
        db.flush()
    return cursor


def _dead_letter(
    db: Session, *, endpoint: str, branch_id: int, key: str, reason: str, payload: dict
) -> None:
    existing = db.scalar(
        select(YoactivDeadLetter).where(
            YoactivDeadLetter.endpoint == endpoint,
            YoactivDeadLetter.external_key == key,
        )
    )
    now = now_utc()
    if existing is None:
        db.add(
            YoactivDeadLetter(
                endpoint=endpoint,
                branch_id=branch_id,
                external_key=key,
                reason=reason[:200],
                payload=payload,
                first_seen_at=now,
                last_seen_at=now,
                occurrences=1,
            )
        )
    else:
        existing.reason = reason[:200]
        existing.payload = payload
        existing.last_seen_at = now
        existing.occurrences += 1
        existing.resolved_at = None
    db.flush()


def run_endpoint_sync(
    db: Session,
    client: YoactivClient,
    *,
    endpoint: str,
    branch: Branch,
    from_date: date | None = None,
    to_date: date | None = None,
    dry_run: bool = False,
    advance_cursor: bool = True,
) -> SyncOutcome:
    """Sync one endpoint for one branch. Commits on success (unless
    ``dry_run``); the caller does not need to.
    """
    if endpoint not in _SPECS:
        raise ValueError(f"unknown sync endpoint {endpoint!r} (known: {', '.join(_SPECS)})")
    spec = _SPECS[endpoint]
    cursor = _get_cursor(db, endpoint, branch.id)

    today = to_date or branch_today(branch.timezone)
    if from_date is not None:
        window_from = from_date
    elif cursor.window_end is not None:
        window_from = cursor.window_end - timedelta(days=settings.yoactiv_sync_overlap_days)
    else:
        window_from = today - timedelta(days=settings.yoactiv_sync_window_days)
    window_from = min(window_from, today)

    outcome = SyncOutcome(
        endpoint=endpoint,
        window_from=window_from,
        window_to=today,
        dry_run=dry_run,
        status="ok",
    )
    cursor.last_run_at = now_utc()

    try:
        rows = client.get_results(spec.operation, spec.params(window_from, today))
    except YoactivAuthError as exc:
        # Auth failure halts *everything* — do not advance, do not keep trying.
        cursor.status = "error"
        cursor.consecutive_failures += 1
        cursor.last_error = str(exc)[:500]
        outcome.status = "error"
        outcome.error = str(exc)
        _audit(db, outcome, branch.id)
        db.commit()
        raise
    except Exception as exc:  # noqa: BLE001 - transport/HTTP/response failure: record, don't crash the job
        cursor.consecutive_failures += 1
        cursor.status = "stuck" if cursor.consecutive_failures >= STUCK_AFTER else "error"
        cursor.last_error = f"{type(exc).__name__}: {exc}"[:500]
        outcome.status = cursor.status
        outcome.error = str(exc)
        _audit(db, outcome, branch.id)
        db.commit()
        return outcome

    outcome.rows_seen = len(rows)
    seen: set[str] = set()
    for row in rows:
        try:
            result, _detail = spec.apply(db, row=row, branch=branch, seen=seen)
            if result == "written":
                outcome.written += 1
            else:
                outcome.skipped += 1
        except _Unresolved as unresolved:
            outcome.dead_lettered += 1
            if unresolved.reason.startswith("member:"):
                outcome.unresolved_members += 1
            _dead_letter(
                db,
                endpoint=endpoint,
                branch_id=branch.id,
                key=unresolved.key,
                reason=unresolved.reason,
                payload=row,
            )
        except Exception as exc:  # noqa: BLE001 - one bad row must not sink the batch
            outcome.dead_lettered += 1
            _dead_letter(
                db,
                endpoint=endpoint,
                branch_id=branch.id,
                key=f"yoactiv:{endpoint}:malformed:{abs(hash(repr(row))) % (10**12)}",
                reason=f"{type(exc).__name__}: {exc}",
                payload=row,
            )

    cursor.rows_seen = outcome.rows_seen
    cursor.rows_written = outcome.written
    cursor.consecutive_failures = 0
    cursor.status = "ok"
    cursor.last_error = None
    cursor.last_success_at = now_utc()
    if advance_cursor and not dry_run:
        cursor.window_end = today

    _audit(db, outcome, branch.id)

    if dry_run:
        db.rollback()
    else:
        db.commit()
    logger.info(
        "yoactiv_sync endpoint=%s branch=%s window=%s..%s seen=%d written=%d dead=%d dry_run=%s",
        endpoint,
        branch.id,
        window_from,
        today,
        outcome.rows_seen,
        outcome.written,
        outcome.dead_lettered,
        dry_run,
    )
    return outcome


def run_reconciliation(db: Session, client: YoactivClient, *, branch: Branch) -> list[SyncOutcome]:
    """Wide, fixed-window re-pull of every endpoint. Idempotent; never moves a
    cursor backwards (``advance_cursor=False``)."""
    today = branch_today(branch.timezone)
    since = today - timedelta(days=settings.yoactiv_reconcile_days)
    outcomes = []
    for endpoint in SYNC_ENDPOINTS:
        outcomes.append(
            run_endpoint_sync(
                db,
                client,
                endpoint=endpoint,
                branch=branch,
                from_date=since,
                to_date=today,
                dry_run=False,
                advance_cursor=False,
            )
        )
    return outcomes


def _audit(db: Session, outcome: SyncOutcome, branch_id: int) -> None:
    audit.record(
        db,
        action=ACTION_YOACTIV_SYNC,
        actor_role="yoactiv-connector",
        entity_type="yoactiv_endpoint",
        entity_id=outcome.endpoint,
        branch_id=branch_id,
        details={
            "window": [outcome.window_from.isoformat(), outcome.window_to.isoformat()],
            "dry_run": outcome.dry_run,
            "status": outcome.status,
            "rows_seen": outcome.rows_seen,
            "written": outcome.written,
            "skipped": outcome.skipped,
            "dead_lettered": outcome.dead_lettered,
            "unresolved_members": outcome.unresolved_members,
            "error": outcome.error,
        },
    )


__all__ = [
    "ACTION_YOACTIV_SYNC",
    "SYNC_ENDPOINTS",
    "SyncOutcome",
    "run_endpoint_sync",
    "run_reconciliation",
]

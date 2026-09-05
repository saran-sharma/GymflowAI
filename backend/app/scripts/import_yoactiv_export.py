"""Import a Yoactiv **export file** (Membership Report / Member Check-ins).

    python -m app.scripts.import_yoactiv_export path/to/export.xlsx --branch-id 1 --dry-run
    python -m app.scripts.import_yoactiv_export path/to/export.xlsx --branch-id 1 --import --yes

A temporary bridge while the Yoactiv **Data API** connector is blocked on
credentials (``docs/INTEGRATIONS.md``). It does not replace that connector:
both write the same rows, through the same identity matching and the same
membership lifecycle, and a visit imported here will not be written twice
when the API sync later covers the same window.

Every row is classified into exactly one of MATCHED / AMBIGUOUS / UNMATCHED /
DUPLICATE / INVALID before anything is written. ``--dry-run`` prints that
classification and writes nothing — run it first, always, and read the
AMBIGUOUS and UNMATCHED sections before passing ``--import``.

    MATCHED    -> import          AMBIGUOUS -> review (human)
    DUPLICATE  -> ignore          UNMATCHED -> review (human)
    INVALID    -> quarantine (reported, never written)

Running the same file twice is safe. Membership terms upsert on
``(plan_name, starts_on)``; check-ins are guarded both by their own
``external_event_id`` and by a natural-key check on
``(member, date, event type, timestamp)``.

--------------------------------------------------------------------------
``--create-missing-members`` — opt-in, off by default
--------------------------------------------------------------------------

For every UNMATCHED row, creates a GymFlow member *record* — a ``User``
whose Login ID is the mobile number, plus a ``Member`` stamped with the
Yoactiv member id — so their history can attach. It does **not** create a
``Membership``: that only ever comes from importing the Membership Report,
so commercial state always traces to a Yoactiv billing row.

Guards, all required:

* ``--branch-id`` — which GymFlow branch these people belong to.
* ``YOACTIV_BOOTSTRAP_PASSWORD`` in the environment — the temporary password
  created accounts start on. There is **no default**; the script refuses to
  create accounts without it, it is never written to the database in
  plaintext, never logged, and never printed. Every created account has
  ``must_change_password`` set, so the member must replace it on first
  sign-in.
* A mobile number shared by two Yoactiv members, or one an existing GymFlow
  account already uses, is never auto-created — it is listed for a human.
"""

from __future__ import annotations

import argparse
import os
from pathlib import Path

from sqlalchemy import select

from app.core.clock import branch_today
from app.core.security import hash_password
from app.db.models import Branch, Role, RoleKey
from app.db.session import SessionLocal
from app.integrations.yoactiv.exports import (
    Classification,
    ExportKind,
    HeaderValidationError,
    classify,
    create_accounts,
    import_checkins,
    import_memberships,
    parse_upload,
    plan_accounts,
    summarize,
)
from app.services import audit

_BOOTSTRAP_PASSWORD_ENV = "YOACTIV_BOOTSTRAP_PASSWORD"
ACTION_EXPORT_IMPORT = "yoactiv.export_import"


def _mask_phone(phone: str) -> str:
    return f"******{phone[-4:]}" if len(phone) >= 4 else "******"


def _report(rows) -> str:
    """Row-level detail, grouped by classification. Mobile numbers masked."""
    lines: list[str] = []
    for classification in Classification:
        group = [r for r in rows if r.classification is classification]
        if not group:
            continue
        lines.append(f"\n{classification.value.upper()} ({len(group)})")
        for row in group[:50]:
            record = row.membership or row.checkin
            who = ""
            if record is not None:
                who = f"yoactiv#{record.yoactiv_member_id} {record.name[:28]} {_mask_phone(record.mobile)}"
            lines.append(f"  row {row.row_number:>6}  {who}  — {row.detail}")
        if len(group) > 50:
            lines.append(f"  … and {len(group) - 50} more")
    return "\n".join(lines)


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Import a Yoactiv Membership Report or Member Check-ins export."
    )
    parser.add_argument("path", type=Path, help="Path to the .xlsx / .xls / .csv export")
    parser.add_argument(
        "--branch-id",
        type=int,
        required=True,
        help="GymFlow branch these rows belong to (the export carries no GymFlow branch id).",
    )
    mode = parser.add_mutually_exclusive_group(required=True)
    mode.add_argument("--dry-run", action="store_true", help="Classify and report; write nothing.")
    mode.add_argument("--import", dest="do_import", action="store_true", help="Write MATCHED rows.")
    parser.add_argument("--yes", action="store_true", help="Required with --import.")
    parser.add_argument(
        "--create-missing-members",
        action="store_true",
        help=f"Also create accounts for UNMATCHED rows. Needs {_BOOTSTRAP_PASSWORD_ENV}.",
    )
    args = parser.parse_args()

    if args.do_import and not args.yes:
        parser.error("--import also needs --yes (this writes to the database).")

    bootstrap_password = os.environ.get(_BOOTSTRAP_PASSWORD_ENV, "")
    if args.create_missing_members and not bootstrap_password:
        parser.error(
            f"--create-missing-members needs {_BOOTSTRAP_PASSWORD_ENV} in the environment. "
            "There is no default; created accounts start on this temporary password and "
            "are forced to change it at first sign-in."
        )

    raw = args.path.read_bytes()
    try:
        parsed = parse_upload(args.path.name, raw)
    except HeaderValidationError as exc:
        raise SystemExit(f"Refusing to import: {exc}") from None

    with SessionLocal() as db:
        branch = db.get(Branch, args.branch_id)
        if branch is None or not branch.is_active:
            raise SystemExit(f"--branch-id {args.branch_id} is not an active GymFlow branch.")

        rows = classify(db, parsed)
        counts = summarize(rows)

        print(f"\nFile      : {args.path.name}")
        print(f"Report    : {parsed.kind.value}")
        print(f"Branch    : {branch.name} (id {branch.id}, {branch.timezone})")
        print(f"Rows      : {counts['total']}")
        for key in ("matched", "ambiguous", "unmatched", "duplicate", "invalid"):
            print(f"  {key:<10}: {counts[key]}")
        print(_report(rows))

        plans, conflicts = ([], [])
        if args.create_missing_members:
            plans, conflicts = plan_accounts(db, rows)
            print(f"\nACCOUNTS TO CREATE ({len(plans)})")
            for plan in plans[:50]:
                print(
                    f"  yoactiv#{plan.yoactiv_member_id}  {plan.full_name[:30]:<30} "
                    f"{_mask_phone(plan.phone)}  (rows {plan.row_numbers[:5]})"
                )
            if len(plans) > 50:
                print(f"  … and {len(plans) - 50} more")
            print(f"\nACCOUNT CONFLICTS — a human must resolve these ({len(conflicts)})")
            for conflict in conflicts[:50]:
                print(
                    f"  yoactiv#{conflict.yoactiv_member_id}  [{conflict.reason}] {conflict.detail}"
                )

        if args.dry_run:
            print("\nDry run — nothing was written.")
            return

        created: list[int] = []
        if args.create_missing_members and plans:
            role = db.scalar(select(Role).where(Role.key == RoleKey.MEMBER.value))
            if role is None:
                raise SystemExit("No MEMBER role in this database.")
            created = create_accounts(
                db,
                plans,
                branch=branch,
                role_id=role.id,
                password_hash=hash_password(bootstrap_password),
                joined_on=branch_today(branch.timezone),
            )
            # Newly created members change the matching picture — reclassify so
            # their rows import in the same run instead of needing a second one.
            rows = classify(db, parsed)
            counts = summarize(rows)

        if parsed.kind is ExportKind.MEMBERSHIP:
            result = import_memberships(db, rows)
        else:
            result = import_checkins(db, rows, branch=branch)

        audit.record(
            db,
            action=ACTION_EXPORT_IMPORT,
            actor_role="operator-cli",
            entity_type="yoactiv_export",
            entity_id=parsed.kind.value,
            branch_id=branch.id,
            details={
                "file": args.path.name,
                "report": parsed.kind.value,
                "counts": counts,
                "written": result.written,
                "accounts_created": len(created),
                "source": "yoactiv-export",
            },
        )
        db.commit()

        print(f"\nWrote {result.written} record(s).")
        if created:
            print(f"Created {len(created)} member account(s), each must change password at login.")
        if result.problems:
            print(f"{len(result.problems)} row(s) need a human — see the report above.")


if __name__ == "__main__":
    main()

"""Import InBody body-composition scans from a LookinBody120 Excel export.

    python -m app.scripts.import_inbody path/to/export.xlsx --dry-run
    python -m app.scripts.import_inbody path/to/export.xlsx --import --yes

This is a manual, human-supervised operation, not an automated pipeline —
nothing calls it, it is not wired into any API endpoint or scheduled job, and
it stays that way until SLAM's InBody export has been reviewed for real by a
human at least once. See ``app/integrations/inbody/importer.py`` for the
pipeline itself (parse -> normalize -> match -> classify) and
``docs/INTEGRATIONS.md`` for what's still manual about this.

Every row is classified into exactly one of MATCHED / AMBIGUOUS / UNMATCHED /
DUPLICATE / INVALID before anything is written. ``--dry-run`` prints that
classification and writes nothing — run it first, always, and read the
AMBIGUOUS and UNMATCHED sections before ever passing ``--import``. Only
MATCHED, non-duplicate rows are ever written; everything else needs a human
to fix the data (in GymFlow or in the export) and be re-run.

    MATCHED    -> import          AMBIGUOUS -> review (human)
    DUPLICATE  -> ignore          UNMATCHED -> review (human)
    INVALID    -> quarantine (reported, never written)

Running the same file twice is safe: rows already recorded (by Local ID, or
by member + exact timestamp when Local ID is missing) classify as DUPLICATE
and are skipped, and the database itself enforces this — see the
``uq_body_compositions_member_external_ref`` / ``..._no_ref`` migration.

--------------------------------------------------------------------------
``--create-missing-members`` — DEFERRED, NOT part of the release candidate
--------------------------------------------------------------------------

An opt-in helper (docs/NEXT_STEPS.md) that, for every UNMATCHED row, creates
a GymFlow member *record* — a ``User`` whose Login ID is the mobile number,
plus a ``Member`` — so the scan can attach. It does **not** create a
``Membership``: Yoactiv is the system of record for commercial membership,
and a phone number in an InBody export is not evidence of one.

Guards, all required:

* ``--branch-id`` — the export carries no branch.
* ``INBODY_BOOTSTRAP_PASSWORD`` in the environment — the temporary password
  the created accounts start on. There is **no default**; the script refuses
  to create accounts without it. Every created account has
  ``must_change_password`` set.
* A mobile number under two different names (``shared_phone``), or one an
  existing GymFlow account already uses (``phone_in_use``), is never
  auto-created — it is listed for a human, like AMBIGUOUS/UNMATCHED.
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
from app.integrations.inbody.importer import (
    HeaderValidationError,
    classify_rows,
    create_bootstrapped_members,
    format_report,
    import_matched,
    parse_workbook,
    plan_bootstrap,
    summarize,
)

_REPORTED_CLASSIFICATIONS = ("matched", "ambiguous", "unmatched", "duplicate", "invalid")

_BOOTSTRAP_PASSWORD_ENV = "INBODY_BOOTSTRAP_PASSWORD"


def _mask_phone(phone: str) -> str:
    return f"******{phone[-4:]}" if len(phone) >= 4 else "******"


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Import InBody LookinBody120 scans from an Excel export."
    )
    parser.add_argument("path", type=Path, help="Path to the .xlsx export")
    parser.add_argument(
        "--sheet",
        default=None,
        help="Sheet name carrying the InBody measurements "
        "(defaults to the workbook's first sheet)",
    )
    mode = parser.add_mutually_exclusive_group(required=True)
    mode.add_argument(
        "--dry-run",
        action="store_true",
        help="Classify every row and print a report. Writes nothing.",
    )
    mode.add_argument(
        "--import",
        dest="do_import",
        action="store_true",
        help="Write MATCHED, non-duplicate rows to body_compositions.",
    )
    parser.add_argument(
        "--yes", action="store_true", help="Required with --import. Confirms the write."
    )
    parser.add_argument(
        "--create-missing-members",
        action="store_true",
        help="DEFERRED / not for the RC. For every UNMATCHED scan, create a member "
        "RECORD (User with Login ID = mobile number, plus Member; no Membership), "
        "then attach its reading. Requires --branch-id and the "
        f"{_BOOTSTRAP_PASSWORD_ENV} environment variable.",
    )
    parser.add_argument(
        "--branch-id",
        type=int,
        default=None,
        help="Branch the created member records belong to (the export has no branch). "
        "Required with --create-missing-members.",
    )
    args = parser.parse_args()

    if not args.path.exists():
        print(f"File not found: {args.path}")
        raise SystemExit(1)

    bootstrap_password: str | None = None
    if args.create_missing_members:
        if args.branch_id is None:
            print("--create-missing-members requires --branch-id.")
            raise SystemExit(1)
        bootstrap_password = os.environ.get(_BOOTSTRAP_PASSWORD_ENV) or None
        if args.do_import and not bootstrap_password:
            print(
                f"--create-missing-members needs {_BOOTSTRAP_PASSWORD_ENV} set to a "
                "temporary password for the new accounts. There is no default. "
                "Refusing to create accounts."
            )
            raise SystemExit(1)

    try:
        rows = parse_workbook(args.path, sheet_name=args.sheet)
    except HeaderValidationError as exc:
        print(f"Cannot read this export:\n  {exc}")
        raise SystemExit(1) from exc

    print(f"Parsed {len(rows)} data row(s) from {args.path.name}\n")

    with SessionLocal() as db:
        classified = classify_rows(db, rows)
        counts = summarize(classified)

        report = format_report(classified)
        if report:
            print(report)
            print()

        print("Summary:")
        for label in _REPORTED_CLASSIFICATIONS:
            print(f"  {label:<10} {counts.get(label, 0)}")

        plans: list = []
        conflicts: list = []
        branch: Branch | None = None
        if args.create_missing_members:
            branch = db.get(Branch, args.branch_id)
            if branch is None or not branch.is_active:
                print(f"\nBranch {args.branch_id} not found or inactive.")
                raise SystemExit(1)
            plans, conflicts = plan_bootstrap(db, classified)

            print(f"\nCreate missing member records (branch {branch.code} — {branch.name}):")
            print(f"  would create   {len(plans)}  (User + Member, no Membership)")
            print(f"  needs a human  {len(conflicts)}")
            for plan in plans[:20]:
                print(
                    f"    + {plan.full_name!r} ({_mask_phone(plan.phone_normalized)}) "
                    f"from row(s) {', '.join(map(str, plan.row_numbers))}"
                )
            if len(plans) > 20:
                print(f"    ... and {len(plans) - 20} more")
            for c in conflicts:
                print(
                    f"    ! {_mask_phone(c.phone_normalized)} [{c.reason}] {c.detail} "
                    f"(row(s) {', '.join(map(str, c.row_numbers))})"
                )
            if not bootstrap_password:
                print(
                    f"    (note: {_BOOTSTRAP_PASSWORD_ENV} is not set — --import would "
                    "refuse to create these.)"
                )

        if args.dry_run:
            print("\nDry run — nothing written.")
            return

        if not args.yes:
            print("\nRefusing to import without --yes.")
            raise SystemExit(1)

        created_count = 0
        if args.create_missing_members and plans:
            assert branch is not None and bootstrap_password is not None
            role = db.scalar(select(Role).where(Role.key == RoleKey.MEMBER.value))
            if role is None:
                print("Member role is not seeded — cannot create accounts.")
                raise SystemExit(1)
            result = create_bootstrapped_members(
                db,
                plans,
                branch=branch,
                role_id=role.id,
                password_hash=hash_password(bootstrap_password),
                joined_on=branch_today(branch.timezone),
            )
            created_count = result.created_count
            # The new member records exist now — re-classify so their UNMATCHED
            # rows become MATCHED (a true re-run would land as DUPLICATE).
            classified = classify_rows(db, rows)
            counts = summarize(classified)

        write_result = import_matched(db, classified)
        db.commit()

        if created_count:
            print(
                f"\nCreated {created_count} member record(s) (Login ID = mobile number, "
                "no membership — Yoactiv owns membership status)."
            )
        print(f"Imported {write_result.written} reading(s).")
        not_matched = len(classified) - counts["matched"]
        if not_matched:
            print(
                f"{not_matched} row(s) were AMBIGUOUS, UNMATCHED, DUPLICATE or INVALID "
                "and were left untouched — see the report above. They need a human to "
                "resolve (fix the member's phone number, deduplicate two accounts, "
                "split a shared mobile number, correct the export) and this file re-run."
            )


if __name__ == "__main__":
    main()

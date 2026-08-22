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

Running the same file twice is safe: rows already recorded (by Local ID, or
by member + exact timestamp when Local ID is missing) classify as DUPLICATE
and are skipped, and the database itself enforces this — see the
``uq_body_compositions_member_external_ref`` / ``..._no_ref`` migration.
"""

from __future__ import annotations

import argparse
from pathlib import Path

from app.db.session import SessionLocal
from app.integrations.inbody.importer import (
    HeaderValidationError,
    classify_rows,
    format_report,
    import_matched,
    parse_workbook,
    summarize,
)

_REPORTED_CLASSIFICATIONS = ("matched", "ambiguous", "unmatched", "duplicate", "invalid")


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
    args = parser.parse_args()

    if not args.path.exists():
        print(f"File not found: {args.path}")
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

        if args.dry_run:
            print("\nDry run — nothing written.")
            return

        if not args.yes:
            print("\nRefusing to import without --yes.")
            raise SystemExit(1)

        result = import_matched(db, classified)
        db.commit()

        print(f"\nImported {result.written} reading(s).")
        not_matched = len(classified) - counts["matched"]
        if not_matched:
            print(
                f"{not_matched} row(s) were AMBIGUOUS, UNMATCHED, DUPLICATE or INVALID "
                "and were left untouched — see the report above. They need a human to "
                "resolve (fix the member's phone number, deduplicate two accounts, "
                "correct the export) and this file re-run."
            )


if __name__ == "__main__":
    main()

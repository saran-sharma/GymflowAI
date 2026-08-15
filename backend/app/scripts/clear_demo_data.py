"""Remove seeded demo rows, and only those.

    python -m app.scripts.clear_demo_data --yes

Demo data exists so the mobile app can be evaluated before the eSSL, YoActiv
and InBody integrations land. It is temporary by design, and this is how it
goes away.

Every row the seeder writes carries ``is_demo=True``; this deletes on that flag
and nothing else, so a real member who signed up at the front desk is never in
scope. It refuses to run without ``--yes`` because the one thing worse than
demo data in production is a delete command that runs by accident.

This is deliberately not wired into application startup. Nothing should be
dropping rows because a process restarted.
"""

from __future__ import annotations

import argparse

from sqlalchemy import func, select

from app.db.models import Branch, Member, Payment, Trainer, TrainerAvailability, User
from app.db.session import SessionLocal
from app.seed import wipe_demo

COUNTED = (
    ("branches", Branch),
    ("users", User),
    ("trainers", Trainer),
    ("members", Member),
    ("availability slots", TrainerAvailability),
    ("payments", Payment),
)


def _tally(db) -> dict[str, int]:
    return {
        label: db.scalar(select(func.count()).select_from(model).where(model.is_demo.is_(True)))
        or 0
        for label, model in COUNTED
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="Delete GymFlow demo rows")
    parser.add_argument("--yes", action="store_true", help="Required. Confirms the deletion.")
    parser.add_argument(
        "--dry-run", action="store_true", help="Report what would be deleted, delete nothing."
    )
    args = parser.parse_args()

    with SessionLocal() as db:
        before = _tally(db)
        total = sum(before.values())

        if total == 0:
            print("No demo rows found. Nothing to do.")
            return

        print("Demo rows currently in the database:")
        for label, count in before.items():
            print(f"  {label:<20} {count}")

        if args.dry_run:
            print("\nDry run — nothing deleted.")
            return

        if not args.yes:
            print("\nRefusing to delete without --yes.")
            raise SystemExit(1)

        wipe_demo(db)
        db.commit()

        after = _tally(db)
        print("\nDeleted. Remaining demo rows:")
        for label, count in after.items():
            print(f"  {label:<20} {count}")
        print("\nReal records were not touched.")


if __name__ == "__main__":
    main()

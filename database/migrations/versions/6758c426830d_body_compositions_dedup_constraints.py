"""Uniqueness guards on body_compositions so an InBody re-import can't duplicate a scan.

The InBody import pipeline (backend/app/scripts/import_inbody.py) is designed
to be safely re-run against the same export file — but until now that was
application-logic hope, not a database guarantee: ``external_ref`` (InBody's
own "Local ID" for a scan) had an index but no uniqueness constraint.

Two constraints, matching the two ways the importer de-duplicates a row:

1. ``(member_id, external_ref)`` unique — the common case. Every real InBody
   scan carries a Local ID, so this alone stops a re-imported file from
   inserting the same scan twice for the same member. NULLs are distinct in
   both Postgres and SQLite, so this rule is silent for rows that lack a
   Local ID.
2. ``(member_id, measured_at)`` unique, but only where ``external_ref IS
   NULL`` — the fallback case, for the rare row whose Local ID is missing
   entirely. Scoped to NULL-ref rows only, so it never interacts with rule 1.

Revision ID: 6758c426830d
Revises: b4e6bbcca127
Create Date: 2026-08-22 00:00:00.000000
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "6758c426830d"
down_revision: str | None = "b4e6bbcca127"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_unique_constraint(
        "uq_body_compositions_member_external_ref",
        "body_compositions",
        ["member_id", "external_ref"],
    )
    op.create_index(
        "uq_body_compositions_member_measured_at_no_ref",
        "body_compositions",
        ["member_id", "measured_at"],
        unique=True,
        postgresql_where=sa.text("external_ref IS NULL"),
    )


def downgrade() -> None:
    op.drop_index(
        "uq_body_compositions_member_measured_at_no_ref", table_name="body_compositions"
    )
    op.drop_constraint(
        "uq_body_compositions_member_external_ref", "body_compositions", type_="unique"
    )

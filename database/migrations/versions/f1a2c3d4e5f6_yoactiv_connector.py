"""Yoactiv Data API connector: incremental-sync cursors and dead letters.

Two additive tables, nothing else. The connector is off by default
(``YOACTIV_ENABLED=false``) and no existing table changes shape here —
Yoactiv check-ins map onto the existing ``attendance_events`` (via its
``external_event_id`` idempotency key) and Yoactiv invoices drive the
existing ``memberships`` / ``members.is_active`` lifecycle. See
``app/integrations/yoactiv/`` and ``docs/INTEGRATIONS.md``.

Revision ID: f1a2c3d4e5f6
Revises: 6be4c30bafe6
Create Date: 2026-08-30 00:00:00.000000
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "f1a2c3d4e5f6"
down_revision: str | None = "6be4c30bafe6"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "yoactiv_sync_cursors",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("endpoint", sa.String(length=32), nullable=False),
        sa.Column("branch_id", sa.Integer(), nullable=False),
        sa.Column("window_end", sa.Date(), nullable=True),
        sa.Column("last_run_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("last_success_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("status", sa.String(length=16), server_default="idle", nullable=False),
        sa.Column("consecutive_failures", sa.Integer(), server_default="0", nullable=False),
        sa.Column("last_error", sa.String(length=500), nullable=True),
        sa.Column("rows_seen", sa.Integer(), server_default="0", nullable=False),
        sa.Column("rows_written", sa.Integer(), server_default="0", nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["branch_id"], ["branches.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "endpoint", "branch_id", name="uq_yoactiv_cursor_endpoint_branch"
        ),
    )
    op.create_index(
        op.f("ix_yoactiv_sync_cursors_branch_id"),
        "yoactiv_sync_cursors",
        ["branch_id"],
        unique=False,
    )

    op.create_table(
        "yoactiv_dead_letters",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("endpoint", sa.String(length=32), nullable=False),
        sa.Column("branch_id", sa.Integer(), nullable=True),
        sa.Column("external_key", sa.String(length=180), nullable=False),
        sa.Column("reason", sa.String(length=200), nullable=False),
        sa.Column("payload", sa.JSON(), nullable=False),
        sa.Column("first_seen_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("last_seen_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("occurrences", sa.Integer(), server_default="1", nullable=False),
        sa.Column("resolved_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["branch_id"], ["branches.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "endpoint", "external_key", name="uq_yoactiv_dead_letter_key"
        ),
    )
    op.create_index(
        op.f("ix_yoactiv_dead_letters_branch_id"),
        "yoactiv_dead_letters",
        ["branch_id"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index(
        op.f("ix_yoactiv_dead_letters_branch_id"), table_name="yoactiv_dead_letters"
    )
    op.drop_table("yoactiv_dead_letters")
    op.drop_index(
        op.f("ix_yoactiv_sync_cursors_branch_id"), table_name="yoactiv_sync_cursors"
    )
    op.drop_table("yoactiv_sync_cursors")

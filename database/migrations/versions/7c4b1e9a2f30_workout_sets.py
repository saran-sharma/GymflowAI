"""Per-set workout logging.

``workout_session_items`` stores what a plan asked for — three sets of ten —
and one status for the whole exercise. Nothing in the schema recorded what was
actually lifted, so previous-session performance, personal records, volume and
RPE trends had no source data at all. This table is that source.

Revision ID: 7c4b1e9a2f30
Revises: 16ad09f49f39
Create Date: 2026-08-17 09:12:41.220613
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "7c4b1e9a2f30"
down_revision: str | None = "16ad09f49f39"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "workout_sets",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("session_item_id", sa.Integer(), nullable=False),
        sa.Column("set_number", sa.Integer(), nullable=False),
        sa.Column("weight_kg", sa.Numeric(precision=5, scale=1), nullable=False),
        sa.Column("reps", sa.Integer(), nullable=False),
        sa.Column("rpe", sa.Numeric(precision=3, scale=1), nullable=True),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
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
        sa.ForeignKeyConstraint(
            ["session_item_id"], ["workout_session_items.id"], ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("session_item_id", "set_number", name="uq_workout_set_number"),
    )
    op.create_index(
        op.f("ix_workout_sets_session_item_id"),
        "workout_sets",
        ["session_item_id"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index(op.f("ix_workout_sets_session_item_id"), table_name="workout_sets")
    op.drop_table("workout_sets")

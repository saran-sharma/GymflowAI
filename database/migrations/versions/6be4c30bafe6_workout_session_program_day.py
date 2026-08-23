"""Let a workout session come from a member's own program day, not a split.

Additive and backward compatible: existing PPL-journey sessions keep their
``split`` exactly as before. ``split`` becomes nullable only so a
templates-era session (``member_program_day_id`` set instead) can omit it —
a member never has both set on the same row.

Revision ID: 6be4c30bafe6
Revises: bdc6b8565dfd
Create Date: 2026-08-23 00:00:00.000000
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "6be4c30bafe6"
down_revision: str | None = "bdc6b8565dfd"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.alter_column("workout_sessions", "split", existing_type=sa.Enum(name="workout_split"), nullable=True)
    op.add_column(
        "workout_sessions", sa.Column("member_program_day_id", sa.Integer(), nullable=True)
    )
    op.create_index(
        op.f("ix_workout_sessions_member_program_day_id"),
        "workout_sessions",
        ["member_program_day_id"],
        unique=False,
    )
    op.create_foreign_key(
        "fk_workout_sessions_member_program_day_id",
        "workout_sessions",
        "member_workout_program_days",
        ["member_program_day_id"],
        ["id"],
        ondelete="SET NULL",
    )


def downgrade() -> None:
    op.drop_constraint(
        "fk_workout_sessions_member_program_day_id", "workout_sessions", type_="foreignkey"
    )
    op.drop_index(
        op.f("ix_workout_sessions_member_program_day_id"), table_name="workout_sessions"
    )
    op.drop_column("workout_sessions", "member_program_day_id")
    op.alter_column(
        "workout_sessions", "split", existing_type=sa.Enum(name="workout_split"), nullable=False
    )

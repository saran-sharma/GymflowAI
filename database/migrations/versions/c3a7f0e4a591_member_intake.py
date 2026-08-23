"""Member intake: the questionnaire a member answers once at registration.

Backs the new ``POST /members`` registration endpoint. Every column is
nullable — a member who declines a question is not an incomplete
registration, and this table is deliberately separate from a trainer's later
fitness ``Assessment`` (a different, ongoing record) so one can never
overwrite the other.

Revision ID: c3a7f0e4a591
Revises: 01f64d9d7103
Create Date: 2026-08-23 00:00:00.000000
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "c3a7f0e4a591"
down_revision: str | None = "01f64d9d7103"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

experience_level_enum = sa.Enum(
    "beginner", "intermediate", "advanced", name="experience_level"
)
preferred_training_style_enum = sa.Enum(
    "strength", "cardio", "general_fitness", "group_classes", "mobility",
    name="preferred_training_style",
)
preferred_time_enum = sa.Enum(
    "morning", "afternoon", "evening", "flexible", name="preferred_time"
)
contact_preference_enum = sa.Enum(
    "whatsapp", "email", "sms", "none", name="contact_preference"
)


def upgrade() -> None:
    # Deliberately no explicit `.create(checkfirst=True)` calls here: each
    # enum object below is used as a column type in `create_table`, which
    # already creates the type itself on first use (see the original
    # `20aa75faece9` migration for the same pattern with `workout_split`).
    # Calling `.create()` first and then letting `create_table` create it
    # again raised "type already exists" — checkfirst isn't threaded through
    # the second, implicit creation.
    op.create_table(
        "member_intakes",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("member_id", sa.Integer(), nullable=False),
        sa.Column("fitness_goal", sa.String(length=160), nullable=True),
        sa.Column("experience_level", experience_level_enum, nullable=True),
        sa.Column("training_frequency_per_week", sa.Integer(), nullable=True),
        sa.Column("preferred_style", preferred_training_style_enum, nullable=True),
        sa.Column("preferred_time", preferred_time_enum, nullable=True),
        sa.Column("wants_pt", sa.Boolean(), nullable=True),
        sa.Column("limitations", sa.String(length=500), nullable=True),
        sa.Column("contact_preference", contact_preference_enum, nullable=True),
        sa.Column("is_demo", sa.Boolean(), server_default=sa.false(), nullable=False),
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
        sa.ForeignKeyConstraint(["member_id"], ["members.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("member_id", name=op.f("uq_member_intakes_member_id")),
    )


def downgrade() -> None:
    op.drop_table("member_intakes")
    contact_preference_enum.drop(op.get_bind(), checkfirst=True)
    preferred_time_enum.drop(op.get_bind(), checkfirst=True)
    preferred_training_style_enum.drop(op.get_bind(), checkfirst=True)
    experience_level_enum.drop(op.get_bind(), checkfirst=True)

"""Workout templates and independent per-member workout programmes.

Additive only. ``WorkoutSplit``/``JourneyDay``/``WorkoutPlan`` and the 45-day
journey they drive are untouched — existing PPL journeys keep working exactly
as before. This adds a parallel schema for the templates system: a
``WorkoutTemplate`` (with days and exercises) is a reusable, editable starting
point; applying one to a member copies its rows into a ``MemberWorkoutProgram``
(with its own days and exercises), so editing the template afterward never
rewrites a member's already-assigned copy. PPL becomes one seeded template
row, not the schema's assumption.

Revision ID: bdc6b8565dfd
Revises: c3a7f0e4a591
Create Date: 2026-08-23 00:00:00.000000
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "bdc6b8565dfd"
down_revision: str | None = "c3a7f0e4a591"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

# Postgres enum labels match `WorkoutCategory`'s member *names*, not its
# `.value` strings: SQLAlchemy's `Enum(SomePythonEnum)` column type — used on
# the model side — serializes by member name by default (the same reason
# `workout_split`'s labels in 20aa75faece9 are `'PUSH'`/`'PULL'`/... rather
# than lowercase). Labels here used the lowercase `.value` form originally,
# which let this migration create the type but made every INSERT through the
# ORM fail with "invalid input value for enum workout_category: FULL_BODY".
_CATEGORY_VALUES = (
    "PUSH",
    "PULL",
    "LEGS",
    "UPPER",
    "LOWER",
    "FULL_BODY",
    "CORE",
    "CONDITIONING",
    "MOBILITY",
    "CUSTOM",
)


def upgrade() -> None:
    # Reusing one Enum object (rather than calling .create() explicitly) lets
    # SQLAlchemy track that the type already exists after the first table
    # that references it, so later tables in this migration don't try to
    # CREATE TYPE a second time. Matches the pattern the original schema
    # migration (20aa75faece9) uses for workout_split.
    category_enum = sa.Enum(*_CATEGORY_VALUES, name="workout_category")

    op.create_table(
        "workout_templates",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("key", sa.String(length=60), nullable=True),
        sa.Column("name", sa.String(length=120), nullable=False),
        sa.Column("description", sa.String(length=300), nullable=True),
        sa.Column("category", category_enum, nullable=False),
        sa.Column("image_key", sa.String(length=80), nullable=True),
        sa.Column("is_system", sa.Boolean(), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False),
        sa.Column("branch_id", sa.Integer(), nullable=True),
        sa.Column("created_by_user_id", sa.Integer(), nullable=True),
        sa.Column("is_demo", sa.Boolean(), nullable=False),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False
        ),
        sa.ForeignKeyConstraint(["branch_id"], ["branches.id"]),
        sa.ForeignKeyConstraint(["created_by_user_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("key", name="uq_workout_templates_key"),
    )
    op.create_index(
        op.f("ix_workout_templates_branch_id"), "workout_templates", ["branch_id"], unique=False
    )

    op.create_table(
        "workout_template_days",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("template_id", sa.Integer(), nullable=False),
        sa.Column("order_index", sa.Integer(), nullable=False),
        sa.Column("name", sa.String(length=120), nullable=False),
        sa.Column("category", category_enum, nullable=False),
        sa.Column("image_key", sa.String(length=80), nullable=True),
        sa.Column("estimated_duration_minutes", sa.Integer(), nullable=True),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False
        ),
        sa.ForeignKeyConstraint(["template_id"], ["workout_templates.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("template_id", "order_index", name="uq_template_day_order"),
    )
    op.create_index(
        op.f("ix_workout_template_days_template_id"),
        "workout_template_days",
        ["template_id"],
        unique=False,
    )

    op.create_table(
        "workout_template_exercises",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("template_day_id", sa.Integer(), nullable=False),
        sa.Column("order_index", sa.Integer(), nullable=False),
        sa.Column("exercise", sa.String(length=120), nullable=False),
        sa.Column("sets", sa.Integer(), nullable=False),
        sa.Column("reps", sa.String(length=32), nullable=False),
        sa.Column("rest_seconds", sa.Integer(), nullable=False),
        sa.Column("notes", sa.String(length=160), nullable=True),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False
        ),
        sa.ForeignKeyConstraint(
            ["template_day_id"], ["workout_template_days.id"], ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        op.f("ix_workout_template_exercises_template_day_id"),
        "workout_template_exercises",
        ["template_day_id"],
        unique=False,
    )

    op.create_table(
        "member_workout_programs",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("member_id", sa.Integer(), nullable=False),
        sa.Column("source_template_id", sa.Integer(), nullable=True),
        sa.Column("name", sa.String(length=120), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False),
        sa.Column("created_by_user_id", sa.Integer(), nullable=True),
        sa.Column("is_demo", sa.Boolean(), nullable=False),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False
        ),
        sa.ForeignKeyConstraint(["member_id"], ["members.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(
            ["source_template_id"], ["workout_templates.id"], ondelete="SET NULL"
        ),
        sa.ForeignKeyConstraint(["created_by_user_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        op.f("ix_member_workout_programs_member_id"),
        "member_workout_programs",
        ["member_id"],
        unique=False,
    )
    op.create_index(
        "uq_member_workout_programs_active",
        "member_workout_programs",
        ["member_id"],
        unique=True,
        postgresql_where=sa.text("is_active"),
        sqlite_where=sa.text("is_active"),
    )

    op.create_table(
        "member_workout_program_days",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("program_id", sa.Integer(), nullable=False),
        sa.Column("order_index", sa.Integer(), nullable=False),
        sa.Column("name", sa.String(length=120), nullable=False),
        sa.Column("category", category_enum, nullable=False),
        sa.Column("image_key", sa.String(length=80), nullable=True),
        sa.Column("estimated_duration_minutes", sa.Integer(), nullable=True),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False
        ),
        sa.ForeignKeyConstraint(
            ["program_id"], ["member_workout_programs.id"], ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("program_id", "order_index", name="uq_member_program_day_order"),
    )
    op.create_index(
        op.f("ix_member_workout_program_days_program_id"),
        "member_workout_program_days",
        ["program_id"],
        unique=False,
    )

    op.create_table(
        "member_workout_program_exercises",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("program_day_id", sa.Integer(), nullable=False),
        sa.Column("order_index", sa.Integer(), nullable=False),
        sa.Column("exercise", sa.String(length=120), nullable=False),
        sa.Column("sets", sa.Integer(), nullable=False),
        sa.Column("reps", sa.String(length=32), nullable=False),
        sa.Column("rest_seconds", sa.Integer(), nullable=False),
        sa.Column("notes", sa.String(length=160), nullable=True),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False
        ),
        sa.ForeignKeyConstraint(
            ["program_day_id"], ["member_workout_program_days.id"], ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        op.f("ix_member_workout_program_exercises_program_day_id"),
        "member_workout_program_exercises",
        ["program_day_id"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_table("member_workout_program_exercises")
    op.drop_table("member_workout_program_days")
    op.drop_index("uq_member_workout_programs_active", table_name="member_workout_programs")
    op.drop_table("member_workout_programs")
    op.drop_table("workout_template_exercises")
    op.drop_table("workout_template_days")
    op.drop_table("workout_templates")
    sa.Enum(name="workout_category").drop(op.get_bind(), checkfirst=True)

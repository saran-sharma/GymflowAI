"""Trainer feedback + owner moderation, and private progress photos.

Adds four tables and three Postgres enum types. Entirely additive — no
existing table, column, index or type is touched — and fully reversible.

* ``trainer_reviews`` / ``trainer_review_moderations`` — a member's star
  rating of a trainer, and the owner's moderation trail. A review is born
  ``pending`` and only an ``approved`` row is ever shown on a profile.
* ``progress_photos`` — metadata only; the bytes live in private storage
  (``app.services.photo_storage``), never in this database and never behind
  a public URL. Default visibility is the member alone.
* ``progress_photo_shares`` — a record that the member chose to hand a
  branded card to the OS share sheet, and exactly which fields they agreed
  to include. GymFlow never stores or posts the shared image.

Revision ID: a7c1e2b9d4f8
Revises: f1a2c3d4e5f6
Create Date: 2026-08-30 15:30:00.000000
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "a7c1e2b9d4f8"
down_revision: str | None = "f1a2c3d4e5f6"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

# Labels are the enum *values* (lowercase), matching the member-intake types
# and `models._by_value`. No explicit `.create()` — the first `create_table`
# that references a type creates it (see migration c3a7f0e4a591 for the same
# note). `trainer_review_status` is used by two tables, so its second use
# passes `create_type=False` to avoid a duplicate CREATE TYPE.
_REVIEW_STATUS = ("pending", "approved", "rejected", "removed")
_MOD_ACTION = ("approve", "reject", "remove", "reinstate", "note", "report")
_PHOTO_ANGLE = ("front", "side", "back")

# For downgrade only.
review_status_type = sa.Enum(*_REVIEW_STATUS, name="trainer_review_status")
review_moderation_action_type = sa.Enum(*_MOD_ACTION, name="review_moderation_action")
progress_photo_angle_type = sa.Enum(*_PHOTO_ANGLE, name="progress_photo_angle")


def upgrade() -> None:
    op.create_table(
        "trainer_reviews",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("member_id", sa.Integer(), nullable=False),
        sa.Column("trainer_id", sa.Integer(), nullable=False),
        sa.Column("branch_id", sa.Integer(), nullable=False),
        sa.Column("workout_session_id", sa.Integer(), nullable=True),
        sa.Column("pt_session_id", sa.Integer(), nullable=True),
        sa.Column("rating", sa.Integer(), nullable=False),
        sa.Column("comment", sa.Text(), nullable=True),
        # First use of the type — created here.
        sa.Column(
            "status",
            sa.Enum(*_REVIEW_STATUS, name="trainer_review_status"),
            server_default="pending",
            nullable=False,
        ),
        sa.Column(
            "display_name_consent",
            sa.Boolean(),
            server_default=sa.false(),
            nullable=False,
        ),
        sa.Column("policy_ack_version", sa.String(length=32), nullable=True),
        sa.Column("reported", sa.Boolean(), server_default=sa.false(), nullable=False),
        sa.Column("reported_reason", sa.Text(), nullable=True),
        sa.Column("reported_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("published_at", sa.DateTime(timezone=True), nullable=True),
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
        sa.CheckConstraint(
            "rating >= 1 AND rating <= 5", name="ck_trainer_review_rating_range"
        ),
        sa.ForeignKeyConstraint(["member_id"], ["members.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["trainer_id"], ["trainers.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["branch_id"], ["branches.id"]),
        sa.ForeignKeyConstraint(
            ["workout_session_id"], ["workout_sessions.id"], ondelete="SET NULL"
        ),
        sa.ForeignKeyConstraint(
            ["pt_session_id"], ["pt_sessions.id"], ondelete="SET NULL"
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "member_id", "workout_session_id", name="uq_trainer_review_member_workout"
        ),
        sa.UniqueConstraint(
            "member_id", "pt_session_id", name="uq_trainer_review_member_pt"
        ),
    )
    op.create_index("ix_trainer_reviews_member_id", "trainer_reviews", ["member_id"])
    op.create_index("ix_trainer_reviews_trainer_id", "trainer_reviews", ["trainer_id"])
    op.create_index("ix_trainer_reviews_branch_id", "trainer_reviews", ["branch_id"])
    op.create_index(
        "ix_trainer_reviews_workout_session_id",
        "trainer_reviews",
        ["workout_session_id"],
    )
    op.create_index(
        "ix_trainer_reviews_pt_session_id", "trainer_reviews", ["pt_session_id"]
    )
    op.create_index("ix_trainer_reviews_status", "trainer_reviews", ["status"])
    op.create_index("ix_trainer_reviews_reported", "trainer_reviews", ["reported"])
    op.create_index(
        "ix_trainer_reviews_trainer_status", "trainer_reviews", ["trainer_id", "status"]
    )

    op.create_table(
        "trainer_review_moderations",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("review_id", sa.Integer(), nullable=False),
        sa.Column("actor_user_id", sa.Integer(), nullable=True),
        sa.Column("actor_role", sa.String(length=32), nullable=True),
        # First use of this type — created here.
        sa.Column(
            "action",
            sa.Enum(*_MOD_ACTION, name="review_moderation_action"),
            nullable=False,
        ),
        # Reuse of trainer_review_status — do not re-create it.
        sa.Column(
            "from_status",
            sa.Enum(*_REVIEW_STATUS, name="trainer_review_status", create_type=False),
            nullable=True,
        ),
        sa.Column(
            "to_status",
            sa.Enum(*_REVIEW_STATUS, name="trainer_review_status", create_type=False),
            nullable=True,
        ),
        sa.Column("note", sa.Text(), nullable=True),
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
            ["review_id"], ["trainer_reviews.id"], ondelete="CASCADE"
        ),
        sa.ForeignKeyConstraint(["actor_user_id"], ["users.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_trainer_review_moderations_review_id",
        "trainer_review_moderations",
        ["review_id"],
    )

    op.create_table(
        "progress_photos",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("member_id", sa.Integer(), nullable=False),
        sa.Column("branch_id", sa.Integer(), nullable=False),
        # First use of this type — created here.
        sa.Column(
            "angle", sa.Enum(*_PHOTO_ANGLE, name="progress_photo_angle"), nullable=False
        ),
        sa.Column("taken_on", sa.Date(), nullable=False),
        sa.Column("note", sa.Text(), nullable=True),
        sa.Column("storage_key", sa.String(length=256), nullable=False),
        sa.Column("content_type", sa.String(length=64), nullable=False),
        sa.Column("byte_size", sa.Integer(), nullable=False),
        sa.Column("width", sa.Integer(), nullable=True),
        sa.Column("height", sa.Integer(), nullable=True),
        sa.Column("checksum_sha256", sa.String(length=64), nullable=True),
        sa.Column(
            "trainer_visible", sa.Boolean(), server_default=sa.false(), nullable=False
        ),
        sa.Column(
            "owner_visible", sa.Boolean(), server_default=sa.false(), nullable=False
        ),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
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
        sa.CheckConstraint("byte_size >= 0", name="ck_progress_photo_byte_size"),
        sa.ForeignKeyConstraint(["member_id"], ["members.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["branch_id"], ["branches.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("storage_key", name=op.f("uq_progress_photos_storage_key")),
    )
    op.create_index("ix_progress_photos_member_id", "progress_photos", ["member_id"])
    op.create_index("ix_progress_photos_branch_id", "progress_photos", ["branch_id"])
    op.create_index("ix_progress_photos_taken_on", "progress_photos", ["taken_on"])
    op.create_index("ix_progress_photos_deleted_at", "progress_photos", ["deleted_at"])
    op.create_index(
        "ix_progress_photos_member_angle_date",
        "progress_photos",
        ["member_id", "angle", "taken_on"],
    )

    op.create_table(
        "progress_photo_shares",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("member_id", sa.Integer(), nullable=False),
        sa.Column("photo_id", sa.Integer(), nullable=False),
        sa.Column("compare_photo_id", sa.Integer(), nullable=True),
        sa.Column(
            "template",
            sa.String(length=32),
            server_default="slam_default",
            nullable=False,
        ),
        sa.Column("caption", sa.Text(), nullable=True),
        sa.Column(
            "included_fields", sa.JSON(), server_default=sa.text("'{}'"), nullable=False
        ),
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
        sa.ForeignKeyConstraint(
            ["photo_id"], ["progress_photos.id"], ondelete="CASCADE"
        ),
        sa.ForeignKeyConstraint(
            ["compare_photo_id"], ["progress_photos.id"], ondelete="SET NULL"
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_progress_photo_shares_member_id", "progress_photo_shares", ["member_id"]
    )
    op.create_index(
        "ix_progress_photo_shares_photo_id", "progress_photo_shares", ["photo_id"]
    )
    op.create_index(
        "ix_progress_photo_shares_compare_photo_id",
        "progress_photo_shares",
        ["compare_photo_id"],
    )


def downgrade() -> None:
    op.drop_table("progress_photo_shares")
    op.drop_table("progress_photos")
    op.drop_table("trainer_review_moderations")
    op.drop_table("trainer_reviews")
    bind = op.get_bind()
    progress_photo_angle_type.drop(bind, checkfirst=True)
    review_moderation_action_type.drop(bind, checkfirst=True)
    review_status_type.drop(bind, checkfirst=True)

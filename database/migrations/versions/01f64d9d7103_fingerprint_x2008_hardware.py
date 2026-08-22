"""Fingerprint / X2008 hardware: device registry, member enrollment mapping,
and an idempotency key on attendance_events.

Three additive pieces, all off in behaviour until ACCESS_CONTROL_ENABLED is
turned on (see app/core/config.py and docs/INTEGRATIONS.md):

* ``fingerprint_devices`` — non-secret facts about a registered ZKTeco/ADMS
  terminal (serial, LAN address, branch). The terminal's Communication Key is
  a real secret and is never stored here — it lives only in the
  FINGERPRINT_COMM_KEY environment variable.
* ``fingerprint_enrollments`` — maps a member to the numeric enroll-ID they
  registered under on a specific device. Deliberately not
  ``members.external_ref``, which is reserved for Yoactiv.
* ``attendance_events.external_event_id`` — nullable, unique when present.
  The hardware receiver constructs it as "{serial}:{enrolled_id}:{device_time}"
  so a redelivered ADMS batch (the terminal resending its backlog is normal
  behaviour for this protocol family) resolves to the same row instead of a
  duplicate visit.

Revision ID: 01f64d9d7103
Revises: 6758c426830d
Create Date: 2026-08-22 00:00:00.000000
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "01f64d9d7103"
down_revision: str | None = "6758c426830d"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "fingerprint_devices",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("branch_id", sa.Integer(), nullable=False),
        sa.Column("device_number", sa.Integer(), nullable=False),
        sa.Column("serial", sa.String(length=64), nullable=False),
        sa.Column("label", sa.String(length=120), nullable=False),
        sa.Column("ip_address", sa.String(length=64), nullable=True),
        sa.Column("tcp_port", sa.Integer(), nullable=True),
        sa.Column("is_active", sa.Boolean(), nullable=False),
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
        sa.UniqueConstraint("serial", name=op.f("uq_fingerprint_devices_serial")),
        sa.UniqueConstraint(
            "branch_id", "device_number", name="uq_fingerprint_device_branch_number"
        ),
    )
    op.create_index(
        op.f("ix_fingerprint_devices_branch_id"),
        "fingerprint_devices",
        ["branch_id"],
        unique=False,
    )

    op.create_table(
        "fingerprint_enrollments",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("member_id", sa.Integer(), nullable=False),
        sa.Column("branch_id", sa.Integer(), nullable=False),
        sa.Column("device_id", sa.Integer(), nullable=False),
        sa.Column("enrolled_id", sa.String(length=32), nullable=False),
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
        sa.ForeignKeyConstraint(["device_id"], ["fingerprint_devices.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["member_id"], ["members.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("member_id", name=op.f("uq_fingerprint_enrollments_member_id")),
        sa.UniqueConstraint(
            "device_id", "enrolled_id", name="uq_fingerprint_enrollment_device_slot"
        ),
    )
    op.create_index(
        op.f("ix_fingerprint_enrollments_branch_id"),
        "fingerprint_enrollments",
        ["branch_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_fingerprint_enrollments_device_id"),
        "fingerprint_enrollments",
        ["device_id"],
        unique=False,
    )

    op.add_column(
        "attendance_events",
        sa.Column("external_event_id", sa.String(length=160), nullable=True),
    )
    op.create_unique_constraint(
        "uq_attendance_event_external_id", "attendance_events", ["external_event_id"]
    )


def downgrade() -> None:
    op.drop_constraint("uq_attendance_event_external_id", "attendance_events", type_="unique")
    op.drop_column("attendance_events", "external_event_id")

    op.drop_index(
        op.f("ix_fingerprint_enrollments_device_id"), table_name="fingerprint_enrollments"
    )
    op.drop_index(
        op.f("ix_fingerprint_enrollments_branch_id"), table_name="fingerprint_enrollments"
    )
    op.drop_table("fingerprint_enrollments")

    op.drop_index(op.f("ix_fingerprint_devices_branch_id"), table_name="fingerprint_devices")
    op.drop_table("fingerprint_devices")

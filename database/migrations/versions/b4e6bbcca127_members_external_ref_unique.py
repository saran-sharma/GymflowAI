"""Members.external_ref must uniquely identify a Yoactiv record.

``external_ref`` exists so a GymFlow member can be linked to its Yoactiv
identity once sync is possible (see the "Yoactiv — ACTION REQUIRED" section of
docs/INTEGRATIONS.md). Nothing writes to this column yet — no seed data, no
service, no migration before this one — so there is no existing data to clean
up; this simply closes the gap before anything does write to it. Without the
constraint, two GymFlow members could end up linked to the same Yoactiv
person, and app.integrations.yoactiv.identity.find_member_by_external_ref
would have no way to say which one is right.

The column stays nullable: Postgres treats NULLs as distinct under a unique
index, so any number of not-yet-linked members are still allowed.

Revision ID: b4e6bbcca127
Revises: d6fe374b99f3
Create Date: 2026-08-22 00:00:00.000000
"""

from __future__ import annotations

from collections.abc import Sequence

from alembic import op

revision: str = "b4e6bbcca127"
down_revision: str | None = "d6fe374b99f3"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.drop_index("ix_members_external_ref", table_name="members")
    op.create_index(
        "ix_members_external_ref",
        "members",
        ["external_ref"],
        unique=True,
    )


def downgrade() -> None:
    op.drop_index("ix_members_external_ref", table_name="members")
    op.create_index(
        "ix_members_external_ref",
        "members",
        ["external_ref"],
        unique=False,
    )

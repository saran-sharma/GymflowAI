"""Login-by-mobile and a first-login password flag.

Two additive columns on ``users``. They back the deferred, opt-in
``app/scripts/import_inbody.py --create-missing-members`` helper (see
docs/NEXT_STEPS.md), which creates a ``User`` + ``Member`` — never a
``Membership`` — for an UNMATCHED InBody scan, keyed by the mobile number. The
columns are inert until that helper is run.

* ``login_phone`` — the mobile number in normalised 10-digit form when it is
  the account's Login ID. A unique index (NULLs distinct, so every legacy
  account is still allowed) lets ``find_user_by_identifier`` resolve a phone
  login to exactly one row without scanning.
* ``must_change_password`` — set on a helper-created account so the app can
  require the member to replace the operator-supplied temporary password. A
  soft flag: login still succeeds while it is true.

Entirely additive and reversible. No existing row is rewritten — every current
account gets ``must_change_password = false`` and ``login_phone = NULL``.

Revision ID: c8f2a1d0b7e3
Revises: a7c1e2b9d4f8
Create Date: 2026-08-31 00:00:00.000000
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "c8f2a1d0b7e3"
down_revision: str | None = "a7c1e2b9d4f8"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "users",
        sa.Column(
            "must_change_password",
            sa.Boolean(),
            nullable=False,
            server_default=sa.false(),
        ),
    )
    op.alter_column("users", "must_change_password", server_default=None)

    op.add_column("users", sa.Column("login_phone", sa.String(length=10), nullable=True))
    op.create_index("ix_users_login_phone", "users", ["login_phone"], unique=True)


def downgrade() -> None:
    op.drop_index("ix_users_login_phone", table_name="users")
    op.drop_column("users", "login_phone")
    op.drop_column("users", "must_change_password")

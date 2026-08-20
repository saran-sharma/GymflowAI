"""One active/completed workout session per member per day.

``start_workout`` already refuses to open a second SCHEDULED/IN_PROGRESS/
COMPLETED session for a member on a date it's already seen — the service-layer
check-then-insert closed the obvious path, but two concurrent "start workout"
taps can both pass that SELECT before either INSERT commits, leaving two rows
for the same day (own_workouts double-counted, the day's activity feed and
journey tally both duplicated).

The constraint is partial, not blanket: CANCELLED and NO_SHOW are excluded
because start_workout() already treats those as non-blocking, so a member can
retry on the same day after a cancelled or no-show session. A flat unique
constraint on (member_id, session_date) would forbid that legitimate retry.

Before the index is created, any pre-existing duplicate is resolved by
keeping the earliest-started row and moving the later duplicate(s) to
CANCELLED — never deleted, so any sets already logged against them are kept
for the record; they just stop counting toward completed-workout tallies.

Revision ID: 526e2d50334f
Revises: 7c4b1e9a2f30
Create Date: 2026-08-21 00:00:00.000000
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "526e2d50334f"
down_revision: str | None = "7c4b1e9a2f30"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

_ACTIVE_STATUSES_SQL = "'SCHEDULED', 'IN_PROGRESS', 'COMPLETED'"


def upgrade() -> None:
    # Keep the earliest-started session per member/day; cancel the rest so the
    # partial index below can be created cleanly on data that predates it.
    op.execute(
        sa.text(
            f"""
            WITH ranked AS (
                SELECT
                    id,
                    row_number() OVER (
                        PARTITION BY member_id, session_date
                        ORDER BY started_at NULLS LAST, id
                    ) AS rn
                FROM workout_sessions
                WHERE status IN ({_ACTIVE_STATUSES_SQL})
            )
            UPDATE workout_sessions
            SET status = 'CANCELLED'
            WHERE id IN (SELECT id FROM ranked WHERE rn > 1)
            """
        )
    )

    op.create_index(
        "uq_workout_sessions_member_active_day",
        "workout_sessions",
        ["member_id", "session_date"],
        unique=True,
        postgresql_where=sa.text("status IN ('SCHEDULED', 'IN_PROGRESS', 'COMPLETED')"),
    )


def downgrade() -> None:
    op.drop_index("uq_workout_sessions_member_active_day", table_name="workout_sessions")

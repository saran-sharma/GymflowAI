"""Member daily check-in ("how are you feeling today?").

One row per member per day, enforced by a unique constraint rather than
service-layer discipline alone. Server-derived ``work_date`` (branch_today),
matching the pattern every other day-scoped record in the journey
architecture already uses.

Revision ID: d6fe374b99f3
Revises: 526e2d50334f
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = 'd6fe374b99f3'
down_revision: str | None = '526e2d50334f'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table('member_checkins',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('member_id', sa.Integer(), nullable=False),
    sa.Column('branch_id', sa.Integer(), nullable=False),
    sa.Column('work_date', sa.Date(), nullable=False),
    sa.Column('feeling', sa.Enum('GREAT', 'GOOD', 'OKAY', 'TIRED', 'LOW', name='checkin_feeling'), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.ForeignKeyConstraint(['branch_id'], ['branches.id'], ),
    sa.ForeignKeyConstraint(['member_id'], ['members.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('member_id', 'work_date', name='uq_member_checkin_day')
    )
    op.create_index(op.f('ix_member_checkins_branch_id'), 'member_checkins', ['branch_id'], unique=False)
    op.create_index(op.f('ix_member_checkins_member_id'), 'member_checkins', ['member_id'], unique=False)
    op.create_index(op.f('ix_member_checkins_work_date'), 'member_checkins', ['work_date'], unique=False)


def downgrade() -> None:
    op.drop_index(op.f('ix_member_checkins_work_date'), table_name='member_checkins')
    op.drop_index(op.f('ix_member_checkins_member_id'), table_name='member_checkins')
    op.drop_index(op.f('ix_member_checkins_branch_id'), table_name='member_checkins')
    op.drop_table('member_checkins')
    sa.Enum(name='checkin_feeling').drop(op.get_bind(), checkfirst=True)

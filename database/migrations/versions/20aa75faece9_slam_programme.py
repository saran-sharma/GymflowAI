"""SLAM programme: journeys, PT, classes, marketing, alerts.

Adds everything V1.5 needs on top of the trainer-accountability core:

* the 45-day General Training journey and its PPL workout records
* PT packages and sessions, with member and trainer arrival kept apart
* group classes, RSVPs and actual attendance as three separate facts
* acquisition source, campaigns and referrals on the member record
* the in-app alert centre, follow-up tasks and attendance corrections
* a reserved table for InBody body composition, which nothing writes yet

Every table carries ``branch_id`` where it is branch-sensitive, so branch
isolation stays a single predicate rather than a join per query.

Revision ID: 20aa75faece9
Revises: 263f304244af
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql
from alembic import op

revision: str = '20aa75faece9'
down_revision: str | None = '263f304244af'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


# ``attendance_status`` already exists from the initial revision; the correction
# table only references it, so the type is not created (or dropped) here.


def upgrade() -> None:
    op.create_table('marketing_sources',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('key', sa.String(length=48), nullable=False),
    sa.Column('label', sa.String(length=80), nullable=False),
    sa.Column('requires_referrer', sa.Boolean(), nullable=False),
    sa.Column('sort_order', sa.Integer(), nullable=False),
    sa.Column('is_active', sa.Boolean(), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.Column('is_demo', sa.Boolean(), nullable=False),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('key')
    )
    op.create_table('campaigns',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('branch_id', sa.Integer(), nullable=True),
    sa.Column('name', sa.String(length=120), nullable=False),
    sa.Column('code', sa.String(length=48), nullable=False),
    sa.Column('description', sa.Text(), nullable=True),
    sa.Column('starts_on', sa.Date(), nullable=True),
    sa.Column('ends_on', sa.Date(), nullable=True),
    sa.Column('is_active', sa.Boolean(), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.Column('is_demo', sa.Boolean(), nullable=False),
    sa.ForeignKeyConstraint(['branch_id'], ['branches.id'], ),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('code')
    )
    op.create_index(op.f('ix_campaigns_branch_id'), 'campaigns', ['branch_id'], unique=False)
    op.create_table('alerts',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('branch_id', sa.Integer(), nullable=True),
    sa.Column('target_role', sa.String(length=32), nullable=True),
    sa.Column('target_user_id', sa.Integer(), nullable=True),
    sa.Column('key', sa.String(length=64), nullable=False),
    sa.Column('severity', sa.Enum('INFO', 'WARNING', 'CRITICAL', name='alert_severity'), nullable=False),
    sa.Column('status', sa.Enum('OPEN', 'ACKNOWLEDGED', 'RESOLVED', 'DISMISSED', name='alert_status'), nullable=False),
    sa.Column('title', sa.String(length=160), nullable=False),
    sa.Column('body', sa.Text(), nullable=False),
    sa.Column('entity_type', sa.String(length=48), nullable=True),
    sa.Column('entity_id', sa.String(length=48), nullable=True),
    sa.Column('action_route', sa.String(length=160), nullable=True),
    sa.Column('dedupe_key', sa.String(length=180), nullable=False),
    sa.Column('payload', postgresql.JSONB(astext_type=sa.Text()), nullable=False),
    sa.Column('resolved_at', sa.DateTime(timezone=True), nullable=True),
    sa.Column('acknowledged_by_user_id', sa.Integer(), nullable=True),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.ForeignKeyConstraint(['acknowledged_by_user_id'], ['users.id'], ),
    sa.ForeignKeyConstraint(['branch_id'], ['branches.id'], ),
    sa.ForeignKeyConstraint(['target_user_id'], ['users.id'], ),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('dedupe_key')
    )
    op.create_index(op.f('ix_alerts_branch_id'), 'alerts', ['branch_id'], unique=False)
    op.create_index('ix_alerts_branch_status', 'alerts', ['branch_id', 'status'], unique=False)
    op.create_index(op.f('ix_alerts_key'), 'alerts', ['key'], unique=False)
    op.create_index(op.f('ix_alerts_status'), 'alerts', ['status'], unique=False)
    op.create_index(op.f('ix_alerts_target_role'), 'alerts', ['target_role'], unique=False)
    op.create_index(op.f('ix_alerts_target_user_id'), 'alerts', ['target_user_id'], unique=False)
    op.create_table('group_classes',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('branch_id', sa.Integer(), nullable=False),
    sa.Column('trainer_id', sa.Integer(), nullable=True),
    sa.Column('name', sa.String(length=120), nullable=False),
    sa.Column('description', sa.Text(), nullable=True),
    sa.Column('starts_at', sa.DateTime(timezone=True), nullable=False),
    sa.Column('ends_at', sa.DateTime(timezone=True), nullable=True),
    sa.Column('class_date', sa.Date(), nullable=False),
    sa.Column('capacity', sa.Integer(), nullable=False),
    sa.Column('status', sa.Enum('SCHEDULED', 'CANCELLED', 'COMPLETED', name='class_status'), nullable=False),
    sa.Column('announcement', sa.Text(), nullable=True),
    sa.Column('created_by_user_id', sa.Integer(), nullable=True),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.Column('is_demo', sa.Boolean(), nullable=False),
    sa.ForeignKeyConstraint(['branch_id'], ['branches.id'], ),
    sa.ForeignKeyConstraint(['created_by_user_id'], ['users.id'], ),
    sa.ForeignKeyConstraint(['trainer_id'], ['trainers.id'], ),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_group_classes_branch_id'), 'group_classes', ['branch_id'], unique=False)
    op.create_index(op.f('ix_group_classes_class_date'), 'group_classes', ['class_date'], unique=False)
    op.create_index(op.f('ix_group_classes_starts_at'), 'group_classes', ['starts_at'], unique=False)
    op.create_index(op.f('ix_group_classes_trainer_id'), 'group_classes', ['trainer_id'], unique=False)
    op.create_table('body_compositions',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('member_id', sa.Integer(), nullable=False),
    sa.Column('branch_id', sa.Integer(), nullable=False),
    sa.Column('measured_at', sa.DateTime(timezone=True), nullable=False),
    sa.Column('source', sa.String(length=32), nullable=False),
    sa.Column('external_ref', sa.String(length=64), nullable=True),
    sa.Column('weight_kg', sa.Numeric(precision=5, scale=1, asdecimal=False), nullable=True),
    sa.Column('body_fat_pct', sa.Numeric(precision=5, scale=2, asdecimal=False), nullable=True),
    sa.Column('muscle_mass_kg', sa.Numeric(precision=5, scale=1, asdecimal=False), nullable=True),
    sa.Column('bmi', sa.Numeric(precision=5, scale=1, asdecimal=False), nullable=True),
    sa.Column('visceral_fat', sa.Numeric(precision=5, scale=1, asdecimal=False), nullable=True),
    sa.Column('bmr_kcal', sa.Integer(), nullable=True),
    sa.Column('body_water_pct', sa.Numeric(precision=5, scale=2, asdecimal=False), nullable=True),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.ForeignKeyConstraint(['branch_id'], ['branches.id'], ),
    sa.ForeignKeyConstraint(['member_id'], ['members.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_body_compositions_branch_id'), 'body_compositions', ['branch_id'], unique=False)
    op.create_index(op.f('ix_body_compositions_external_ref'), 'body_compositions', ['external_ref'], unique=False)
    op.create_index(op.f('ix_body_compositions_member_id'), 'body_compositions', ['member_id'], unique=False)
    op.create_table('group_class_attendance',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('class_id', sa.Integer(), nullable=False),
    sa.Column('member_id', sa.Integer(), nullable=False),
    sa.Column('branch_id', sa.Integer(), nullable=False),
    sa.Column('attended', sa.Boolean(), nullable=False),
    sa.Column('recorded_by_user_id', sa.Integer(), nullable=True),
    sa.Column('recorded_at', sa.DateTime(timezone=True), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.ForeignKeyConstraint(['branch_id'], ['branches.id'], ),
    sa.ForeignKeyConstraint(['class_id'], ['group_classes.id'], ondelete='CASCADE'),
    sa.ForeignKeyConstraint(['member_id'], ['members.id'], ondelete='CASCADE'),
    sa.ForeignKeyConstraint(['recorded_by_user_id'], ['users.id'], ),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('class_id', 'member_id', name='uq_class_attendance')
    )
    op.create_index(op.f('ix_group_class_attendance_branch_id'), 'group_class_attendance', ['branch_id'], unique=False)
    op.create_index(op.f('ix_group_class_attendance_class_id'), 'group_class_attendance', ['class_id'], unique=False)
    op.create_index(op.f('ix_group_class_attendance_member_id'), 'group_class_attendance', ['member_id'], unique=False)
    op.create_table('group_class_rsvps',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('class_id', sa.Integer(), nullable=False),
    sa.Column('member_id', sa.Integer(), nullable=False),
    sa.Column('response', sa.Enum('PENDING', 'YES', 'NO', name='rsvp_response'), nullable=False),
    sa.Column('responded_at', sa.DateTime(timezone=True), nullable=True),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.ForeignKeyConstraint(['class_id'], ['group_classes.id'], ondelete='CASCADE'),
    sa.ForeignKeyConstraint(['member_id'], ['members.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('class_id', 'member_id', name='uq_class_rsvp')
    )
    op.create_index(op.f('ix_group_class_rsvps_class_id'), 'group_class_rsvps', ['class_id'], unique=False)
    op.create_index(op.f('ix_group_class_rsvps_member_id'), 'group_class_rsvps', ['member_id'], unique=False)
    op.create_table('journeys',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('member_id', sa.Integer(), nullable=False),
    sa.Column('branch_id', sa.Integer(), nullable=False),
    sa.Column('journey_type', sa.Enum('GENERAL_TRAINING', name='journey_type'), nullable=False),
    sa.Column('start_date', sa.Date(), nullable=False),
    sa.Column('end_date', sa.Date(), nullable=False),
    sa.Column('duration_days', sa.Integer(), nullable=False),
    sa.Column('assessment_days', sa.Integer(), nullable=False),
    sa.Column('cardio_sessions_required', sa.Integer(), nullable=False),
    sa.Column('status', sa.Enum('ACTIVE', 'COMPLETED', 'PAUSED', 'CANCELLED', name='journey_status'), nullable=False),
    sa.Column('assessment_status', sa.Enum('NOT_STARTED', 'IN_PROGRESS', 'COMPLETED', name='assessment_status'), nullable=False),
    sa.Column('assigned_trainer_id', sa.Integer(), nullable=True),
    sa.Column('completed_on', sa.Date(), nullable=True),
    sa.Column('completion_summary', postgresql.JSONB(astext_type=sa.Text()), nullable=True),
    sa.Column('pt_offer_shown', sa.Boolean(), nullable=False),
    sa.Column('pt_converted', sa.Boolean(), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.Column('is_demo', sa.Boolean(), nullable=False),
    sa.ForeignKeyConstraint(['assigned_trainer_id'], ['trainers.id'], ),
    sa.ForeignKeyConstraint(['branch_id'], ['branches.id'], ),
    sa.ForeignKeyConstraint(['member_id'], ['members.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_journeys_branch_id'), 'journeys', ['branch_id'], unique=False)
    op.create_index('ix_journeys_branch_status', 'journeys', ['branch_id', 'status'], unique=False)
    op.create_index(op.f('ix_journeys_member_id'), 'journeys', ['member_id'], unique=False)
    op.create_table('referrals',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('referrer_member_id', sa.Integer(), nullable=False),
    sa.Column('referred_member_id', sa.Integer(), nullable=False),
    sa.Column('branch_id', sa.Integer(), nullable=False),
    sa.Column('note', sa.Text(), nullable=True),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.Column('is_demo', sa.Boolean(), nullable=False),
    sa.ForeignKeyConstraint(['branch_id'], ['branches.id'], ),
    sa.ForeignKeyConstraint(['referred_member_id'], ['members.id'], ondelete='CASCADE'),
    sa.ForeignKeyConstraint(['referrer_member_id'], ['members.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('referred_member_id', name='uq_referral_referred')
    )
    op.create_index(op.f('ix_referrals_branch_id'), 'referrals', ['branch_id'], unique=False)
    op.create_index(op.f('ix_referrals_referred_member_id'), 'referrals', ['referred_member_id'], unique=False)
    op.create_index(op.f('ix_referrals_referrer_member_id'), 'referrals', ['referrer_member_id'], unique=False)
    op.create_table('tasks',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('branch_id', sa.Integer(), nullable=False),
    sa.Column('member_id', sa.Integer(), nullable=True),
    sa.Column('assigned_trainer_id', sa.Integer(), nullable=True),
    sa.Column('key', sa.String(length=64), nullable=False),
    sa.Column('title', sa.String(length=160), nullable=False),
    sa.Column('detail', sa.Text(), nullable=True),
    sa.Column('due_on', sa.Date(), nullable=True),
    sa.Column('status', sa.String(length=24), nullable=False),
    sa.Column('dedupe_key', sa.String(length=180), nullable=False),
    sa.Column('completed_at', sa.DateTime(timezone=True), nullable=True),
    sa.Column('completed_by_user_id', sa.Integer(), nullable=True),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.ForeignKeyConstraint(['assigned_trainer_id'], ['trainers.id'], ),
    sa.ForeignKeyConstraint(['branch_id'], ['branches.id'], ),
    sa.ForeignKeyConstraint(['completed_by_user_id'], ['users.id'], ),
    sa.ForeignKeyConstraint(['member_id'], ['members.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('dedupe_key')
    )
    op.create_index(op.f('ix_tasks_branch_id'), 'tasks', ['branch_id'], unique=False)
    op.create_index(op.f('ix_tasks_status'), 'tasks', ['status'], unique=False)
    op.create_table('assessments',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('journey_id', sa.Integer(), nullable=True),
    sa.Column('member_id', sa.Integer(), nullable=False),
    sa.Column('branch_id', sa.Integer(), nullable=False),
    sa.Column('trainer_id', sa.Integer(), nullable=True),
    sa.Column('status', sa.Enum('NOT_STARTED', 'IN_PROGRESS', 'COMPLETED', name='assessment_status'), nullable=False),
    sa.Column('goal', sa.String(length=160), nullable=True),
    sa.Column('height_cm', sa.Numeric(precision=5, scale=1, asdecimal=False), nullable=True),
    sa.Column('weight_kg', sa.Numeric(precision=5, scale=1, asdecimal=False), nullable=True),
    sa.Column('notes', sa.Text(), nullable=True),
    sa.Column('recorded_at', sa.DateTime(timezone=True), nullable=True),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.Column('is_demo', sa.Boolean(), nullable=False),
    sa.ForeignKeyConstraint(['branch_id'], ['branches.id'], ),
    sa.ForeignKeyConstraint(['journey_id'], ['journeys.id'], ondelete='CASCADE'),
    sa.ForeignKeyConstraint(['member_id'], ['members.id'], ondelete='CASCADE'),
    sa.ForeignKeyConstraint(['trainer_id'], ['trainers.id'], ),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_assessments_branch_id'), 'assessments', ['branch_id'], unique=False)
    op.create_index(op.f('ix_assessments_journey_id'), 'assessments', ['journey_id'], unique=False)
    op.create_index(op.f('ix_assessments_member_id'), 'assessments', ['member_id'], unique=False)
    op.create_table('attendance_corrections',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('trainer_attendance_id', sa.Integer(), nullable=False),
    sa.Column('trainer_id', sa.Integer(), nullable=False),
    sa.Column('branch_id', sa.Integer(), nullable=False),
    sa.Column('work_date', sa.Date(), nullable=False),
    sa.Column('correction_type', sa.Enum('MISSING_CHECKOUT', 'LATE_REASON', 'EARLY_EXIT_REASON', 'WRONG_CHECK_IN', 'SHIFT_CORRECTION', name='correction_type'), nullable=False),
    sa.Column('status', sa.Enum('PENDING', 'APPROVED', 'REJECTED', 'WITHDRAWN', name='correction_status'), nullable=False),
    sa.Column('reason', sa.Text(), nullable=False),
    sa.Column('requested_check_in_at', sa.DateTime(timezone=True), nullable=True),
    sa.Column('requested_check_out_at', sa.DateTime(timezone=True), nullable=True),
    sa.Column('original_check_in_at', sa.DateTime(timezone=True), nullable=True),
    sa.Column('original_check_out_at', sa.DateTime(timezone=True), nullable=True),
    sa.Column('original_status', postgresql.ENUM('SCHEDULED', 'ON_TIME', 'LATE', 'EARLY_EXIT', 'LATE_AND_EARLY_EXIT',
                    'ABSENT', 'MISSING_CHECKOUT', 'COMPLETED', name='attendance_status',
                    create_type=False), nullable=True),
    sa.Column('new_status', postgresql.ENUM('SCHEDULED', 'ON_TIME', 'LATE', 'EARLY_EXIT', 'LATE_AND_EARLY_EXIT',
                    'ABSENT', 'MISSING_CHECKOUT', 'COMPLETED', name='attendance_status',
                    create_type=False), nullable=True),
    sa.Column('requested_by_user_id', sa.Integer(), nullable=False),
    sa.Column('reviewed_by_user_id', sa.Integer(), nullable=True),
    sa.Column('review_note', sa.Text(), nullable=True),
    sa.Column('reviewed_at', sa.DateTime(timezone=True), nullable=True),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.ForeignKeyConstraint(['branch_id'], ['branches.id'], ),
    sa.ForeignKeyConstraint(['requested_by_user_id'], ['users.id'], ),
    sa.ForeignKeyConstraint(['reviewed_by_user_id'], ['users.id'], ),
    sa.ForeignKeyConstraint(['trainer_attendance_id'], ['trainer_attendance.id'], ondelete='CASCADE'),
    sa.ForeignKeyConstraint(['trainer_id'], ['trainers.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_attendance_corrections_branch_id'), 'attendance_corrections', ['branch_id'], unique=False)
    op.create_index(op.f('ix_attendance_corrections_status'), 'attendance_corrections', ['status'], unique=False)
    op.create_index(op.f('ix_attendance_corrections_trainer_attendance_id'), 'attendance_corrections', ['trainer_attendance_id'], unique=False)
    op.create_index(op.f('ix_attendance_corrections_trainer_id'), 'attendance_corrections', ['trainer_id'], unique=False)
    op.create_index(op.f('ix_attendance_corrections_work_date'), 'attendance_corrections', ['work_date'], unique=False)
    op.create_table('cardio_sessions',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('journey_id', sa.Integer(), nullable=False),
    sa.Column('member_id', sa.Integer(), nullable=False),
    sa.Column('branch_id', sa.Integer(), nullable=False),
    sa.Column('day_number', sa.Integer(), nullable=False),
    sa.Column('duration_minutes', sa.Integer(), nullable=False),
    sa.Column('machine', sa.String(length=80), nullable=True),
    sa.Column('notes', sa.Text(), nullable=True),
    sa.Column('recorded_by_user_id', sa.Integer(), nullable=True),
    sa.Column('completed_at', sa.DateTime(timezone=True), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.Column('is_demo', sa.Boolean(), nullable=False),
    sa.ForeignKeyConstraint(['branch_id'], ['branches.id'], ),
    sa.ForeignKeyConstraint(['journey_id'], ['journeys.id'], ondelete='CASCADE'),
    sa.ForeignKeyConstraint(['member_id'], ['members.id'], ondelete='CASCADE'),
    sa.ForeignKeyConstraint(['recorded_by_user_id'], ['users.id'], ),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('journey_id', 'day_number', name='uq_cardio_journey_day')
    )
    op.create_index(op.f('ix_cardio_sessions_branch_id'), 'cardio_sessions', ['branch_id'], unique=False)
    op.create_index(op.f('ix_cardio_sessions_journey_id'), 'cardio_sessions', ['journey_id'], unique=False)
    op.create_index(op.f('ix_cardio_sessions_member_id'), 'cardio_sessions', ['member_id'], unique=False)
    op.create_table('journey_days',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('journey_id', sa.Integer(), nullable=False),
    sa.Column('day_number', sa.Integer(), nullable=False),
    sa.Column('planned_on', sa.Date(), nullable=False),
    sa.Column('split', sa.Enum('ASSESSMENT', 'CARDIO', 'PUSH', 'PULL', 'LEGS', 'REST', name='workout_split'), nullable=False),
    sa.Column('status', sa.Enum('PENDING', 'IN_PROGRESS', 'COMPLETED', 'MISSED', name='day_status'), nullable=False),
    sa.Column('completed_at', sa.DateTime(timezone=True), nullable=True),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.ForeignKeyConstraint(['journey_id'], ['journeys.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('journey_id', 'day_number', name='uq_journey_day')
    )
    op.create_index(op.f('ix_journey_days_journey_id'), 'journey_days', ['journey_id'], unique=False)
    op.create_index(op.f('ix_journey_days_planned_on'), 'journey_days', ['planned_on'], unique=False)
    op.create_table('pt_packages',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('member_id', sa.Integer(), nullable=False),
    sa.Column('branch_id', sa.Integer(), nullable=False),
    sa.Column('trainer_id', sa.Integer(), nullable=True),
    sa.Column('journey_id', sa.Integer(), nullable=True),
    sa.Column('sessions_total', sa.Integer(), nullable=False),
    sa.Column('sessions_used', sa.Integer(), nullable=False),
    sa.Column('status', sa.Enum('ACTIVE', 'COMPLETED', 'EXPIRED', 'CANCELLED', name='package_status'), nullable=False),
    sa.Column('start_date', sa.Date(), nullable=False),
    sa.Column('expiry_date', sa.Date(), nullable=True),
    sa.Column('price_amount', sa.Numeric(precision=10, scale=2, asdecimal=False), nullable=True),
    sa.Column('currency', sa.String(length=8), nullable=True),
    sa.Column('origin', sa.String(length=32), nullable=False),
    sa.Column('created_by_user_id', sa.Integer(), nullable=True),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.Column('is_demo', sa.Boolean(), nullable=False),
    sa.ForeignKeyConstraint(['branch_id'], ['branches.id'], ),
    sa.ForeignKeyConstraint(['created_by_user_id'], ['users.id'], ),
    sa.ForeignKeyConstraint(['journey_id'], ['journeys.id'], ),
    sa.ForeignKeyConstraint(['member_id'], ['members.id'], ondelete='CASCADE'),
    sa.ForeignKeyConstraint(['trainer_id'], ['trainers.id'], ),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_pt_packages_branch_id'), 'pt_packages', ['branch_id'], unique=False)
    op.create_index(op.f('ix_pt_packages_journey_id'), 'pt_packages', ['journey_id'], unique=False)
    op.create_index(op.f('ix_pt_packages_member_id'), 'pt_packages', ['member_id'], unique=False)
    op.create_index(op.f('ix_pt_packages_trainer_id'), 'pt_packages', ['trainer_id'], unique=False)
    op.create_table('workout_plans',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('member_id', sa.Integer(), nullable=True),
    sa.Column('journey_id', sa.Integer(), nullable=True),
    sa.Column('branch_id', sa.Integer(), nullable=True),
    sa.Column('name', sa.String(length=120), nullable=False),
    sa.Column('is_template', sa.Boolean(), nullable=False),
    sa.Column('is_active', sa.Boolean(), nullable=False),
    sa.Column('created_by_user_id', sa.Integer(), nullable=True),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.Column('is_demo', sa.Boolean(), nullable=False),
    sa.ForeignKeyConstraint(['branch_id'], ['branches.id'], ),
    sa.ForeignKeyConstraint(['created_by_user_id'], ['users.id'], ),
    sa.ForeignKeyConstraint(['journey_id'], ['journeys.id'], ondelete='CASCADE'),
    sa.ForeignKeyConstraint(['member_id'], ['members.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_workout_plans_branch_id'), 'workout_plans', ['branch_id'], unique=False)
    op.create_index(op.f('ix_workout_plans_journey_id'), 'workout_plans', ['journey_id'], unique=False)
    op.create_index(op.f('ix_workout_plans_member_id'), 'workout_plans', ['member_id'], unique=False)
    op.create_table('pt_sessions',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('package_id', sa.Integer(), nullable=False),
    sa.Column('member_id', sa.Integer(), nullable=False),
    sa.Column('trainer_id', sa.Integer(), nullable=False),
    sa.Column('branch_id', sa.Integer(), nullable=False),
    sa.Column('session_date', sa.Date(), nullable=False),
    sa.Column('scheduled_start', sa.DateTime(timezone=True), nullable=False),
    sa.Column('scheduled_end', sa.DateTime(timezone=True), nullable=True),
    sa.Column('session_number', sa.Integer(), nullable=False),
    sa.Column('status', sa.Enum('SCHEDULED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED', 'MISSED', 'NO_SHOW', name='session_status'), nullable=False),
    sa.Column('member_checked_in_at', sa.DateTime(timezone=True), nullable=True),
    sa.Column('trainer_checked_in_at', sa.DateTime(timezone=True), nullable=True),
    sa.Column('started_at', sa.DateTime(timezone=True), nullable=True),
    sa.Column('completed_at', sa.DateTime(timezone=True), nullable=True),
    sa.Column('completed_by_user_id', sa.Integer(), nullable=True),
    sa.Column('notes', sa.Text(), nullable=True),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.Column('is_demo', sa.Boolean(), nullable=False),
    sa.ForeignKeyConstraint(['branch_id'], ['branches.id'], ),
    sa.ForeignKeyConstraint(['completed_by_user_id'], ['users.id'], ),
    sa.ForeignKeyConstraint(['member_id'], ['members.id'], ondelete='CASCADE'),
    sa.ForeignKeyConstraint(['package_id'], ['pt_packages.id'], ondelete='CASCADE'),
    sa.ForeignKeyConstraint(['trainer_id'], ['trainers.id'], ),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index('ix_pt_sessions_branch_date', 'pt_sessions', ['branch_id', 'session_date'], unique=False)
    op.create_index(op.f('ix_pt_sessions_branch_id'), 'pt_sessions', ['branch_id'], unique=False)
    op.create_index(op.f('ix_pt_sessions_member_id'), 'pt_sessions', ['member_id'], unique=False)
    op.create_index(op.f('ix_pt_sessions_package_id'), 'pt_sessions', ['package_id'], unique=False)
    op.create_index(op.f('ix_pt_sessions_session_date'), 'pt_sessions', ['session_date'], unique=False)
    op.create_index('ix_pt_sessions_trainer_date', 'pt_sessions', ['trainer_id', 'session_date'], unique=False)
    op.create_index(op.f('ix_pt_sessions_trainer_id'), 'pt_sessions', ['trainer_id'], unique=False)
    op.create_table('workout_plan_items',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('plan_id', sa.Integer(), nullable=False),
    sa.Column('split', sa.Enum('ASSESSMENT', 'CARDIO', 'PUSH', 'PULL', 'LEGS', 'REST', name='workout_split'), nullable=False),
    sa.Column('order_index', sa.Integer(), nullable=False),
    sa.Column('exercise', sa.String(length=120), nullable=False),
    sa.Column('sets', sa.Integer(), nullable=False),
    sa.Column('reps', sa.String(length=32), nullable=False),
    sa.Column('rest_seconds', sa.Integer(), nullable=False),
    sa.Column('notes', sa.String(length=160), nullable=True),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.ForeignKeyConstraint(['plan_id'], ['workout_plans.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index('ix_plan_items_plan_split', 'workout_plan_items', ['plan_id', 'split'], unique=False)
    op.create_index(op.f('ix_workout_plan_items_plan_id'), 'workout_plan_items', ['plan_id'], unique=False)
    op.create_table('workout_sessions',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('member_id', sa.Integer(), nullable=False),
    sa.Column('branch_id', sa.Integer(), nullable=False),
    sa.Column('journey_id', sa.Integer(), nullable=True),
    sa.Column('journey_day_id', sa.Integer(), nullable=True),
    sa.Column('day_number', sa.Integer(), nullable=True),
    sa.Column('split', sa.Enum('ASSESSMENT', 'CARDIO', 'PUSH', 'PULL', 'LEGS', 'REST', name='workout_split'), nullable=False),
    sa.Column('session_date', sa.Date(), nullable=False),
    sa.Column('status', sa.Enum('SCHEDULED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED', 'MISSED', 'NO_SHOW', name='session_status'), nullable=False),
    sa.Column('supervising_trainer_id', sa.Integer(), nullable=True),
    sa.Column('started_at', sa.DateTime(timezone=True), nullable=True),
    sa.Column('completed_at', sa.DateTime(timezone=True), nullable=True),
    sa.Column('notes', sa.Text(), nullable=True),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.Column('is_demo', sa.Boolean(), nullable=False),
    sa.ForeignKeyConstraint(['branch_id'], ['branches.id'], ),
    sa.ForeignKeyConstraint(['journey_day_id'], ['journey_days.id'], ondelete='SET NULL'),
    sa.ForeignKeyConstraint(['journey_id'], ['journeys.id'], ondelete='CASCADE'),
    sa.ForeignKeyConstraint(['member_id'], ['members.id'], ondelete='CASCADE'),
    sa.ForeignKeyConstraint(['supervising_trainer_id'], ['trainers.id'], ),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_workout_sessions_branch_id'), 'workout_sessions', ['branch_id'], unique=False)
    op.create_index(op.f('ix_workout_sessions_journey_id'), 'workout_sessions', ['journey_id'], unique=False)
    op.create_index('ix_workout_sessions_member_date', 'workout_sessions', ['member_id', 'session_date'], unique=False)
    op.create_index(op.f('ix_workout_sessions_member_id'), 'workout_sessions', ['member_id'], unique=False)
    op.create_index(op.f('ix_workout_sessions_session_date'), 'workout_sessions', ['session_date'], unique=False)
    op.create_index(op.f('ix_workout_sessions_supervising_trainer_id'), 'workout_sessions', ['supervising_trainer_id'], unique=False)
    op.create_table('workout_session_items',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('session_id', sa.Integer(), nullable=False),
    sa.Column('plan_item_id', sa.Integer(), nullable=True),
    sa.Column('order_index', sa.Integer(), nullable=False),
    sa.Column('exercise', sa.String(length=120), nullable=False),
    sa.Column('sets', sa.Integer(), nullable=False),
    sa.Column('reps', sa.String(length=32), nullable=False),
    sa.Column('rest_seconds', sa.Integer(), nullable=False),
    sa.Column('status', sa.Enum('PENDING', 'COMPLETED', 'SKIPPED', name='item_status'), nullable=False),
    sa.Column('completed_at', sa.DateTime(timezone=True), nullable=True),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.ForeignKeyConstraint(['plan_item_id'], ['workout_plan_items.id'], ondelete='SET NULL'),
    sa.ForeignKeyConstraint(['session_id'], ['workout_sessions.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_workout_session_items_session_id'), 'workout_session_items', ['session_id'], unique=False)
    op.add_column('members', sa.Column('marketing_source_id', sa.Integer(), nullable=True))
    op.add_column('members', sa.Column('campaign_id', sa.Integer(), nullable=True))
    op.add_column('members', sa.Column('registered_on', sa.Date(), nullable=True))
    op.create_index(op.f('ix_members_campaign_id'), 'members', ['campaign_id'], unique=False)
    op.create_index(op.f('ix_members_marketing_source_id'), 'members', ['marketing_source_id'], unique=False)
    op.create_index(op.f('ix_members_registered_on'), 'members', ['registered_on'], unique=False)
    op.create_foreign_key(None, 'members', 'marketing_sources', ['marketing_source_id'], ['id'])
    op.create_foreign_key(None, 'members', 'campaigns', ['campaign_id'], ['id'])


def downgrade() -> None:
    # Autogenerate leaves these unnamed, which cannot be dropped. Postgres
    # names an inline foreign key <table>_<column>_fkey, so name them here.
    op.drop_constraint('members_marketing_source_id_fkey', 'members', type_='foreignkey')
    op.drop_constraint('members_campaign_id_fkey', 'members', type_='foreignkey')
    op.drop_index(op.f('ix_members_registered_on'), table_name='members')
    op.drop_index(op.f('ix_members_marketing_source_id'), table_name='members')
    op.drop_index(op.f('ix_members_campaign_id'), table_name='members')
    op.drop_column('members', 'registered_on')
    op.drop_column('members', 'campaign_id')
    op.drop_column('members', 'marketing_source_id')
    op.drop_index(op.f('ix_workout_session_items_session_id'), table_name='workout_session_items')
    op.drop_table('workout_session_items')
    op.drop_index(op.f('ix_workout_sessions_supervising_trainer_id'), table_name='workout_sessions')
    op.drop_index(op.f('ix_workout_sessions_session_date'), table_name='workout_sessions')
    op.drop_index(op.f('ix_workout_sessions_member_id'), table_name='workout_sessions')
    op.drop_index('ix_workout_sessions_member_date', table_name='workout_sessions')
    op.drop_index(op.f('ix_workout_sessions_journey_id'), table_name='workout_sessions')
    op.drop_index(op.f('ix_workout_sessions_branch_id'), table_name='workout_sessions')
    op.drop_table('workout_sessions')
    op.drop_index(op.f('ix_workout_plan_items_plan_id'), table_name='workout_plan_items')
    op.drop_index('ix_plan_items_plan_split', table_name='workout_plan_items')
    op.drop_table('workout_plan_items')
    op.drop_index(op.f('ix_pt_sessions_trainer_id'), table_name='pt_sessions')
    op.drop_index('ix_pt_sessions_trainer_date', table_name='pt_sessions')
    op.drop_index(op.f('ix_pt_sessions_session_date'), table_name='pt_sessions')
    op.drop_index(op.f('ix_pt_sessions_package_id'), table_name='pt_sessions')
    op.drop_index(op.f('ix_pt_sessions_member_id'), table_name='pt_sessions')
    op.drop_index(op.f('ix_pt_sessions_branch_id'), table_name='pt_sessions')
    op.drop_index('ix_pt_sessions_branch_date', table_name='pt_sessions')
    op.drop_table('pt_sessions')
    op.drop_index(op.f('ix_workout_plans_member_id'), table_name='workout_plans')
    op.drop_index(op.f('ix_workout_plans_journey_id'), table_name='workout_plans')
    op.drop_index(op.f('ix_workout_plans_branch_id'), table_name='workout_plans')
    op.drop_table('workout_plans')
    op.drop_index(op.f('ix_pt_packages_trainer_id'), table_name='pt_packages')
    op.drop_index(op.f('ix_pt_packages_member_id'), table_name='pt_packages')
    op.drop_index(op.f('ix_pt_packages_journey_id'), table_name='pt_packages')
    op.drop_index(op.f('ix_pt_packages_branch_id'), table_name='pt_packages')
    op.drop_table('pt_packages')
    op.drop_index(op.f('ix_journey_days_planned_on'), table_name='journey_days')
    op.drop_index(op.f('ix_journey_days_journey_id'), table_name='journey_days')
    op.drop_table('journey_days')
    op.drop_index(op.f('ix_cardio_sessions_member_id'), table_name='cardio_sessions')
    op.drop_index(op.f('ix_cardio_sessions_journey_id'), table_name='cardio_sessions')
    op.drop_index(op.f('ix_cardio_sessions_branch_id'), table_name='cardio_sessions')
    op.drop_table('cardio_sessions')
    op.drop_index(op.f('ix_attendance_corrections_work_date'), table_name='attendance_corrections')
    op.drop_index(op.f('ix_attendance_corrections_trainer_id'), table_name='attendance_corrections')
    op.drop_index(op.f('ix_attendance_corrections_trainer_attendance_id'), table_name='attendance_corrections')
    op.drop_index(op.f('ix_attendance_corrections_status'), table_name='attendance_corrections')
    op.drop_index(op.f('ix_attendance_corrections_branch_id'), table_name='attendance_corrections')
    op.drop_table('attendance_corrections')
    op.drop_index(op.f('ix_assessments_member_id'), table_name='assessments')
    op.drop_index(op.f('ix_assessments_journey_id'), table_name='assessments')
    op.drop_index(op.f('ix_assessments_branch_id'), table_name='assessments')
    op.drop_table('assessments')
    op.drop_index(op.f('ix_tasks_status'), table_name='tasks')
    op.drop_index(op.f('ix_tasks_branch_id'), table_name='tasks')
    op.drop_table('tasks')
    op.drop_index(op.f('ix_referrals_referrer_member_id'), table_name='referrals')
    op.drop_index(op.f('ix_referrals_referred_member_id'), table_name='referrals')
    op.drop_index(op.f('ix_referrals_branch_id'), table_name='referrals')
    op.drop_table('referrals')
    op.drop_index(op.f('ix_journeys_member_id'), table_name='journeys')
    op.drop_index('ix_journeys_branch_status', table_name='journeys')
    op.drop_index(op.f('ix_journeys_branch_id'), table_name='journeys')
    op.drop_table('journeys')
    op.drop_index(op.f('ix_group_class_rsvps_member_id'), table_name='group_class_rsvps')
    op.drop_index(op.f('ix_group_class_rsvps_class_id'), table_name='group_class_rsvps')
    op.drop_table('group_class_rsvps')
    op.drop_index(op.f('ix_group_class_attendance_member_id'), table_name='group_class_attendance')
    op.drop_index(op.f('ix_group_class_attendance_class_id'), table_name='group_class_attendance')
    op.drop_index(op.f('ix_group_class_attendance_branch_id'), table_name='group_class_attendance')
    op.drop_table('group_class_attendance')
    op.drop_index(op.f('ix_body_compositions_member_id'), table_name='body_compositions')
    op.drop_index(op.f('ix_body_compositions_external_ref'), table_name='body_compositions')
    op.drop_index(op.f('ix_body_compositions_branch_id'), table_name='body_compositions')
    op.drop_table('body_compositions')
    op.drop_index(op.f('ix_group_classes_trainer_id'), table_name='group_classes')
    op.drop_index(op.f('ix_group_classes_starts_at'), table_name='group_classes')
    op.drop_index(op.f('ix_group_classes_class_date'), table_name='group_classes')
    op.drop_index(op.f('ix_group_classes_branch_id'), table_name='group_classes')
    op.drop_table('group_classes')
    op.drop_index(op.f('ix_alerts_target_user_id'), table_name='alerts')
    op.drop_index(op.f('ix_alerts_target_role'), table_name='alerts')
    op.drop_index(op.f('ix_alerts_status'), table_name='alerts')
    op.drop_index(op.f('ix_alerts_key'), table_name='alerts')
    op.drop_index('ix_alerts_branch_status', table_name='alerts')
    op.drop_index(op.f('ix_alerts_branch_id'), table_name='alerts')
    op.drop_table('alerts')
    op.drop_index(op.f('ix_campaigns_branch_id'), table_name='campaigns')
    op.drop_table('campaigns')
    op.drop_table('marketing_sources')

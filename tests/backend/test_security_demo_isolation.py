"""`wipe_demo` must delete demo rows and *only* demo rows.

The documented cutover is "stop seeding, run the cleanup, confirm only real
data remains" — i.e. it runs against a database that holds both. A `wipe_demo`
with an unscoped ``delete(Model)`` would take real members' journeys, workouts,
PT packages, body compositions, corrections, incentive results, classes,
alerts and tasks with it. These tests hold that line.
"""

from __future__ import annotations

from datetime import UTC, date, datetime

from sqlalchemy import func, select

from app.core.security import hash_password
from app.db.models import (
    Alert,
    BodyComposition,
    GroupClass,
    Journey,
    JourneyStatus,
    Member,
    Membership,
    MembershipStatus,
    PTPackage,
    Role,
    Setting,
    Task,
    Trainer,
    TrainerAttendance,
    User,
)
from app.seed import wipe_demo


def _count(db, model, **eq):
    stmt = select(func.count()).select_from(model)
    for k, v in eq.items():
        stmt = stmt.where(getattr(model, k) == v)
    return db.scalar(stmt)


def _make_real_world(db):
    """A non-demo branch with one real trainer + member and a row in every
    table wipe_demo touches unscoped."""
    from conftest import make_branch, make_roles

    roles: dict[str, Role] = make_roles(db)

    real_branch = make_branch(db, "REAL-GYM", "Front Desk Signups")
    real_branch.is_demo = False
    db.flush()

    ru = User(
        email="real.trainer@frontdesk.example",
        full_name="Real Trainer",
        password_hash=hash_password("x"),
        role_id=roles["trainer"].id,
        branch_id=real_branch.id,
        is_demo=False,
    )
    db.add(ru)
    db.flush()
    rt = Trainer(
        user_id=ru.id,
        branch_id=real_branch.id,
        employee_code="REAL-T1",
        designation="Trainer",
        joined_on=date(2025, 1, 1),
        is_demo=False,
    )
    db.add(rt)
    db.flush()

    mu = User(
        email="real.member@frontdesk.example",
        full_name="Real Member",
        password_hash=hash_password("x"),
        role_id=roles["member"].id,
        branch_id=real_branch.id,
        is_demo=False,
    )
    db.add(mu)
    db.flush()
    rm = Member(
        user_id=mu.id,
        branch_id=real_branch.id,
        member_code="REAL-M1",
        joined_on=date(2025, 1, 1),
        is_demo=False,
    )
    db.add(rm)
    db.flush()
    db.add(
        Membership(
            member_id=rm.id,
            branch_id=real_branch.id,
            plan_name="Annual",
            status=MembershipStatus.ACTIVE,
            starts_on=date(2026, 1, 1),
            ends_on=date(2026, 12, 31),
            is_demo=False,
        )
    )

    j = Journey(
        member_id=rm.id,
        branch_id=real_branch.id,
        journey_type="general_training",
        status=JourneyStatus.ACTIVE,
        start_date=date(2026, 8, 1),
        end_date=date(2026, 9, 14),
        duration_days=45,
        assessment_days=3,
        is_demo=False,
    )
    db.add(j)
    db.add(
        BodyComposition(
            member_id=rm.id,
            branch_id=real_branch.id,
            measured_at=datetime(2026, 8, 1, tzinfo=UTC),
            source="inbody",
            external_ref="REAL-LB-1",
            weight_kg=80.0,
        )
    )
    db.add(
        PTPackage(
            member_id=rm.id,
            branch_id=real_branch.id,
            sessions_total=20,
            sessions_used=0,
            start_date=date(2026, 8, 1),
            is_demo=False,
        )
    )
    db.add(
        TrainerAttendance(
            trainer_id=rt.id,
            branch_id=real_branch.id,
            work_date=date(2026, 8, 12),
        )
    )
    db.add(
        GroupClass(
            branch_id=real_branch.id,
            name="Real Spin",
            starts_at=datetime(2026, 8, 20, 7, tzinfo=UTC),
            ends_at=datetime(2026, 8, 20, 8, tzinfo=UTC),
            class_date=date(2026, 8, 20),
            capacity=10,
            is_demo=False,
        )
    )
    db.add(
        Alert(
            branch_id=real_branch.id,
            key="real.alert",
            title="Real",
            body="real",
            dedupe_key="real.alert:REAL-GYM",
        )
    )
    db.add(
        Task(
            branch_id=real_branch.id,
            key="real.task",
            title="Real task",
            dedupe_key="real.task:REAL-GYM",
        )
    )
    db.add(Setting(branch_id=real_branch.id, key="shift.grace_minutes", value={"value": 7}))
    db.commit()
    return real_branch, rt, rm


def test_wipe_demo_removes_demo_rows(db, world):
    assert _count(db, Member, is_demo=True) > 0
    assert _count(db, Journey) >= 0
    wipe_demo(db)
    db.expire_all()
    assert _count(db, Member, is_demo=True) == 0
    assert _count(db, Trainer, is_demo=True) == 0
    assert _count(db, User, is_demo=True) == 0


def test_wipe_demo_never_touches_real_rows(db, world):
    """The whole point: run against a DB with demo *and* real rows."""
    real_branch, rt, rm = _make_real_world(db)

    wipe_demo(db)
    db.expire_all()

    # Every demo member is gone…
    assert _count(db, Member, is_demo=True) == 0
    # …and every real row is exactly where it was.
    assert _count(db, Member, id=rm.id) == 1
    assert _count(db, Trainer, id=rt.id) == 1
    assert _count(db, Journey, member_id=rm.id) == 1
    assert _count(db, BodyComposition, member_id=rm.id) == 1
    assert _count(db, PTPackage, member_id=rm.id) == 1
    assert _count(db, TrainerAttendance, trainer_id=rt.id) == 1
    assert _count(db, GroupClass, branch_id=real_branch.id) == 1
    assert _count(db, Alert, branch_id=real_branch.id) == 1
    assert _count(db, Task, branch_id=real_branch.id) == 1
    assert _count(db, Setting, branch_id=real_branch.id) == 1
    assert _count(db, Membership, member_id=rm.id) == 1

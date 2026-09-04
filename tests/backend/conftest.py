"""Test fixtures.

The suite runs against a real PostgreSQL database so the enum types, JSONB
columns and unique constraints behave exactly as they will in production. If no
Postgres is reachable it falls back to SQLite, which keeps the domain and
permission tests runnable anywhere.
"""

from __future__ import annotations

import os
import sys
import uuid
from datetime import date, time, timedelta
from pathlib import Path

import pytest

# Locate the application from this file rather than from the working directory.
# pytest's `pythonpath` setting resolves against its rootdir, which moves
# depending on where the suite is invoked from — and `python -m pytest` happens
# to add the cwd while a bare `pytest` does not, so a cwd-relative path passes
# locally and fails in CI.
BACKEND = Path(__file__).resolve().parents[2] / "backend"
if str(BACKEND) not in sys.path:
    sys.path.insert(0, str(BACKEND))

# Environment must be set before any app module reads settings.
DEFAULT_TEST_DB = "postgresql+psycopg://gymflow:gymflow@localhost:5432/gymflow_test"
os.environ.setdefault("DATABASE_URL", os.getenv("TEST_DATABASE_URL", DEFAULT_TEST_DB))
os.environ.setdefault("SECRET_KEY", "test-secret-key-not-used-anywhere-real-0123456789")
os.environ.setdefault("ENVIRONMENT", "test")
os.environ.setdefault("RATE_LIMIT_ENABLED", "false")
os.environ.setdefault("SEED_DEMO_DATA", "false")
# Password hashing is deliberately slow; four rounds keeps the suite quick
# while still exercising the real bcrypt code path.
os.environ.setdefault("BCRYPT_ROUNDS", "4")


def _reachable(url: str) -> bool:
    from sqlalchemy import create_engine, text

    try:
        engine = create_engine(url)
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
        engine.dispose()
        return True
    except Exception:
        return False


USING_SQLITE_FALLBACK = False

if not os.environ["DATABASE_URL"].startswith("sqlite") and not _reachable(
    os.environ["DATABASE_URL"]
):
    # Say so loudly. SQLite returns naive datetimes from timezone-aware columns,
    # so a handful of attendance assertions fail in ways that look like product
    # bugs rather than "Postgres is not running".
    USING_SQLITE_FALLBACK = True
    print(
        "\n"
        "  ┌─────────────────────────────────────────────────────────────────┐\n"
        "  │  Postgres is unreachable — falling back to in-memory SQLite.    │\n"
        "  │  Timezone-dependent attendance tests WILL fail on SQLite.       │\n"
        "  │  Start Postgres and re-run for a meaningful result.             │\n"
        "  └─────────────────────────────────────────────────────────────────┘\n",
        flush=True,
    )
    os.environ["DATABASE_URL"] = "sqlite+pysqlite:///:memory:"

from fastapi.testclient import TestClient  # noqa: E402
from sqlalchemy import select  # noqa: E402
from sqlalchemy.orm import Session  # noqa: E402

from app.core import clock  # noqa: E402
from app.core.rate_limit import limiter  # noqa: E402
from app.core.security import hash_password, hash_pin, new_token_secret  # noqa: E402
from app.db.base import Base  # noqa: E402
from app.db.models import (  # noqa: E402
    Branch,
    IncentiveRule,
    Member,
    Membership,
    MembershipStatus,
    Role,
    RoleKey,
    Setting,
    Shift,
    Trainer,
    User,
)
from app.db.session import SessionLocal, engine  # noqa: E402
from app.main import app  # noqa: E402
from app.services import settings_service  # noqa: E402

PASSWORD = "TestPassw0rd!"
PIN = "135790"


@pytest.fixture(scope="session", autouse=True)
def _schema():
    Base.metadata.drop_all(engine)
    Base.metadata.create_all(engine)
    yield
    Base.metadata.drop_all(engine)


@pytest.fixture(autouse=True)
def _clean(_schema):
    """Empty every table between tests so no test depends on another's rows."""
    with SessionLocal() as db:
        for table in reversed(Base.metadata.sorted_tables):
            db.execute(table.delete())
        db.commit()
    limiter.reset()
    clock.freeze(None)
    from app.services.intelligence import _cache as _intel_cache

    _intel_cache.clear()
    yield
    clock.freeze(None)


@pytest.fixture
def db() -> Session:
    with SessionLocal() as session:
        yield session


@pytest.fixture
def client() -> TestClient:
    return TestClient(app)


# --------------------------------------------------------------- factories


def make_roles(db: Session) -> dict[str, Role]:
    out = {}
    for key in RoleKey:
        role = db.scalar(select(Role).where(Role.key == key.value))
        if role is None:
            role = Role(key=key.value, name=key.value.replace("_", " ").title())
            db.add(role)
        out[key.value] = role
    db.flush()
    return out


def make_branch(db: Session, code: str, name: str, capacity: int = 100) -> Branch:
    branch = Branch(
        code=code,
        name=name,
        city="Chennai",
        timezone="Asia/Kolkata",
        capacity=capacity,
        qr_secret=new_token_secret(32),
        is_demo=True,
    )
    db.add(branch)
    db.flush()
    return branch


def make_user(
    db: Session,
    roles: dict[str, Role],
    role_key: RoleKey,
    branch: Branch | None,
    name: str | None = None,
    with_pin: bool = False,
) -> User:
    user = User(
        email=f"{(name or role_key.value).lower().replace(' ', '.')}.{uuid.uuid4().hex[:6]}@gymflow.demo",
        full_name=name or role_key.value.title(),
        password_hash=hash_password(PASSWORD),
        pin_hash=hash_pin(PIN) if with_pin else None,
        role_id=roles[role_key.value].id,
        branch_id=branch.id if branch else None,
        is_demo=True,
    )
    db.add(user)
    db.flush()
    return user


def make_trainer(
    db: Session,
    roles: dict[str, Role],
    branch: Branch,
    name: str,
    start: time = time(18, 0),
    end: time = time(21, 0),
    weekdays: range | list[int] = range(7),
) -> tuple[Trainer, User]:
    user = make_user(db, roles, RoleKey.TRAINER, branch, name=name, with_pin=True)
    trainer = Trainer(
        user_id=user.id,
        branch_id=branch.id,
        employee_code=f"{branch.code}-{uuid.uuid4().hex[:6]}",
        designation="Trainer",
        joined_on=date(2025, 1, 1),
        is_demo=True,
    )
    db.add(trainer)
    db.flush()
    for weekday in weekdays:
        db.add(
            Shift(
                trainer_id=trainer.id,
                branch_id=branch.id,
                weekday=weekday,
                start_time=start,
                end_time=end,
                is_active=True,
                is_demo=True,
            )
        )
    db.flush()
    return trainer, user


def make_member(
    db: Session, roles: dict[str, Role], branch: Branch, name: str, trainer: Trainer | None = None
) -> tuple[Member, User]:
    user = make_user(db, roles, RoleKey.MEMBER, branch, name=name)
    member = Member(
        user_id=user.id,
        branch_id=branch.id,
        member_code=f"{branch.code}-M{uuid.uuid4().hex[:6]}",
        assigned_trainer_id=trainer.id if trainer else None,
        joined_on=date(2025, 1, 1),
        is_demo=True,
    )
    db.add(member)
    db.flush()
    today = date.today()
    db.add(
        Membership(
            member_id=member.id,
            branch_id=branch.id,
            plan_name="Annual",
            status=MembershipStatus.ACTIVE,
            starts_on=today - timedelta(days=30),
            ends_on=today + timedelta(days=200),
            is_demo=True,
        )
    )
    db.flush()
    return member, user


def make_settings(db: Session) -> None:
    for key, value in settings_service.DEFAULTS.items():
        db.add(Setting(key=key, branch_id=None, value={"value": value}))
    db.add(
        IncentiveRule(
            branch_id=None,
            name="Test default",
            min_punctuality_pct=90,
            min_attendance_pct=95,
            max_late_count=2,
            max_early_exit_count=1,
            max_missing_checkout_count=2,
            review_band_pct=5,
            is_demo=True,
        )
    )
    db.flush()


@pytest.fixture
def world(db: Session) -> dict:
    """A three-branch SLAM with one trainer and one member per branch."""
    roles = make_roles(db)
    make_settings(db)

    nagalkeni = make_branch(db, "SLAM-NGK", "SLAM Nagalkeni", 90)
    boganhalli = make_branch(db, "SLAM-BGH", "SLAM Boganhalli", 120)
    alandur = make_branch(db, "SLAM-ALD", "SLAM Alandur", 75)

    owner = make_user(db, roles, RoleKey.OWNER, None, name="Owner")
    admin = make_user(db, roles, RoleKey.SUPER_ADMIN, None, name="Admin")
    manager_ngk = make_user(db, roles, RoleKey.BRANCH_MANAGER, nagalkeni, name="Manager NGK")
    manager_bgh = make_user(db, roles, RoleKey.BRANCH_MANAGER, boganhalli, name="Manager BGH")

    trainer_ngk, trainer_ngk_user = make_trainer(db, roles, nagalkeni, "Vikas Menon")
    trainer_bgh, trainer_bgh_user = make_trainer(db, roles, boganhalli, "Sneha Iyer")

    member_ngk, member_ngk_user = make_member(db, roles, nagalkeni, "Aditya Rao", trainer_ngk)

    db.commit()
    return {
        "roles": roles,
        "branches": {"ngk": nagalkeni, "bgh": boganhalli, "ald": alandur},
        "owner": owner,
        "admin": admin,
        "manager_ngk": manager_ngk,
        "manager_bgh": manager_bgh,
        "trainer_ngk": trainer_ngk,
        "trainer_ngk_user": trainer_ngk_user,
        "trainer_bgh": trainer_bgh,
        "trainer_bgh_user": trainer_bgh_user,
        "member_ngk": member_ngk,
        "member_ngk_user": member_ngk_user,
    }


@pytest.fixture
def auth(client: TestClient):
    """Log a fixture user in and return an Authorization header.

    Login runs on the real clock even when the test has frozen time. JWT expiry
    is validated by the JWT library against the wall clock, so a token minted at
    a frozen 2026 instant would read as expired the moment it is used; the
    attendance rules under test are unrelated to token lifetime.
    """

    def _auth(user: User) -> dict[str, str]:
        frozen = clock._frozen
        clock.freeze(None)
        try:
            response = client.post(
                "/api/v1/auth/login", json={"email": user.email, "password": PASSWORD}
            )
        finally:
            clock.freeze(frozen)
        assert response.status_code == 200, response.text
        return {"Authorization": f"Bearer {response.json()['tokens']['access_token']}"}

    return _auth

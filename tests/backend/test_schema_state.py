"""The schema drift report.

This exists because of a real incident: a database left on the previous
revision served most of the API and returned opaque 500s from exactly the
endpoints touching the newer tables. These tests pin the thing that makes that
diagnosable — and, just as importantly, that the report can never be the reason
the API fails to start.
"""

from __future__ import annotations

from sqlalchemy import create_engine, text

from app.db import schema_state
from app.db.session import engine


def test_the_head_revision_is_readable_from_the_installed_layout():
    """Resolved from the module's own path, not the working directory.

    The API is started from `backend/` and the suite from the repo root; a
    cwd-relative lookup would work in one and silently return None in the other.
    """
    assert schema_state.MIGRATIONS_DIR.is_dir()
    assert schema_state.head_revision() is not None


def test_a_database_with_no_alembic_version_is_reported_as_not_current(tmp_path):
    """The suite's own databases are built with create_all, so this is also the
    shape the test environment itself presents."""
    scratch = create_engine(f"sqlite+pysqlite:///{tmp_path/'empty.db'}")
    state = schema_state.check(scratch)

    assert state.current is None
    assert state.is_current is False
    assert state.status == "unknown"
    assert "alembic upgrade head" in state.detail
    scratch.dispose()


def test_a_database_on_an_older_revision_names_both_revisions(tmp_path):
    """The message has to contain what to run, not just that something is wrong."""
    scratch = create_engine(f"sqlite+pysqlite:///{tmp_path/'old.db'}")
    with scratch.begin() as connection:
        connection.execute(text("CREATE TABLE alembic_version (version_num VARCHAR(32))"))
        connection.execute(text("INSERT INTO alembic_version VALUES ('263f304244af')"))

    state = schema_state.check(scratch)
    head = schema_state.head_revision()

    assert state.current == "263f304244af"
    assert state.head == head
    assert state.is_current is False
    assert state.status == "outdated"
    assert "263f304244af" in state.detail
    assert head in state.detail
    assert "alembic upgrade head" in state.detail
    scratch.dispose()


def test_a_database_at_head_is_reported_as_current(tmp_path):
    scratch = create_engine(f"sqlite+pysqlite:///{tmp_path/'head.db'}")
    head = schema_state.head_revision()
    with scratch.begin() as connection:
        connection.execute(text("CREATE TABLE alembic_version (version_num VARCHAR(32))"))
        connection.execute(text(f"INSERT INTO alembic_version VALUES ('{head}')"))

    state = schema_state.check(scratch)
    assert state.is_current is True
    assert state.status == "current"
    scratch.dispose()


def test_an_unreachable_database_never_raises():
    """The report runs at startup. It must degrade, not crash the process."""
    unreachable = create_engine("postgresql+psycopg://nobody@127.0.0.1:1/nothing")

    assert schema_state.current_revision(unreachable) is None
    state = schema_state.check(unreachable)
    assert state.is_current is False
    unreachable.dispose()


def test_checking_the_live_test_database_does_not_raise():
    """Whatever the suite's database looks like, the call itself is safe."""
    state = schema_state.check(engine)
    assert state.status in {"current", "outdated", "unknown"}


def test_management_can_read_the_schema_state_over_http(client, world, auth):
    response = client.get("/api/v1/schema", headers=auth(world["owner"]))
    assert response.status_code == 200

    body = response.json()
    assert body["status"] in {"current", "outdated", "unknown"}
    assert body["head_revision"] == schema_state.head_revision()
    assert "detail" in body


def test_a_trainer_cannot_read_the_schema_state(client, world, auth):
    """The revision identifies the build, so it stays behind management auth."""
    response = client.get("/api/v1/schema", headers=auth(world["trainer_ngk_user"]))
    assert response.status_code == 403


def test_health_stays_free_of_version_detail(client):
    """`/health` is unauthenticated and deliberately says nothing about the build."""
    body = client.get("/api/v1/health").json()

    assert set(body) == {"status", "database", "server_time"}
    assert "revision" not in str(body)

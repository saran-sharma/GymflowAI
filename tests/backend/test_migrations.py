"""The migration chain, and the table whose absence started this.

A dev database left a revision behind served most of the API perfectly well and
threw `UndefinedTable` from exactly the endpoints touching `workout_sets` —
which reads as "workout logging is broken" rather than "this database needs
migrating". These tests pin the chain itself, so a branch that adds a head
without a path to it, or drops a table the app queries, fails here rather than
in somebody's terminal.
"""

from __future__ import annotations

from pathlib import Path

import pytest
from alembic.config import Config
from alembic.script import ScriptDirectory
from sqlalchemy import create_engine, inspect, text

from app.db import schema_state
from app.db.base import Base

MIGRATIONS = Path(__file__).resolve().parents[2] / "database" / "migrations"


@pytest.fixture(scope="module")
def script() -> ScriptDirectory:
    config = Config()
    config.set_main_option("script_location", str(MIGRATIONS))
    return ScriptDirectory.from_config(config)


def test_there_is_exactly_one_head(script):
    """Two heads mean two branches nobody merged, and `upgrade head` fails."""
    assert len(script.get_heads()) == 1


def test_every_revision_is_reachable_from_the_base(script):
    """A revision whose down_revision names nothing is a break in the chain."""
    revisions = {rev.revision for rev in script.walk_revisions()}
    for rev in script.walk_revisions():
        downs = rev.down_revision
        if downs is None:
            continue
        for down in (downs,) if isinstance(downs, str) else downs:
            assert down in revisions, f"{rev.revision} points at unknown {down}"


def test_the_head_matches_what_the_app_reports(script):
    assert schema_state.head_revision() == script.get_current_head()


def test_workout_sets_is_in_the_chain(script):
    """The specific table whose missing migration produced UndefinedTable."""
    revisions = {rev.revision for rev in script.walk_revisions()}
    assert "7c4b1e9a2f30" in revisions


def test_every_model_table_the_api_queries_exists_in_the_suite_database():
    """Guards the shape the app expects, `workout_sets` included."""
    from app.db.session import engine

    present = set(inspect(engine).get_table_names())
    expected = set(Base.metadata.tables)
    missing = expected - present
    assert not missing, f"tables missing from the database: {sorted(missing)}"


def test_a_database_a_revision_behind_is_reported_rather_than_hidden(tmp_path):
    """The diagnostic that turns an opaque 500 into an obvious action."""
    scratch = create_engine(f"sqlite+pysqlite:///{tmp_path/'behind.db'}")
    with scratch.begin() as connection:
        connection.execute(text("CREATE TABLE alembic_version (version_num VARCHAR(32))"))
        connection.execute(text("INSERT INTO alembic_version VALUES ('16ad09f49f39')"))

    state = schema_state.check(scratch)
    assert state.is_current is False
    assert state.status == "outdated"
    assert "alembic upgrade head" in state.detail
    scratch.dispose()

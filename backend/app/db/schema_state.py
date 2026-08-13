"""Is the database's schema the one this code was written against?

A database that is a migration behind does not fail loudly. It serves most of
the app perfectly well and then returns opaque 500s from exactly the endpoints
that touch the newer tables — which reads as "those features are broken" rather
than "this database needs migrating". This module makes the difference legible:
logged once at startup, and readable by an operator through the API.

Nothing here changes behaviour. It reports.
"""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

from sqlalchemy import inspect, text
from sqlalchemy.engine import Engine

#: Resolved from this file so it does not depend on the working directory —
#: the API is started from `backend/`, the tests from the repo root.
MIGRATIONS_DIR = Path(__file__).resolve().parents[3] / "database" / "migrations"


@dataclass(frozen=True)
class SchemaState:
    #: Revision the database reports, or None when it was never migrated.
    current: str | None
    #: Revision this checkout expects.
    head: str | None
    #: True when the two agree.
    is_current: bool
    #: Short, actionable summary for a log line or an API response.
    detail: str

    @property
    def status(self) -> str:
        if self.head is None or self.current is None:
            return "unknown"
        return "current" if self.is_current else "outdated"


def head_revision() -> str | None:
    """The newest revision on disk, or None if alembic cannot be read.

    Import errors and a missing migrations directory are both non-fatal: this
    is a diagnostic, and a diagnostic must never be the reason the API refuses
    to start.
    """
    try:
        from alembic.config import Config
        from alembic.script import ScriptDirectory

        config = Config()
        config.set_main_option("script_location", str(MIGRATIONS_DIR))
        return ScriptDirectory.from_config(config).get_current_head()
    except Exception:
        return None


def current_revision(engine: Engine) -> str | None:
    """What the database says it is at, or None if it has never been migrated."""
    try:
        with engine.connect() as connection:
            if not inspect(connection).has_table("alembic_version"):
                return None
            return connection.execute(text("SELECT version_num FROM alembic_version")).scalar()
    except Exception:
        return None


def check(engine: Engine) -> SchemaState:
    head = head_revision()
    current = current_revision(engine)

    if head is None:
        return SchemaState(current, head, True, "Migration scripts are not readable from here.")

    if current is None:
        # Also the normal state under the test suite, which builds the schema
        # with create_all rather than by migrating.
        return SchemaState(
            current,
            head,
            False,
            "This database has no Alembic version. Run: alembic upgrade head",
        )

    if current == head:
        return SchemaState(current, head, True, f"Schema is at {head}.")

    return SchemaState(
        current,
        head,
        False,
        (
            f"This database is at {current} but the code expects {head}. "
            "Endpoints using the newer tables will fail until you run: alembic upgrade head"
        ),
    )


__all__ = ["MIGRATIONS_DIR", "SchemaState", "check", "current_revision", "head_revision"]

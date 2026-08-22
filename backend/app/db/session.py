"""Engine and session factory."""

from __future__ import annotations

from collections.abc import Iterator

from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker

from app.core.config import settings

connect_args: dict = {}
engine_kwargs: dict = {"pool_pre_ping": True, "future": True}

if settings.database_url.startswith("sqlite"):
    connect_args["check_same_thread"] = False
    # A file-backed SQLite URL still needs one shared connection across the
    # TestClient's threads, otherwise each thread sees an empty database.
    from sqlalchemy.pool import StaticPool

    engine_kwargs["poolclass"] = StaticPool
    engine_kwargs.pop("pool_pre_ping")
else:
    # Without this, a fresh SELECT of a TIMESTAMPTZ column deserializes in
    # whatever timezone the Postgres session happens to default to (a server/
    # role setting this app does not control), while a freshly-constructed
    # in-memory row not yet round-tripped through a SELECT still carries
    # whatever tzinfo `now_utc()` gave it. Both represent the same instant,
    # but the API would render two different offsets for it depending on
    # which code path produced the value. Pinning the connection itself to
    # UTC is what `now_utc()`'s own contract already promises everywhere
    # else: the server's one authoritative instant, always UTC.
    connect_args["options"] = "-c timezone=UTC"

engine = create_engine(settings.database_url, connect_args=connect_args, **engine_kwargs)
SessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False, class_=Session)


def get_db() -> Iterator[Session]:
    db = SessionLocal()
    try:
        yield db
        db.commit()
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


__all__ = ["SessionLocal", "engine", "get_db"]

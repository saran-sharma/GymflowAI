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

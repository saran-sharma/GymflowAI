"""Declarative base and shared column mixins."""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import Boolean, DateTime, func
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


class Base(DeclarativeBase):
    pass


class TimestampMixin:
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )


class DemoMixin:
    """Marks rows created by the seeder.

    Demo data is fictional and must be identifiable so a production cutover can
    delete it in one statement without touching real SLAM records.
    """

    is_demo: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)


__all__ = ["Base", "DemoMixin", "TimestampMixin"]

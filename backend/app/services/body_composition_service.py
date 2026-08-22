"""Body composition: the one place Member, Trainer and Owner all read InBody
history from — nothing queries ``body_compositions`` independently per screen.

Read-only by design. Rows only ever arrive through the human-supervised
``app/integrations/inbody/importer.py`` pipeline (see
``app/scripts/import_inbody.py``); nothing here writes, corrects, or infers a
measurement. A member, trainer or owner with no rows on file gets an honest
empty result, never a fabricated snapshot.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.models import BodyComposition

#: How many of a member's most recent scans a screen ever needs at once.
#: Bounds the *newest* N returned, not how far back the query looks — a
#: member with 40 scans on file sees their most recent 12, not their oldest.
DEFAULT_HISTORY_LIMIT = 12


@dataclass
class BodyCompositionReading:
    """One scan, exactly as stored — units and nullability match
    ``BodyComposition`` column-for-column. No field here is computed; a
    metric the importer does not write (Body Fat Mass in kg, for one) has no
    place on this dataclass either, rather than being derived and presented
    as if it were measured."""

    measured_at: datetime
    source: str
    weight_kg: float | None
    body_fat_pct: float | None
    muscle_mass_kg: float | None
    bmi: float | None
    visceral_fat: float | None
    bmr_kcal: int | None
    body_water_pct: float | None


def _reading(row: BodyComposition) -> BodyCompositionReading:
    return BodyCompositionReading(
        measured_at=row.measured_at,
        source=row.source,
        weight_kg=row.weight_kg,
        body_fat_pct=row.body_fat_pct,
        muscle_mass_kg=row.muscle_mass_kg,
        bmi=row.bmi,
        visceral_fat=row.visceral_fat,
        bmr_kcal=row.bmr_kcal,
        body_water_pct=row.body_water_pct,
    )


def get_body_composition_history(
    db: Session, *, member_id: int, limit: int = DEFAULT_HISTORY_LIMIT
) -> list[BodyCompositionReading]:
    """Oldest first — the same left-to-right convention
    ``journey_service.strength_trend`` uses for its points, so a trend chart
    never has to reverse anything before rendering. An empty list is the
    honest answer for a member with no scans, not a missing/failed result.
    """
    rows = db.scalars(
        select(BodyComposition)
        .where(BodyComposition.member_id == member_id)
        .order_by(BodyComposition.measured_at.desc())
        .limit(limit)
    ).all()
    return [_reading(row) for row in reversed(rows)]


def get_latest_body_composition(db: Session, *, member_id: int) -> BodyCompositionReading | None:
    """The one measurement a compact card needs. ``None`` when this member
    has never been scanned — not a row of zeros."""
    row = db.scalar(
        select(BodyComposition)
        .where(BodyComposition.member_id == member_id)
        .order_by(BodyComposition.measured_at.desc())
        .limit(1)
    )
    return _reading(row) if row else None


__all__ = [
    "BodyCompositionReading",
    "DEFAULT_HISTORY_LIMIT",
    "get_body_composition_history",
    "get_latest_body_composition",
]

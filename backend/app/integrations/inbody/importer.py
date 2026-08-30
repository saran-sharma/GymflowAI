"""LookinBody120 Excel import pipeline for InBody body-composition scans.

    Excel -> parse_workbook -> classify_rows -> (human reviews the report) -> import_matched

This is a standalone, human-supervised import tool (see
``app/scripts/import_inbody.py``), not a running integration. It is deliberately
not wired into ``app/integrations/inbody/provider.py`` or the registry —
``InBodyProvider`` there stays an interface until SLAM tells us the machines
report through something GymFlow can read live. This pipeline instead exists
to turn a manual Excel export from those same InBody 120 / LookinBody120
machines into rows in ``body_compositions``, one deliberate run at a time.

Column names are validated against the exact names SLAM has told us the export
carries (see the mission for PR #3). Anything not in that list is read but
never mapped — 87 columns come off the machine and about 15 are known to us;
the other ~70 (segmental composition, impedance, etc.) are left alone rather
than guessed at.

Identity: InBody's own "ID" field is the member's phone number by SLAM's
convention; "Local ID" is InBody's own identifier for the scan and is not a
GymFlow identifier of any kind. Matching to a GymFlow member is by phone only
— never by name, which is exactly the kind of "looks right" collision that
lets two different people's data end up on the wrong record.
"""

from __future__ import annotations

import csv
import io
import re
from collections import defaultdict
from dataclasses import dataclass, field
from datetime import date, datetime, time
from enum import Enum
from pathlib import Path
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.v1.auth import normalise_phone
from app.db.models import BodyComposition, Member, User

# --------------------------------------------------------------- validation

# canonical field -> the exact header text SLAM's export is expected to carry.
# Matching is case/whitespace-insensitive but the *names themselves* are not
# guessed — these are the fields the mission names explicitly.
REQUIRED_COLUMNS: dict[str, str] = {
    "name": "Name",
    "id": "ID",
    "date_of_birth": "Date of Birth",
    "mobile_number": "Mobile Number",
    "weight": "Weight",
    "tbw": "TBW",
    "protein": "Protein",
    "minerals": "Minerals",
    "bfm": "BFM",
    "smm": "SMM",
    "bmi": "BMI",
    "pbf": "PBF",
    "bmr": "BMR",
    "vfl": "VFL",
    "local_id": "Local ID",
}

_TEST_DATETIME_NAMES = ("Test Date/Time", "Test Date / Time", "TestDateTime")
_TEST_DATE_NAME = "Test Date"
_TEST_TIME_NAME = "Test Time"


class HeaderValidationError(ValueError):
    """The workbook's header row does not carry the columns this pipeline needs.

    Raised instead of proceeding on a partial or guessed match — a silently
    misparsed InBody export is a worse outcome than a script that refuses to
    run.
    """


_NUMBERED_PREFIX_RE = re.compile(r"^\s*\d+\s*[\.\):]\s*")
_PAREN_SUFFIX_RE = re.compile(r"\s*\([^)]*\)\s*$")


def _normalise_header_text(value: Any) -> str:
    text = str(value)
    # SLAM's real export numbers every column ("27. BFM (Body Fat Mass)") and
    # spells several of them out in full ("36. PBF (Percent Body Fat)"). The
    # canonical names in REQUIRED_COLUMNS are the short form InBody itself
    # uses elsewhere on the same report, so both wrappers are stripped before
    # matching — never to guess a field, only to see past decoration the
    # machine adds around the same known name.
    text = _NUMBERED_PREFIX_RE.sub("", text)
    text = _PAREN_SUFFIX_RE.sub("", text)
    return " ".join(text.split()).strip().lower()


def _resolve_headers(header_row: tuple[Any, ...]) -> dict[str, int]:
    by_text: dict[str, int] = {}
    for idx, cell in enumerate(header_row):
        if cell is None:
            continue
        text = _normalise_header_text(cell)
        if text:
            # First occurrence wins; a repeated header is not this function's
            # problem to adjudicate.
            by_text.setdefault(text, idx)

    missing: list[str] = []
    resolved: dict[str, int] = {}

    for canonical, display in REQUIRED_COLUMNS.items():
        key = display.strip().lower()
        if key in by_text:
            resolved[canonical] = by_text[key]
        else:
            missing.append(display)

    combined_idx = next(
        (by_text[name.lower()] for name in _TEST_DATETIME_NAMES if name.lower() in by_text), None
    )
    if combined_idx is not None:
        resolved["test_datetime"] = combined_idx
    elif _TEST_DATE_NAME.lower() in by_text and _TEST_TIME_NAME.lower() in by_text:
        resolved["test_date"] = by_text[_TEST_DATE_NAME.lower()]
        resolved["test_time"] = by_text[_TEST_TIME_NAME.lower()]
    else:
        missing.append("Test Date/Time (or separate 'Test Date' + 'Test Time' columns)")

    if missing:
        raise HeaderValidationError(
            "InBody export is missing expected column(s): "
            + ", ".join(missing)
            + ". Refusing to guess — check the export's header row against "
            "docs/INTEGRATIONS.md."
        )
    return resolved


# ------------------------------------------------------------------- parsing


@dataclass(frozen=True)
class ParsedRow:
    """One data row, with cells reachable by canonical field name."""

    row_number: int  # 1-based Excel row number, for a human to go find it
    columns: dict[str, int]
    values: tuple[Any, ...]

    def get(self, key: str) -> Any:
        idx = self.columns.get(key)
        if idx is None or idx >= len(self.values):
            return None
        return self.values[idx]


def parse_workbook(path: str | Path, sheet_name: str | None = None) -> list[ParsedRow]:
    """Read an InBody LookinBody120 export and validate its header.

    Raises ``HeaderValidationError`` if the expected columns are not present
    by name. Does not raise on individual bad data rows — those are reported
    later, by ``classify_rows``, as INVALID.
    """
    import openpyxl  # imported here so a missing dependency fails loudly at call time

    workbook = openpyxl.load_workbook(path, data_only=True, read_only=True)
    try:
        sheet = workbook[sheet_name] if sheet_name else workbook.worksheets[0]
        rows = sheet.iter_rows(values_only=True)
        try:
            header = next(rows)
        except StopIteration as exc:
            raise HeaderValidationError("The InBody export has no header row.") from exc

        columns = _resolve_headers(header)

        parsed: list[ParsedRow] = []
        for row_number, values in enumerate(rows, start=2):
            if values is None or all(v is None for v in values):
                continue  # blank row — Excel exports often trail with these
            parsed.append(ParsedRow(row_number=row_number, columns=columns, values=values))
        return parsed
    finally:
        workbook.close()


def parse_csv_export(raw: bytes) -> list[ParsedRow]:
    """Read a LookinBody120 auto-export CSV (Setup Menu → "Export Data as
    CSV/Image Files") — the automatic per-scan path, as opposed to the
    manual bulk Excel export ``parse_workbook`` reads.

    Deliberately an adapter, not a second importer: this function's only job
    is turning CSV text into the exact same ``ParsedRow`` shape
    ``parse_workbook`` produces, reusing ``_resolve_headers`` unchanged so
    every downstream stage (``normalize_row``, ``classify_rows``,
    ``import_matched``) is shared code, not a parallel copy that could drift.

    UNVERIFIED against a real per-scan export: the vendor documentation
    found for this feature confirms the auto-export exists and where it
    writes files, but not this CSV's exact header text or encoding. This
    assumes the same canonical column names as the bulk export
    (``REQUIRED_COLUMNS``) and a UTF-8-with-optional-BOM encoding (the
    common case for Windows-software CSV output) — both need confirming
    against a real file from the gym PC before this path is trusted with
    real data. Raises ``HeaderValidationError`` exactly like
    ``parse_workbook`` if the header doesn't match, rather than guessing.
    """
    text = raw.decode("utf-8-sig")
    reader = csv.reader(io.StringIO(text))
    rows_iter = iter(reader)
    try:
        header = next(rows_iter)
    except StopIteration as exc:
        raise HeaderValidationError("The InBody CSV export has no header row.") from exc

    columns = _resolve_headers(tuple(header))

    parsed: list[ParsedRow] = []
    for row_number, raw_values in enumerate(rows_iter, start=2):
        if not raw_values or all(not str(v).strip() for v in raw_values):
            continue  # blank row
        # Excel's cell types (datetime objects, floats) don't exist in CSV
        # text — every value here is a plain string. `normalize_row`'s own
        # parsers (`_parse_number`, `_parse_datetime`, ...) already accept
        # strings as their fallback path, so no separate CSV-typed variant
        # of `normalize_row` is needed.
        values: tuple[Any, ...] = tuple(raw_values)
        parsed.append(ParsedRow(row_number=row_number, columns=columns, values=values))
    return parsed


# --------------------------------------------------------------- normalizing

# Sane physical ranges used only to catch obviously broken rows (a text cell
# that slipped into a numeric column, a unit mismatch, a corrupted export) —
# not to second-guess a real measurement. Wide on purpose.
_WEIGHT_RANGE_KG = (20.0, 300.0)
_BMI_RANGE = (10.0, 70.0)
_BODY_FAT_PCT_RANGE = (2.0, 80.0)
_BODY_WATER_PCT_RANGE = (20.0, 80.0)
_MUSCLE_MASS_RANGE_KG = (5.0, 100.0)
_VISCERAL_FAT_RANGE = (0.0, 60.0)
_BMR_RANGE_KCAL = (400, 5000)

_DATETIME_FORMATS = (
    "%Y-%m-%d %H:%M:%S",
    "%Y-%m-%d %H:%M",
    "%Y-%m-%d",
    "%d-%m-%Y %H:%M:%S",
    "%d-%m-%Y %H:%M",
    "%d-%m-%Y",
    "%d/%m/%Y %H:%M:%S",
    "%d/%m/%Y %H:%M",
    "%d/%m/%Y",
    # SLAM's real LookinBody120 export, both with a trailing dot after the day
    # ("2025.09.10. 12:04:23") and without one.
    "%Y.%m.%d. %H:%M:%S",
    "%Y.%m.%d %H:%M:%S",
    "%Y.%m.%d.",
    "%Y.%m.%d",
)
_TIME_FORMATS = ("%H:%M:%S", "%H:%M")


@dataclass(frozen=True)
class NormalizedReading:
    name: str
    phone_raw: str
    phone_normalized: str
    measured_at: datetime
    weight_kg: float
    body_fat_pct: float | None
    muscle_mass_kg: float | None
    bmi: float | None
    visceral_fat: float | None
    bmr_kcal: int | None
    body_water_pct: float | None
    external_ref: str | None
    # Parsed and validated for completeness, but BodyComposition has no
    # column for either — see the module docstring and this PR's report.
    # Left off the write path deliberately.
    protein: float | None = None
    minerals: float | None = None


def _clean_str(value: Any) -> str | None:
    if value is None:
        return None
    text = str(value).strip()
    return text or None


def _parse_number(value: Any) -> float | None:
    if value is None:
        return None
    if isinstance(value, bool):  # bool is an int subclass; never a measurement
        return None
    if isinstance(value, int | float):
        return float(value)
    text = str(value).strip()
    if not text:
        return None
    try:
        return float(text)
    except ValueError:
        return None


def _parse_date_component(value: Any) -> date | None:
    if value is None:
        return None
    if isinstance(value, datetime):
        return value.date()
    if isinstance(value, date):
        return value
    text = str(value).strip()
    if not text:
        return None
    for fmt in _DATETIME_FORMATS:
        try:
            return datetime.strptime(text, fmt).date()
        except ValueError:
            continue
    return None


def _parse_time_component(value: Any) -> time | None:
    if value is None:
        return None
    if isinstance(value, datetime):
        return value.time()
    if isinstance(value, time):
        return value
    text = str(value).strip()
    if not text:
        return None
    for fmt in _TIME_FORMATS:
        try:
            return datetime.strptime(text, fmt).time()
        except ValueError:
            continue
    return None


def _parse_datetime(value: Any) -> datetime | None:
    if value is None:
        return None
    if isinstance(value, datetime):
        return value
    if isinstance(value, date):
        return datetime.combine(value, time.min)
    text = str(value).strip()
    if not text:
        return None
    for fmt in _DATETIME_FORMATS:
        try:
            return datetime.strptime(text, fmt)
        except ValueError:
            continue
    return None


def _combine_date_and_time(date_value: Any, time_value: Any) -> datetime | None:
    d = _parse_date_component(date_value)
    if d is None:
        return None
    t = _parse_time_component(time_value)
    return datetime.combine(d, t or time.min)


def _clean_external_ref(value: Any) -> str | None:
    text = _clean_str(value)
    if text is None:
        return None
    # openpyxl/Excel represents an integer-looking Local ID as a float
    # ("100234.0"); normalise it back to how a human would write it.
    if text.endswith(".0"):
        try:
            return str(int(float(text)))
        except ValueError:
            pass
    return text


def normalize_row(row: ParsedRow) -> tuple[NormalizedReading | None, list[str]]:
    """Validate and map one row's semantically-known fields.

    Returns ``(reading, [])`` on success or ``(None, errors)`` — never both —
    so a caller can never accidentally act on a half-valid reading.
    """
    errors: list[str] = []

    name = _clean_str(row.get("name"))
    if not name:
        errors.append("missing Name")

    mobile_raw = _clean_str(row.get("mobile_number"))
    id_raw = _clean_str(row.get("id"))
    # "InBody ID" is documented as the phone number by SLAM's own convention;
    # "Mobile Number" is the more explicitly-named field, so it's tried
    # first, with ID as a fallback when Mobile Number is blank or unusable.
    phone_normalized = normalise_phone(mobile_raw) if mobile_raw else ""
    phone_raw = mobile_raw or ""
    if len(phone_normalized) != 10 and id_raw:
        fallback = normalise_phone(id_raw)
        if len(fallback) == 10:
            phone_normalized = fallback
            phone_raw = id_raw
    if len(phone_normalized) != 10:
        errors.append("no usable 10-digit phone number in Mobile Number or ID")
        phone_raw = phone_raw or id_raw or ""

    if "test_datetime" in row.columns:
        measured_at = _parse_datetime(row.get("test_datetime"))
    else:
        measured_at = _combine_date_and_time(row.get("test_date"), row.get("test_time"))
    if measured_at is None:
        errors.append("unparseable Test Date/Time")

    weight_kg = _parse_number(row.get("weight"))
    if weight_kg is None:
        errors.append("missing/unparseable Weight")
    elif not (_WEIGHT_RANGE_KG[0] <= weight_kg <= _WEIGHT_RANGE_KG[1]):
        errors.append(f"Weight {weight_kg}kg is outside a plausible human range")

    bmi = _parse_number(row.get("bmi"))
    if bmi is not None and not (_BMI_RANGE[0] <= bmi <= _BMI_RANGE[1]):
        errors.append(f"BMI {bmi} is outside a plausible range")

    body_fat_pct = _parse_number(row.get("pbf"))
    if body_fat_pct is not None and not (
        _BODY_FAT_PCT_RANGE[0] <= body_fat_pct <= _BODY_FAT_PCT_RANGE[1]
    ):
        errors.append(f"PBF {body_fat_pct}% is outside a plausible range")

    muscle_mass_kg = _parse_number(row.get("smm"))
    if muscle_mass_kg is not None and not (
        _MUSCLE_MASS_RANGE_KG[0] <= muscle_mass_kg <= _MUSCLE_MASS_RANGE_KG[1]
    ):
        errors.append(f"SMM {muscle_mass_kg}kg is outside a plausible range")

    visceral_fat = _parse_number(row.get("vfl"))
    if visceral_fat is not None and not (
        _VISCERAL_FAT_RANGE[0] <= visceral_fat <= _VISCERAL_FAT_RANGE[1]
    ):
        errors.append(f"VFL {visceral_fat} is outside a plausible range")

    bmr_raw = _parse_number(row.get("bmr"))
    bmr_kcal = int(round(bmr_raw)) if bmr_raw is not None else None
    if bmr_kcal is not None and not (_BMR_RANGE_KCAL[0] <= bmr_kcal <= _BMR_RANGE_KCAL[1]):
        errors.append(f"BMR {bmr_kcal}kcal is outside a plausible range")

    body_water_pct = _parse_number(row.get("tbw"))
    if body_water_pct is not None and not (
        _BODY_WATER_PCT_RANGE[0] <= body_water_pct <= _BODY_WATER_PCT_RANGE[1]
    ):
        errors.append(f"TBW {body_water_pct}% is outside a plausible range")

    protein = _parse_number(row.get("protein"))
    minerals = _parse_number(row.get("minerals"))
    external_ref = _clean_external_ref(row.get("local_id"))

    if errors:
        return None, errors

    assert measured_at is not None and weight_kg is not None  # narrowed by the checks above
    return (
        NormalizedReading(
            name=name or "",
            phone_raw=phone_raw,
            phone_normalized=phone_normalized,
            measured_at=measured_at,
            weight_kg=weight_kg,
            body_fat_pct=body_fat_pct,
            muscle_mass_kg=muscle_mass_kg,
            bmi=bmi,
            visceral_fat=visceral_fat,
            bmr_kcal=bmr_kcal,
            body_water_pct=body_water_pct,
            external_ref=external_ref,
            protein=protein,
            minerals=minerals,
        ),
        [],
    )


# -------------------------------------------------------------- classifying


class Classification(str, Enum):
    MATCHED = "matched"
    AMBIGUOUS = "ambiguous"
    UNMATCHED = "unmatched"
    DUPLICATE = "duplicate"
    INVALID = "invalid"


@dataclass
class ClassifiedRow:
    row_number: int
    name: str
    phone_raw: str
    classification: Classification
    detail: str
    member_id: int | None = None
    branch_id: int | None = None
    reading: NormalizedReading | None = field(default=None, repr=False)


def _build_phone_index(db: Session) -> dict[str, list[Member]]:
    """Active members keyed by normalised 10-digit phone.

    ``User.phone`` is not unique, so this is a list per key on purpose — two
    or more active members sharing a phone number is the expected, real
    AMBIGUOUS case, not a data error to paper over.
    """
    index: dict[str, list[Member]] = defaultdict(list)
    rows = db.execute(
        select(Member, User)
        .join(User, Member.user_id == User.id)
        .where(
            Member.is_active.is_(True),
            User.is_active.is_(True),
            User.phone.isnot(None),
        )
    ).all()
    for member, user in rows:
        normalized = normalise_phone(user.phone or "")
        if len(normalized) == 10:
            index[normalized].append(member)
    return index


def _load_accepted(
    db: Session, member_ids: set[int]
) -> dict[int, list[tuple[str | None, datetime]]]:
    """Existing (external_ref, measured_at) pairs per member, for dedup."""
    accepted: dict[int, list[tuple[str | None, datetime]]] = defaultdict(list)
    if not member_ids:
        return accepted
    rows = db.execute(
        select(
            BodyComposition.member_id, BodyComposition.external_ref, BodyComposition.measured_at
        ).where(BodyComposition.member_id.in_(member_ids))
    ).all()
    for member_id, external_ref, measured_at in rows:
        accepted[member_id].append((external_ref, measured_at))
    return accepted


def _is_duplicate(
    accepted: list[tuple[str | None, datetime]], external_ref: str | None, measured_at: datetime
) -> bool:
    """Same measurement already recorded for this member?

    By Local ID when the row has one (the common, reliable case); otherwise
    by exact timestamp — deliberately checked against every prior entry for
    the member regardless of *that* entry's own ref, since a second scan
    landing on the same recorded instant is far more likely to be the same
    scan re-arriving than a coincidence.
    """
    if external_ref:
        return any(existing_ref == external_ref for existing_ref, _ in accepted)
    return any(existing_at == measured_at for _, existing_at in accepted)


def classify_rows(db: Session, rows: list[ParsedRow]) -> list[ClassifiedRow]:
    """Classify every row into MATCHED / AMBIGUOUS / UNMATCHED / DUPLICATE / INVALID.

    Read-only: never writes to the database. Safe to call as many times as
    wanted — this *is* the dry-run report.
    """
    phone_index = _build_phone_index(db)

    prelim: list[tuple[ParsedRow, NormalizedReading | None, list[str], list[Member]]] = []
    candidate_member_ids: set[int] = set()
    for row in rows:
        reading, errors = normalize_row(row)
        if reading is None:
            prelim.append((row, None, errors, []))
            continue
        matches = phone_index.get(reading.phone_normalized, [])
        prelim.append((row, reading, [], matches))
        if len(matches) == 1:
            candidate_member_ids.add(matches[0].id)

    accepted = _load_accepted(db, candidate_member_ids)

    out: list[ClassifiedRow] = []
    for row, reading, errors, matches in prelim:
        if reading is None:
            out.append(
                ClassifiedRow(
                    row_number=row.row_number,
                    name=_clean_str(row.get("name")) or "",
                    phone_raw=_clean_str(row.get("mobile_number"))
                    or _clean_str(row.get("id"))
                    or "",
                    classification=Classification.INVALID,
                    detail="; ".join(errors),
                )
            )
            continue

        if len(matches) == 0:
            out.append(
                ClassifiedRow(
                    row_number=row.row_number,
                    name=reading.name,
                    phone_raw=reading.phone_raw,
                    classification=Classification.UNMATCHED,
                    detail=f"no active member found with phone ending "
                    f"{reading.phone_normalized[-4:]}",
                )
            )
            continue

        if len(matches) > 1:
            codes = ", ".join(sorted(m.member_code for m in matches))
            out.append(
                ClassifiedRow(
                    row_number=row.row_number,
                    name=reading.name,
                    phone_raw=reading.phone_raw,
                    classification=Classification.AMBIGUOUS,
                    detail=f"{len(matches)} active members share this phone number: {codes}",
                )
            )
            continue

        member = matches[0]
        if _is_duplicate(accepted[member.id], reading.external_ref, reading.measured_at):
            key = (
                f"external_ref={reading.external_ref}"
                if reading.external_ref
                else f"measured_at={reading.measured_at.isoformat()}"
            )
            out.append(
                ClassifiedRow(
                    row_number=row.row_number,
                    name=reading.name,
                    phone_raw=reading.phone_raw,
                    classification=Classification.DUPLICATE,
                    member_id=member.id,
                    detail=f"already recorded for {member.member_code} ({key})",
                )
            )
            continue

        accepted[member.id].append((reading.external_ref, reading.measured_at))
        out.append(
            ClassifiedRow(
                row_number=row.row_number,
                name=reading.name,
                phone_raw=reading.phone_raw,
                classification=Classification.MATCHED,
                member_id=member.id,
                branch_id=member.branch_id,
                detail=f"matched {member.member_code}",
                reading=reading,
            )
        )

    return out


def summarize(rows: list[ClassifiedRow]) -> dict[str, int]:
    counts = {c.value: 0 for c in Classification}
    for row in rows:
        counts[row.classification.value] += 1
    return counts


def format_report(rows: list[ClassifiedRow]) -> str:
    """Human-readable dry-run report, grouped by classification."""
    lines: list[str] = []
    for classification in Classification:
        bucket = [r for r in rows if r.classification == classification]
        if not bucket:
            continue
        lines.append(f"-- {classification.value.upper()} ({len(bucket)}) --")
        for r in bucket:
            lines.append(f"  row {r.row_number}: {r.name!r} ({r.phone_raw}) — {r.detail}")
    return "\n".join(lines)


# -------------------------------------------------------------------- write


@dataclass(frozen=True)
class ImportResult:
    written: int
    skipped: int


def import_matched(db: Session, rows: list[ClassifiedRow]) -> ImportResult:
    """Write MATCHED, non-duplicate rows to body_compositions.

    Only ``Classification.MATCHED`` rows are written. AMBIGUOUS, UNMATCHED,
    INVALID and DUPLICATE rows are never written here — the caller (see
    ``app/scripts/import_inbody.py``) is responsible for surfacing those from
    the same classified list for human follow-up. Does not commit; the
    caller controls the transaction.
    """
    written = 0
    for row in rows:
        if row.classification != Classification.MATCHED:
            continue
        reading = row.reading
        assert reading is not None and row.member_id is not None and row.branch_id is not None
        db.add(
            BodyComposition(
                member_id=row.member_id,
                branch_id=row.branch_id,
                measured_at=reading.measured_at,
                source="inbody",
                external_ref=reading.external_ref,
                weight_kg=reading.weight_kg,
                body_fat_pct=reading.body_fat_pct,
                muscle_mass_kg=reading.muscle_mass_kg,
                bmi=reading.bmi,
                visceral_fat=reading.visceral_fat,
                bmr_kcal=reading.bmr_kcal,
                body_water_pct=reading.body_water_pct,
            )
        )
        written += 1
    db.flush()
    return ImportResult(written=written, skipped=len(rows) - written)


__all__ = [
    "REQUIRED_COLUMNS",
    "Classification",
    "ClassifiedRow",
    "HeaderValidationError",
    "ImportResult",
    "NormalizedReading",
    "ParsedRow",
    "classify_rows",
    "format_report",
    "import_matched",
    "normalize_row",
    "parse_csv_export",
    "parse_workbook",
    "summarize",
]

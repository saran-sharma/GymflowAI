"""Tests for the InBody LookinBody120 Excel import pipeline.

These use small, hand-built synthetic .xlsx fixtures — not the real 1,345-row
SLAM export, which was not available when this pipeline was built. They exist
to prove the parser, normalizer, matcher and classifier behave correctly on
known shapes (a valid header, a matched row, an ambiguous phone, a duplicate,
an out-of-range value), not to validate against real InBody data.
"""

from __future__ import annotations

from datetime import datetime
from pathlib import Path

import pytest
from conftest import make_member
from openpyxl import Workbook
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError

from app.db.models import BodyComposition
from app.integrations.inbody.importer import (
    Classification,
    HeaderValidationError,
    classify_rows,
    import_matched,
    normalize_row,
    parse_workbook,
    summarize,
)

FULL_HEADER = [
    "Name",
    "ID",
    "Date of Birth",
    "Mobile Number",
    "Test Date/Time",
    "Weight",
    "TBW",
    "Protein",
    "Minerals",
    "BFM",
    "SMM",
    "BMI",
    "PBF",
    "BMR",
    "VFL",
    "Local ID",
]

SPLIT_DATE_TIME_HEADER = [
    "Name",
    "ID",
    "Date of Birth",
    "Mobile Number",
    "Test Date",
    "Test Time",
    "Weight",
    "TBW",
    "Protein",
    "Minerals",
    "BFM",
    "SMM",
    "BMI",
    "PBF",
    "BMR",
    "VFL",
    "Local ID",
]


def _write_workbook(path: Path, header: list[str], rows: list[list]) -> Path:
    wb = Workbook()
    ws = wb.active
    ws.append(header)
    for row in rows:
        ws.append(row)
    wb.save(path)
    return path


def _row(
    name="Aditya Rao",
    id_="9000000001",
    dob="1995-01-01",
    mobile="9000000001",
    test_dt=None,
    weight=72.4,
    tbw=45.0,
    protein=11.2,
    minerals=3.8,
    bfm=15.1,
    smm=33.2,
    bmi=23.5,
    pbf=18.4,
    bmr=1650,
    vfl=8,
    local_id="LB-0001",
) -> list:
    test_dt = test_dt or datetime(2026, 8, 1, 9, 30, 0)
    return [
        name,
        id_,
        dob,
        mobile,
        test_dt,
        weight,
        tbw,
        protein,
        minerals,
        bfm,
        smm,
        bmi,
        pbf,
        bmr,
        vfl,
        local_id,
    ]


# ------------------------------------------------------------------ parsing


def test_header_validation_rejects_missing_columns(tmp_path):
    bad_header = [h for h in FULL_HEADER if h not in ("PBF", "VFL")]
    path = _write_workbook(tmp_path / "bad.xlsx", bad_header, [_row()])
    # _row() still has 16 values; trim to match the shortened header so this
    # test is purely about the header check, not row-shape mismatches.
    with pytest.raises(HeaderValidationError) as exc_info:
        parse_workbook(path)
    message = str(exc_info.value)
    assert "PBF" in message
    assert "VFL" in message


def test_header_validation_accepts_split_test_date_and_time(tmp_path):
    row = [
        "Aditya Rao",
        "9000000001",
        "1995-01-01",
        "9000000001",
        "2026-08-01",
        "09:30:00",
        72.4,
        45.0,
        11.2,
        3.8,
        15.1,
        33.2,
        23.5,
        18.4,
        1650,
        8,
        "LB-0001",
    ]
    path = _write_workbook(tmp_path / "split.xlsx", SPLIT_DATE_TIME_HEADER, [row])
    parsed = parse_workbook(path)
    assert len(parsed) == 1
    reading, errors = normalize_row(parsed[0])
    assert errors == []
    assert reading.measured_at == datetime(2026, 8, 1, 9, 30, 0)


def test_parse_workbook_skips_blank_rows(tmp_path):
    path = _write_workbook(
        tmp_path / "with_blank.xlsx",
        FULL_HEADER,
        [_row(), [None] * len(FULL_HEADER), _row(local_id="LB-0002")],
    )
    parsed = parse_workbook(path)
    assert len(parsed) == 2


# -------------------------------------------------------------- normalizing


def test_normalize_row_maps_known_fields(tmp_path):
    path = _write_workbook(tmp_path / "map.xlsx", FULL_HEADER, [_row()])
    parsed = parse_workbook(path)
    reading, errors = normalize_row(parsed[0])
    assert errors == []
    assert reading.weight_kg == 72.4
    assert reading.body_fat_pct == 18.4  # PBF -> body_fat_pct
    assert reading.muscle_mass_kg == 33.2  # SMM -> muscle_mass_kg
    assert reading.bmi == 23.5
    assert reading.visceral_fat == 8  # VFL -> visceral_fat
    assert reading.bmr_kcal == 1650  # BMR -> bmr_kcal
    assert reading.body_water_pct == 45.0  # TBW -> body_water_pct
    assert reading.external_ref == "LB-0001"  # Local ID -> external_ref
    assert reading.measured_at == datetime(2026, 8, 1, 9, 30, 0)
    assert reading.phone_normalized == "9000000001"
    # Parsed for validation but never persisted — BodyComposition has no
    # protein/minerals column.
    assert reading.protein == 11.2
    assert reading.minerals == 3.8


def test_normalize_row_falls_back_to_id_when_mobile_number_missing():
    from app.integrations.inbody.importer import ParsedRow

    # Build directly via ParsedRow to control exactly which cell is blank.
    header_map = {
        "name": 0,
        "id": 1,
        "date_of_birth": 2,
        "mobile_number": 3,
        "test_datetime": 4,
        "weight": 5,
        "tbw": 6,
        "protein": 7,
        "minerals": 8,
        "bfm": 9,
        "smm": 10,
        "bmi": 11,
        "pbf": 12,
        "bmr": 13,
        "vfl": 14,
        "local_id": 15,
    }
    values = tuple(_row(mobile=None))
    row = ParsedRow(row_number=2, columns=header_map, values=values)
    reading, errors = normalize_row(row)
    assert errors == []
    assert reading.phone_normalized == "9000000001"  # fell back to ID


@pytest.mark.parametrize(
    "overrides,expected_fragment",
    [
        ({"weight": None}, "Weight"),
        ({"weight": 900}, "Weight"),
        ({"bmi": 5}, "BMI"),
        ({"name": None}, "Name"),
        ({"mobile": None, "id_": None}, "phone"),
        ({"test_dt": "not-a-date"}, "Test Date/Time"),
    ],
)
def test_normalize_row_rejects_out_of_range_or_missing_values(
    tmp_path, overrides, expected_fragment
):
    path = _write_workbook(tmp_path / "invalid.xlsx", FULL_HEADER, [_row(**overrides)])
    parsed = parse_workbook(path)
    reading, errors = normalize_row(parsed[0])
    assert reading is None
    assert any(expected_fragment.lower() in e.lower() for e in errors)


# -------------------------------------------------------------- classifying


def test_matched_ambiguous_unmatched_and_invalid_classification(db, world):
    branch = world["branches"]["ngk"]
    roles = world["roles"]

    matched_member, matched_user = make_member(db, roles, branch, "Matched Member")
    matched_user.phone = "+91 90000 00010"

    dup1_member, dup1_user = make_member(db, roles, branch, "Duplicate Phone One")
    dup1_user.phone = "9000000020"
    dup2_member, dup2_user = make_member(db, roles, branch, "Duplicate Phone Two")
    dup2_user.phone = "09000000020"  # normalises to the same 10 digits
    db.commit()

    rows = [
        _row(name="Matched Member", id_="9000000010", mobile="9000000010", local_id="LB-A"),
        _row(name="Ambiguous Member", id_="9000000020", mobile="9000000020", local_id="LB-B"),
        _row(name="Nobody Here", id_="9999999999", mobile="9999999999", local_id="LB-C"),
        _row(name=None, id_="9000000010", mobile="9000000010", local_id="LB-D"),  # invalid: no name
    ]
    parsed_rows = []
    from app.integrations.inbody.importer import ParsedRow

    header_map = {
        "name": 0,
        "id": 1,
        "date_of_birth": 2,
        "mobile_number": 3,
        "test_datetime": 4,
        "weight": 5,
        "tbw": 6,
        "protein": 7,
        "minerals": 8,
        "bfm": 9,
        "smm": 10,
        "bmi": 11,
        "pbf": 12,
        "bmr": 13,
        "vfl": 14,
        "local_id": 15,
    }
    for i, r in enumerate(rows):
        parsed_rows.append(ParsedRow(row_number=i + 2, columns=header_map, values=tuple(r)))

    classified = classify_rows(db, parsed_rows)
    counts = summarize(classified)

    assert counts["matched"] == 1
    assert counts["ambiguous"] == 1
    assert counts["unmatched"] == 1
    assert counts["invalid"] == 1
    assert counts["duplicate"] == 0

    by_row = {c.row_number: c for c in classified}
    assert by_row[2].classification == Classification.MATCHED
    assert by_row[2].member_id == matched_member.id
    assert by_row[3].classification == Classification.AMBIGUOUS
    assert by_row[4].classification == Classification.UNMATCHED
    assert by_row[5].classification == Classification.INVALID


def _parsed_rows_from(rows: list[list]) -> list:
    from app.integrations.inbody.importer import ParsedRow

    header_map = {
        "name": 0,
        "id": 1,
        "date_of_birth": 2,
        "mobile_number": 3,
        "test_datetime": 4,
        "weight": 5,
        "tbw": 6,
        "protein": 7,
        "minerals": 8,
        "bfm": 9,
        "smm": 10,
        "bmi": 11,
        "pbf": 12,
        "bmr": 13,
        "vfl": 14,
        "local_id": 15,
    }
    return [
        ParsedRow(row_number=i + 2, columns=header_map, values=tuple(r)) for i, r in enumerate(rows)
    ]


def test_duplicate_detected_against_existing_db_row(db, world):
    branch = world["branches"]["ngk"]
    member, user = make_member(db, world["roles"], branch, "Existing Scan")
    user.phone = "9000000030"
    db.commit()

    db.add(
        BodyComposition(
            member_id=member.id,
            branch_id=branch.id,
            measured_at=datetime(2026, 7, 1, 9, 0, 0),
            source="inbody",
            external_ref="LB-EXIST",
            weight_kg=70.0,
        )
    )
    db.commit()

    rows = _parsed_rows_from(
        [_row(name="Existing Scan", id_="9000000030", mobile="9000000030", local_id="LB-EXIST")]
    )
    classified = classify_rows(db, rows)
    assert classified[0].classification == Classification.DUPLICATE


def test_duplicate_detected_within_same_batch(db, world):
    branch = world["branches"]["ngk"]
    member, user = make_member(db, world["roles"], branch, "Batch Dup")
    user.phone = "9000000040"
    db.commit()

    rows = _parsed_rows_from(
        [
            _row(name="Batch Dup", id_="9000000040", mobile="9000000040", local_id="LB-SAME"),
            _row(name="Batch Dup", id_="9000000040", mobile="9000000040", local_id="LB-SAME"),
        ]
    )
    classified = classify_rows(db, rows)
    assert classified[0].classification == Classification.MATCHED
    assert classified[1].classification == Classification.DUPLICATE


def test_duplicate_fallback_by_measured_at_when_local_id_absent(db, world):
    branch = world["branches"]["ngk"]
    member, user = make_member(db, world["roles"], branch, "No Local Id")
    user.phone = "9000000050"
    db.commit()

    same_time = datetime(2026, 8, 1, 9, 30, 0)
    rows = _parsed_rows_from(
        [
            _row(
                name="No Local Id",
                id_="9000000050",
                mobile="9000000050",
                local_id=None,
                test_dt=same_time,
            ),
            _row(
                name="No Local Id",
                id_="9000000050",
                mobile="9000000050",
                local_id=None,
                test_dt=same_time,
            ),
        ]
    )
    classified = classify_rows(db, rows)
    assert classified[0].classification == Classification.MATCHED
    assert classified[1].classification == Classification.DUPLICATE


# -------------------------------------------------------- dry-run / import


def test_dry_run_never_writes_to_the_database(db, world):
    branch = world["branches"]["ngk"]
    member, user = make_member(db, world["roles"], branch, "Dry Run Member")
    user.phone = "9000000060"
    db.commit()

    before = db.scalar(select(BodyComposition).limit(1))
    assert before is None

    rows = _parsed_rows_from(
        [_row(name="Dry Run Member", id_="9000000060", mobile="9000000060", local_id="LB-DRY")]
    )
    classified = classify_rows(db, rows)
    assert summarize(classified)["matched"] == 1

    count = db.scalar(select(BodyComposition).limit(1))
    assert count is None  # classify_rows must never write


def test_import_writes_only_matched_rows(db, world):
    branch = world["branches"]["ngk"]
    matched_member, matched_user = make_member(db, world["roles"], branch, "Import Matched")
    matched_user.phone = "9000000070"
    dup1_member, dup1_user = make_member(db, world["roles"], branch, "Ambig One")
    dup1_user.phone = "9000000080"
    dup2_member, dup2_user = make_member(db, world["roles"], branch, "Ambig Two")
    dup2_user.phone = "9000000080"
    db.commit()

    rows = _parsed_rows_from(
        [
            _row(name="Import Matched", id_="9000000070", mobile="9000000070", local_id="LB-M1"),
            _row(name="Ambig", id_="9000000080", mobile="9000000080", local_id="LB-M2"),
            _row(name="Unmatched", id_="9999999999", mobile="9999999999", local_id="LB-M3"),
            _row(name=None, id_="9000000070", mobile="9000000070", local_id="LB-M4"),
        ]
    )
    classified = classify_rows(db, rows)
    result = import_matched(db, classified)
    db.commit()

    assert result.written == 1
    assert result.skipped == 3

    stored = db.scalars(select(BodyComposition)).all()
    assert len(stored) == 1
    row = stored[0]
    assert row.member_id == matched_member.id
    assert row.branch_id == branch.id
    assert row.source == "inbody"
    assert row.external_ref == "LB-M1"
    assert float(row.weight_kg) == 72.4
    assert float(row.bmi) == 23.5


def test_reimporting_the_same_file_creates_no_new_rows(db, world):
    branch = world["branches"]["ngk"]
    member, user = make_member(db, world["roles"], branch, "Idempotent Member")
    user.phone = "9000000090"
    db.commit()

    rows = _parsed_rows_from(
        [_row(name="Idempotent Member", id_="9000000090", mobile="9000000090", local_id="LB-IDEMP")]
    )

    first = classify_rows(db, rows)
    import_matched(db, first)
    db.commit()
    assert db.scalar(select(BodyComposition)) is not None
    first_count = len(db.scalars(select(BodyComposition)).all())
    assert first_count == 1

    # Re-parse "the same file" — a fresh set of ParsedRow objects, exactly as
    # a second script invocation would produce.
    rows_again = _parsed_rows_from(
        [_row(name="Idempotent Member", id_="9000000090", mobile="9000000090", local_id="LB-IDEMP")]
    )
    second = classify_rows(db, rows_again)
    assert summarize(second)["duplicate"] == 1
    assert summarize(second)["matched"] == 0

    result = import_matched(db, second)
    db.commit()
    assert result.written == 0

    second_count = len(db.scalars(select(BodyComposition)).all())
    assert second_count == first_count


def test_invalid_row_does_not_abort_the_rest_of_the_batch(db, world):
    branch = world["branches"]["ngk"]
    member, user = make_member(db, world["roles"], branch, "Fine Member")
    user.phone = "9000000100"
    db.commit()

    rows = _parsed_rows_from(
        [
            _row(name=None, id_="9000000999", mobile="9000000999", local_id="LB-BAD"),  # invalid
            _row(name="Fine Member", id_="9000000100", mobile="9000000100", local_id="LB-GOOD"),
        ]
    )
    classified = classify_rows(db, rows)
    counts = summarize(classified)
    assert counts["invalid"] == 1
    assert counts["matched"] == 1

    result = import_matched(db, classified)
    db.commit()
    assert result.written == 1


# --------------------------------------------------------- DB-level guard


def test_database_enforces_uniqueness_on_member_and_external_ref(db, world):
    branch = world["branches"]["ngk"]
    member, user = make_member(db, world["roles"], branch, "Constraint Member")
    user.phone = "9000000110"
    db.commit()

    db.add(
        BodyComposition(
            member_id=member.id,
            branch_id=branch.id,
            measured_at=datetime(2026, 8, 1, 9, 0, 0),
            source="inbody",
            external_ref="LB-UNIQUE",
            weight_kg=70.0,
        )
    )
    db.commit()

    db.add(
        BodyComposition(
            member_id=member.id,
            branch_id=branch.id,
            measured_at=datetime(2026, 8, 2, 9, 0, 0),  # different timestamp
            source="inbody",
            external_ref="LB-UNIQUE",  # same ref for the same member
            weight_kg=71.0,
        )
    )
    with pytest.raises(IntegrityError):
        db.commit()
    db.rollback()


def test_database_enforces_uniqueness_on_member_and_measured_at_when_ref_is_null(db, world):
    branch = world["branches"]["ngk"]
    member, user = make_member(db, world["roles"], branch, "No Ref Constraint")
    user.phone = "9000000120"
    db.commit()

    same_time = datetime(2026, 8, 1, 9, 0, 0)
    db.add(
        BodyComposition(
            member_id=member.id,
            branch_id=branch.id,
            measured_at=same_time,
            source="inbody",
            external_ref=None,
            weight_kg=70.0,
        )
    )
    db.commit()

    db.add(
        BodyComposition(
            member_id=member.id,
            branch_id=branch.id,
            measured_at=same_time,
            source="inbody",
            external_ref=None,
            weight_kg=71.0,
        )
    )
    with pytest.raises(IntegrityError):
        db.commit()
    db.rollback()

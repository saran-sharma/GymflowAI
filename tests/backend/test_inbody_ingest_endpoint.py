"""POST /api/v1/inbody/ingest/{secret} — the automatic-ingestion receiver.

Exercises the endpoint end to end (auth, branch, classify, import) using a
raw CSV upload — the shape the LookinBody120 auto-export watch agent sends —
while `classify_rows`/`import_matched` themselves stay exactly the
already-tested code from `test_inbody_import.py`. Nothing here duplicates
that coverage; it proves the HTTP wrapper around it behaves.
"""

from __future__ import annotations

import csv
import io

import pytest
from conftest import make_member
from sqlalchemy import select

from app.core.config import settings
from app.db.models import BodyComposition

API = "/api/v1/inbody/ingest"
SECRET = "test-inbody-ingest-secret"

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


def _row(
    name="Aditya Rao",
    id_="9000000001",
    mobile="9000000001",
    local_id="LB-0001",
    weight=72.4,
) -> list:
    return [
        name,
        id_,
        "1995-01-01",
        mobile,
        "2026-08-01 09:30:00",
        weight,
        45.0,
        11.2,
        3.8,
        15.1,
        33.2,
        23.5,
        18.4,
        1650,
        8,
        local_id,
    ]


def _csv_bytes(rows: list[list]) -> bytes:
    buf = io.StringIO()
    writer = csv.writer(buf)
    writer.writerow(FULL_HEADER)
    writer.writerows(rows)
    return buf.getvalue().encode("utf-8")


@pytest.fixture
def enable_inbody_ingest(monkeypatch):
    monkeypatch.setattr(settings, "inbody_ingest_enabled", True)
    monkeypatch.setattr(settings, "inbody_ingest_shared_secret", SECRET)
    yield


def _upload(client, branch_id, content, secret=SECRET, filename="export.csv"):
    return client.post(
        f"{API}/{secret}",
        params={"branch_id": branch_id},
        files={"file": (filename, content, "text/csv")},
    )


def test_the_route_is_not_found_when_the_integration_is_off(client, world):
    resp = _upload(client, world["branches"]["ngk"].id, _csv_bytes([_row()]))
    assert resp.status_code == 404


def test_wrong_secret_is_rejected(client, world, enable_inbody_ingest):
    resp = _upload(
        client, world["branches"]["ngk"].id, _csv_bytes([_row()]), secret="not-the-secret"
    )
    assert resp.status_code == 401


def test_unknown_branch_is_rejected(client, enable_inbody_ingest):
    resp = _upload(client, 999999, _csv_bytes([_row()]))
    assert resp.status_code == 404


def test_a_new_scan_is_matched_and_written(client, db, world, enable_inbody_ingest):
    branch = world["branches"]["ngk"]
    member, user = make_member(db, world["roles"], branch, "Ingest Match")
    user.phone = "9000000001"
    db.commit()

    resp = _upload(client, branch.id, _csv_bytes([_row(mobile="9000000001")]))
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["written"] == 1
    assert body["counts"]["matched"] == 1

    row = db.scalar(select(BodyComposition).where(BodyComposition.member_id == member.id))
    assert row is not None
    assert row.external_ref == "LB-0001"


def test_a_duplicate_scan_writes_nothing_new(client, db, world, enable_inbody_ingest):
    branch = world["branches"]["ngk"]
    member, user = make_member(db, world["roles"], branch, "Ingest Dup")
    user.phone = "9000000002"
    db.commit()

    payload = _csv_bytes([_row(mobile="9000000002", local_id="LB-DUP")])
    first = _upload(client, branch.id, payload)
    assert first.json()["written"] == 1

    second = _upload(client, branch.id, payload)
    assert second.status_code == 200
    assert second.json()["written"] == 0
    assert second.json()["counts"]["duplicate"] == 1

    rows = db.scalars(select(BodyComposition).where(BodyComposition.member_id == member.id)).all()
    assert len(rows) == 1


def test_an_unknown_member_is_reported_not_guessed(client, world, enable_inbody_ingest):
    branch = world["branches"]["ngk"]
    resp = _upload(client, branch.id, _csv_bytes([_row(mobile="9999999999")]))
    assert resp.status_code == 200
    body = resp.json()
    assert body["written"] == 0
    assert body["counts"]["unmatched"] == 1


def test_a_malformed_file_400s_and_writes_nothing(client, world, enable_inbody_ingest):
    branch = world["branches"]["ngk"]
    garbage = b"this is not a csv export at all\nno headers here"
    resp = _upload(client, branch.id, garbage)
    assert resp.status_code == 400


def test_a_scan_for_another_branch_does_not_leak_across_branches(
    client, db, world, enable_inbody_ingest
):
    ngk = world["branches"]["ngk"]
    bgh = world["branches"]["bgh"]
    member, user = make_member(db, world["roles"], ngk, "NGK Only")
    user.phone = "9000000003"
    db.commit()

    # Uploading against the wrong branch_id must not write anything, even
    # though the member's phone matches — the member simply isn't at this
    # branch, so `classify_rows` never resolves them into a MATCHED row here.
    resp = _upload(client, bgh.id, _csv_bytes([_row(mobile="9000000003")]))
    assert resp.status_code == 200
    assert resp.json()["written"] == 0

    row = db.scalar(select(BodyComposition).where(BodyComposition.member_id == member.id))
    assert row is None

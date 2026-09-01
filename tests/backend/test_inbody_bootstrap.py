"""Tests for `--create-missing-members` (DEFERRED helper) and the auth changes
that back it.

The default import path creates no accounts — `test_default_import_creates_no_
accounts` pins that. The opt-in path creates a `User` (Login ID = mobile
number) + `Member` only, never a `Membership`, and never without an
operator-supplied temporary password.
"""

from __future__ import annotations

from datetime import date

from app.core.security import hash_password
from app.db.models import BodyComposition, Member, Membership, RoleKey, User
from app.integrations.inbody.importer import (
    Classification,
    classify_rows,
    create_bootstrapped_members,
    import_matched,
    parse_workbook,
    plan_bootstrap,
    summarize,
)
from conftest import make_member, make_trainer
from sqlalchemy import select
from test_inbody_import import FULL_HEADER, _row, _write_workbook

TEMP_PW = "temp-Provisioned-9137"  # what an operator would put in INBODY_BOOTSTRAP_PASSWORD


def _classify(db, tmp_path, rows, name="export.xlsx"):
    path = _write_workbook(tmp_path / name, FULL_HEADER, rows)
    return classify_rows(db, parse_workbook(path))


def _create(db, plans, branch, roles):
    return create_bootstrapped_members(
        db,
        plans,
        branch=branch,
        role_id=roles[RoleKey.MEMBER.value].id,
        password_hash=hash_password(TEMP_PW),
        joined_on=date.today(),
    )


# -------------------------------------------- de-identified export is refused


def test_deidentified_export_is_all_invalid_never_guessed(db, world, tmp_path):
    """A masked LookinBody export (names like ``Nit**sh``, ``ID`` = 8 digits +
    ``**``, ``Mobile Number`` = ``-``) must classify every row INVALID — never
    MATCHED, AMBIGUOUS, written, or turned into a bootstrap plan. Mirrors the
    real de-identified `InBodyExcelData_2026-08-20_...xlsx` (gitignored)."""
    branch = world["branches"]["ngk"]
    # A real member whose phone shares the visible 8 digits of a masked row —
    # the pipeline must still not match on a truncated number.
    _, real_user = make_member(db, world["roles"], branch, "Real Member")
    real_user.phone = "9440120399"
    db.commit()

    masked_rows = [
        _row(name="Nit**sh", id_="86680995**", mobile="-", local_id=f"LB-{i}") for i in range(4)
    ] + [
        _row(name="****** babu", id_="94401203**", mobile="94401203**", local_id="LB-x"),
        _row(name="ra*ya", id_="98405449**", mobile="-", local_id="LB-y"),
    ]
    classified = _classify(db, tmp_path, masked_rows)
    counts = summarize(classified)

    assert counts["matched"] == 0
    assert counts["ambiguous"] == 0
    assert counts["invalid"] == len(masked_rows)
    assert all(
        "no usable 10-digit phone" in r.detail
        for r in classified
        if r.classification is Classification.INVALID
    )

    assert import_matched(db, classified).written == 0
    plans, conflicts = plan_bootstrap(db, classified)
    assert plans == [] and conflicts == []
    db.commit()
    assert db.scalar(select(User).where(User.full_name == "Nit**sh")) is None


# ---------------------------------------------------- default path is untouched


def test_default_import_creates_no_accounts(db, world, tmp_path):
    """MATCHED -> import, everything else -> review/ignore/quarantine. The plain
    classify + import path never creates a User or Member for an UNMATCHED row."""
    users_before = db.scalars(select(User)).all()
    members_before = db.scalars(select(Member)).all()

    classified = _classify(
        db,
        tmp_path,
        [
            _row(name="Nobody Here", id_="9333000111", mobile="9333000111", local_id="LB-U1"),
            _row(name="Also Nobody", id_="9333000222", mobile="9333000222", local_id="LB-U2"),
        ],
    )
    assert summarize(classified)["unmatched"] == 2

    written = import_matched(db, classified)
    db.commit()

    assert written.written == 0
    assert len(db.scalars(select(User)).all()) == len(users_before)
    assert len(db.scalars(select(Member)).all()) == len(members_before)


# ------------------------------------------------------------- happy path


def test_unmatched_row_becomes_a_member_record_with_no_membership(db, world, tmp_path):
    branch = world["branches"]["ngk"]
    classified = _classify(
        db, tmp_path, [_row(name="Priya Sharma", id_="9812345678", mobile="9812345678")]
    )
    assert summarize(classified)["unmatched"] == 1

    plans, conflicts = plan_bootstrap(db, classified)
    assert conflicts == []
    assert [p.phone_normalized for p in plans] == ["9812345678"]
    assert plans[0].full_name == "Priya Sharma"

    result = _create(db, plans, branch, world["roles"])
    db.flush()
    assert result.created_count == 1

    user = db.scalar(select(User).where(User.login_phone == "9812345678"))
    assert user is not None
    assert user.email == "9812345678@no-email.gymflow.app"
    assert user.phone == "9812345678"
    assert user.must_change_password is True
    assert user.is_demo is False
    assert user.role.key == RoleKey.MEMBER.value
    assert user.branch_id == branch.id

    member = db.scalar(select(Member).where(Member.user_id == user.id))
    assert member is not None and member.is_active
    assert member.member_code.startswith(branch.code)

    # System-of-record boundary: no commercial membership is invented.
    assert db.scalar(select(Membership).where(Membership.member_id == member.id)) is None

    # Re-classify now that the member exists: the row attaches.
    reclassified = classify_rows(
        db,
        parse_workbook(
            _write_workbook(
                tmp_path / "again.xlsx",
                FULL_HEADER,
                [_row(name="Priya Sharma", id_="9812345678", mobile="9812345678")],
            )
        ),
    )
    assert summarize(reclassified)["matched"] == 1
    written = import_matched(db, reclassified)
    db.commit()
    assert written.written == 1

    comps = db.scalars(select(BodyComposition).where(BodyComposition.member_id == member.id)).all()
    assert len(comps) == 1
    assert comps[0].source == "inbody"


def test_rerunning_the_same_file_creates_no_second_record_or_reading(db, world, tmp_path):
    branch = world["branches"]["ngk"]
    rows = [_row(name="Priya Sharma", id_="9812345678", mobile="9812345678")]

    plans, _ = plan_bootstrap(db, _classify(db, tmp_path, rows))
    _create(db, plans, branch, world["roles"])
    db.commit()
    import_matched(
        db,
        classify_rows(db, parse_workbook(_write_workbook(tmp_path / "a.xlsx", FULL_HEADER, rows))),
    )
    db.commit()

    classified = classify_rows(
        db, parse_workbook(_write_workbook(tmp_path / "b.xlsx", FULL_HEADER, rows))
    )
    plans2, conflicts2 = plan_bootstrap(db, classified)
    assert plans2 == [] and conflicts2 == []  # the row is MATCHED now, not UNMATCHED
    assert classified[0].classification is Classification.DUPLICATE

    written = import_matched(db, classified)
    db.commit()
    assert written.written == 0

    users = db.scalars(select(User).where(User.login_phone == "9812345678")).all()
    assert len(users) == 1
    member = db.scalar(select(Member).where(Member.user_id == users[0].id))
    assert (
        len(db.scalars(select(BodyComposition).where(BodyComposition.member_id == member.id)).all())
        == 1
    )


# ---------------------------------------------------------- refuses to guess


def test_shared_mobile_number_with_two_names_is_not_auto_created(db, world, tmp_path):
    classified = _classify(
        db,
        tmp_path,
        [
            _row(name="Ravi Kumar", id_="9800000000", mobile="9800000000", local_id="LB-1"),
            _row(name="Anjali Kumar", id_="9800000000", mobile="9800000000", local_id="LB-2"),
        ],
    )
    assert summarize(classified)["unmatched"] == 2

    plans, conflicts = plan_bootstrap(db, classified)
    assert plans == []
    assert len(conflicts) == 1
    assert conflicts[0].reason == "shared_phone"
    assert conflicts[0].row_numbers == [2, 3]
    assert "Ravi Kumar" in conflicts[0].detail and "Anjali Kumar" in conflicts[0].detail

    assert db.scalar(select(User).where(User.login_phone == "9800000000")) is None


def test_mobile_number_already_used_by_a_staff_account_is_not_auto_created(db, world, tmp_path):
    _, trainer_user = make_trainer(db, world["roles"], world["branches"]["ngk"], "Deepak Nair")
    trainer_user.phone = "9700000000"
    db.commit()

    classified = _classify(
        db, tmp_path, [_row(name="Someone Else", id_="9700000000", mobile="9700000000")]
    )
    assert summarize(classified)["unmatched"] == 1

    plans, conflicts = plan_bootstrap(db, classified)
    assert plans == []
    assert [c.reason for c in conflicts] == ["phone_in_use"]


def test_existing_member_row_attaches_without_a_new_record(db, world, tmp_path):
    branch = world["branches"]["ngk"]
    _, user = make_member(db, world["roles"], branch, "Existing Member")
    user.phone = "9611111111"
    db.commit()
    before = db.scalars(select(User)).all()

    classified = _classify(
        db, tmp_path, [_row(name="Existing Member", id_="9611111111", mobile="9611111111")]
    )
    assert classified[0].classification is Classification.MATCHED
    plans, conflicts = plan_bootstrap(db, classified)
    assert plans == [] and conflicts == []
    assert len(db.scalars(select(User)).all()) == len(before)


# ------------------------------------------------------- auth surface


def test_phone_login_works_and_flags_the_temporary_password(db, world, client, tmp_path):
    branch = world["branches"]["ngk"]
    plans, _ = plan_bootstrap(
        db,
        _classify(db, tmp_path, [_row(name="Meera Iyer", id_="9522222222", mobile="9522222222")]),
    )
    _create(db, plans, branch, world["roles"])
    db.commit()

    ok = client.post("/api/v1/auth/login", json={"email": "9522222222", "password": TEMP_PW})
    assert ok.status_code == 200, ok.text
    body = ok.json()
    assert body["user"]["must_change_password"] is True
    assert body["user"]["phone"] == "9522222222"
    assert body["user"]["role"] == RoleKey.MEMBER.value

    bad = client.post(
        "/api/v1/auth/login", json={"email": "9522222222", "password": "wrong-password"}
    )
    assert bad.status_code == 401

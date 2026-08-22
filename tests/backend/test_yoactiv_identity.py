"""Identity mapping between a Yoactiv record and a GymFlow ``Member`` row.

Covers ``app.integrations.yoactiv.identity``: looking a GymFlow member up by
``external_ref``, linking one, and the database-level guarantee that two
GymFlow members can never claim the same Yoactiv identity.

None of this exercises a real Yoactiv sync — that is not possible yet (see
``docs/INTEGRATIONS.md``). ``ExternalMember`` instances here are hand-built
test data, not a captured or simulated API response.
"""

from __future__ import annotations

import pytest
from conftest import make_branch, make_member, make_roles
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.integrations.base import ExternalMember
from app.integrations.yoactiv import identity


def _branch(db: Session, code: str = "SLAM-NGK"):
    return make_branch(db, code, f"{code} branch")


def _member(db: Session, branch, name: str):
    roles = make_roles(db)
    member, user = make_member(db, roles, branch, name)
    db.commit()
    return member


def test_no_match_returns_none(db: Session):
    _member(db, _branch(db), "Unlinked Member")
    external = ExternalMember(external_id="YOACTIV-DOES-NOT-EXIST", full_name="Nobody")

    assert identity.find_member_by_external_ref(db, external) is None


def test_exactly_one_match_is_returned(db: Session):
    member = _member(db, _branch(db), "Linked Member")
    member.external_ref = "YOACTIV-0001"
    db.commit()

    external = ExternalMember(external_id="YOACTIV-0001", full_name="Linked Member")
    found = identity.find_member_by_external_ref(db, external)

    assert found is not None
    assert found.id == member.id


def test_link_member_stamps_external_ref_only(db: Session):
    member = _member(db, _branch(db), "About To Be Linked")
    assert member.external_ref is None
    original_code = member.member_code

    external = ExternalMember(external_id="YOACTIV-0002", full_name="About To Be Linked")
    identity.link_member(db, member, external)
    db.commit()
    db.refresh(member)

    assert member.external_ref == "YOACTIV-0002"
    # Linking must not touch GymFlow's own identifier for the member.
    assert member.member_code == original_code


def test_a_duplicate_external_ref_is_rejected_by_the_database(db: Session):
    """external_ref must be impossible to duplicate, not merely discouraged.

    Two GymFlow members ending up linked to the same Yoactiv person would
    silently corrupt any future sync (whichever the mapper the loop hits
    second would "win", nondeterministically). The unique constraint on
    ``members.external_ref`` (migration b4e6bbcca127) is what actually
    prevents this — this test is a guard against that constraint ever being
    quietly dropped.
    """
    branch = _branch(db)
    first = _member(db, branch, "First Claimant")
    second = _member(db, branch, "Second Claimant")

    first.external_ref = "YOACTIV-DUPLICATE"
    db.commit()

    second.external_ref = "YOACTIV-DUPLICATE"
    with pytest.raises(IntegrityError):
        db.commit()
    db.rollback()


def test_multiple_unlinked_members_can_all_have_a_null_external_ref(db: Session):
    """The unique constraint must not forbid the common "not yet linked" state."""
    branch = _branch(db)
    a = _member(db, branch, "Unlinked A")
    b = _member(db, branch, "Unlinked B")

    assert a.external_ref is None
    assert b.external_ref is None
    db.commit()  # would raise if NULL were treated as a colliding value

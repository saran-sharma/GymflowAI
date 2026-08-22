"""Effective PT status: membership truth and PT package truth, combined.

The bug this guards against: a member with an expired membership but an
untouched, still-`ACTIVE` PT package must never read as "PT ACTIVE" anywhere
— not on the trainer roster, not on the member's own screen, not to the
owner. The package is never deleted or mutated by a membership lapse; only
the *reported*, effective status changes. See `app.domain.pt_eligibility`.
"""

from __future__ import annotations

from datetime import date, timedelta

from app.db.models import Membership, MembershipStatus, PackageStatus
from app.domain.pt_eligibility import EffectivePtStatus, effective_pt_status
from app.services import pt_service

API = "/api/v1"


def _package(db, member, size=12, **kwargs):
    return pt_service.create_package(db, member=member, sessions_total=size, **kwargs)


def _membership_row(db, member):
    return db.query(Membership).filter(Membership.member_id == member.id).one()


def _expire_membership(db, member, *, days_ago=5):
    membership = _membership_row(db, member)
    membership.ends_on = date.today() - timedelta(days=days_ago)
    membership.status = MembershipStatus.ACTIVE  # stale stored value on purpose
    db.commit()
    return membership


def _renew_membership(db, member, *, days_ahead=200):
    membership = _membership_row(db, member)
    membership.ends_on = date.today() + timedelta(days=days_ahead)
    membership.status = MembershipStatus.ACTIVE
    db.commit()
    return membership


# ------------------------------------------------------- the domain function


def test_active_membership_and_active_package_with_sessions_is_pt_active():
    assert (
        effective_pt_status(
            package_status=PackageStatus.ACTIVE,
            sessions_remaining=5,
            membership_status=MembershipStatus.ACTIVE,
        )
        is EffectivePtStatus.PT_ACTIVE
    )


def test_expired_membership_with_active_package_is_paused_not_active():
    assert (
        effective_pt_status(
            package_status=PackageStatus.ACTIVE,
            sessions_remaining=5,
            membership_status=MembershipStatus.EXPIRED,
        )
        is EffectivePtStatus.PT_PAUSED_MEMBERSHIP_EXPIRED
    )


def test_expired_package_is_pt_expired_regardless_of_membership():
    assert (
        effective_pt_status(
            package_status=PackageStatus.EXPIRED,
            sessions_remaining=0,
            membership_status=MembershipStatus.ACTIVE,
        )
        is EffectivePtStatus.PT_EXPIRED
    )
    assert (
        effective_pt_status(
            package_status=PackageStatus.EXPIRED,
            sessions_remaining=0,
            membership_status=MembershipStatus.EXPIRED,
        )
        is EffectivePtStatus.PT_EXPIRED
    )


def test_completed_package_is_pt_completed():
    assert (
        effective_pt_status(
            package_status=PackageStatus.COMPLETED,
            sessions_remaining=0,
            membership_status=MembershipStatus.ACTIVE,
        )
        is EffectivePtStatus.PT_COMPLETED
    )


def test_no_package_at_all_is_no_pt():
    assert (
        effective_pt_status(
            package_status=None, sessions_remaining=None, membership_status=MembershipStatus.ACTIVE
        )
        is EffectivePtStatus.NO_PT
    )


def test_zero_sessions_remaining_on_an_otherwise_active_membership_is_expired():
    assert (
        effective_pt_status(
            package_status=PackageStatus.ACTIVE,
            sessions_remaining=0,
            membership_status=MembershipStatus.ACTIVE,
        )
        is EffectivePtStatus.PT_EXPIRED
    )


# --------------------------------------------------- required regression cases


def test_case_1_active_membership_and_active_pt(db, world):
    """1. active membership + active PT -> PT_ACTIVE everywhere."""
    member = world["member_ngk"]
    package = _package(db, member, trainer_id=world["trainer_ngk"].id)

    assert pt_service.effective_status_for_package(db, package) is EffectivePtStatus.PT_ACTIVE


def test_case_2_expired_membership_and_active_pt_is_paused(db, world):
    """2. expired membership + active PT -> PT_PAUSED_MEMBERSHIP_EXPIRED, not active."""
    member = world["member_ngk"]
    package = _package(db, member, trainer_id=world["trainer_ngk"].id)
    _expire_membership(db, member)

    assert (
        pt_service.effective_status_for_package(db, package)
        is EffectivePtStatus.PT_PAUSED_MEMBERSHIP_EXPIRED
    )
    # The package itself is untouched — this is a reported status, not a mutation.
    assert package.status is PackageStatus.ACTIVE


def test_case_3_expired_membership_trainer_roster_does_not_say_pt_active(client, db, world, auth):
    """3. Trainer roster reflects the paused state, never 'PT ACTIVE'."""
    member = world["member_ngk"]
    _package(db, member, trainer_id=world["trainer_ngk"].id)
    _expire_membership(db, member)

    headers = auth(world["trainer_ngk_user"])
    rows = client.get(f"{API}/trainers/me/clients", headers=headers).json()
    row = next(r for r in rows if r["member_id"] == member.id)

    assert row["effective_pt_status"] == "pt_paused_membership_expired"
    assert row["membership_status"] == "expired"
    assert row["pt_package"]["status"] == "active"  # package preserved
    assert row["pt_package"]["effective_status"] == "pt_paused_membership_expired"

    detail = client.get(f"{API}/trainers/me/clients/{member.id}", headers=headers).json()
    assert detail["client"]["effective_pt_status"] == "pt_paused_membership_expired"


def test_case_4_renewed_membership_makes_pt_eligible_again_automatically(client, db, world, auth):
    """4. After renewal, PT becomes eligible again with no extra action."""
    member = world["member_ngk"]
    package = _package(db, member, trainer_id=world["trainer_ngk"].id)
    _expire_membership(db, member)
    assert (
        pt_service.effective_status_for_package(db, package)
        is EffectivePtStatus.PT_PAUSED_MEMBERSHIP_EXPIRED
    )

    _renew_membership(db, member)

    assert pt_service.effective_status_for_package(db, package) is EffectivePtStatus.PT_ACTIVE

    headers = auth(world["trainer_ngk_user"])
    rows = client.get(f"{API}/trainers/me/clients", headers=headers).json()
    row = next(r for r in rows if r["member_id"] == member.id)
    assert row["effective_pt_status"] == "pt_active"


def test_case_5_expired_pt_package(db, world):
    """5. Expired PT package (its own expiry_date has passed) -> PT_EXPIRED."""
    member = world["member_ngk"]
    package = _package(
        db, member, trainer_id=world["trainer_ngk"].id, expiry_date=date.today() - timedelta(days=1)
    )
    pt_service.settle_package(db, package)

    assert package.status is PackageStatus.EXPIRED
    assert pt_service.effective_status_for_package(db, package) is EffectivePtStatus.PT_EXPIRED


def test_case_6_both_membership_and_pt_package_expired(db, world):
    """6. Both expired -> still PT_EXPIRED (the package's own expiry is authoritative,
    not "paused", since there is nothing left to resume by renewing membership alone)."""
    member = world["member_ngk"]
    package = _package(
        db, member, trainer_id=world["trainer_ngk"].id, expiry_date=date.today() - timedelta(days=1)
    )
    pt_service.settle_package(db, package)
    _expire_membership(db, member)

    assert pt_service.effective_status_for_package(db, package) is EffectivePtStatus.PT_EXPIRED


def test_case_7_no_pt_package(db, world):
    """7. A member who never had PT -> NO_PT."""
    member = world["member_ngk"]
    assert pt_service.effective_status_for_member(db, member.id) is EffectivePtStatus.NO_PT


def test_case_8_package_history_retained_through_membership_expiry(client, db, world, auth):
    """8. Membership expiry never touches the package: sessions, trainer, dates,
    and history are all preserved exactly as they were."""
    member = world["member_ngk"]
    trainer = world["trainer_ngk"]
    package = _package(
        db,
        member,
        size=20,
        trainer_id=trainer.id,
        start_date=date.today() - timedelta(days=10),
    )
    package.sessions_used = 6
    db.commit()

    before = {
        "sessions_total": package.sessions_total,
        "sessions_used": package.sessions_used,
        "sessions_remaining": package.sessions_remaining,
        "trainer_id": package.trainer_id,
        "start_date": package.start_date,
        "status": package.status,
    }

    _expire_membership(db, member)
    pt_service.effective_status_for_package(db, package)  # reading must not mutate

    db.refresh(package)
    assert package.sessions_total == before["sessions_total"]
    assert package.sessions_used == before["sessions_used"]
    assert package.sessions_remaining == before["sessions_remaining"]
    assert package.trainer_id == before["trainer_id"]
    assert package.start_date == before["start_date"]
    assert package.status == before["status"] == PackageStatus.ACTIVE

    headers = auth(world["trainer_ngk_user"])
    row = client.get(f"{API}/trainers/me/clients/{member.id}", headers=headers).json()
    pkg = row["client"]["pt_package"]
    assert pkg["sessions_total"] == 20
    assert pkg["sessions_used"] == 6
    assert pkg["sessions_remaining"] == 14
    assert pkg["trainer_name"] == trainer.user.full_name

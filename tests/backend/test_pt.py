"""PT packages, sessions and the split attendance view.

The invariant under test throughout: a member's session balance only moves
when a session is actually delivered, and it moves exactly once.
"""

from __future__ import annotations

from datetime import date, timedelta

import pytest
from conftest import make_member
from sqlalchemy import select

from app.core.clock import now_utc
from app.db.models import Alert, PackageStatus, SessionStatus
from app.services import journey_service, pt_service


def _package(db, member, size=12, **kwargs):
    return pt_service.create_package(db, member=member, sessions_total=size, **kwargs)


def _session(db, package, trainer, when=None):
    return pt_service.schedule_session(
        db,
        package=package,
        trainer_id=trainer.id,
        scheduled_start=when or (now_utc() + timedelta(hours=1)),
    )


# --------------------------------------------------------------- packages


def test_package_sizes_come_from_configuration(db, world):
    assert pt_service.package_options(db, world["branches"]["ngk"].id) == [12, 20, 30]


def test_an_unconfigured_package_size_is_rejected(db, world):
    with pytest.raises(pt_service.PTError):
        _package(db, world["member_ngk"], size=7)


def test_a_member_cannot_hold_two_active_packages(db, world):
    _package(db, world["member_ngk"])
    with pytest.raises(pt_service.PTError):
        _package(db, world["member_ngk"], size=20)


def test_a_package_expires_when_its_expiry_date_has_passed(db, world):
    package = _package(db, world["member_ngk"], expiry_date=date.today() - timedelta(days=1))
    pt_service.settle_package(db, package)
    assert package.status is PackageStatus.EXPIRED


# ---------------------------------------------------------------- sessions


def test_session_numbers_count_up_within_the_package(db, world):
    package = _package(db, world["member_ngk"])
    trainer = world["trainer_ngk"]
    assert _session(db, package, trainer).session_number == 1
    assert _session(db, package, trainer).session_number == 2


def test_a_cancelled_session_does_not_hand_its_number_to_the_next_one(db, world):
    """Two sessions both labelled "7 / 20" would be worse than a gap."""
    package = _package(db, world["member_ngk"])
    trainer = world["trainer_ngk"]
    first = _session(db, package, trainer)
    pt_service.close_session(db, session=first, outcome=SessionStatus.CANCELLED)

    assert _session(db, package, trainer).session_number == 2


def test_a_package_cannot_be_overbooked(db, world):
    package = _package(db, world["member_ngk"], size=12)
    trainer = world["trainer_ngk"]
    for _ in range(12):
        _session(db, package, trainer)
    with pytest.raises(pt_service.PTError):
        _session(db, package, trainer)


def test_a_trainer_from_another_branch_cannot_be_booked(db, world):
    package = _package(db, world["member_ngk"])
    with pytest.raises(pt_service.PTError):
        _session(db, package, world["trainer_bgh"])


# ------------------------------------------------------- split attendance


def test_the_session_only_starts_once_both_people_are_present(db, world):
    package = _package(db, world["member_ngk"])
    session = _session(db, package, world["trainer_ngk"])

    pt_service.mark_arrival(db, session=session, who="member")
    view = pt_service.split_view(db, session)
    assert view.member_checked_in is True
    assert view.trainer_checked_in is False
    assert view.can_complete is False, "one person present is not a session"

    pt_service.mark_arrival(db, session=session, who="trainer")
    view = pt_service.split_view(db, session)
    assert view.can_complete is True
    assert session.status is SessionStatus.IN_PROGRESS


def test_completion_consumes_exactly_one_session_however_often_it_is_called(db, world):
    package = _package(db, world["member_ngk"])
    session = _session(db, package, world["trainer_ngk"])
    pt_service.mark_arrival(db, session=session, who="member")
    pt_service.mark_arrival(db, session=session, who="trainer")

    pt_service.complete_session(db, session=session, completed_by_user_id=None)
    pt_service.complete_session(db, session=session, completed_by_user_id=None)

    assert package.sessions_used == 1
    assert package.sessions_remaining == 11


def test_a_cancellation_or_no_show_costs_the_member_nothing(db, world):
    package = _package(db, world["member_ngk"])
    trainer = world["trainer_ngk"]

    pt_service.close_session(
        db, session=_session(db, package, trainer), outcome=SessionStatus.CANCELLED
    )
    pt_service.close_session(
        db, session=_session(db, package, trainer), outcome=SessionStatus.NO_SHOW
    )

    assert package.sessions_used == 0
    assert package.sessions_remaining == 12


def test_a_closed_session_cannot_be_reopened_by_marking_an_arrival(db, world):
    package = _package(db, world["member_ngk"])
    session = _session(db, package, world["trainer_ngk"])
    pt_service.close_session(db, session=session, outcome=SessionStatus.CANCELLED)

    with pytest.raises(pt_service.PTError):
        pt_service.mark_arrival(db, session=session, who="member")


# ---------------------------------------------------------------- balance


def test_a_low_balance_raises_a_reminder_for_the_owner_and_the_member(db, world):
    package = _package(db, world["member_ngk"], size=12)
    package.sessions_used = 9  # three left, under the threshold of four
    pt_service.settle_package(db, package)

    alerts = [a for a in db.scalars(select(Alert)).all() if a.key == "pt.low_balance"]
    assert len(alerts) == 2
    assert {a.target_user_id is None for a in alerts} == {True, False}


def test_an_exhausted_package_completes_itself_and_prompts_a_renewal(db, world):
    package = _package(db, world["member_ngk"], size=12)
    trainer = world["trainer_ngk"]
    for _ in range(12):
        session = _session(db, package, trainer)
        pt_service.mark_arrival(db, session=session, who="member")
        pt_service.mark_arrival(db, session=session, who="trainer")
        pt_service.complete_session(db, session=session, completed_by_user_id=None)

    assert package.status is PackageStatus.COMPLETED
    assert package.sessions_remaining == 0
    keys = {a.key for a in db.scalars(select(Alert)).all()}
    assert "pt.package_complete" in keys


def test_utilisation_reports_delivered_against_booked(db, world):
    package = _package(db, world["member_ngk"])
    trainer = world["trainer_ngk"]
    today = date.today()

    delivered = _session(db, package, trainer)
    pt_service.mark_arrival(db, session=delivered, who="member")
    pt_service.mark_arrival(db, session=delivered, who="trainer")
    pt_service.complete_session(db, session=delivered, completed_by_user_id=None)
    pt_service.close_session(
        db, session=_session(db, package, trainer), outcome=SessionStatus.NO_SHOW
    )

    stats = pt_service.utilisation(db, [world["branches"]["ngk"].id], today, today)
    assert stats["booked"] == 2
    assert stats["completed"] == 1
    assert stats["no_show"] == 1
    assert stats["utilisation_pct"] == 50.0


# ---------------------------------------------------- journey → PT linkage


def test_converting_a_finished_journey_marks_it_converted(db, world):
    roles = world["roles"]
    member, _user = make_member(db, roles, world["branches"]["ngk"], "Converting Member")
    journey = journey_service.start_journey(
        db, member=member, start_date=date.today() - timedelta(days=44)
    )
    journey_service.settle_journey(db, journey)

    package = _package(db, member, journey_id=journey.id, origin="journey_conversion")

    assert journey.pt_converted is True
    assert package.origin == "journey_conversion"


def test_an_early_morning_session_belongs_to_the_branch_day_not_the_utc_day(db, world):
    """IST is UTC+5:30, so anything before 05:30 local falls on the previous
    UTC day. Filing by the UTC date would drop that session off the trainer's
    schedule for the day it is actually happening.
    """
    from datetime import datetime
    from zoneinfo import ZoneInfo

    from app.core.clock import UTC

    ist = ZoneInfo("Asia/Kolkata")
    local_day = date(2026, 8, 12)
    five_am_ist = datetime(2026, 8, 12, 5, 0, tzinfo=ist).astimezone(UTC)
    assert five_am_ist.date() == date(2026, 8, 11), "the fixture must straddle midnight UTC"

    package = _package(db, world["member_ngk"])
    session = pt_service.schedule_session(
        db,
        package=package,
        trainer_id=world["trainer_ngk"].id,
        scheduled_start=five_am_ist,
    )

    assert session.session_date == local_day
    assert pt_service.sessions_for_trainer(db, world["trainer_ngk"].id, local_day) == [session]

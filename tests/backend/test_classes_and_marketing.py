"""Group classes, RSVPs, attendance, and the acquisition funnel.

Two separations are load-bearing here and are asserted directly: saying yes is
not the same as turning up, and a marketing number is a count of real rows or
it is zero.
"""

from __future__ import annotations

from datetime import date, timedelta

import pytest
from conftest import make_member
from sqlalchemy import select

from app.core.clock import now_utc
from app.db.models import Alert, ClassStatus, MarketingSource, RsvpResponse
from app.services import class_service, journey_service, marketing_service, pt_service


def _class(db, world, *, when=None, capacity=20, branch="ngk", trainer=None):
    return class_service.create_class(
        db,
        branch=world["branches"][branch],
        name="Zumba",
        starts_at=when or (now_utc() + timedelta(days=1)),
        trainer_id=trainer.id if trainer else None,
        capacity=capacity,
    )


# ---------------------------------------------------------- group classes


def test_creating_a_class_announces_it_to_every_member_at_that_branch(db, world):
    group_class = _class(db, world)
    announcements = [
        a
        for a in db.scalars(select(Alert)).all()
        if a.key == "class.announced" and a.entity_id == str(group_class.id)
    ]
    assert announcements, "members should hear about the class in-app"
    assert all(a.target_user_id is not None for a in announcements)


def test_a_class_at_another_branch_cannot_be_rsvped_to(db, world):
    group_class = _class(db, world, branch="bgh")
    with pytest.raises(class_service.ClassError):
        class_service.set_rsvp(
            db, group_class=group_class, member=world["member_ngk"], answer=RsvpResponse.YES
        )


def test_rsvp_counts_track_yes_no_and_remaining_capacity(db, world):
    roles = world["roles"]
    branch = world["branches"]["ngk"]
    second, _ = make_member(db, roles, branch, "Second Member")
    group_class = _class(db, world, capacity=10)

    class_service.set_rsvp(
        db, group_class=group_class, member=world["member_ngk"], answer=RsvpResponse.YES
    )
    class_service.set_rsvp(db, group_class=group_class, member=second, answer=RsvpResponse.NO)

    tally = class_service.counts(db, group_class)
    assert tally["yes"] == 1
    assert tally["no"] == 1
    assert tally["available"] == 9


def test_a_member_can_change_their_mind(db, world):
    group_class = _class(db, world)
    member = world["member_ngk"]
    class_service.set_rsvp(db, group_class=group_class, member=member, answer=RsvpResponse.YES)
    class_service.set_rsvp(db, group_class=group_class, member=member, answer=RsvpResponse.NO)

    tally = class_service.counts(db, group_class)
    assert tally["yes"] == 0
    assert tally["no"] == 1


def test_a_full_class_stops_taking_yeses(db, world):
    roles = world["roles"]
    branch = world["branches"]["ngk"]
    second, _ = make_member(db, roles, branch, "Overflow Member")
    group_class = _class(db, world, capacity=1)

    class_service.set_rsvp(
        db, group_class=group_class, member=world["member_ngk"], answer=RsvpResponse.YES
    )
    with pytest.raises(class_service.ClassError):
        class_service.set_rsvp(db, group_class=group_class, member=second, answer=RsvpResponse.YES)


def test_saying_yes_is_not_the_same_as_turning_up(db, world):
    roles = world["roles"]
    branch = world["branches"]["ngk"]
    second, _ = make_member(db, roles, branch, "No Show Member")
    group_class = _class(db, world)

    for member in (world["member_ngk"], second):
        class_service.set_rsvp(db, group_class=group_class, member=member, answer=RsvpResponse.YES)

    class_service.record_attendance(
        db,
        group_class=group_class,
        member_ids=[world["member_ngk"].id],
        attended=True,
        recorded_by_user_id=None,
    )
    class_service.record_attendance(
        db,
        group_class=group_class,
        member_ids=[second.id],
        attended=False,
        recorded_by_user_id=None,
    )

    tally = class_service.counts(db, group_class)
    assert tally["registered"] == 2
    assert tally["attended"] == 1
    assert tally["absent"] == 1
    assert tally["show_up_pct"] == 50.0


def test_poor_turnout_is_flagged_when_the_class_closes(db, world):
    roles = world["roles"]
    branch = world["branches"]["ngk"]
    members = [world["member_ngk"]]
    for index in range(3):
        member, _ = make_member(db, roles, branch, f"Class Member {index}")
        members.append(member)

    group_class = _class(db, world)
    for member in members:
        class_service.set_rsvp(db, group_class=group_class, member=member, answer=RsvpResponse.YES)
    class_service.record_attendance(
        db,
        group_class=group_class,
        member_ids=[m.id for m in members],
        attended=False,
        recorded_by_user_id=None,
    )

    class_service.close_class(db, group_class)
    assert group_class.status is ClassStatus.COMPLETED
    assert "class.low_attendance" in {a.key for a in db.scalars(select(Alert)).all()}


def test_cancelling_a_class_tells_everyone_who_said_yes(db, world):
    group_class = _class(db, world)
    class_service.set_rsvp(
        db, group_class=group_class, member=world["member_ngk"], answer=RsvpResponse.YES
    )
    class_service.cancel_class(db, group_class, "Trainer unavailable")

    assert group_class.status is ClassStatus.CANCELLED
    cancellations = [
        a for a in db.scalars(select(Alert)).all() if "cancelled" in (a.dedupe_key or "")
    ]
    assert cancellations


# -------------------------------------------------------------- marketing


def test_the_source_list_is_seeded_once_and_is_idempotent(db, world):
    marketing_service.ensure_sources(db)
    marketing_service.ensure_sources(db)
    keys = [s.key for s in db.scalars(select(MarketingSource)).all()]
    assert len(keys) == len(set(keys))
    assert "instagram" in keys and "referral" in keys and "walk_in" in keys


def test_a_referral_source_without_a_referrer_is_rejected(db, world):
    marketing_service.ensure_sources(db)
    referral = db.scalar(select(MarketingSource).where(MarketingSource.key == "referral"))

    with pytest.raises(marketing_service.MarketingError):
        marketing_service.record_acquisition(
            db, member=world["member_ngk"], source_id=referral.id, referrer_member_id=None
        )


def test_a_member_cannot_refer_themselves(db, world):
    with pytest.raises(marketing_service.MarketingError):
        marketing_service.link_referral(
            db,
            referrer_member_id=world["member_ngk"].id,
            referred_member=world["member_ngk"],
        )


def test_the_funnel_counts_source_members_day45_and_pt_conversions(db, world):
    marketing_service.ensure_sources(db)
    instagram = db.scalar(select(MarketingSource).where(MarketingSource.key == "instagram"))
    branch = world["branches"]["ngk"]
    roles = world["roles"]

    finished, _ = make_member(db, roles, branch, "Funnel Finished")
    mid, _ = make_member(db, roles, branch, "Funnel Mid")
    for member in (finished, mid):
        marketing_service.record_acquisition(
            db, member=member, source_id=instagram.id, registered_on=date.today()
        )

    journey = journey_service.start_journey(
        db, member=finished, start_date=date.today() - timedelta(days=44)
    )
    journey_service.settle_journey(db, journey)
    pt_service.create_package(
        db, member=finished, sessions_total=12, journey_id=journey.id, origin="journey_conversion"
    )
    journey_service.start_journey(db, member=mid, start_date=date.today() - timedelta(days=10))

    funnels = marketing_service.funnel(db, [branch.id])
    instagram_row = next(f for f in funnels if f.source_key == "instagram")
    assert instagram_row.joined == 2
    assert instagram_row.reached_day_45 == 1
    assert instagram_row.pt_conversions == 1
    assert instagram_row.pt_conversion_pct == 50.0


def test_a_member_with_no_recorded_source_is_reported_as_unrecorded_not_guessed(db, world):
    funnels = marketing_service.funnel(db, [world["branches"]["ngk"].id])
    assert [f.source_key for f in funnels] == ["unrecorded"]
    assert funnels[0].joined == 1


def test_the_funnel_is_scoped_to_the_branches_asked_for(db, world):
    roles = world["roles"]
    make_member(db, roles, world["branches"]["bgh"], "Other Branch Member")
    db.flush()

    ngk_only = marketing_service.funnel(db, [world["branches"]["ngk"].id])
    assert sum(f.joined for f in ngk_only) == 1

    both = marketing_service.funnel(db, [world["branches"]["ngk"].id, world["branches"]["bgh"].id])
    assert sum(f.joined for f in both) == 2


def test_a_referral_shows_up_in_the_leaderboard(db, world):
    roles = world["roles"]
    branch = world["branches"]["ngk"]
    referred, _ = make_member(db, roles, branch, "Referred Member")
    marketing_service.link_referral(
        db, referrer_member_id=world["member_ngk"].id, referred_member=referred
    )

    board = marketing_service.referral_leaderboard(db, [branch.id])
    assert board[0]["member_id"] == world["member_ngk"].id
    assert board[0]["referrals"] == 1

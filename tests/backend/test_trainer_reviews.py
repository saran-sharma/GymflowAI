"""Post-workout trainer feedback and owner moderation.

The through-line: nothing a member submits is visible anywhere until an owner
approves it, a trainer can never moderate a review of themselves, identity is
withheld unless the member consents, and every branch check is a single
predicate on ``branch_id``.
"""

from __future__ import annotations

from datetime import date, timedelta

import pytest
from conftest import make_member

from app.db.models import (
    SessionStatus,
    TrainerReview,
    TrainerReviewModeration,
    TrainerReviewStatus,
    WorkoutSession,
    WorkoutSplit,
)

API = "/api/v1"


@pytest.fixture
def completed_workout(db, world) -> WorkoutSession:
    """A finished own-workout that Vikas supervised for Aditya."""
    member = world["member_ngk"]
    session = WorkoutSession(
        member_id=member.id,
        branch_id=member.branch_id,
        split=WorkoutSplit.PUSH,
        session_date=date.today(),
        status=SessionStatus.COMPLETED,
        supervising_trainer_id=world["trainer_ngk"].id,
    )
    db.add(session)
    db.commit()
    return session


def _submit(client, headers, session_id, **body):
    payload = {"workout_session_id": session_id, "rating": 5, "policy_ack": True}
    payload.update(body)
    return client.post(f"{API}/feedback/reviews", headers=headers, json=payload)


# --------------------------------------------------------------- creation


def test_a_member_submits_a_rating_and_it_lands_pending(client, world, auth, completed_workout):
    headers = auth(world["member_ngk_user"])
    prompt = client.get(
        f"{API}/feedback/reviews/prompt",
        headers=headers,
        params={"workout_session_id": completed_workout.id},
    ).json()
    assert prompt["eligible"] is True
    assert prompt["already_reviewed"] is False
    assert prompt["trainer"]["id"] == world["trainer_ngk"].id
    assert prompt["policy_version"]

    response = _submit(
        client, headers, completed_workout.id, comment="Great session, kept me going."
    )
    assert response.status_code == 201, response.text
    body = response.json()
    assert body["status"] == "pending"
    assert body["rating"] == 5
    assert body["comment"] == "Great session, kept me going."
    assert body["can_retract"] is True


def test_the_comment_is_optional(client, world, auth, completed_workout):
    headers = auth(world["member_ngk_user"])
    response = _submit(client, headers, completed_workout.id)
    assert response.status_code == 201
    assert response.json()["comment"] is None


def test_the_policy_must_be_acknowledged(client, world, auth, completed_workout):
    headers = auth(world["member_ngk_user"])
    response = _submit(client, headers, completed_workout.id, policy_ack=False)
    assert response.status_code == 409
    assert "policy" in response.json()["detail"].lower()


@pytest.mark.parametrize("bad", [0, 6, -1, 100])
def test_rating_must_be_one_to_five(client, world, auth, completed_workout, bad):
    headers = auth(world["member_ngk_user"])
    response = _submit(client, headers, completed_workout.id, rating=bad)
    assert response.status_code == 422


def test_one_review_per_session(client, world, auth, completed_workout):
    headers = auth(world["member_ngk_user"])
    assert _submit(client, headers, completed_workout.id).status_code == 201
    again = _submit(client, headers, completed_workout.id)
    assert again.status_code == 409


def test_a_member_cannot_review_a_workout_that_is_not_theirs(client, db, world, auth):
    # Aditya's supervised session...
    session = WorkoutSession(
        member_id=world["member_ngk"].id,
        branch_id=world["member_ngk"].branch_id,
        split=WorkoutSplit.PULL,
        session_date=date.today() - timedelta(days=1),
        status=SessionStatus.COMPLETED,
        supervising_trainer_id=world["trainer_ngk"].id,
    )
    db.add(session)
    # ...a different member at the same branch cannot review it.
    _stranger, stranger_user = make_member(
        db, world["roles"], world["branches"]["ngk"], "Someone Else"
    )
    db.commit()
    assert _submit(client, auth(stranger_user), session.id).status_code == 404
    # And a trainer is not a member at all.
    assert _submit(client, auth(world["trainer_ngk_user"]), session.id).status_code == 403


def test_a_workout_with_no_supervising_trainer_has_nothing_to_review(client, db, world, auth):
    member = world["member_ngk"]
    solo = WorkoutSession(
        member_id=member.id,
        branch_id=member.branch_id,
        split=WorkoutSplit.LEGS,
        session_date=date.today(),
        status=SessionStatus.COMPLETED,
        supervising_trainer_id=None,
    )
    db.add(solo)
    db.commit()
    headers = auth(world["member_ngk_user"])
    prompt = client.get(
        f"{API}/feedback/reviews/prompt",
        headers=headers,
        params={"workout_session_id": solo.id},
    ).json()
    assert prompt["eligible"] is False
    assert prompt["trainer"] is None
    assert _submit(client, headers, solo.id).status_code == 422


# ---------------------------------------------------- member self-service


def test_a_member_can_retract_only_while_pending(client, db, world, auth, completed_workout):
    headers = auth(world["member_ngk_user"])
    review_id = _submit(client, headers, completed_workout.id).json()["id"]

    # Owner approves -> it is published -> retract is refused.
    client.post(
        f"{API}/feedback/reviews/{review_id}/moderate",
        headers=auth(world["owner"]),
        json={"action": "approve"},
    )
    blocked = client.delete(f"{API}/feedback/reviews/{review_id}", headers=headers)
    assert blocked.status_code == 409

    # A fresh pending one can be withdrawn, and the row is gone.
    second = WorkoutSession(
        member_id=world["member_ngk"].id,
        branch_id=world["member_ngk"].branch_id,
        split=WorkoutSplit.PULL,
        session_date=date.today() - timedelta(days=1),
        status=SessionStatus.COMPLETED,
        supervising_trainer_id=world["trainer_ngk"].id,
    )
    db.add(second)
    db.commit()
    other_id = _submit(client, headers, second.id).json()["id"]
    assert client.delete(f"{API}/feedback/reviews/{other_id}", headers=headers).status_code == 200
    assert db.get(TrainerReview, other_id) is None


def test_identity_is_withheld_until_the_member_consents(client, db, world, auth, completed_workout):
    member_headers = auth(world["member_ngk_user"])
    review_id = _submit(
        client, member_headers, completed_workout.id, comment="Superb form cues."
    ).json()["id"]
    client.post(
        f"{API}/feedback/reviews/{review_id}/moderate",
        headers=auth(world["owner"]),
        json={"action": "approve"},
    )

    testimonials = client.get(
        f"{API}/feedback/trainers/{world['trainer_ngk'].id}/testimonials",
        headers=auth(world["trainer_ngk_user"]),
    ).json()["testimonials"]
    assert testimonials[0]["author_label"] == "Verified GymFlow Member"

    # Member turns consent on -> now a first name + last initial, never the full name.
    client.patch(
        f"{API}/feedback/reviews/{review_id}/consent",
        headers=member_headers,
        json={"display_name_consent": True},
    )
    testimonials = client.get(
        f"{API}/feedback/trainers/{world['trainer_ngk'].id}/testimonials",
        headers=auth(world["trainer_ngk_user"]),
    ).json()["testimonials"]
    assert testimonials[0]["author_label"] == "Aditya R."
    assert "Rao" not in testimonials[0]["author_label"]

    # And can withdraw it again without un-publishing.
    client.patch(
        f"{API}/feedback/reviews/{review_id}/consent",
        headers=member_headers,
        json={"display_name_consent": False},
    )
    testimonials = client.get(
        f"{API}/feedback/trainers/{world['trainer_ngk'].id}/testimonials",
        headers=auth(world["trainer_ngk_user"]),
    ).json()["testimonials"]
    assert len(testimonials) == 1
    assert testimonials[0]["author_label"] == "Verified GymFlow Member"


# ----------------------------------------------------------- moderation


def test_pending_reviews_are_invisible_on_the_trainer_profile(
    client, world, auth, completed_workout
):
    _submit(
        client,
        auth(world["member_ngk_user"]),
        completed_workout.id,
        comment="Pending words.",
    )
    profile = client.get(
        f"{API}/feedback/trainers/{world['trainer_ngk'].id}/testimonials",
        headers=auth(world["trainer_ngk_user"]),
    ).json()
    assert profile["testimonials"] == []
    assert profile["summary"]["pending_count"] == 1
    assert profile["summary"]["review_count"] == 0


def test_owner_approves_and_it_appears(client, db, world, auth, completed_workout):
    review_id = _submit(
        client,
        auth(world["member_ngk_user"]),
        completed_workout.id,
        comment="He corrected my form.",
    ).json()["id"]

    queue = client.get(f"{API}/feedback/reviews", headers=auth(world["owner"])).json()
    assert any(r["id"] == review_id and r["status"] == "pending" for r in queue)

    approved = client.post(
        f"{API}/feedback/reviews/{review_id}/moderate",
        headers=auth(world["owner"]),
        json={"action": "approve"},
    )
    assert approved.status_code == 200
    assert approved.json()["status"] == "approved"

    review = db.get(TrainerReview, review_id)
    assert review.status == TrainerReviewStatus.APPROVED
    assert review.published_at is not None

    profile = client.get(
        f"{API}/feedback/trainers/{world['trainer_ngk'].id}/testimonials",
        headers=auth(world["trainer_ngk_user"]),
    ).json()
    assert profile["testimonials"][0]["comment"] == "He corrected my form."
    assert profile["summary"]["average_rating"] == 5.0
    assert profile["summary"]["review_count"] == 1


def test_owner_rejects_then_can_remove_an_approved_one(client, db, world, auth, completed_workout):
    review_id = _submit(client, auth(world["member_ngk_user"]), completed_workout.id).json()["id"]
    owner = auth(world["owner"])

    client.post(
        f"{API}/feedback/reviews/{review_id}/moderate",
        headers=owner,
        json={"action": "reject"},
    )
    assert db.get(TrainerReview, review_id).status == TrainerReviewStatus.REJECTED

    client.post(
        f"{API}/feedback/reviews/{review_id}/moderate",
        headers=owner,
        json={"action": "approve"},
    )
    assert db.get(TrainerReview, review_id).status == TrainerReviewStatus.APPROVED

    client.post(
        f"{API}/feedback/reviews/{review_id}/moderate",
        headers=owner,
        json={"action": "remove"},
    )
    removed = db.get(TrainerReview, review_id)
    assert removed.status == TrainerReviewStatus.REMOVED

    profile = client.get(
        f"{API}/feedback/trainers/{world['trainer_ngk'].id}/testimonials",
        headers=auth(world["trainer_ngk_user"]),
    ).json()
    assert profile["testimonials"] == []


def test_every_moderation_action_is_recorded(client, db, world, auth, completed_workout):
    review_id = _submit(client, auth(world["member_ngk_user"]), completed_workout.id).json()["id"]
    owner = auth(world["owner"])
    client.post(
        f"{API}/feedback/reviews/{review_id}/moderate",
        headers=owner,
        json={"action": "approve"},
    )
    client.post(
        f"{API}/feedback/reviews/{review_id}/moderate",
        headers=owner,
        json={"action": "note", "note": "Long-standing member, genuine."},
    )

    rows = (
        db.query(TrainerReviewModeration)
        .filter(TrainerReviewModeration.review_id == review_id)
        .order_by(TrainerReviewModeration.id)
        .all()
    )
    assert [r.action.value for r in rows] == ["approve", "note"]
    assert rows[1].note == "Long-standing member, genuine."

    from app.db.models import AuditLog

    audit_actions = {
        a.action for a in db.query(AuditLog).filter(AuditLog.entity_type == "trainer_review").all()
    }
    assert "feedback.review_submitted" in audit_actions
    assert "feedback.review_moderated" in audit_actions


def test_a_trainer_cannot_moderate_a_review_of_themselves(
    client, db, world, auth, completed_workout
):
    """Even if the trainer's user somehow reaches the endpoint, and even for a
    management user who is also the reviewed trainer."""
    review_id = _submit(client, auth(world["member_ngk_user"]), completed_workout.id).json()["id"]

    # A plain trainer has no moderation route (management-only dependency).
    forbidden = client.post(
        f"{API}/feedback/reviews/{review_id}/moderate",
        headers=auth(world["trainer_ngk_user"]),
        json={"action": "approve"},
    )
    assert forbidden.status_code == 403

    # Make the reviewed trainer's user a branch manager too, and it is still refused.
    world["trainer_ngk_user"].role = world["roles"]["branch_manager"]
    db.commit()
    still_forbidden = client.post(
        f"{API}/feedback/reviews/{review_id}/moderate",
        headers=auth(world["trainer_ngk_user"]),
        json={"action": "approve"},
    )
    assert still_forbidden.status_code == 403
    assert "themselves" in still_forbidden.json()["detail"].lower()


def test_a_reported_review_surfaces_at_the_top_of_the_queue(
    client, db, world, auth, completed_workout
):
    clean_id = _submit(client, auth(world["member_ngk_user"]), completed_workout.id).json()["id"]
    second = WorkoutSession(
        member_id=world["member_ngk"].id,
        branch_id=world["member_ngk"].branch_id,
        split=WorkoutSplit.PULL,
        session_date=date.today() - timedelta(days=1),
        status=SessionStatus.COMPLETED,
        supervising_trainer_id=world["trainer_ngk"].id,
    )
    db.add(second)
    db.commit()
    reported_id = _submit(
        client, auth(world["member_ngk_user"]), second.id, comment="something off"
    ).json()["id"]

    r = client.post(
        f"{API}/feedback/reviews/{reported_id}/report",
        headers=auth(world["member_ngk_user"]),
        json={"reason": "I want to change my wording."},
    )
    assert r.status_code == 200

    queue = client.get(f"{API}/feedback/reviews", headers=auth(world["owner"])).json()
    assert queue[0]["id"] == reported_id
    assert queue[0]["reported"] is True
    reported_only = client.get(
        f"{API}/feedback/reviews",
        headers=auth(world["owner"]),
        params={"reported": True},
    ).json()
    assert {r["id"] for r in reported_only} == {reported_id}
    assert clean_id not in {r["id"] for r in reported_only}


# ------------------------------------------------------------ isolation


def test_branch_isolation_on_the_moderation_queue(client, db, world, auth, completed_workout):
    _submit(client, auth(world["member_ngk_user"]), completed_workout.id)

    # The Boganhalli manager sees nothing from Nagalkeni.
    bgh_queue = client.get(f"{API}/feedback/reviews", headers=auth(world["manager_bgh"])).json()
    assert bgh_queue == []

    # The Nagalkeni manager does.
    ngk_queue = client.get(f"{API}/feedback/reviews", headers=auth(world["manager_ngk"])).json()
    assert len(ngk_queue) == 1

    # The owner sees every branch.
    owner_queue = client.get(f"{API}/feedback/reviews", headers=auth(world["owner"])).json()
    assert len(owner_queue) == 1


def test_a_member_only_sees_their_own_reviews(client, world, auth, completed_workout):
    _submit(client, auth(world["member_ngk_user"]), completed_workout.id)
    mine = client.get(f"{API}/feedback/reviews/me", headers=auth(world["member_ngk_user"])).json()
    assert len(mine) == 1
    # The member has no access to the moderation queue.
    assert (
        client.get(f"{API}/feedback/reviews", headers=auth(world["member_ngk_user"])).status_code
        == 403
    )


def test_trainer_summaries_are_management_only_and_branch_scoped(
    client, world, auth, completed_workout
):
    review_id = _submit(client, auth(world["member_ngk_user"]), completed_workout.id).json()["id"]
    client.post(
        f"{API}/feedback/reviews/{review_id}/moderate",
        headers=auth(world["owner"]),
        json={"action": "approve"},
    )

    assert (
        client.get(
            f"{API}/feedback/trainer-summaries", headers=auth(world["member_ngk_user"])
        ).status_code
        == 403
    )
    owner_rows = client.get(
        f"{API}/feedback/trainer-summaries", headers=auth(world["owner"])
    ).json()
    vikas = next(r for r in owner_rows if r["trainer"]["id"] == world["trainer_ngk"].id)
    assert vikas["summary"]["average_rating"] == 5.0

    bgh_rows = client.get(
        f"{API}/feedback/trainer-summaries", headers=auth(world["manager_bgh"])
    ).json()
    assert all(r["trainer"]["id"] != world["trainer_ngk"].id for r in bgh_rows)


def test_trainer_sees_only_their_own_rating_summary(client, world, auth, completed_workout):
    review_id = _submit(client, auth(world["member_ngk_user"]), completed_workout.id).json()["id"]
    client.post(
        f"{API}/feedback/reviews/{review_id}/moderate",
        headers=auth(world["owner"]),
        json={"action": "approve"},
    )
    summary = client.get(
        f"{API}/feedback/me/rating-summary", headers=auth(world["trainer_ngk_user"])
    ).json()
    assert summary["trainer_id"] == world["trainer_ngk"].id
    assert summary["review_count"] == 1
    assert summary["approved_testimonial_count"] == 0  # no comment on this one

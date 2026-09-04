"""Ask GymFlow — constrained, deterministic answers over the intelligence layer."""

from __future__ import annotations

from datetime import date, timedelta

from conftest import make_member
from intelligence_helpers import add_weekly_workouts, add_workout

API = "/api/v1/intelligence"


def _ask(client, actor, question, member_id=None):
    body = {"question": question}
    if member_id is not None:
        body["member_id"] = member_id
    return client.post(f"{API}/ask", json=body, headers=actor)


# --------------------------------------------------------------- member


def test_member_overview_answer_is_built_from_signals(client, db, world, auth):
    member = world["member_ngk"]
    add_weekly_workouts(db, member, ending=date.today(), weeks=4, per_week=3)
    db.commit()

    r = _ask(client, auth(world["member_ngk_user"]), "How am I doing?")
    assert r.status_code == 200
    body = r.json()
    assert body["intent"] == "overview"
    assert body["source"] == "deterministic"
    assert body["answer"]
    assert body["suggestions"]  # follow-up chips


def test_member_consistency_question(client, db, world, auth):
    member = world["member_ngk"]
    add_weekly_workouts(db, member, ending=date.today(), weeks=4, per_week=3)
    db.commit()
    body = _ask(client, auth(world["member_ngk_user"]), "Am I training consistently?").json()
    assert body["intent"] == "consistency"
    assert any("week" in d["label"].lower() for d in body["data"])


def test_member_records_question_when_there_are_none(client, db, world, auth):
    member = world["member_ngk"]
    add_workout(db, member, on=date.today() - timedelta(days=3), sets=[(60, 8)])
    db.commit()
    body = _ask(client, auth(world["member_ngk_user"]), "Any recent PRs?").json()
    assert body["intent"] == "records"
    assert "No personal records" in body["answer"]


def test_member_next_weight_needs_the_lift_named(client, db, world, auth):
    member = world["member_ngk"]
    add_workout(
        db, member, on=date.today() - timedelta(days=10), exercise="Back Squat", sets=[(80, 8)]
    )
    add_workout(
        db, member, on=date.today() - timedelta(days=3), exercise="Back Squat", sets=[(85, 8)]
    )
    db.commit()

    vague = _ask(client, auth(world["member_ngk_user"]), "Should I go heavier?").json()
    assert vague["intent"] == "next_weight"
    assert "which lift" in vague["answer"].lower()

    named = _ask(
        client, auth(world["member_ngk_user"]), "Should I go heavier on Back Squat?"
    ).json()
    assert named["intent"] == "next_weight"
    assert "not a change to your programme" in named["answer"]


def test_unrecognised_member_question_says_what_can_be_asked(client, world, auth):
    body = _ask(client, auth(world["member_ngk_user"]), "what's the weather").json()
    assert body["intent"] == "unrecognised"
    assert "consistency" in body["answer"]
    assert body["suggestions"]


def test_a_member_cannot_ask_about_someone_else(client, db, world, auth):
    other, _ = make_member(db, world["roles"], world["branches"]["ngk"], "Someone Else")
    add_weekly_workouts(db, world["member_ngk"], ending=date.today(), weeks=4, per_week=3)
    db.commit()
    # member_id is ignored for a member — the answer is about themselves.
    body = _ask(
        client, auth(world["member_ngk_user"]), "How am I doing?", member_id=other.id
    ).json()
    assert body["intent"] in ("overview", "unrecognised")
    # Nothing about the other member leaked.
    assert "Someone Else" not in body["answer"]


# --------------------------------------------------------------- trainer


def test_trainer_asks_about_a_client_in_context(client, db, world, auth):
    member = world["member_ngk"]
    add_weekly_workouts(db, member, ending=date.today(), weeks=4, per_week=3)
    db.commit()
    body = _ask(
        client, auth(world["trainer_ngk_user"]), "How is Aditya?", member_id=member.id
    ).json()
    assert body["intent"] == "member"
    assert body["action"]["route"] == f"/(trainer)/client/{member.id}"


def test_trainer_cannot_ask_about_a_member_at_another_branch(client, db, world, auth):
    r = _ask(
        client,
        auth(world["trainer_bgh_user"]),
        "How is this client?",
        member_id=world["member_ngk"].id,
    )
    assert r.status_code == 403


def test_trainer_who_needs_attention(client, db, world, auth):
    for days_ago in (60, 55, 50, 45):
        add_workout(db, world["member_ngk"], on=date.today() - timedelta(days=days_ago))
    db.commit()
    body = _ask(client, auth(world["trainer_ngk_user"]), "Who needs attention?").json()
    assert body["intent"] == "attention"
    assert body["data"]  # at least one client listed


# --------------------------------------------------------------- owner


def test_owner_attention_question(client, db, world, auth):
    body = _ask(client, auth(world["owner"]), "What needs my attention today?").json()
    assert body["intent"] == "attention"
    assert body["source"] == "deterministic"


def test_owner_punctuality_question(client, world, auth):
    body = _ask(client, auth(world["owner"]), "How is trainer punctuality?").json()
    assert body["intent"] == "punctuality"


def test_owner_tell_me_more_explains_the_matching_issue(client, db, world, auth):
    """The dashboard "Tell me more" entry point: the question carries the
    issue's title and the answer re-explains that specific issue."""
    from datetime import date, timedelta

    from intelligence_helpers import add_attendance

    from app.db.models import AttendanceStatus

    t = world["trainer_ngk"]
    b = world["branches"]["ngk"].id
    add_attendance(
        db, t.id, b, on=date.today() - timedelta(days=1), status=AttendanceStatus.ABSENT, n=4
    )
    db.commit()

    body = _ask(
        client,
        auth(world["owner"]),
        "Tell me more about: 4 unworked shifts this month",
    ).json()
    assert body["intent"] == "explain"
    assert "unworked" in body["answer"].lower()
    assert body["data"]  # the evidence behind that issue


def test_owner_why_is_this_flagged_falls_back_to_the_top_issue(client, db, world, auth):
    from datetime import date, timedelta

    from intelligence_helpers import add_attendance

    from app.db.models import AttendanceStatus

    add_attendance(
        db,
        world["trainer_ngk"].id,
        world["branches"]["ngk"].id,
        on=date.today() - timedelta(days=1),
        status=AttendanceStatus.ABSENT,
        n=4,
    )
    db.commit()
    body = _ask(client, auth(world["owner"]), "Why is this flagged?").json()
    assert body["intent"] == "explain"
    assert body["answer"]


def test_a_branch_manager_explain_stays_in_scope(client, db, world, auth):
    """`_owner_explain` re-runs the daily brief with the caller's
    scoped_branch_filter — a branch manager never sees another branch's issue."""
    from datetime import date, timedelta

    from intelligence_helpers import add_attendance

    from app.db.models import AttendanceStatus

    # An absence at Boganhalli — outside the NGK manager's scope.
    add_attendance(
        db,
        world["trainer_bgh"].id,
        world["branches"]["bgh"].id,
        on=date.today() - timedelta(days=1),
        status=AttendanceStatus.ABSENT,
        n=5,
    )
    db.commit()
    body = _ask(client, auth(world["manager_ngk"]), "Tell me more about unworked shifts").json()
    assert body["intent"] == "explain"
    # The Boganhalli absence (5 unworked shifts) is outside the NGK manager's
    # scope, so it can never be the issue explained.
    assert "5 unworked" not in body["answer"]
    blob = " ".join(f"{d['label']} {d['value']}" for d in body["data"])
    assert "5" not in blob or "unworked" not in blob.lower()


# --------------------------------------------------------------- suggestions


def test_suggestions_are_role_aware(client, db, world, auth):
    member_chips = client.get(
        f"{API}/ask/suggestions", headers=auth(world["member_ngk_user"])
    ).json()["suggestions"]
    assert any("How am I doing" in c for c in member_chips)

    owner_chips = client.get(f"{API}/ask/suggestions", headers=auth(world["owner"])).json()[
        "suggestions"
    ]
    assert any("attention" in c.lower() for c in owner_chips)

    trainer_chips = client.get(
        f"{API}/ask/suggestions?member_id={world['member_ngk'].id}",
        headers=auth(world["trainer_ngk_user"]),
    ).json()["suggestions"]
    assert any("Aditya" in c for c in trainer_chips)  # first name substituted

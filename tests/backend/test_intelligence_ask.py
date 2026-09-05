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
    # The deep link must carry the lift — progress-exercise renders nothing
    # without an ?exercise= query param.
    assert named["action"]["route"] == "/(member)/progress-exercise?exercise=Back%20Squat"


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


def test_owner_attendance_means_member_visits_not_trainer_shifts(client, db, world, auth):
    """The bug device QA surfaced: the weekly card shows member visits up,
    but Ask read "attendance" as trainer shifts and said "no shifts
    recorded". Bare "attendance" for an owner is member attendance."""
    from datetime import UTC, date, datetime

    from app.db.models import AttendanceEvent, CaptureMethod, EventType, PersonType

    branch = world["branches"]["ngk"]
    for day in (26, 27, 29):
        db.add(
            AttendanceEvent(
                branch_id=branch.id,
                user_id=world["member_ngk"].user_id,
                person_type=PersonType.MEMBER,
                event_type=EventType.CHECK_IN,
                method=CaptureMethod.QR,
                occurred_at=datetime(2026, 8, day, 8, tzinfo=UTC),
                work_date=date(2026, 8, day),
            )
        )
    db.commit()

    body = _ask(client, auth(world["owner"]), "How is attendance trending?").json()
    assert body["intent"] == "member_visits"
    assert "member attendance" in body["answer"].lower()
    assert body["action"]["route"] == "/(owner)/members"
    assert any("member visits" in d["label"].lower() for d in body["data"])


def test_owner_trainer_attendance_still_resolves_to_punctuality(client, world, auth):
    for q in (
        "How are the trainers doing with attendance?",
        "trainer shift attendance",
        "staff punctuality this week",
        "any unworked shifts?",
    ):
        body = _ask(client, auth(world["owner"]), q).json()
        assert body["intent"] == "punctuality", q


def test_owner_footfall_and_busy_questions_route_to_member_visits(client, world, auth):
    for q in ("What was footfall last week?", "How busy was the gym?", "member visits"):
        body = _ask(client, auth(world["owner"]), q).json()
        assert body["intent"] == "member_visits", q


def test_member_attendance_question_means_their_own_consistency(client, db, world, auth):
    from datetime import date

    from intelligence_helpers import add_weekly_workouts

    add_weekly_workouts(db, world["member_ngk"], ending=date.today(), weeks=4, per_week=3)
    db.commit()
    body = _ask(client, auth(world["member_ngk_user"]), "How is my attendance?").json()
    assert body["intent"] == "consistency"


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
    assert any("progressing" in c.lower() for c in member_chips)
    assert any("slowed" in c.lower() for c in member_chips)

    owner_chips = client.get(f"{API}/ask/suggestions", headers=auth(world["owner"])).json()[
        "suggestions"
    ]
    assert any("attention" in c.lower() for c in owner_chips)
    assert any("branch" in c.lower() for c in owner_chips)
    # The attendance chip must name *member* attendance, and there is a
    # separate trainer-punctuality chip — the two are no longer conflated.
    assert any("member attendance" in c.lower() for c in owner_chips)
    assert any("punctuality" in c.lower() for c in owner_chips)
    # Every owner chip resolves to a real intent (no unrecognised fallback).
    for chip in owner_chips:
        assert _ask(client, auth(world["owner"]), chip).json()["intent"] != "unrecognised", chip

    trainer_chips_no_ctx = client.get(
        f"{API}/ask/suggestions", headers=auth(world["trainer_ngk_user"])
    ).json()["suggestions"]
    assert any("focus on today" in c.lower() for c in trainer_chips_no_ctx)

    trainer_chips = client.get(
        f"{API}/ask/suggestions?member_id={world['member_ngk'].id}",
        headers=auth(world["trainer_ngk_user"]),
    ).json()["suggestions"]
    assert any("Aditya" in c for c in trainer_chips)  # first name substituted


def test_member_slowdown_question_gives_the_specific_reason(client, db, world, auth):
    from datetime import date, timedelta

    from intelligence_helpers import add_weekly_workouts

    member = world["member_ngk"]
    # Heavier previous 4 weeks, much lighter recent 4 → a declining trend.
    span = 28
    add_weekly_workouts(
        db, member, ending=date.today() - timedelta(days=span), weeks=4, per_week=3, weight_kg=80
    )
    add_weekly_workouts(db, member, ending=date.today(), weeks=4, per_week=3, weight_kg=40)
    db.commit()

    body = _ask(client, auth(world["member_ngk_user"]), "Why has my progress slowed?").json()
    assert body["intent"] == "slowdown"
    assert "volume is down" in body["answer"].lower()
    assert body["data"]


def test_trainer_focus_today_without_a_client_picks_the_top_of_the_queue(client, db, world, auth):
    from datetime import date, timedelta

    for days_ago in (60, 55, 50, 45):
        add_workout(db, world["member_ngk"], on=date.today() - timedelta(days=days_ago))
    db.commit()
    body = _ask(client, auth(world["trainer_ngk_user"]), "What should I focus on today?").json()
    assert body["intent"] == "focus_today"
    assert body["data"]
    assert body["action"]["route"].startswith("/(trainer)/client/")


def test_owner_which_branch_needs_attention(client, db, world, auth):
    from datetime import date, timedelta

    from intelligence_helpers import add_attendance

    from app.db.models import AttendanceStatus

    # Nagalkeni all late this month, Boganhalli all on time.
    add_attendance(
        db,
        world["trainer_ngk"].id,
        world["branches"]["ngk"].id,
        on=date.today().replace(day=1) + timedelta(days=1),
        status=AttendanceStatus.LATE,
        n=12,
    )
    add_attendance(
        db,
        world["trainer_bgh"].id,
        world["branches"]["bgh"].id,
        on=date.today().replace(day=1) + timedelta(days=1),
        status=AttendanceStatus.COMPLETED,
        n=12,
    )
    db.commit()
    body = _ask(client, auth(world["owner"]), "Which branch needs attention?").json()
    assert body["intent"] == "branch"
    assert "Nagalkeni" in body["answer"]
    assert body["action"]["route"].startswith("/(owner)/branch/")

"""Workout templates and each member's independent workout programme.

Covers the shape of the PPL-removal mandate directly: PPL is one template
among several (not the architecture), applying a template copies it so a
later template edit never rewrites an already-assigned member, and a trainer
can freely add/rename/reorder/delete days and exercises within a member's own
copy. None of this touches the 45-day journey/``WorkoutSplit`` machinery —
``test_journey.py`` covers that separately and is untouched by this file.
"""

from __future__ import annotations

from sqlalchemy import select

from app.db.models import MemberWorkoutProgram, WorkoutTemplate, WorkoutTemplateExercise
from app.services import workout_template_service


def test_default_templates_are_seeded_and_idempotent(db):
    workout_template_service.ensure_default_templates(db)
    db.commit()

    templates = db.scalars(select(WorkoutTemplate)).all()
    keys = {t.key for t in templates}
    assert "ppl_6day" in keys
    assert len(templates) == 9  # the full default pack from the master brief

    ppl = next(t for t in templates if t.key == "ppl_6day")
    assert len(ppl.days) == 6
    assert ppl.days[0].exercises  # PPL's push day carries real exercises

    # Calling again must not duplicate rows.
    workout_template_service.ensure_default_templates(db)
    db.commit()
    assert len(db.scalars(select(WorkoutTemplate)).all()) == 9


def test_list_templates_api_returns_system_pack(client, world, auth, db):
    workout_template_service.ensure_default_templates(db)
    db.commit()

    headers = auth(world["trainer_ngk_user"])
    response = client.get("/api/v1/workout-templates", headers=headers)
    assert response.status_code == 200, response.text
    names = {t["name"] for t in response.json()}
    assert "Push / Pull / Legs" in names
    assert "Beginner Full Body" in names


def test_apply_template_creates_independent_copy(client, world, auth, db):
    workout_template_service.ensure_default_templates(db)
    db.commit()

    member = world["member_ngk"]
    ppl = db.scalar(select(WorkoutTemplate).where(WorkoutTemplate.key == "ppl_6day"))
    headers = auth(world["trainer_ngk_user"])

    response = client.post(
        f"/api/v1/members/{member.id}/program/apply-template",
        json={"template_id": ppl.id},
        headers=headers,
    )
    assert response.status_code == 201, response.text
    program = response.json()
    assert program["source_template_id"] == ppl.id
    assert len(program["days"]) == 6
    push_day = next(d for d in program["days"] if d["name"] == "Push A")
    original_exercise_count = len(push_day["exercises"])
    assert original_exercise_count > 0

    # Editing the template afterward must not touch the member's own copy.
    template_push_day = ppl.days[0]
    db.add(
        WorkoutTemplateExercise(
            template_day_id=template_push_day.id,
            order_index=99,
            exercise="Added after the member's copy was made",
            sets=1,
            reps="1",
            rest_seconds=0,
        )
    )
    db.commit()

    refreshed = client.get(f"/api/v1/members/{member.id}/program", headers=headers)
    assert refreshed.status_code == 200, refreshed.text
    refreshed_push_day = next(d for d in refreshed.json()["days"] if d["name"] == "Push A")
    assert len(refreshed_push_day["exercises"]) == original_exercise_count


def test_applying_a_new_template_retires_the_previous_program(client, world, auth, db):
    workout_template_service.ensure_default_templates(db)
    db.commit()
    member = world["member_ngk"]
    headers = auth(world["trainer_ngk_user"])
    ppl = db.scalar(select(WorkoutTemplate).where(WorkoutTemplate.key == "ppl_6day"))
    upper_lower = db.scalar(
        select(WorkoutTemplate).where(WorkoutTemplate.key == "upper_lower_4day")
    )

    first = client.post(
        f"/api/v1/members/{member.id}/program/apply-template",
        json={"template_id": ppl.id},
        headers=headers,
    ).json()
    second = client.post(
        f"/api/v1/members/{member.id}/program/apply-template",
        json={"template_id": upper_lower.id},
        headers=headers,
    ).json()

    assert second["id"] != first["id"]
    programs = db.scalars(
        select(MemberWorkoutProgram).where(MemberWorkoutProgram.member_id == member.id)
    ).all()
    active = [p for p in programs if p.is_active]
    assert len(active) == 1
    assert active[0].id == second["id"]


def test_trainer_can_build_a_fully_custom_program(client, world, auth):
    member = world["member_ngk"]
    headers = auth(world["trainer_ngk_user"])

    created = client.post(
        f"/api/v1/members/{member.id}/program/custom",
        json={"name": "Custom plan"},
        headers=headers,
    )
    assert created.status_code == 201, created.text

    day1 = client.post(
        f"/api/v1/members/{member.id}/program/days",
        json={"name": "Day 1 — Upper Strength", "category": "upper"},
        headers=headers,
    )
    assert day1.status_code == 201, day1.text
    day1_id = day1.json()["id"]

    day2 = client.post(
        f"/api/v1/members/{member.id}/program/days",
        json={"name": "Day 2 — Lower Strength", "category": "lower"},
        headers=headers,
    )
    assert day2.status_code == 201, day2.text
    day2_id = day2.json()["id"]

    # Rename + reorder.
    renamed = client.put(
        f"/api/v1/members/{member.id}/program/days/{day1_id}",
        json={"name": "Day 1 — Push Focus"},
        headers=headers,
    )
    assert renamed.status_code == 200
    assert renamed.json()["name"] == "Day 1 — Push Focus"

    reordered = client.put(
        f"/api/v1/members/{member.id}/program/days/reorder",
        json={"day_ids": [day2_id, day1_id]},
        headers=headers,
    )
    assert reordered.status_code == 200
    assert [d["id"] for d in reordered.json()] == [day2_id, day1_id]

    # Exercises within a day.
    added = client.post(
        f"/api/v1/members/{member.id}/program/days/{day1_id}/exercises",
        json={"exercise": "Overhead Press", "sets": 4, "reps": "6-8", "rest_seconds": 90},
        headers=headers,
    )
    assert added.status_code == 201, added.text
    exercise_id = added.json()["exercises"][0]["id"]

    updated = client.put(
        f"/api/v1/members/{member.id}/program/days/{day1_id}/exercises/{exercise_id}",
        json={"sets": 5},
        headers=headers,
    )
    assert updated.status_code == 200
    assert updated.json()["exercises"][0]["sets"] == 5

    removed = client.delete(
        f"/api/v1/members/{member.id}/program/days/{day1_id}/exercises/{exercise_id}",
        headers=headers,
    )
    assert removed.status_code == 204

    deleted = client.delete(f"/api/v1/members/{member.id}/program/days/{day2_id}", headers=headers)
    assert deleted.status_code == 204

    program = client.get(f"/api/v1/members/{member.id}/program", headers=headers).json()
    assert [d["id"] for d in program["days"]] == [day1_id]
    assert program["days"][0]["exercises"] == []


def test_member_cannot_write_their_own_program(client, world, auth):
    member = world["member_ngk"]
    headers = auth(world["member_ngk_user"])

    response = client.post(
        f"/api/v1/members/{member.id}/program/custom",
        json={"name": "Self-authored plan"},
        headers=headers,
    )
    assert response.status_code == 403

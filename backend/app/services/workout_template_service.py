"""Workout templates and each member's independent copy of one.

A template is a reusable, editable starting point. Applying one to a member
copies its days and exercises into a new :class:`MemberWorkoutProgram` —
editing the template afterward never rewrites a member's already-assigned
copy, because after the copy the two share no rows. PPL is one seeded
template among several (see :mod:`app.domain.workout_templates_library`), not
the system's assumption; the 45-day journey's own PPL rotation
(:mod:`app.domain.journey`, ``WorkoutPlan``) is untouched by any of this.
"""

from __future__ import annotations

from datetime import date

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.clock import to_branch_time
from app.db.models import (
    Member,
    MemberWorkoutProgram,
    MemberWorkoutProgramDay,
    MemberWorkoutProgramExercise,
    WorkoutCategory,
    WorkoutTemplate,
    WorkoutTemplateDay,
    WorkoutTemplateExercise,
)
from app.domain.workout_templates_library import TEMPLATES


def ensure_default_templates(db: Session) -> None:
    """Create (or refresh the content of) the seeded system template pack.

    Idempotent and safe to call on every boot/seed run: matched by ``key``,
    never by ``name``, so a trainer renaming their view of "Push / Pull /
    Legs" doesn't cause it to be recreated. Refreshing an existing system
    template's days/exercises only touches the template row itself — any
    member who already applied it keeps their own independent copy.
    """
    for spec in TEMPLATES:
        template = db.scalar(select(WorkoutTemplate).where(WorkoutTemplate.key == spec.key))
        if template is None:
            template = WorkoutTemplate(
                key=spec.key,
                name=spec.name,
                description=spec.description,
                category=WorkoutCategory(spec.category),
                image_key=spec.image_key,
                is_system=True,
                is_active=True,
            )
            db.add(template)
            db.flush()
        else:
            template.name = spec.name
            template.description = spec.description
            template.category = WorkoutCategory(spec.category)
            template.image_key = spec.image_key
            # Rebuild this system template's own days/exercises from the
            # content spec — never touches any member's already-applied copy.
            for day in list(template.days):
                db.delete(day)
            db.flush()

        for day_index, day_spec in enumerate(spec.days):
            day = WorkoutTemplateDay(
                template_id=template.id,
                order_index=day_index,
                name=day_spec.name,
                category=WorkoutCategory(day_spec.category),
                image_key=day_spec.category,
                estimated_duration_minutes=day_spec.estimated_duration_minutes,
            )
            db.add(day)
            db.flush()
            for ex_index, (name, sets, reps, rest, notes) in enumerate(day_spec.exercises):
                db.add(
                    WorkoutTemplateExercise(
                        template_day_id=day.id,
                        order_index=ex_index,
                        exercise=name,
                        sets=sets,
                        reps=reps,
                        rest_seconds=rest,
                        notes=notes,
                    )
                )
    db.flush()


def list_templates(db: Session, *, branch_id: int | None = None) -> list[WorkoutTemplate]:
    """System templates plus a branch's own custom templates.

    A trainer at branch A never sees branch B's custom templates — only the
    global system pack (``branch_id IS NULL``) and their own branch's rows.
    """
    stmt = select(WorkoutTemplate).where(WorkoutTemplate.is_active.is_(True))
    if branch_id is not None:
        stmt = stmt.where(
            (WorkoutTemplate.branch_id.is_(None)) | (WorkoutTemplate.branch_id == branch_id)
        )
    else:
        stmt = stmt.where(WorkoutTemplate.branch_id.is_(None))
    stmt = stmt.order_by(WorkoutTemplate.is_system.desc(), WorkoutTemplate.name)
    return list(db.scalars(stmt).unique())


def get_template(db: Session, template_id: int) -> WorkoutTemplate:
    template = db.get(WorkoutTemplate, template_id)
    if template is None or not template.is_active:
        raise HTTPException(status_code=404, detail="Template not found")
    return template


def active_program(db: Session, member_id: int) -> MemberWorkoutProgram | None:
    return db.scalar(
        select(MemberWorkoutProgram).where(
            MemberWorkoutProgram.member_id == member_id,
            MemberWorkoutProgram.is_active.is_(True),
        )
    )


def program_anchor_date(program: MemberWorkoutProgram, tz_name: str | None = None) -> date:
    """Day 0 of the rotation — the calendar date the programme was set up.

    ``created_at`` is a UTC instant, so its *date* depends on the timezone it
    is read in. The rotation steps against ``on``, which callers derive from
    ``branch_today(...)`` — a branch-local date — so the anchor must be the
    branch-local date of ``created_at`` too. Reading it as the UTC date
    (the old behaviour) put the anchor a day off in the hours where the
    branch-local calendar day is ahead of UTC, landing "start workout" on the
    wrong programme day.
    """
    return to_branch_time(program.created_at, tz_name).date()


def resolve_program_day_for_date(
    program: MemberWorkoutProgram,
    on: date,
    *,
    tz_name: str | None = None,
) -> MemberWorkoutProgramDay | None:
    """Which of this programme's days falls on ``on``, on a calendar rotation.

    Day 1, Day 2, Day 3, Day 1, … stepping once per calendar day from
    ``program_anchor_date`` (in ``tz_name``, the branch's zone), in the order
    the trainer arranged them. A pure function of the date, so "what does the
    Workout screen preview say" and "what does Start actually open" can never
    disagree, and asking twice on the same day gives the same day — the
    previous rule counted ``WorkoutSession`` rows, which drifted every time a
    workout was started and never lined up with the week strip's calendar.
    """
    days = sorted(program.days, key=lambda d: d.order_index)
    if not days:
        return None
    offset = (on - program_anchor_date(program, tz_name)).days
    return days[offset % len(days)]


def resolve_today_program_day(
    program: MemberWorkoutProgram, *, on: date, tz_name: str | None = None
) -> MemberWorkoutProgramDay | None:
    """``resolve_program_day_for_date`` for the branch's current date.

    ``on`` is always the caller's ``branch_today(tz_name)`` — never a device
    clock — and ``tz_name`` is the same branch zone, so the anchor and the
    step are read in one timezone and "today" is the date the server uses
    everywhere else.
    """
    return resolve_program_day_for_date(program, on, tz_name=tz_name)


def apply_template(
    db: Session,
    *,
    member: Member,
    template: WorkoutTemplate,
    created_by_user_id: int | None,
) -> MemberWorkoutProgram:
    """Copy a template's days and exercises into a new programme for this member.

    Retires the member's current active programme (if any) rather than
    deleting it — past sessions still point at its days, so it stays around
    as history, just no longer the live one.
    """
    current = active_program(db, member.id)
    if current is not None:
        current.is_active = False
        db.flush()

    program = MemberWorkoutProgram(
        member_id=member.id,
        source_template_id=template.id,
        name=template.name,
        is_active=True,
        created_by_user_id=created_by_user_id,
    )
    db.add(program)
    db.flush()

    for day in template.days:
        program_day = MemberWorkoutProgramDay(
            program_id=program.id,
            order_index=day.order_index,
            name=day.name,
            category=day.category,
            image_key=day.image_key,
            estimated_duration_minutes=day.estimated_duration_minutes,
        )
        db.add(program_day)
        db.flush()
        for exercise in day.exercises:
            db.add(
                MemberWorkoutProgramExercise(
                    program_day_id=program_day.id,
                    order_index=exercise.order_index,
                    exercise=exercise.exercise,
                    sets=exercise.sets,
                    reps=exercise.reps,
                    rest_seconds=exercise.rest_seconds,
                    notes=exercise.notes,
                )
            )
    db.flush()
    return program


def create_custom_program(
    db: Session, *, member: Member, name: str, created_by_user_id: int | None
) -> MemberWorkoutProgram:
    """Start a member on an empty programme with no template — fully custom."""
    current = active_program(db, member.id)
    if current is not None:
        current.is_active = False
        db.flush()

    program = MemberWorkoutProgram(
        member_id=member.id,
        source_template_id=None,
        name=name,
        is_active=True,
        created_by_user_id=created_by_user_id,
    )
    db.add(program)
    db.flush()
    return program


def _next_day_order(program: MemberWorkoutProgram) -> int:
    return (max((d.order_index for d in program.days), default=-1)) + 1


def add_day(
    db: Session,
    *,
    program: MemberWorkoutProgram,
    name: str,
    category: WorkoutCategory,
    estimated_duration_minutes: int | None = None,
) -> MemberWorkoutProgramDay:
    day = MemberWorkoutProgramDay(
        program_id=program.id,
        order_index=_next_day_order(program),
        name=name,
        category=category,
        image_key=category.value,
        estimated_duration_minutes=estimated_duration_minutes,
    )
    db.add(day)
    db.flush()
    return day


def rename_day(
    db: Session,
    *,
    day: MemberWorkoutProgramDay,
    name: str | None = None,
    category: WorkoutCategory | None = None,
    estimated_duration_minutes: int | None = None,
) -> MemberWorkoutProgramDay:
    if name is not None:
        day.name = name
    if category is not None:
        day.category = category
        day.image_key = category.value
    if estimated_duration_minutes is not None:
        day.estimated_duration_minutes = estimated_duration_minutes
    db.flush()
    return day


def reorder_days(
    db: Session, *, program: MemberWorkoutProgram, day_ids_in_order: list[int]
) -> list[MemberWorkoutProgramDay]:
    by_id = {day.id: day for day in program.days}
    if set(by_id) != set(day_ids_in_order):
        raise HTTPException(
            status_code=400, detail="The reordered list must contain every day exactly once"
        )
    # Two-phase: push everything past the end first so the unique
    # (program_id, order_index) constraint never collides mid-update.
    offset = len(day_ids_in_order)
    for day in by_id.values():
        day.order_index += offset
    db.flush()
    for index, day_id in enumerate(day_ids_in_order):
        by_id[day_id].order_index = index
    db.flush()
    return sorted(by_id.values(), key=lambda d: d.order_index)


def delete_day(db: Session, *, day: MemberWorkoutProgramDay) -> None:
    db.delete(day)
    db.flush()


def _next_exercise_order(day: MemberWorkoutProgramDay) -> int:
    return (max((e.order_index for e in day.exercises), default=-1)) + 1


def add_exercise(
    db: Session,
    *,
    day: MemberWorkoutProgramDay,
    exercise: str,
    sets: int = 3,
    reps: str = "10",
    rest_seconds: int = 60,
    notes: str | None = None,
) -> MemberWorkoutProgramExercise:
    row = MemberWorkoutProgramExercise(
        program_day_id=day.id,
        order_index=_next_exercise_order(day),
        exercise=exercise,
        sets=sets,
        reps=reps,
        rest_seconds=rest_seconds,
        notes=notes,
    )
    db.add(row)
    db.flush()
    return row


def update_exercise(
    db: Session,
    *,
    exercise_row: MemberWorkoutProgramExercise,
    exercise: str | None = None,
    sets: int | None = None,
    reps: str | None = None,
    rest_seconds: int | None = None,
    notes: str | None = None,
) -> MemberWorkoutProgramExercise:
    if exercise is not None:
        exercise_row.exercise = exercise
    if sets is not None:
        exercise_row.sets = sets
    if reps is not None:
        exercise_row.reps = reps
    if rest_seconds is not None:
        exercise_row.rest_seconds = rest_seconds
    if notes is not None:
        exercise_row.notes = notes
    db.flush()
    return exercise_row


def reorder_exercises(
    db: Session, *, day: MemberWorkoutProgramDay, exercise_ids_in_order: list[int]
) -> list[MemberWorkoutProgramExercise]:
    by_id = {ex.id: ex for ex in day.exercises}
    if set(by_id) != set(exercise_ids_in_order):
        raise HTTPException(
            status_code=400,
            detail="The reordered list must contain every exercise exactly once",
        )
    for index, ex_id in enumerate(exercise_ids_in_order):
        by_id[ex_id].order_index = index
    db.flush()
    return sorted(by_id.values(), key=lambda e: e.order_index)


def remove_exercise(db: Session, *, exercise_row: MemberWorkoutProgramExercise) -> None:
    db.delete(exercise_row)
    db.flush()


__all__ = [
    "ensure_default_templates",
    "list_templates",
    "get_template",
    "active_program",
    "apply_template",
    "create_custom_program",
    "add_day",
    "rename_day",
    "reorder_days",
    "delete_day",
    "add_exercise",
    "update_exercise",
    "reorder_exercises",
    "remove_exercise",
]

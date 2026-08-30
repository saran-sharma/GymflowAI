"""Workout templates and each member's own workout programme.

Deliberately a separate router from ``journeys``: the 45-day journey's PPL
rotation (``WorkoutPlan``/``WorkoutSplit``) is a different, untouched system —
this is the templates/custom-days world that sits alongside it, per member,
independent of which journey (if any) a member is on.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy import select
from sqlalchemy.orm import Session, joinedload

# Reuses the same read/write authority checks the 45-day journey/plan
# endpoints already apply — a member sees only themselves, a trainer only
# members at their own branch, and only staff (never a member) can write.
from app.api.v1.journeys import _load_member, assert_can_read_member, assert_can_write_member
from app.core.clock import branch_today
from app.core.deps import get_current_user
from app.db.models import (
    MemberWorkoutProgram,
    MemberWorkoutProgramDay,
    RoleKey,
    Trainer,
    User,
)
from app.db.session import get_db
from app.schemas.training import (
    AddProgramDayRequest,
    AddProgramExerciseRequest,
    ApplyTemplateRequest,
    CreateCustomProgramRequest,
    MemberWorkoutProgramOut,
    ProgramDayOut,
    RenameProgramDayRequest,
    ReorderDaysRequest,
    ReorderExercisesRequest,
    UpdateProgramExerciseRequest,
    WorkoutTemplateOut,
)
from app.services import audit, workout_template_service

router = APIRouter(tags=["workout-templates"])


def _trainer_of(db: Session, user: User) -> Trainer | None:
    return db.scalar(select(Trainer).where(Trainer.user_id == user.id))


@router.get("/workout-templates", response_model=list[WorkoutTemplateOut])
def list_workout_templates(
    branch_id: int | None = None,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> list[WorkoutTemplateOut]:
    """The system default pack, plus one branch's own custom templates.

    A trainer's own branch is used automatically rather than trusting a
    client-supplied id; ``branch_id`` is only honoured for an owner/admin
    looking at one branch's custom templates deliberately.
    """
    scoped_branch_id = branch_id
    if user.role.key == RoleKey.TRAINER.value:
        trainer = _trainer_of(db, user)
        scoped_branch_id = trainer.branch_id if trainer else None
    templates = workout_template_service.list_templates(db, branch_id=scoped_branch_id)
    return [WorkoutTemplateOut.model_validate(t) for t in templates]


@router.get("/workout-templates/{template_id}", response_model=WorkoutTemplateOut)
def get_workout_template(
    template_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> WorkoutTemplateOut:
    template = workout_template_service.get_template(db, template_id)
    return WorkoutTemplateOut.model_validate(template)


def _program_out(program: MemberWorkoutProgram) -> MemberWorkoutProgramOut:
    return MemberWorkoutProgramOut.model_validate(program)


@router.get("/members/{member_id}/program", response_model=MemberWorkoutProgramOut | None)
def member_program(
    member_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> MemberWorkoutProgramOut | None:
    member = _load_member(db, member_id)
    assert_can_read_member(db, user, member)
    program = workout_template_service.active_program(db, member.id)
    return _program_out(program) if program else None


@router.get("/members/{member_id}/program/today", response_model=ProgramDayOut | None)
def member_program_today(
    member_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> ProgramDayOut | None:
    """Which programme day "start workout" would use right now, without
    actually starting anything — the Workout screen's preview card."""
    member = _load_member(db, member_id)
    assert_can_read_member(db, user, member)
    program = workout_template_service.active_program(db, member.id)
    if program is None:
        return None
    day = workout_template_service.resolve_today_program_day(
        program, on=branch_today(member.branch.timezone)
    )
    return ProgramDayOut.model_validate(day) if day else None


@router.post(
    "/members/{member_id}/program/apply-template",
    response_model=MemberWorkoutProgramOut,
    status_code=201,
)
def apply_template_to_member(
    member_id: int,
    payload: ApplyTemplateRequest,
    request: Request,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> MemberWorkoutProgramOut:
    member = _load_member(db, member_id)
    assert_can_write_member(db, user, member)
    template = workout_template_service.get_template(db, payload.template_id)
    program = workout_template_service.apply_template(
        db, member=member, template=template, created_by_user_id=user.id
    )

    audit.record(
        db,
        action="workout.template_applied",
        actor=user,
        entity_type="member_workout_program",
        entity_id=program.id,
        branch_id=member.branch_id,
        request=request,
        details={
            "member_id": member.id,
            "template_id": template.id,
            "template_name": template.name,
        },
    )
    return _program_out(program)


@router.post(
    "/members/{member_id}/program/custom",
    response_model=MemberWorkoutProgramOut,
    status_code=201,
)
def create_custom_program(
    member_id: int,
    payload: CreateCustomProgramRequest,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> MemberWorkoutProgramOut:
    member = _load_member(db, member_id)
    assert_can_write_member(db, user, member)
    program = workout_template_service.create_custom_program(
        db, member=member, name=payload.name, created_by_user_id=user.id
    )
    return _program_out(program)


def _load_program_day(db: Session, member_id: int, day_id: int) -> MemberWorkoutProgramDay:
    day = db.get(
        MemberWorkoutProgramDay,
        day_id,
        options=[joinedload(MemberWorkoutProgramDay.program)],
    )
    if day is None or day.program.member_id != member_id:
        raise HTTPException(status_code=404, detail="Day not found")
    return day


def _require_active_program(db: Session, member_id: int) -> MemberWorkoutProgram:
    program = workout_template_service.active_program(db, member_id)
    if program is None:
        raise HTTPException(status_code=404, detail="This member has no active workout programme")
    return program


@router.post("/members/{member_id}/program/days", response_model=ProgramDayOut, status_code=201)
def add_program_day(
    member_id: int,
    payload: AddProgramDayRequest,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> ProgramDayOut:
    member = _load_member(db, member_id)
    assert_can_write_member(db, user, member)
    program = _require_active_program(db, member.id)
    day = workout_template_service.add_day(
        db,
        program=program,
        name=payload.name,
        category=payload.category,
        estimated_duration_minutes=payload.estimated_duration_minutes,
    )
    return ProgramDayOut.model_validate(day)


@router.put("/members/{member_id}/program/days/reorder", response_model=list[ProgramDayOut])
def reorder_program_days(
    member_id: int,
    payload: ReorderDaysRequest,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> list[ProgramDayOut]:
    # Registered ahead of the /{day_id} route below: Starlette matches routes
    # in registration order, so this literal path must come first or
    # "reorder" gets swallowed as a day_id and fails int validation.
    member = _load_member(db, member_id)
    assert_can_write_member(db, user, member)
    program = _require_active_program(db, member.id)
    days = workout_template_service.reorder_days(
        db, program=program, day_ids_in_order=payload.day_ids
    )
    return [ProgramDayOut.model_validate(d) for d in days]


@router.put("/members/{member_id}/program/days/{day_id}", response_model=ProgramDayOut)
def rename_program_day(
    member_id: int,
    day_id: int,
    payload: RenameProgramDayRequest,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> ProgramDayOut:
    member = _load_member(db, member_id)
    assert_can_write_member(db, user, member)
    day = _load_program_day(db, member.id, day_id)
    day = workout_template_service.rename_day(
        db,
        day=day,
        name=payload.name,
        category=payload.category,
        estimated_duration_minutes=payload.estimated_duration_minutes,
    )
    return ProgramDayOut.model_validate(day)


@router.delete("/members/{member_id}/program/days/{day_id}", status_code=204, response_model=None)
def delete_program_day(
    member_id: int,
    day_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> None:
    member = _load_member(db, member_id)
    assert_can_write_member(db, user, member)
    day = _load_program_day(db, member.id, day_id)
    workout_template_service.delete_day(db, day=day)


@router.post(
    "/members/{member_id}/program/days/{day_id}/exercises",
    response_model=ProgramDayOut,
    status_code=201,
)
def add_program_exercise(
    member_id: int,
    day_id: int,
    payload: AddProgramExerciseRequest,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> ProgramDayOut:
    member = _load_member(db, member_id)
    assert_can_write_member(db, user, member)
    day = _load_program_day(db, member.id, day_id)
    workout_template_service.add_exercise(
        db,
        day=day,
        exercise=payload.exercise,
        sets=payload.sets,
        reps=payload.reps,
        rest_seconds=payload.rest_seconds,
        notes=payload.notes,
    )
    db.refresh(day)
    return ProgramDayOut.model_validate(day)


@router.put(
    "/members/{member_id}/program/days/{day_id}/exercises/reorder",
    response_model=ProgramDayOut,
)
def reorder_program_exercises(
    member_id: int,
    day_id: int,
    payload: ReorderExercisesRequest,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> ProgramDayOut:
    # Registered ahead of the /{exercise_id} route below for the same reason
    # the day-level reorder route is: literal segments must precede a
    # same-position path parameter or they get swallowed by it.
    member = _load_member(db, member_id)
    assert_can_write_member(db, user, member)
    day = _load_program_day(db, member.id, day_id)
    workout_template_service.reorder_exercises(
        db, day=day, exercise_ids_in_order=payload.exercise_ids
    )
    db.refresh(day)
    return ProgramDayOut.model_validate(day)


@router.put(
    "/members/{member_id}/program/days/{day_id}/exercises/{exercise_id}",
    response_model=ProgramDayOut,
)
def update_program_exercise(
    member_id: int,
    day_id: int,
    exercise_id: int,
    payload: UpdateProgramExerciseRequest,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> ProgramDayOut:
    member = _load_member(db, member_id)
    assert_can_write_member(db, user, member)
    day = _load_program_day(db, member.id, day_id)
    exercise_row = next((e for e in day.exercises if e.id == exercise_id), None)
    if exercise_row is None:
        raise HTTPException(status_code=404, detail="Exercise not found")
    workout_template_service.update_exercise(
        db,
        exercise_row=exercise_row,
        exercise=payload.exercise,
        sets=payload.sets,
        reps=payload.reps,
        rest_seconds=payload.rest_seconds,
        notes=payload.notes,
    )
    db.refresh(day)
    return ProgramDayOut.model_validate(day)


@router.delete(
    "/members/{member_id}/program/days/{day_id}/exercises/{exercise_id}",
    status_code=204,
    response_model=None,
)
def remove_program_exercise(
    member_id: int,
    day_id: int,
    exercise_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> None:
    member = _load_member(db, member_id)
    assert_can_write_member(db, user, member)
    day = _load_program_day(db, member.id, day_id)
    exercise_row = next((e for e in day.exercises if e.id == exercise_id), None)
    if exercise_row is None:
        raise HTTPException(status_code=404, detail="Exercise not found")
    workout_template_service.remove_exercise(db, exercise_row=exercise_row)

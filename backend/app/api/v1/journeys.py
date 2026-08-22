"""The 45-day journey, workouts and the trainer's authority over both.

Reads settle the journey first. That is what makes Day-45 completion automatic
without a scheduler being the only thing that can trigger it — opening the
screen is enough, and the sweep catches anyone who never opens it.
"""

from __future__ import annotations

from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy import func, select
from sqlalchemy.orm import Session, joinedload

from app.core.clock import branch_today
from app.core.deps import (
    assert_branch_access,
    get_current_user,
    require_management,
    scoped_branch_filter,
)
from app.db.models import (
    Assessment,
    CardioSession,
    Journey,
    JourneyDay,
    JourneyStatus,
    Member,
    RoleKey,
    SessionStatus,
    Trainer,
    User,
    WorkoutPlanItem,
    WorkoutSession,
    WorkoutSessionItem,
    WorkoutSet,
    WorkoutSplit,
)
from app.db.session import get_db
from app.domain.workout_library import SPLIT_LABELS
from app.schemas.common import MessageOut
from app.schemas.training import (
    AssessmentOut,
    AssessmentRequest,
    BodyCompositionHistoryOut,
    BodyCompositionOut,
    CardioRequest,
    CardioSessionOut,
    ExerciseSessionOut,
    ExerciseTrendOut,
    ExerciseTrendPointOut,
    JourneyDayOut,
    JourneyOut,
    PersonalRecordOut,
    PlanItemOut,
    PlanItemUpsert,
    StartJourneyRequest,
    StartWorkoutRequest,
    StrengthTrendOut,
    WorkoutItemOut,
    WorkoutItemUpdate,
    WorkoutPlanOut,
    WorkoutSessionOut,
    WorkoutSetCreate,
    WorkoutSetHistory,
    WorkoutSetLogged,
    WorkoutSetOut,
    WorkoutSetUpdate,
)
from app.services import audit, body_composition_service, journey_service

router = APIRouter(prefix="/journeys", tags=["journeys"])


# --------------------------------------------------------------- helpers


def _load_member(db: Session, member_id: int) -> Member:
    member = db.scalar(
        select(Member)
        .options(joinedload(Member.user), joinedload(Member.branch))
        .where(Member.id == member_id)
    )
    if member is None:
        raise HTTPException(status_code=404, detail="Member not found")
    return member


def current_member(db: Session, user: User) -> Member:
    member = db.scalar(
        select(Member)
        .options(joinedload(Member.user), joinedload(Member.branch))
        .where(Member.user_id == user.id)
    )
    if member is None:
        raise HTTPException(status_code=403, detail="This account is not a member")
    return member


def _trainer_of(db: Session, user: User) -> Trainer | None:
    return db.scalar(select(Trainer).where(Trainer.user_id == user.id))


def assert_can_read_member(db: Session, user: User, member: Member) -> None:
    """Members see only themselves; trainers only members at their branch."""
    role = user.role.key
    if role == RoleKey.MEMBER.value:
        if member.user_id != user.id:
            raise HTTPException(status_code=403, detail="You can only view your own record")
        return
    if role == RoleKey.TRAINER.value:
        trainer = _trainer_of(db, user)
        if trainer is None or trainer.branch_id != member.branch_id:
            raise HTTPException(status_code=403, detail="This member is outside your branch")
        return
    assert_branch_access(user, member.branch_id)


def assert_can_write_member(db: Session, user: User, member: Member) -> None:
    """Recording assessments, cardio and plan edits is staff work, not the member's."""
    if user.role.key == RoleKey.MEMBER.value:
        raise HTTPException(status_code=403, detail="Only a trainer can record this")
    assert_can_read_member(db, user, member)


def journey_out(db: Session, journey: Journey) -> JourneyOut:
    progress = journey_service.progress(db, journey)
    member = db.get(Member, journey.member_id)
    trainer = db.get(Trainer, journey.assigned_trainer_id) if journey.assigned_trainer_id else None
    return JourneyOut(
        id=journey.id,
        member_id=journey.member_id,
        member_name=member.user.full_name if member and member.user else "Member",
        branch_id=journey.branch_id,
        journey_type=journey.journey_type,
        status=journey.status,
        start_date=journey.start_date,
        end_date=journey.end_date,
        duration_days=journey.duration_days,
        assessment_days=journey.assessment_days,
        current_day=progress.current_day,
        phase=progress.phase,
        split_today=progress.split_today,
        assessment_status=journey.assessment_status,
        cardio_completed=progress.cardio_completed,
        cardio_required=progress.cardio_required,
        days_completed=progress.days_completed,
        workouts_completed=progress.workouts_completed,
        completion_pct=progress.completion_pct,
        completed_on=journey.completed_on,
        completion_summary=journey.completion_summary,
        assigned_trainer_id=journey.assigned_trainer_id,
        assigned_trainer_name=(trainer.user.full_name if trainer and trainer.user else None),
        pt_converted=journey.pt_converted,
        is_demo=journey.is_demo,
    )


def _logged_set_counts(db: Session, items: list[WorkoutSessionItem]) -> dict[int, int]:
    """Sets logged per exercise, in one query rather than one per exercise."""
    if not items:
        return {}
    rows = db.execute(
        select(WorkoutSet.session_item_id, func.count())
        .where(WorkoutSet.session_item_id.in_([i.id for i in items]))
        .group_by(WorkoutSet.session_item_id)
    ).all()
    return dict(rows)


def workout_out(db: Session, session: WorkoutSession) -> WorkoutSessionOut:
    items = sorted(session.items, key=lambda i: i.order_index)
    counts = _logged_set_counts(db, items)
    return WorkoutSessionOut(
        id=session.id,
        member_id=session.member_id,
        branch_id=session.branch_id,
        journey_id=session.journey_id,
        day_number=session.day_number,
        split=session.split,
        split_label=SPLIT_LABELS.get(session.split, session.split.value.title()),
        session_date=session.session_date,
        status=session.status,
        started_at=session.started_at,
        completed_at=session.completed_at,
        supervising_trainer_id=session.supervising_trainer_id,
        items=[
            WorkoutItemOut.model_validate(i).model_copy(update={"sets_logged": counts.get(i.id, 0)})
            for i in items
        ],
        completed_items=sum(1 for i in items if i.status.value == "completed"),
        total_items=len(items),
    )


def _load_journey(db: Session, journey_id: int) -> Journey:
    journey = db.get(Journey, journey_id)
    if journey is None:
        raise HTTPException(status_code=404, detail="Journey not found")
    # Settle before anything reads it: Day 45 completes itself.
    journey_service.settle_journey(db, journey)
    return journey


# ------------------------------------------------------------- member view


@router.get("/me", response_model=JourneyOut | None)
def my_journey(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> JourneyOut | None:
    member = current_member(db, user)
    journey = journey_service.latest_journey(db, member.id)
    if journey is None:
        return None
    journey_service.settle_journey(db, journey)
    return journey_out(db, journey)


@router.get("/me/days", response_model=list[JourneyDayOut])
def my_journey_days(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> list[JourneyDay]:
    member = current_member(db, user)
    journey = journey_service.latest_journey(db, member.id)
    if journey is None:
        return []
    return list(
        db.scalars(
            select(JourneyDay)
            .where(JourneyDay.journey_id == journey.id)
            .order_by(JourneyDay.day_number)
        ).all()
    )


@router.get("/me/assessment", response_model=AssessmentOut | None)
def my_assessment(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> Assessment | None:
    member = current_member(db, user)
    journey = journey_service.latest_journey(db, member.id)
    if journey is None:
        return None
    return db.scalar(select(Assessment).where(Assessment.journey_id == journey.id))


@router.get("/me/cardio", response_model=list[CardioSessionOut])
def my_cardio(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> list[CardioSession]:
    member = current_member(db, user)
    journey = journey_service.latest_journey(db, member.id)
    if journey is None:
        return []
    return list(
        db.scalars(
            select(CardioSession)
            .where(CardioSession.journey_id == journey.id)
            .order_by(CardioSession.day_number)
        ).all()
    )


# --------------------------------------------------------------- workouts


@router.get("/me/workout/today", response_model=WorkoutSessionOut | None)
def my_workout_today(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> WorkoutSessionOut | None:
    member = current_member(db, user)
    session = journey_service.today_workout(db, member)
    return workout_out(db, session) if session else None


@router.post("/me/workout/start", response_model=WorkoutSessionOut)
def start_my_workout(
    payload: StartWorkoutRequest,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> WorkoutSessionOut:
    member = current_member(db, user)
    journey = journey_service.active_journey(db, member.id)
    session = journey_service.start_workout(
        db,
        member=member,
        journey=journey,
        split=payload.split,
        supervising_trainer_id=payload.supervising_trainer_id,
    )
    return workout_out(db, session)


@router.patch("/workouts/{session_id}/items/{item_id}", response_model=WorkoutItemOut)
def update_workout_item(
    session_id: int,
    item_id: int,
    payload: WorkoutItemUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    session = db.get(WorkoutSession, session_id)
    if session is None:
        raise HTTPException(status_code=404, detail="Workout not found")
    member = _load_member(db, session.member_id)
    assert_can_read_member(db, user, member)
    if session.status is SessionStatus.COMPLETED:
        raise HTTPException(status_code=409, detail="This workout is already finished")
    return journey_service.set_item_status(db, session=session, item_id=item_id, done=payload.done)


# ------------------------------------------------------------- logged sets

# Who may log a set is the same question as who may see the workout, so these
# reuse ``assert_can_read_member`` exactly as ``update_workout_item`` does. That
# is deliberate: the member records their own sets, and ``assert_can_write_member``
# would lock the member out of their own workout. A trainer at the same branch
# can still correct a set, and everyone else is refused by branch scope.


def _authorised_session(db: Session, user: User, session_id: int) -> WorkoutSession:
    session = db.get(WorkoutSession, session_id)
    if session is None:
        raise HTTPException(status_code=404, detail="Workout not found")
    assert_can_read_member(db, user, _load_member(db, session.member_id))
    return session


def _writable_item(
    db: Session, user: User, session_id: int, item_id: int
) -> tuple[WorkoutSession, WorkoutSessionItem]:
    """The read path plus the one rule that separates writing from reading.

    A finished workout is a record. Reopening it by logging into it would let
    today's session absorb tomorrow's work, so writes stop at completion while
    reads stay open.

    Returns the session as well as the item because every caller needs both,
    and re-resolving the session would repeat the ownership check and its query.
    """
    session = _authorised_session(db, user, session_id)
    if session.status is SessionStatus.COMPLETED:
        raise HTTPException(status_code=409, detail="This workout is already finished")
    return session, journey_service.load_item(db, session=session, item_id=item_id)


@router.get(
    "/workouts/{session_id}/items/{item_id}/sets",
    response_model=list[WorkoutSetOut],
)
def list_workout_sets(
    session_id: int,
    item_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> list[WorkoutSet]:
    session = _authorised_session(db, user, session_id)
    item = journey_service.load_item(db, session=session, item_id=item_id)
    return journey_service.list_sets(db, item=item)


def _exercise_session_out(entry: journey_service.ExerciseSession) -> ExerciseSessionOut:
    past = entry.session
    return ExerciseSessionOut(
        session_id=past.id,
        session_date=past.session_date,
        split=past.split,
        split_label=SPLIT_LABELS.get(past.split, past.split.value.title()),
        sets=[WorkoutSetOut.model_validate(row) for row in entry.sets],
        volume_kg=entry.volume_kg,
        top_weight_kg=entry.top_weight_kg,
        total_reps=entry.total_reps,
        average_rpe=entry.average_rpe,
    )


@router.get(
    "/workouts/{session_id}/items/{item_id}/history",
    response_model=WorkoutSetHistory,
)
def exercise_history(
    session_id: int,
    item_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> WorkoutSetHistory:
    """This member's history with this lift, most recent session first.

    Always a body, never null: `sessions: []` is the honest answer for a lift
    they have never logged, and the app says "first time" from that rather than
    having to tell an empty result apart from a failed request.
    """
    session = _authorised_session(db, user, session_id)
    item = journey_service.load_item(db, session=session, item_id=item_id)
    history = journey_service.exercise_history(
        db,
        member_id=session.member_id,
        exercise=item.exercise,
        before_session_id=session.id,
    )

    return WorkoutSetHistory(
        exercise=history.exercise,
        sessions=[_exercise_session_out(entry) for entry in history.sessions],
        heaviest=(WorkoutSetOut.model_validate(history.heaviest) if history.heaviest else None),
        best_volume_kg=history.best_volume.volume_kg if history.best_volume else None,
        best_volume_on=(history.best_volume.session.session_date if history.best_volume else None),
    )


@router.post(
    "/workouts/{session_id}/items/{item_id}/sets",
    response_model=WorkoutSetLogged,
    status_code=201,
)
def log_workout_set(
    session_id: int,
    item_id: int,
    payload: WorkoutSetCreate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> WorkoutSetLogged:
    """Store the set, and say what it beat.

    Records ride back with the write that earned them. Asking for them
    separately would mean a moment where the app could show a PR for a set the
    server had not stored — the one thing a training record must never do.
    """
    session, item = _writable_item(db, user, session_id, item_id)
    logged = journey_service.log_set(
        db,
        item=item,
        set_number=payload.set_number,
        weight_kg=payload.weight_kg,
        reps=payload.reps,
        rpe=payload.rpe,
        completed_at=payload.completed_at,
    )
    records = journey_service.detect_records(db, session=session, item=item, logged=logged)
    return WorkoutSetLogged(
        set=WorkoutSetOut.model_validate(logged),
        records=[PersonalRecordOut(**vars(record)) for record in records],
    )


@router.patch(
    "/workouts/{session_id}/items/{item_id}/sets/{set_id}",
    response_model=WorkoutSetOut,
)
def update_workout_set(
    session_id: int,
    item_id: int,
    set_id: int,
    payload: WorkoutSetUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> WorkoutSet:
    _, item = _writable_item(db, user, session_id, item_id)
    row = journey_service.load_set(db, item=item, set_id=set_id)
    # exclude_unset, so a field the client did not send keeps its stored value
    # rather than being overwritten with the schema default.
    return journey_service.update_set(db, row=row, changes=payload.model_dump(exclude_unset=True))


@router.delete(
    "/workouts/{session_id}/items/{item_id}/sets/{set_id}",
    response_model=MessageOut,
)
def delete_workout_set(
    session_id: int,
    item_id: int,
    set_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> MessageOut:
    _, item = _writable_item(db, user, session_id, item_id)
    row = journey_service.load_set(db, item=item, set_id=set_id)
    set_number = row.set_number
    journey_service.delete_set(db, row=row)
    return MessageOut(message=f"Set {set_number} removed.")


@router.post("/workouts/{session_id}/complete", response_model=WorkoutSessionOut)
def complete_workout(
    session_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> WorkoutSessionOut:
    session = db.get(WorkoutSession, session_id)
    if session is None:
        raise HTTPException(status_code=404, detail="Workout not found")
    member = _load_member(db, session.member_id)
    assert_can_read_member(db, user, member)
    journey_service.complete_workout(db, session)
    return workout_out(db, session)


def _strength_trend_out(db: Session, member_id: int) -> StrengthTrendOut:
    trends = journey_service.strength_trend(db, member_id=member_id)
    return StrengthTrendOut(
        exercises=[
            ExerciseTrendOut(
                exercise=trend.exercise,
                points=[
                    ExerciseTrendPointOut(
                        session_date=point.session_date,
                        top_weight_kg=point.top_weight_kg,
                        volume_kg=point.volume_kg,
                    )
                    for point in trend.points
                ],
                heaviest_kg=trend.heaviest_kg,
                is_recent_pr=trend.is_recent_pr,
            )
            for trend in trends
        ]
    )


@router.get("/me/progress/strength", response_model=StrengthTrendOut)
def my_strength_trend(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> StrengthTrendOut:
    """Recent progression on the lifts this member actually trains, most
    recently trained exercise first. See `journey_service.strength_trend` —
    nothing here is computed beyond what the mid-workout logging modal already
    shows one exercise at a time."""
    member = current_member(db, user)
    return _strength_trend_out(db, member.id)


@router.get("/members/{member_id}/progress/strength", response_model=StrengthTrendOut)
def member_strength_trend(
    member_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> StrengthTrendOut:
    """Same as `my_strength_trend`, for a trainer or owner looking at one
    member — Member Intelligence and the trainer client-detail screen."""
    member = _load_member(db, member_id)
    assert_can_read_member(db, user, member)
    return _strength_trend_out(db, member.id)


def _body_composition_out(
    reading: body_composition_service.BodyCompositionReading,
) -> BodyCompositionOut:
    return BodyCompositionOut(
        measured_at=reading.measured_at,
        source=reading.source,
        weight_kg=reading.weight_kg,
        body_fat_pct=reading.body_fat_pct,
        muscle_mass_kg=reading.muscle_mass_kg,
        bmi=reading.bmi,
        visceral_fat=reading.visceral_fat,
        bmr_kcal=reading.bmr_kcal,
        body_water_pct=reading.body_water_pct,
    )


def _body_composition_history_out(db: Session, member_id: int) -> BodyCompositionHistoryOut:
    readings = body_composition_service.get_body_composition_history(db, member_id=member_id)
    return BodyCompositionHistoryOut(
        latest=_body_composition_out(readings[-1]) if readings else None,
        measurements=[_body_composition_out(r) for r in readings],
    )


@router.get("/me/progress/body-composition", response_model=BodyCompositionHistoryOut)
def my_body_composition(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> BodyCompositionHistoryOut:
    """This member's InBody history. See `body_composition_service` — the
    same read model every role reads from, so a member and their trainer are
    never looking at two different truths about the same scans."""
    member = current_member(db, user)
    return _body_composition_history_out(db, member.id)


@router.get(
    "/members/{member_id}/progress/body-composition", response_model=BodyCompositionHistoryOut
)
def member_body_composition(
    member_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> BodyCompositionHistoryOut:
    """Same as `my_body_composition`, for a trainer or owner looking at one
    member — Member Intelligence and the trainer client-detail screen."""
    member = _load_member(db, member_id)
    assert_can_read_member(db, user, member)
    return _body_composition_history_out(db, member.id)


@router.get("/members/{member_id}/plan", response_model=WorkoutPlanOut | None)
def member_plan(
    member_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> WorkoutPlanOut | None:
    member = _load_member(db, member_id)
    assert_can_read_member(db, user, member)
    journey = journey_service.latest_journey(db, member.id)
    if journey is None:
        return None
    plan = journey_service.plan_for(db, journey)
    items = db.scalars(
        select(WorkoutPlanItem)
        .where(WorkoutPlanItem.plan_id == plan.id)
        .order_by(WorkoutPlanItem.split, WorkoutPlanItem.order_index)
    ).all()
    return WorkoutPlanOut(
        id=plan.id,
        name=plan.name,
        member_id=plan.member_id,
        journey_id=plan.journey_id,
        is_active=plan.is_active,
        items=[PlanItemOut.model_validate(i) for i in items],
    )


@router.put("/members/{member_id}/plan/{split}", response_model=WorkoutPlanOut)
def replace_plan_split(
    member_id: int,
    split: WorkoutSplit,
    payload: list[PlanItemUpsert],
    request: Request,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> WorkoutPlanOut:
    """Let an authorised trainer rewrite one split of a member's plan.

    Scoped to a single split so an edit to Push cannot silently drop Pull.
    """
    member = _load_member(db, member_id)
    assert_can_write_member(db, user, member)
    journey = journey_service.latest_journey(db, member.id)
    if journey is None:
        raise HTTPException(status_code=404, detail="This member has no journey to plan")
    plan = journey_service.plan_for(db, journey)

    for existing in db.scalars(
        select(WorkoutPlanItem).where(
            WorkoutPlanItem.plan_id == plan.id, WorkoutPlanItem.split == split
        )
    ).all():
        db.delete(existing)
    db.flush()

    for index, item in enumerate(payload):
        db.add(
            WorkoutPlanItem(
                plan_id=plan.id,
                split=split,
                order_index=index,
                exercise=item.exercise,
                sets=item.sets,
                reps=item.reps,
                rest_seconds=item.rest_seconds,
                notes=item.notes,
            )
        )
    db.flush()

    audit.record(
        db,
        action="workout.plan_change",
        actor=user,
        entity_type="workout_plan",
        entity_id=plan.id,
        branch_id=member.branch_id,
        request=request,
        details={"split": split.value, "items": len(payload), "member_id": member.id},
    )
    return member_plan(member_id, db, user)


# --------------------------------------------------------- staff journeys


@router.post("", response_model=JourneyOut, status_code=201)
def start_journey(
    payload: StartJourneyRequest,
    request: Request,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> JourneyOut:
    member = _load_member(db, payload.member_id)
    assert_can_write_member(db, user, member)
    journey = journey_service.start_journey(
        db,
        member=member,
        start_date=payload.start_date,
        trainer_id=payload.trainer_id,
        created_by_user_id=user.id,
    )
    audit.record(
        db,
        action="journey.start",
        actor=user,
        entity_type="journey",
        entity_id=journey.id,
        branch_id=member.branch_id,
        request=request,
        details={"member_id": member.id, "start_date": journey.start_date.isoformat()},
    )
    return journey_out(db, journey)


@router.get("/members/{member_id}", response_model=JourneyOut | None)
def member_journey(
    member_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> JourneyOut | None:
    member = _load_member(db, member_id)
    assert_can_read_member(db, user, member)
    journey = journey_service.latest_journey(db, member.id)
    if journey is None:
        return None
    journey_service.settle_journey(db, journey)
    return journey_out(db, journey)


@router.post("/{journey_id}/assessment", response_model=AssessmentOut)
def record_assessment(
    journey_id: int,
    payload: AssessmentRequest,
    request: Request,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> Assessment:
    journey = _load_journey(db, journey_id)
    member = _load_member(db, journey.member_id)
    assert_can_write_member(db, user, member)

    trainer = _trainer_of(db, user)
    row = journey_service.record_assessment(
        db,
        journey=journey,
        trainer_id=trainer.id if trainer else journey.assigned_trainer_id,
        goal=payload.goal,
        height_cm=payload.height_cm,
        weight_kg=payload.weight_kg,
        notes=payload.notes,
        completed=payload.completed,
    )
    audit.record(
        db,
        action="journey.assessment",
        actor=user,
        entity_type="journey",
        entity_id=journey.id,
        branch_id=journey.branch_id,
        request=request,
        details={"member_id": journey.member_id, "status": row.status.value},
    )
    return row


@router.post("/{journey_id}/cardio", response_model=CardioSessionOut, status_code=201)
def record_cardio(
    journey_id: int,
    payload: CardioRequest,
    request: Request,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> CardioSession:
    journey = _load_journey(db, journey_id)
    member = _load_member(db, journey.member_id)
    assert_can_write_member(db, user, member)

    row = journey_service.record_cardio(
        db,
        journey=journey,
        day_number=payload.day_number,
        duration_minutes=payload.duration_minutes,
        machine=payload.machine,
        notes=payload.notes,
        recorded_by_user_id=user.id,
    )
    audit.record(
        db,
        action="journey.cardio",
        actor=user,
        entity_type="journey",
        entity_id=journey.id,
        branch_id=journey.branch_id,
        request=request,
        details={"member_id": journey.member_id, "day_number": payload.day_number},
    )
    return row


@router.get("", response_model=list[JourneyOut])
def list_journeys(
    branch_id: int | None = Query(default=None),
    status_filter: JourneyStatus | None = Query(default=None, alias="status"),
    ready_for_pt: bool = Query(default=False),
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
    user: User = Depends(require_management),
) -> list[JourneyOut]:
    allowed = scoped_branch_filter(user, branch_id)
    if ready_for_pt:
        return [
            journey_out(db, j)
            for j in journey_service.pt_ready_members(db, allowed)[offset : offset + limit]
        ]

    stmt = select(Journey).order_by(Journey.start_date.desc()).offset(offset).limit(limit)
    if allowed is not None:
        stmt = stmt.where(Journey.branch_id.in_(allowed))
    if status_filter is not None:
        stmt = stmt.where(Journey.status == status_filter)
    journeys = list(db.scalars(stmt).all())
    for journey in journeys:
        journey_service.settle_journey(db, journey)
    return [journey_out(db, j) for j in journeys]


@router.post("/settle", response_model=MessageOut)
def settle_journeys(
    request: Request,
    branch_id: int | None = Query(default=None),
    db: Session = Depends(get_db),
    user: User = Depends(require_management),
) -> MessageOut:
    """Run the Day-45 automation now.

    The sweep also runs on its own schedule and on every journey read; this
    endpoint exists so a manager can force it without waiting.
    """
    allowed = scoped_branch_filter(user, branch_id)
    settled = 0
    if allowed is None:
        settled = journey_service.settle_all(db)
    else:
        for bid in allowed:
            settled += journey_service.settle_all(db, bid)
    audit.record(
        db,
        action="journey.settle",
        actor=user,
        branch_id=branch_id,
        request=request,
        details={"completed": settled},
    )
    return MessageOut(message=f"{settled} journey(s) completed.")


@router.get("/day", response_model=list[JourneyDayOut])
def journey_day_plan(
    journey_id: int = Query(...),
    on: date | None = Query(default=None),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> list[JourneyDay]:
    journey = _load_journey(db, journey_id)
    member = _load_member(db, journey.member_id)
    assert_can_read_member(db, user, member)

    stmt = select(JourneyDay).where(JourneyDay.journey_id == journey.id)
    if on is not None:
        stmt = stmt.where(JourneyDay.planned_on == on)
    else:
        branch_date = branch_today(member.branch.timezone if member.branch else None)
        stmt = stmt.where(JourneyDay.planned_on == branch_date)
    return list(db.scalars(stmt.order_by(JourneyDay.day_number)).all())


__all__ = [
    "assert_can_read_member",
    "assert_can_write_member",
    "current_member",
    "journey_out",
    "router",
    "workout_out",
]

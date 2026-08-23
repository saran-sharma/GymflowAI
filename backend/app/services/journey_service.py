"""The 45-day General Training journey.

Two things matter here beyond CRUD:

* **Day 45 completes itself.** :func:`settle_journey` is idempotent and runs on
  every read of a journey as well as from the scheduled sweep, so completion,
  the progress summary, the PT recommendation, the owner alert and the
  follow-up task all happen server-side without anyone pressing a button.
* **The day number comes from the server clock**, never from the client, for
  the same reason attendance times do.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime, timedelta

from fastapi import HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.clock import branch_today, now_utc
from app.db.models import (
    Alert,
    AlertSeverity,
    Assessment,
    AssessmentStatus,
    AttendanceEvent,
    Branch,
    CardioSession,
    DayStatus,
    EventType,
    ItemStatus,
    Journey,
    JourneyDay,
    JourneyStatus,
    JourneyType,
    Member,
    PackageStatus,
    PersonType,
    PTPackage,
    SessionStatus,
    Trainer,
    WorkoutPlan,
    WorkoutPlanItem,
    WorkoutSession,
    WorkoutSessionItem,
    WorkoutSet,
    WorkoutSplit,
)
from app.domain import journey as journey_domain
from app.domain.records import (
    Performed,
    PersonalRecord,
    records_for,
    volume_of,
)
from app.domain.workout_library import exercises_for
from app.services import alert_service, settings_service, workout_template_service


class JourneyError(HTTPException):
    def __init__(self, detail: str, code: str, status_code: int = status.HTTP_409_CONFLICT):
        super().__init__(status_code=status_code, detail={"code": code, "message": detail})


# ------------------------------------------------------------------- rules


def rules_for(db: Session, branch_id: int | None) -> journey_domain.JourneyPlanRules:
    return journey_domain.JourneyPlanRules(
        duration_days=settings_service.get_int(db, "journey.duration_days", branch_id),
        assessment_days=settings_service.get_int(db, "journey.assessment_days", branch_id),
        cardio_sessions_required=settings_service.get_int(
            db, "journey.cardio_sessions_required", branch_id
        ),
        split_pattern=journey_domain.parse_split_pattern(
            settings_service.get_list(db, "journey.split_pattern", branch_id)
        ),
    )


# ---------------------------------------------------------------- creation


def start_journey(
    db: Session,
    *,
    member: Member,
    start_date: date | None = None,
    trainer_id: int | None = None,
    created_by_user_id: int | None = None,
) -> Journey:
    """Begin a member's General Training journey.

    A member may only have one active journey — starting a second would make
    "Day X of 45" ambiguous on every screen that shows it.
    """
    existing = db.scalar(
        select(Journey).where(
            Journey.member_id == member.id, Journey.status == JourneyStatus.ACTIVE
        )
    )
    if existing is not None:
        raise JourneyError(
            "This member already has an active journey.", "journey_active", status.HTTP_409_CONFLICT
        )

    branch = db.get(Branch, member.branch_id)
    begins = start_date or branch_today(branch.timezone if branch else None)
    rules = rules_for(db, member.branch_id)

    journey = Journey(
        member_id=member.id,
        branch_id=member.branch_id,
        journey_type=JourneyType.GENERAL_TRAINING,
        start_date=begins,
        end_date=begins + timedelta(days=rules.duration_days - 1),
        duration_days=rules.duration_days,
        assessment_days=rules.assessment_days,
        cardio_sessions_required=rules.cardio_sessions_required,
        status=JourneyStatus.ACTIVE,
        assessment_status=AssessmentStatus.NOT_STARTED,
        assigned_trainer_id=trainer_id or member.assigned_trainer_id,
        is_demo=member.is_demo,
    )
    db.add(journey)
    db.flush()

    for day_number, planned_on, split in journey_domain.plan_days(begins, rules):
        db.add(
            JourneyDay(
                journey_id=journey.id,
                day_number=day_number,
                planned_on=planned_on,
                split=split,
                status=DayStatus.PENDING,
            )
        )

    db.add(
        Assessment(
            journey_id=journey.id,
            member_id=member.id,
            branch_id=member.branch_id,
            trainer_id=journey.assigned_trainer_id,
            status=AssessmentStatus.NOT_STARTED,
            is_demo=member.is_demo,
        )
    )
    _ensure_plan(db, journey, created_by_user_id)
    db.flush()
    return journey


def _ensure_plan(
    db: Session, journey: Journey, created_by_user_id: int | None = None
) -> WorkoutPlan:
    """Give the journey its own copy of the PPL chart.

    A copy, not a reference: the trainer edits this member's plan, and the
    chain template stays where it is.
    """
    plan = db.scalar(
        select(WorkoutPlan).where(
            WorkoutPlan.journey_id == journey.id, WorkoutPlan.is_active.is_(True)
        )
    )
    if plan is not None:
        return plan

    plan = WorkoutPlan(
        member_id=journey.member_id,
        journey_id=journey.id,
        branch_id=journey.branch_id,
        name="SLAM General Training — PPL",
        is_template=False,
        is_active=True,
        created_by_user_id=created_by_user_id,
        is_demo=journey.is_demo,
    )
    db.add(plan)
    db.flush()

    for split in (
        WorkoutSplit.PUSH,
        WorkoutSplit.PULL,
        WorkoutSplit.LEGS,
        WorkoutSplit.CARDIO,
        WorkoutSplit.ASSESSMENT,
    ):
        for index, (exercise, sets, reps, rest) in enumerate(exercises_for(split)):
            db.add(
                WorkoutPlanItem(
                    plan_id=plan.id,
                    split=split,
                    order_index=index,
                    exercise=exercise,
                    sets=sets,
                    reps=reps,
                    rest_seconds=rest,
                )
            )
    db.flush()
    return plan


def active_journey(db: Session, member_id: int) -> Journey | None:
    return db.scalar(
        select(Journey)
        .where(Journey.member_id == member_id, Journey.status == JourneyStatus.ACTIVE)
        .order_by(Journey.start_date.desc())
    )


def latest_journey(db: Session, member_id: int) -> Journey | None:
    return db.scalar(
        select(Journey).where(Journey.member_id == member_id).order_by(Journey.start_date.desc())
    )


# ------------------------------------------------------------------ status


@dataclass
class JourneyProgress:
    journey: Journey
    current_day: int
    phase: str
    split_today: WorkoutSplit
    cardio_completed: int
    cardio_required: int
    assessment_status: AssessmentStatus
    days_completed: int
    days_total: int
    workouts_completed: int
    completion_pct: float
    is_complete: bool


def current_day(db: Session, journey: Journey, on: date | None = None) -> int:
    branch = db.get(Branch, journey.branch_id)
    today = on or branch_today(branch.timezone if branch else None)
    raw = journey_domain.day_number_for(journey.start_date, today)
    # Clamp to the programme: a member two weeks past the end is still "Day 45".
    return max(0, min(raw, journey.duration_days))


def progress(db: Session, journey: Journey, on: date | None = None) -> JourneyProgress:
    day = current_day(db, journey, on)
    rules = journey_domain.JourneyPlanRules(
        duration_days=journey.duration_days,
        assessment_days=journey.assessment_days,
        cardio_sessions_required=journey.cardio_sessions_required,
    )
    cardio = (
        db.scalar(
            select(func.count())
            .select_from(CardioSession)
            .where(CardioSession.journey_id == journey.id)
        )
        or 0
    )
    completed_days = (
        db.scalar(
            select(func.count())
            .select_from(JourneyDay)
            .where(JourneyDay.journey_id == journey.id, JourneyDay.status == DayStatus.COMPLETED)
        )
        or 0
    )
    workouts = (
        db.scalar(
            select(func.count())
            .select_from(WorkoutSession)
            .where(
                WorkoutSession.journey_id == journey.id,
                WorkoutSession.status == SessionStatus.COMPLETED,
            )
        )
        or 0
    )

    split = db.scalar(
        select(JourneyDay.split).where(
            JourneyDay.journey_id == journey.id, JourneyDay.day_number == day
        )
    ) or journey_domain.split_for_day(day, rules)

    return JourneyProgress(
        journey=journey,
        current_day=day,
        phase=journey_domain.phase_for_day(day, rules)
        if journey.status is JourneyStatus.ACTIVE
        else "complete",
        split_today=split,
        cardio_completed=int(cardio),
        cardio_required=journey.cardio_sessions_required,
        assessment_status=journey.assessment_status,
        days_completed=int(completed_days),
        days_total=journey.duration_days,
        workouts_completed=int(workouts),
        completion_pct=round(day * 100 / journey.duration_days, 1)
        if journey.duration_days
        else 0.0,
        is_complete=journey.status is JourneyStatus.COMPLETED,
    )


# -------------------------------------------------------- day-45 automation


def build_summary(db: Session, journey: Journey) -> dict:
    """The progress summary handed to the member on completion.

    Only counts things GymFlow actually recorded. No body-composition numbers:
    those come from InBody, which is not connected.
    """
    workouts = (
        db.scalar(
            select(func.count())
            .select_from(WorkoutSession)
            .where(
                WorkoutSession.journey_id == journey.id,
                WorkoutSession.status == SessionStatus.COMPLETED,
            )
        )
        or 0
    )
    by_split_rows = db.execute(
        select(WorkoutSession.split, func.count())
        .where(
            WorkoutSession.journey_id == journey.id,
            WorkoutSession.status == SessionStatus.COMPLETED,
        )
        .group_by(WorkoutSession.split)
    ).all()
    cardio = (
        db.scalar(
            select(func.count())
            .select_from(CardioSession)
            .where(CardioSession.journey_id == journey.id)
        )
        or 0
    )
    member = db.get(Member, journey.member_id)
    visits = (
        db.scalar(
            select(func.count(func.distinct(AttendanceEvent.work_date))).where(
                AttendanceEvent.user_id == member.user_id,
                AttendanceEvent.person_type == PersonType.MEMBER,
                AttendanceEvent.event_type == EventType.CHECK_IN,
                AttendanceEvent.work_date >= journey.start_date,
                AttendanceEvent.work_date <= journey.end_date,
            )
        )
        or 0
        if member
        else 0
    )

    return {
        "duration_days": journey.duration_days,
        "workouts_completed": int(workouts),
        "workouts_by_split": {str(split.value): int(count) for split, count in by_split_rows},
        "cardio_sessions": int(cardio),
        "gym_visits": int(visits),
        "assessment_completed": journey.assessment_status is AssessmentStatus.COMPLETED,
        "consistency_pct": (
            round(int(workouts) * 100 / max(1, journey.duration_days - journey.assessment_days), 1)
        ),
        "generated_at": now_utc().isoformat(),
    }


def settle_journey(db: Session, journey: Journey, on: date | None = None) -> Journey:
    """Run the Day-45 rule. Safe to call on every read.

    This is the automation the brief requires: reaching the final day marks
    the journey complete, writes the summary, flags the member as ready for
    PT, raises the owner/trainer alert and opens the follow-up task — with no
    manual trigger anywhere.
    """
    if journey.status is not JourneyStatus.ACTIVE:
        return journey

    branch = db.get(Branch, journey.branch_id)
    today = on or branch_today(branch.timezone if branch else None)
    raw_day = journey_domain.day_number_for(journey.start_date, today)
    if raw_day < journey.duration_days:
        return journey

    journey.status = JourneyStatus.COMPLETED
    journey.completed_on = min(today, journey.end_date) if today >= journey.end_date else today
    journey.completion_summary = build_summary(db, journey)
    db.flush()

    member = db.get(Member, journey.member_id)
    member_name = member.user.full_name if member and member.user else f"Member {journey.member_id}"

    alert_service.raise_alert(
        db,
        key=alert_service.JOURNEY_DAY45,
        dedupe_key=f"journey:{journey.id}:day45",
        title=f"{member_name} completed the 45-day journey",
        body=(
            f"{member_name} finished SLAM General Training on "
            f"{journey.completed_on.isoformat()}. They are now eligible for a PT introduction."
        ),
        severity=AlertSeverity.INFO,
        branch_id=journey.branch_id,
        entity_type="journey",
        entity_id=journey.id,
        action_route=f"/owner/member/{journey.member_id}",
        payload={"member_id": journey.member_id, "journey_id": journey.id},
    )

    if member is not None:
        alert_service.raise_alert(
            db,
            key=alert_service.JOURNEY_PT_READY,
            dedupe_key=f"journey:{journey.id}:member-pt-offer",
            # The 45 days are an internal business rule. The member is told
            # what they achieved, not which internal counter it tripped.
            title="Your General Training programme is complete",
            body=(
                "You have finished SLAM General Training. Your trainer will talk you "
                "through what comes next."
            ),
            severity=AlertSeverity.INFO,
            branch_id=journey.branch_id,
            target_role=None,
            target_user_id=member.user_id,
            entity_type="journey",
            entity_id=journey.id,
            action_route="/member/pt",
        )

    raise_pt_review_alert(db, journey)

    alert_service.create_task(
        db,
        key="pt_follow_up",
        dedupe_key=f"journey:{journey.id}:pt-follow-up",
        title=f"PT introduction — {member_name}",
        detail="45-day General Training complete. Discuss a PT package and record the outcome.",
        branch_id=journey.branch_id,
        member_id=journey.member_id,
        assigned_trainer_id=journey.assigned_trainer_id,
        due_on=today + timedelta(days=3),
    )
    db.flush()
    return journey


def settle_all(db: Session, branch_id: int | None = None) -> int:
    """Sweep every active journey. Called by the scheduled automation run."""
    stmt = select(Journey).where(Journey.status == JourneyStatus.ACTIVE)
    if branch_id is not None:
        stmt = stmt.where(Journey.branch_id == branch_id)
    settled = 0
    for journey in db.scalars(stmt).all():
        before = journey.status
        settle_journey(db, journey)
        if journey.status is not before:
            settled += 1
    return settled


def raise_pt_review_alert(db: Session, journey: Journey) -> bool:
    """Tell the member's trainer that they are ready for a PT review.

    The trainer owns the decision, so the trainer gets the alert with the action
    attached; management sees the day-45 fact separately.

    Idempotent on its dedupe key and safe to re-run, which is why the automation
    sweep calls it as well as the completion transition. Without that, a member
    whose journey completed before this alert existed — or on a day the sweep
    did not run — would never be reviewed at all.
    """
    member = db.get(Member, journey.member_id)
    if member is None or not member.assigned_trainer_id:
        return False
    trainer = db.get(Trainer, member.assigned_trainer_id)
    if trainer is None:
        return False

    # `pt_ready_members` matches on the journey link, so a member whose package
    # was created without one still looks unconverted. Asking their trainer to
    # convert somebody already training on PT is worse than staying quiet — and
    # a review alert raised before the package existed is withdrawn here rather
    # than left standing, the same way the attendance alerts clear themselves.
    if db.scalar(
        select(PTPackage.id).where(
            PTPackage.member_id == member.id, PTPackage.status == PackageStatus.ACTIVE
        )
    ):
        alert_service.resolve_alert(db, f"journey:{journey.id}:pt-review")
        return False

    member_name = member.user.full_name if member.user else f"Member {journey.member_id}"
    summary = journey.completion_summary or {}
    workouts = summary.get("workouts_completed", 0)
    consistency = summary.get("consistency_pct")
    alert_service.raise_alert(
        db,
        key=alert_service.JOURNEY_PT_REVIEW,
        dedupe_key=f"journey:{journey.id}:pt-review",
        title=f"{member_name} is ready for PT review",
        body=(
            f"{member_name} has completed General Training — {workouts} workouts recorded"
            + (f", {consistency}% consistency" if consistency is not None else "")
            + ". Review their performance and decide whether to convert them to PT."
        ),
        severity=AlertSeverity.INFO,
        branch_id=journey.branch_id,
        target_role=None,
        target_user_id=trainer.user_id,
        entity_type="member",
        entity_id=journey.member_id,
        action_route=f"/trainer/client/{journey.member_id}",
        payload={
            "member_id": journey.member_id,
            "member_name": member_name,
            "journey_id": journey.id,
            "training_type": journey.journey_type.value,
            "reason": "general_training_complete",
            "workouts_completed": workouts,
            "consistency_pct": consistency,
            "cardio_sessions": summary.get("cardio_sessions"),
            "completed_on": journey.completed_on.isoformat() if journey.completed_on else None,
        },
    )
    return True


def pt_ready_members(db: Session, branch_ids: list[int] | None) -> list[Journey]:
    """Completed journeys with no PT package yet — the owner's opportunity list."""
    converted = select(PTPackage.journey_id).where(PTPackage.journey_id.isnot(None))
    stmt = (
        select(Journey)
        .where(Journey.status == JourneyStatus.COMPLETED, Journey.id.notin_(converted))
        .order_by(Journey.completed_on.desc())
    )
    if branch_ids is not None:
        stmt = stmt.where(Journey.branch_id.in_(branch_ids))
    return list(db.scalars(stmt).all())


# ---------------------------------------------------- assessment and cardio


def record_assessment(
    db: Session,
    *,
    journey: Journey,
    trainer_id: int | None,
    goal: str | None = None,
    height_cm: float | None = None,
    weight_kg: float | None = None,
    notes: str | None = None,
    completed: bool = True,
) -> Assessment:
    row = db.scalar(select(Assessment).where(Assessment.journey_id == journey.id))
    if row is None:
        row = Assessment(
            journey_id=journey.id,
            member_id=journey.member_id,
            branch_id=journey.branch_id,
        )
        db.add(row)

    row.trainer_id = trainer_id or row.trainer_id
    row.goal = goal if goal is not None else row.goal
    row.height_cm = height_cm if height_cm is not None else row.height_cm
    row.weight_kg = weight_kg if weight_kg is not None else row.weight_kg
    row.notes = notes if notes is not None else row.notes
    row.status = AssessmentStatus.COMPLETED if completed else AssessmentStatus.IN_PROGRESS
    row.recorded_at = now_utc()

    journey.assessment_status = row.status
    if completed:
        _complete_day(db, journey, day_number=1)
    db.flush()
    return row


def record_cardio(
    db: Session,
    *,
    journey: Journey,
    day_number: int,
    duration_minutes: int,
    machine: str | None = None,
    notes: str | None = None,
    recorded_by_user_id: int | None = None,
) -> CardioSession:
    if day_number < 1 or day_number > journey.assessment_days:
        raise JourneyError(
            f"Cardio is recorded for days 1–{journey.assessment_days} of the journey.",
            "outside_cardio_window",
            status.HTTP_400_BAD_REQUEST,
        )
    existing = db.scalar(
        select(CardioSession).where(
            CardioSession.journey_id == journey.id, CardioSession.day_number == day_number
        )
    )
    if existing is not None:
        raise JourneyError(
            f"Day {day_number} cardio is already recorded.",
            "cardio_already_recorded",
        )

    row = CardioSession(
        journey_id=journey.id,
        member_id=journey.member_id,
        branch_id=journey.branch_id,
        day_number=day_number,
        duration_minutes=max(0, duration_minutes),
        machine=machine,
        notes=notes,
        recorded_by_user_id=recorded_by_user_id,
        completed_at=now_utc(),
        is_demo=journey.is_demo,
    )
    db.add(row)
    _complete_day(db, journey, day_number=day_number)
    db.flush()
    return row


def _complete_day(db: Session, journey: Journey, *, day_number: int) -> JourneyDay | None:
    day = db.scalar(
        select(JourneyDay).where(
            JourneyDay.journey_id == journey.id, JourneyDay.day_number == day_number
        )
    )
    if day is None:
        return None
    day.status = DayStatus.COMPLETED
    day.completed_at = now_utc()
    db.flush()
    return day


# ---------------------------------------------------------------- workouts


def plan_for(db: Session, journey: Journey) -> WorkoutPlan:
    return _ensure_plan(db, journey)


def plan_items(db: Session, plan: WorkoutPlan, split: WorkoutSplit) -> list[WorkoutPlanItem]:
    return list(
        db.scalars(
            select(WorkoutPlanItem)
            .where(WorkoutPlanItem.plan_id == plan.id, WorkoutPlanItem.split == split)
            .order_by(WorkoutPlanItem.order_index)
        ).all()
    )


def start_workout(
    db: Session,
    *,
    member: Member,
    on: date | None = None,
    journey: Journey | None = None,
    split: WorkoutSplit | None = None,
    supervising_trainer_id: int | None = None,
) -> WorkoutSession:
    """Open today's own-workout session, materialising its chart from the plan.

    Returns the existing session if the member already started one today —
    tapping "start" twice must not create two records of one workout.
    """
    branch = db.get(Branch, member.branch_id)
    session_date = on or branch_today(branch.timezone if branch else None)
    journey = journey or active_journey(db, member.id)

    existing = db.scalar(
        select(WorkoutSession).where(
            WorkoutSession.member_id == member.id,
            WorkoutSession.session_date == session_date,
            WorkoutSession.status.in_(
                [SessionStatus.SCHEDULED, SessionStatus.IN_PROGRESS, SessionStatus.COMPLETED]
            ),
        )
    )
    if existing is not None:
        return existing

    # A personalized program supersedes the journey's own PPL rotation the
    # moment one is assigned — see the templates system in
    # app.services.workout_template_service. The 45-day journey itself is
    # untouched either way; only where today's *exercises* come from changes.
    program = workout_template_service.active_program(db, member.id)
    if program is not None and program.days:
        chosen_day = workout_template_service.resolve_today_program_day(db, program)
        assert chosen_day is not None  # program.days is non-empty, guaranteed above
        session = WorkoutSession(
            member_id=member.id,
            branch_id=member.branch_id,
            journey_id=None,
            journey_day_id=None,
            day_number=None,
            member_program_day_id=chosen_day.id,
            split=None,
            session_date=session_date,
            status=SessionStatus.IN_PROGRESS,
            supervising_trainer_id=supervising_trainer_id,
            started_at=now_utc(),
            is_demo=member.is_demo,
        )
        db.add(session)
        db.flush()
        for exercise in chosen_day.exercises:
            db.add(
                WorkoutSessionItem(
                    session_id=session.id,
                    order_index=exercise.order_index,
                    exercise=exercise.exercise,
                    sets=exercise.sets,
                    reps=exercise.reps,
                    rest_seconds=exercise.rest_seconds,
                )
            )
        db.flush()
        return session

    day_row: JourneyDay | None = None
    day_number: int | None = None
    if journey is not None:
        day_number = current_day(db, journey, session_date)
        day_row = db.scalar(
            select(JourneyDay).where(
                JourneyDay.journey_id == journey.id, JourneyDay.day_number == day_number
            )
        )
    resolved_split = split or (day_row.split if day_row else WorkoutSplit.PUSH)

    session = WorkoutSession(
        member_id=member.id,
        branch_id=member.branch_id,
        journey_id=journey.id if journey else None,
        journey_day_id=day_row.id if day_row else None,
        day_number=day_number,
        split=resolved_split,
        session_date=session_date,
        status=SessionStatus.IN_PROGRESS,
        supervising_trainer_id=supervising_trainer_id,
        started_at=now_utc(),
        is_demo=member.is_demo,
    )
    db.add(session)
    db.flush()

    if journey is not None:
        plan = plan_for(db, journey)
        for item in plan_items(db, plan, resolved_split):
            db.add(
                WorkoutSessionItem(
                    session_id=session.id,
                    plan_item_id=item.id,
                    order_index=item.order_index,
                    exercise=item.exercise,
                    sets=item.sets,
                    reps=item.reps,
                    rest_seconds=item.rest_seconds,
                )
            )
    else:
        for index, (exercise, sets, reps, rest) in enumerate(exercises_for(resolved_split)):
            db.add(
                WorkoutSessionItem(
                    session_id=session.id,
                    order_index=index,
                    exercise=exercise,
                    sets=sets,
                    reps=reps,
                    rest_seconds=rest,
                )
            )
    db.flush()
    return session


def load_item(db: Session, *, session: WorkoutSession, item_id: int) -> WorkoutSessionItem:
    """Fetch an exercise, refusing one that belongs to a different workout.

    The session is already authorised by the caller, so re-checking the parent
    here is what stops an item id from *another* member's workout being
    reached through a session id the caller does own.
    """
    item = db.scalar(
        select(WorkoutSessionItem).where(
            WorkoutSessionItem.id == item_id, WorkoutSessionItem.session_id == session.id
        )
    )
    if item is None:
        raise JourneyError(
            "That exercise is not part of this workout.",
            "item_not_found",
            status.HTTP_404_NOT_FOUND,
        )
    return item


def set_item_status(
    db: Session, *, session: WorkoutSession, item_id: int, done: bool
) -> WorkoutSessionItem:
    item = load_item(db, session=session, item_id=item_id)
    item.status = ItemStatus.COMPLETED if done else ItemStatus.PENDING
    item.completed_at = now_utc() if done else None
    db.flush()
    return item


# ------------------------------------------------------------- logged sets

# Set logging is the member's own record of what they lifted. It is deliberately
# not gated on the exercise's ``status``: a member logs sets as they go and the
# exercise is only "completed" at the end, so requiring completion first would
# invert the order the work actually happens in.


def list_sets(db: Session, *, item: WorkoutSessionItem) -> list[WorkoutSet]:
    return list(
        db.scalars(
            select(WorkoutSet)
            .where(WorkoutSet.session_item_id == item.id)
            .order_by(WorkoutSet.set_number)
        ).all()
    )


def _assert_set_number_free(
    db: Session, *, item: WorkoutSessionItem, set_number: int, exclude_id: int | None = None
) -> None:
    stmt = select(WorkoutSet.id).where(
        WorkoutSet.session_item_id == item.id, WorkoutSet.set_number == set_number
    )
    if exclude_id is not None:
        stmt = stmt.where(WorkoutSet.id != exclude_id)
    if db.scalar(stmt) is not None:
        raise JourneyError(
            f"Set {set_number} is already logged for this exercise.",
            "set_number_taken",
        )


def log_set(
    db: Session,
    *,
    item: WorkoutSessionItem,
    set_number: int,
    weight_kg: float,
    reps: int,
    rpe: float | None = None,
    completed_at: datetime | None = None,
) -> WorkoutSet:
    """Record one performed set.

    ``completed_at`` defaults to now rather than staying null: a set that has
    been logged has been done, and leaving the time empty would make "logged"
    and "planned" indistinguishable in the history this table exists to serve.
    """
    _assert_set_number_free(db, item=item, set_number=set_number)
    row = WorkoutSet(
        session_item_id=item.id,
        set_number=set_number,
        weight_kg=weight_kg,
        reps=reps,
        rpe=rpe,
        completed_at=completed_at or now_utc(),
    )
    db.add(row)
    db.flush()
    return row


def load_set(db: Session, *, item: WorkoutSessionItem, set_id: int) -> WorkoutSet:
    row = db.scalar(
        select(WorkoutSet).where(WorkoutSet.id == set_id, WorkoutSet.session_item_id == item.id)
    )
    if row is None:
        raise JourneyError(
            "That set is not part of this exercise.",
            "set_not_found",
            status.HTTP_404_NOT_FOUND,
        )
    return row


def update_set(db: Session, *, row: WorkoutSet, changes: dict) -> WorkoutSet:
    """Apply a partial correction. Only keys present in ``changes`` are touched."""
    if "set_number" in changes and changes["set_number"] != row.set_number:
        _assert_set_number_free(
            db,
            item=row.item,
            set_number=changes["set_number"],
            exclude_id=row.id,
        )
    for field, value in changes.items():
        setattr(row, field, value)
    db.flush()
    return row


# ------------------------------------------------------ history and records

# Everything below is derived from `workout_sets` on read. Nothing is stored,
# nothing is cached, and no figure exists that cannot be recomputed from the
# rows the member logged — which is the only way a training history stays
# honest when a set is later corrected or deleted.

#: How many past sessions of one exercise a member is shown. Enough to see a
#: trend, few enough to stay one screen and one query.
HISTORY_SESSIONS = 8


@dataclass
class ExerciseSession:
    """One past session of one exercise, with what it adds up to."""

    session: WorkoutSession
    sets: list[WorkoutSet]

    @property
    def volume_kg(self) -> float:
        return volume_of([Performed(weight_kg=row.weight_kg, reps=row.reps) for row in self.sets])

    @property
    def top_weight_kg(self) -> float:
        return max((row.weight_kg for row in self.sets), default=0.0)

    @property
    def total_reps(self) -> int:
        return sum(row.reps for row in self.sets)

    @property
    def average_rpe(self) -> float | None:
        """None when nobody recorded one — never zero, which would read as easy."""
        scored = [row.rpe for row in self.sets if row.rpe is not None]
        return round(sum(scored) / len(scored), 1) if scored else None


@dataclass
class ExerciseHistory:
    exercise: str
    sessions: list[ExerciseSession]
    heaviest: WorkoutSet | None
    best_volume: ExerciseSession | None


def exercise_history(
    db: Session,
    *,
    member_id: int,
    exercise: str,
    before_session_id: int | None = None,
    limit: int = HISTORY_SESSIONS,
) -> ExerciseHistory:
    """Past sessions of one lift, most recent first.

    Matched on exercise *name* rather than on the plan item, because a member's
    plan is re-generated per session and re-splitting the programme must not
    erase the history of a lift they have been doing for weeks. That is a known
    limitation, not an accident: renaming an exercise in the library starts its
    history over.

    ``before_session_id`` excludes the session being worked in, whose sets are
    already on screen and are not yet history.

    Sessions with no logged sets never appear. An exercise ticked off without
    any sets recorded has nothing to show, and an empty row reads as a bug.
    """
    rows = db.execute(
        select(WorkoutSet, WorkoutSession)
        .join(WorkoutSessionItem, WorkoutSet.session_item_id == WorkoutSessionItem.id)
        .join(WorkoutSession, WorkoutSessionItem.session_id == WorkoutSession.id)
        .where(
            WorkoutSession.member_id == member_id,
            WorkoutSessionItem.exercise == exercise,
            *([WorkoutSession.id != before_session_id] if before_session_id else []),
        )
        .order_by(
            WorkoutSession.session_date.desc(),
            WorkoutSession.id.desc(),
            WorkoutSet.set_number,
        )
    ).all()

    # Grouped in Python rather than in SQL: the rows arrive already ordered, and
    # the alternative is one query per session to fetch the sets back.
    grouped: dict[int, ExerciseSession] = {}
    for workout_set, session in rows:
        entry = grouped.get(session.id)
        if entry is None:
            entry = grouped[session.id] = ExerciseSession(session=session, sets=[])
        entry.sets.append(workout_set)

    sessions = list(grouped.values())
    every_set = [row for entry in sessions for row in entry.sets]

    return ExerciseHistory(
        exercise=exercise,
        sessions=sessions[:limit],
        # Records look at everything, not just the window shown. A heaviest-ever
        # that quietly meant "heaviest of the last eight" would be a lie.
        heaviest=max(every_set, key=lambda row: (row.weight_kg, row.reps), default=None),
        best_volume=max(sessions, key=lambda entry: entry.volume_kg, default=None),
    )


def previous_performance(
    db: Session, *, session: WorkoutSession, item: WorkoutSessionItem
) -> ExerciseSession | None:
    """The last session in which this member logged sets for this exercise."""
    history = exercise_history(
        db,
        member_id=session.member_id,
        exercise=item.exercise,
        before_session_id=session.id,
        limit=1,
    )
    return history.sessions[0] if history.sessions else None


# ------------------------------------------------------------ strength trend

TREND_EXERCISES = 6
TREND_SESSIONS = 8


@dataclass
class ExerciseTrendPoint:
    session_date: date
    top_weight_kg: float
    volume_kg: float


@dataclass
class ExerciseTrend:
    exercise: str
    points: list[ExerciseTrendPoint]  # oldest first, so a chart reads left-to-right
    heaviest_kg: float
    is_recent_pr: bool


def trained_exercises(db: Session, *, member_id: int, limit: int = TREND_EXERCISES) -> list[str]:
    """Exercise names this member has actually logged sets for, most recently
    trained first. An exercise on the plan that a member has never done has
    no trend to show, so it never appears here."""
    rows = db.execute(
        select(WorkoutSessionItem.exercise, func.max(WorkoutSession.session_date))
        .join(WorkoutSession, WorkoutSessionItem.session_id == WorkoutSession.id)
        .join(WorkoutSet, WorkoutSet.session_item_id == WorkoutSessionItem.id)
        .where(WorkoutSession.member_id == member_id)
        .group_by(WorkoutSessionItem.exercise)
        .order_by(func.max(WorkoutSession.session_date).desc())
        .limit(limit)
    ).all()
    return [row[0] for row in rows]


def strength_trend(
    db: Session,
    *,
    member_id: int,
    exercises_limit: int = TREND_EXERCISES,
    sessions_limit: int = TREND_SESSIONS,
) -> list[ExerciseTrend]:
    """Real strength progression, built from sets the member actually logged —
    the same ``exercise_history`` the mid-workout logging modal already uses,
    read across every recently-trained lift instead of just the one on screen.

    Nothing here is invented: no exercise appears without logged sets, no
    session is synthesised to fill a gap, and "heaviest ever" always looks at
    the member's complete history for that exercise, never just the window of
    points returned for the chart.
    """
    trends = []
    for exercise in trained_exercises(db, member_id=member_id, limit=exercises_limit):
        history = exercise_history(db, member_id=member_id, exercise=exercise, limit=sessions_limit)
        if not history.sessions:
            continue
        points = [
            ExerciseTrendPoint(
                session_date=entry.session.session_date,
                top_weight_kg=entry.top_weight_kg,
                volume_kg=entry.volume_kg,
            )
            for entry in reversed(history.sessions)
        ]
        heaviest_kg = history.heaviest.weight_kg if history.heaviest else 0.0
        latest = history.sessions[0]
        trends.append(
            ExerciseTrend(
                exercise=exercise,
                points=points,
                heaviest_kg=heaviest_kg,
                is_recent_pr=bool(heaviest_kg) and latest.top_weight_kg >= heaviest_kg,
            )
        )
    return trends


# --------------------------------------------------------- personal records


def detect_records(
    db: Session, *, session: WorkoutSession, item: WorkoutSessionItem, logged: WorkoutSet
) -> list[PersonalRecord]:
    """What, if anything, the set just logged beat.

    This function only gathers; :mod:`app.domain.records` decides. Keeping the
    rules out of the query means they can be argued with, and tested, without a
    database.
    """
    prior = db.execute(
        select(WorkoutSet, WorkoutSessionItem.session_id)
        .join(WorkoutSessionItem, WorkoutSet.session_item_id == WorkoutSessionItem.id)
        .join(WorkoutSession, WorkoutSessionItem.session_id == WorkoutSession.id)
        .where(
            WorkoutSession.member_id == session.member_id,
            WorkoutSessionItem.exercise == item.exercise,
            WorkoutSet.id != logged.id,
        )
    ).all()

    by_session: dict[int, list[Performed]] = {}
    earlier: list[Performed] = []
    for row, session_id in prior:
        performed = Performed(weight_kg=row.weight_kg, reps=row.reps)
        earlier.append(performed)
        by_session.setdefault(session_id, []).append(performed)

    return records_for(
        Performed(weight_kg=logged.weight_kg, reps=logged.reps),
        earlier=earlier,
        session_so_far=by_session.get(session.id, []),
        past_session_volumes=[
            volume_of(rows) for session_id, rows in by_session.items() if session_id != session.id
        ],
    )


def delete_set(db: Session, *, row: WorkoutSet) -> None:
    """Remove a set logged by mistake.

    A mistyped set is data the member never did, so this is a real delete
    rather than a soft one — unlike attendance or payments, nothing downstream
    is entitled to the erroneous row.
    """
    db.delete(row)
    db.flush()


def complete_workout(db: Session, session: WorkoutSession) -> WorkoutSession:
    """Finish the workout and, if it belonged to a journey, tick that day off."""
    if session.status is SessionStatus.COMPLETED:
        return session
    session.status = SessionStatus.COMPLETED
    session.completed_at = now_utc()
    db.flush()

    if session.journey_id and session.day_number:
        journey = db.get(Journey, session.journey_id)
        if journey is not None:
            _complete_day(db, journey, day_number=session.day_number)
            # Finishing the final day's workout should complete the journey in
            # the same request, not on some later sweep.
            settle_journey(db, journey)
    return session


def today_workout(db: Session, member: Member, on: date | None = None) -> WorkoutSession | None:
    branch = db.get(Branch, member.branch_id)
    session_date = on or branch_today(branch.timezone if branch else None)
    return db.scalar(
        select(WorkoutSession)
        .where(WorkoutSession.member_id == member.id, WorkoutSession.session_date == session_date)
        .order_by(WorkoutSession.id.desc())
    )


def streak(db: Session, member: Member, on: date | None = None) -> int:
    """Consecutive days ending today with a completed own workout."""
    branch = db.get(Branch, member.branch_id)
    today = on or branch_today(branch.timezone if branch else None)
    days = set(
        db.scalars(
            select(WorkoutSession.session_date).where(
                WorkoutSession.member_id == member.id,
                WorkoutSession.status == SessionStatus.COMPLETED,
                WorkoutSession.session_date <= today,
                WorkoutSession.session_date >= today - timedelta(days=120),
            )
        ).all()
    )
    if not days:
        return 0
    # Starting from today lets a member who has not trained *yet* today keep
    # yesterday's streak visible instead of watching it reset each morning.
    cursor = today if today in days else today - timedelta(days=1)
    count = 0
    while cursor in days:
        count += 1
        cursor -= timedelta(days=1)
    return count


def open_alerts_for_member(db: Session, member: Member) -> list[Alert]:
    return list(
        db.scalars(
            select(Alert)
            .where(Alert.target_user_id == member.user_id)
            .order_by(Alert.created_at.desc())
            .limit(20)
        ).all()
    )


__all__ = [
    "JourneyError",
    "JourneyProgress",
    "active_journey",
    "build_summary",
    "complete_workout",
    "current_day",
    "latest_journey",
    "open_alerts_for_member",
    "plan_for",
    "plan_items",
    "progress",
    "pt_ready_members",
    "raise_pt_review_alert",
    "record_assessment",
    "record_cardio",
    "rules_for",
    "set_item_status",
    "settle_all",
    "settle_journey",
    "start_journey",
    "start_workout",
    "streak",
    "today_workout",
]

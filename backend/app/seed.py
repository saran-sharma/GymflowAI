"""Demo seed for SLAM Fitness Studio.

Everything created here is fictional and flagged ``is_demo=True`` so a
production cutover can delete it in one pass. The three branches are real
SLAM locations; every person, membership and attendance record is invented.

Run with:  python -m app.seed          (from backend/)
           python -m app.seed --reset  (wipe demo rows first)
"""

from __future__ import annotations

import argparse
import random
from datetime import date, time, timedelta

from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app.core.clock import branch_today, combine_branch, now_utc
from app.core.security import hash_password, hash_pin, new_token_secret
from app.db.models import (
    Alert,
    Assessment,
    AttendanceCorrection,
    AttendanceEvent,
    AttendanceStatus,
    AuditLog,
    BodyComposition,
    Branch,
    Campaign,
    CaptureMethod,
    CardioSession,
    EventType,
    GroupClass,
    GroupClassAttendance,
    GroupClassRsvp,
    IncentiveResult,
    IncentiveRule,
    ItemStatus,
    Journey,
    JourneyDay,
    MarketingSource,
    Member,
    Membership,
    MembershipStatus,
    Notification,
    Payment,
    PaymentKind,
    PaymentMethod,
    PaymentStatus,
    PersonType,
    PTPackage,
    PTSession,
    Referral,
    RefreshToken,
    Role,
    RoleKey,
    RsvpResponse,
    SessionStatus,
    Setting,
    Shift,
    Task,
    Trainer,
    TrainerAttendance,
    TrainerAvailability,
    User,
    WorkoutPlan,
    WorkoutPlanItem,
    WorkoutSession,
    WorkoutSessionItem,
)
from app.db.session import SessionLocal
from app.services import (
    attendance_service,
    automation_service,
    class_service,
    incentive_service,
    journey_service,
    marketing_service,
    pt_service,
    settings_service,
)
from app.services.attendance_service import recompute

# Demo credentials. These are throwaway values for a seeded demo database and
# are documented in the README so the app can be opened without a handover.
DEMO_PASSWORD = "SlamDemo2026!"
DEMO_PIN = "246813"

BRANCHES = [
    {
        "code": "SLAM-NGK",
        "name": "SLAM Nagalkeni",
        "city": "Chennai",
        "address": "Nagalkeni, Chromepet",
        "capacity": 90,
    },
    {
        "code": "SLAM-BGH",
        "name": "SLAM Boganhalli",
        "city": "Bengaluru",
        "address": "Boganhalli, Outer Ring Road",
        "capacity": 120,
    },
    {
        "code": "SLAM-ALD",
        "name": "SLAM Alandur",
        "city": "Chennai",
        "address": "Alandur, near Metro",
        "capacity": 75,
    },
]

ROLES = [
    (RoleKey.SUPER_ADMIN, "Super Admin", "Full platform access across all branches"),
    (RoleKey.OWNER, "Owner", "Sees every SLAM branch"),
    (RoleKey.BRANCH_MANAGER, "Branch Manager", "Manages one assigned branch"),
    (RoleKey.TRAINER, "Trainer", "Own attendance and permitted trainer information"),
    (RoleKey.MEMBER, "Member", "Own membership and attendance information"),
]

# (name, designation, specialty, shift start, shift end, behaviour profile)
# The profiles are what make the demo dashboard tell a story: a punctual head
# trainer, a habitual late arrival, an early leaver and a clean record.
TRAINERS = [
    (
        "SLAM-NGK",
        "Vikas Menon",
        "Head Trainer",
        "Strength & Transformation",
        time(6, 0),
        time(14, 0),
        "punctual",
    ),
    (
        "SLAM-NGK",
        "Divya Rao",
        "Trainer",
        "Functional & Mobility",
        time(16, 0),
        time(22, 0),
        "punctual",
    ),
    (
        "SLAM-NGK",
        "Farhan Ali",
        "Floor Trainer",
        "General Fitness",
        time(6, 0),
        time(14, 0),
        "early_leaver",
    ),
    (
        "SLAM-BGH",
        "Sneha Iyer",
        "Trainer",
        "Fat Loss & Conditioning",
        time(16, 0),
        time(23, 0),
        "sometimes_late",
    ),
    (
        "SLAM-BGH",
        "Rahul Deshpande",
        "Strength Coach",
        "Powerlifting & Rehab",
        time(17, 0),
        time(23, 0),
        "often_late",
    ),
    ("SLAM-BGH", "Anita Kulkarni", "Trainer", "Group Classes", time(6, 0), time(13, 0), "punctual"),
    (
        "SLAM-ALD",
        "Kiran Prasad",
        "Head Trainer",
        "Strength & Athletics",
        time(6, 0),
        time(14, 0),
        "punctual",
    ),
    (
        "SLAM-ALD",
        "Meera Shetty",
        "Trainer",
        "Yoga & Recovery",
        time(17, 0),
        time(22, 0),
        "sometimes_late",
    ),
]

# Members, each placed at a deliberate point of the SLAM journey so every
# state the app can render is visible in the demo: the first three days, mid
# programme, the day before the finish, and past Day 45 with and without a PT
# package. ``journey_day`` is the day the member is on today; None means they
# are not on a journey at all.
#
# (branch, name, plan, legacy PT count, journey_day, source key, campaign, referred by)
MEMBERS = [
    ("SLAM-NGK", "Aditya Rao", "Elite Annual + PT", 12, 48, "instagram", "AUG-TRANSFORM", None),
    ("SLAM-NGK", "Kavya Nair", "Quarterly + PT", 20, 30, "referral", None, "Aditya Rao"),
    ("SLAM-NGK", "Sameer Khan", "Monthly", 0, 2, "walk_in", None, None),
    ("SLAM-NGK", "Ritu Balan", "Quarterly", 0, 44, "google", "AUG-TRANSFORM", None),
    ("SLAM-BGH", "Arjun Mehta", "Annual + PT", 12, 51, "instagram", None, None),
    ("SLAM-BGH", "Isha Patel", "Annual", 0, 12, "facebook", "WEEKEND-TRIAL", None),
    ("SLAM-BGH", "Dev Anand", "Monthly", 0, 1, "banner", None, None),
    ("SLAM-BGH", "Nisha Rao", "Quarterly", 0, None, "website", None, None),
    ("SLAM-ALD", "Nikhil Verma", "Quarterly", 0, 22, "referral", None, "Tara Suresh"),
    ("SLAM-ALD", "Tara Suresh", "Elite Annual + PT", 12, 47, "instagram", "AUG-TRANSFORM", None),
    ("SLAM-ALD", "Vivek Nambiar", "Monthly", 0, 3, "whatsapp", None, None),
    # Finished the journey and has not converted — this is the member the
    # owner's PT opportunity list exists for.
    ("SLAM-ALD", "Priyanka Das", "Annual", 0, 46, "google", None, None),
    # A second cohort, so the lists, charts and marketing report have enough
    # rows to look like a working gym rather than a fixture file. Journey days
    # are spread deliberately across the assessment window, the middle of the
    # programme and the run-up to Day 45.
    ("SLAM-NGK", "Rahul Iyer", "Annual + PT", 20, 8, "instagram", "AUG-TRANSFORM", None),
    ("SLAM-NGK", "Meghna Pillai", "Monthly", 0, 16, "google", None, None),
    ("SLAM-NGK", "Farhan Ali", "Elite Annual + PT", 30, 34, "referral", None, "Kavya Nair"),
    ("SLAM-NGK", "Sneha Kapoor", "Quarterly", 0, 41, "website", None, None),
    ("SLAM-NGK", "Imran Sheikh", "Monthly", 0, None, "walk_in", None, None),
    ("SLAM-BGH", "Anjali Menon", "Quarterly + PT", 12, 5, "banner", "WEEKEND-TRIAL", None),
    ("SLAM-BGH", "Karthik Nair", "Annual", 0, 27, "facebook", None, None),
    ("SLAM-BGH", "Deepa Raman", "Elite Annual + PT", 20, 39, "instagram", None, None),
    ("SLAM-BGH", "Suresh Kumar", "Monthly", 0, 2, "walk_in", None, None),
    ("SLAM-ALD", "Lakshmi Iyer", "Annual + PT", 30, 19, "google", "AUG-TRANSFORM", None),
    ("SLAM-ALD", "Rohit Desai", "Quarterly", 0, 43, "referral", None, "Nikhil Verma"),
    ("SLAM-ALD", "Ayesha Khan", "Monthly", 0, 11, "website", None, None),
]

# Campaigns SLAM ran. Nothing here carries a price — pricing has not been
# supplied, and inventing one would put a fake number in front of a member.
CAMPAIGNS = [
    ("AUG-TRANSFORM", "August Transformation", None, 60, 0),
    ("WEEKEND-TRIAL", "Weekend Trial", "SLAM-BGH", 30, 10),
]

# (branch, class name, days from today, hour, minute, trainer name, capacity)
CLASSES = [
    ("SLAM-NGK", "Zumba", 1, 18, 30, "Divya Rao", 20),
    ("SLAM-NGK", "Strength Circuit", -3, 7, 0, "Vikas Menon", 16),
    ("SLAM-BGH", "HIIT Express", 2, 19, 0, "Anita Kulkarni", 24),
    ("SLAM-ALD", "Yoga & Mobility", 3, 7, 30, "Meera Shetty", 18),
]

MANAGERS = [
    ("SLAM-NGK", "Priya Menon"),
    ("SLAM-BGH", "Rohit Bhat"),
    ("SLAM-ALD", "Lakshmi Iyer"),
]

# Days of attendance history to fabricate.
HISTORY_DAYS = 28


def _email(name: str, suffix: str) -> str:
    return f"{name.lower().replace(' ', '.')}@{suffix}"


def wipe_demo(db: Session) -> None:
    """Remove seeded rows only. Real records are never touched."""
    demo_user_ids = list(db.scalars(select(User.id).where(User.is_demo.is_(True))).all())
    db.execute(delete(AuditLog).where(AuditLog.actor_user_id.in_(demo_user_ids)))
    db.execute(delete(Notification).where(Notification.user_id.in_(demo_user_ids)))
    db.execute(delete(RefreshToken).where(RefreshToken.user_id.in_(demo_user_ids)))
    db.execute(delete(AttendanceEvent).where(AttendanceEvent.user_id.in_(demo_user_ids)))
    db.execute(delete(IncentiveResult))
    db.execute(delete(AttendanceCorrection))
    db.execute(delete(TrainerAttendance))
    db.execute(delete(TrainerAvailability).where(TrainerAvailability.is_demo.is_(True)))
    db.execute(delete(Payment).where(Payment.is_demo.is_(True)))
    db.execute(delete(Shift).where(Shift.is_demo.is_(True)))
    # Programme rows, deleted child-first so no foreign key is left dangling.
    db.execute(delete(WorkoutSessionItem))
    db.execute(delete(WorkoutSession))
    db.execute(delete(WorkoutPlanItem))
    db.execute(delete(WorkoutPlan))
    db.execute(delete(CardioSession))
    db.execute(delete(Assessment))
    db.execute(delete(PTSession))
    db.execute(delete(PTPackage))
    db.execute(delete(JourneyDay))
    db.execute(delete(Journey))
    db.execute(delete(GroupClassAttendance))
    db.execute(delete(GroupClassRsvp))
    db.execute(delete(GroupClass))
    db.execute(delete(BodyComposition))
    db.execute(delete(Referral))
    db.execute(delete(Alert))
    db.execute(delete(Task))
    db.execute(delete(Membership).where(Membership.is_demo.is_(True)))
    db.execute(delete(Member).where(Member.is_demo.is_(True)))
    db.execute(delete(Trainer).where(Trainer.is_demo.is_(True)))
    db.execute(delete(IncentiveRule).where(IncentiveRule.is_demo.is_(True)))
    db.execute(delete(Campaign).where(Campaign.is_demo.is_(True)))
    db.execute(delete(MarketingSource))
    db.execute(delete(Setting))
    db.execute(delete(User).where(User.is_demo.is_(True)))
    db.execute(delete(Branch).where(Branch.is_demo.is_(True)))
    db.commit()


def ensure_roles(db: Session) -> dict[str, Role]:
    out: dict[str, Role] = {}
    for key, name, description in ROLES:
        role = db.scalar(select(Role).where(Role.key == key.value))
        if role is None:
            role = Role(key=key.value, name=name, description=description)
            db.add(role)
        out[key.value] = role
    db.flush()
    return out


def ensure_branches(db: Session) -> dict[str, Branch]:
    out: dict[str, Branch] = {}
    for spec in BRANCHES:
        branch = db.scalar(select(Branch).where(Branch.code == spec["code"]))
        if branch is None:
            branch = Branch(
                code=spec["code"],
                name=spec["name"],
                city=spec["city"],
                address=spec["address"],
                capacity=spec["capacity"],
                timezone="Asia/Kolkata",
                qr_secret=new_token_secret(32),
                is_demo=True,
            )
            db.add(branch)
        out[spec["code"]] = branch
    db.flush()
    return out


def ensure_settings(db: Session) -> None:
    descriptions = {
        "shift.grace_minutes": "Minutes after shift start still counted as on time",
        "shift.early_exit_grace_minutes": "Minutes before shift end still counted as a full shift",
        "punctuality.punctuality_weight": "Weight of on-time % in the overall score",
        "punctuality.attendance_weight": "Weight of attendance % in the overall score",
        "attendance.allow_checkin_before_shift_minutes": "How early a check-in is accepted",
        "attendance.allow_checkin_after_shift_minutes": "How long after shift end a check-in is accepted",
        "attendance.methods_enabled": "Capture methods live in this version",
        "occupancy.count_members_only": "Whether occupancy counts members only",
        "occupancy.busy_period_min_days": "Days of history required before busy periods are shown",
        "journey.duration_days": "Length of the SLAM General Training journey",
        "journey.assessment_days": "Days at the start reserved for assessment and cardio",
        "journey.cardio_sessions_required": "Cardio sessions expected in the assessment phase",
        "journey.split_pattern": "Workout rotation after the assessment phase",
        "pt.package_options": "PT package sizes offered",
        "pt.low_balance_threshold": "Remaining sessions that trigger a renewal reminder",
        "pt.default_validity_days": "How long a PT package stays valid",
        "classes.default_capacity": "Default capacity for a new group class",
        "classes.rsvp_reminder_hours": "How long before a class members are reminded",
        "alerts.late_trainer": "Raise an alert when a trainer is late",
        "alerts.missing_checkout": "Raise an alert when a shift has no check-out",
        "alerts.journey_day45": "Raise an alert when a member completes Day 45",
        "alerts.pt_low_balance": "Raise an alert when PT sessions run low",
        "alerts.membership_expiry_days": "How far ahead a membership renewal is flagged",
        "alerts.low_class_attendance_pct": "Turnout below this share of yes-RSVPs is flagged",
    }
    for key, value in settings_service.DEFAULTS.items():
        existing = db.scalar(select(Setting).where(Setting.key == key, Setting.branch_id.is_(None)))
        if existing is None:
            db.add(
                Setting(
                    key=key,
                    branch_id=None,
                    value={"value": value},
                    description=descriptions.get(key),
                )
            )
    db.flush()


def ensure_user(
    db: Session,
    *,
    email: str,
    full_name: str,
    role: Role,
    branch: Branch | None,
    with_pin: bool = False,
) -> User:
    user = db.scalar(select(User).where(User.email == email))
    if user is None:
        user = User(
            email=email,
            full_name=full_name,
            password_hash=hash_password(DEMO_PASSWORD),
            pin_hash=hash_pin(DEMO_PIN) if with_pin else None,
            role_id=role.id,
            branch_id=branch.id if branch else None,
            phone="+91 90000 00000",
            is_demo=True,
        )
        db.add(user)
        db.flush()
    return user


def ensure_incentive_rules(db: Session, branches: dict[str, Branch]) -> None:
    if db.scalar(select(IncentiveRule).where(IncentiveRule.branch_id.is_(None))) is None:
        db.add(
            IncentiveRule(
                branch_id=None,
                name="SLAM chain default",
                min_punctuality_pct=90,
                min_attendance_pct=95,
                max_late_count=2,
                max_early_exit_count=1,
                max_missing_checkout_count=2,
                review_band_pct=5,
                is_demo=True,
            )
        )
    db.flush()


def _behaviour(profile: str, rng: random.Random) -> tuple[str, int, int]:
    """One simulated day: (outcome, arrival offset in minutes, early-exit minutes).

    The arrival offset is relative to shift start and may be negative — a
    trainer who turns up eight minutes early. Offsets above the 10-minute grace
    are what produce a LATE mark, so the numbers here read the same way the
    dashboard will.
    """
    roll = rng.random()
    if profile == "punctual":
        if roll < 0.03:
            return "absent", 0, 0
        if roll < 0.08:
            return "present", rng.randint(11, 18), 0
        return "present", rng.randint(-8, 8), 0
    if profile == "sometimes_late":
        if roll < 0.05:
            return "absent", 0, 0
        if roll < 0.28:
            return "present", rng.randint(11, 25), 0
        return "present", rng.randint(-5, 9), 0
    if profile == "often_late":
        if roll < 0.10:
            return "absent", 0, 0
        if roll < 0.52:
            return "present", rng.randint(12, 40), 0
        if roll < 0.59:
            return "missing_checkout", rng.randint(0, 20), 0
        return "present", rng.randint(-3, 9), 0
    if profile == "early_leaver":
        if roll < 0.05:
            return "absent", 0, 0
        if roll < 0.45:
            return "present", rng.randint(-5, 8), rng.randint(15, 50)
        return "present", rng.randint(-5, 9), 0
    return "present", 0, 0


def seed_attendance_history(
    db: Session, trainer: Trainer, branch: Branch, shift: Shift, profile: str, rng: random.Random
) -> None:
    today = branch_today(branch.timezone)
    grace = settings_service.get_int(db, "shift.grace_minutes", branch.id)

    for offset in range(HISTORY_DAYS, -1, -1):
        work_date = today - timedelta(days=offset)
        # The seeded roster runs Mon–Sat; Sunday is a rest day.
        if work_date.weekday() == 6:
            continue

        start_at = combine_branch(work_date, shift.start_time, branch.timezone)
        end_at = combine_branch(work_date, shift.end_time, branch.timezone)
        if shift.end_time <= shift.start_time:
            end_at += timedelta(days=1)

        is_today = work_date == today
        # Only fabricate today's record if the shift has already begun, so the
        # demo's "who has not arrived yet" state is real rather than staged.
        if is_today and now_utc() < start_at:
            continue

        outcome, arrival_offset, early = _behaviour(profile, rng)

        record = TrainerAttendance(
            trainer_id=trainer.id,
            branch_id=branch.id,
            work_date=work_date,
            shift_id=shift.id,
            scheduled_start=start_at,
            scheduled_end=end_at,
            grace_minutes=grace,
            early_exit_grace_minutes=0,
        )

        if outcome != "absent":
            record.check_in_at = start_at + timedelta(minutes=arrival_offset)
            record.check_in_method = CaptureMethod.QR if rng.random() > 0.3 else CaptureMethod.PIN

            closed = outcome != "missing_checkout" and (not is_today or now_utc() >= end_at)
            if closed:
                record.check_out_at = end_at - timedelta(minutes=early)
                record.check_out_method = record.check_in_method

            for event_type, moment in (
                (EventType.CHECK_IN, record.check_in_at),
                (EventType.CHECK_OUT, record.check_out_at),
            ):
                if moment is None:
                    continue
                db.add(
                    AttendanceEvent(
                        branch_id=branch.id,
                        person_type=PersonType.TRAINER,
                        user_id=trainer.user_id,
                        event_type=event_type,
                        method=record.check_in_method,
                        occurred_at=moment,
                        work_date=work_date,
                        device_info="DEMO seed",
                    )
                )

        # The record carries its own shift snapshot, so the same code path the
        # API uses derives the status here too.
        db.add(record)
        db.flush()
        recompute(record)


def seed_member_visits(db: Session, member: Member, branch: Branch, rng: random.Random) -> None:
    today = branch_today(branch.timezone)
    for offset in range(14, -1, -1):
        work_date = today - timedelta(days=offset)
        if rng.random() > 0.6:
            continue
        hour = rng.choice([6, 7, 18, 19, 20])
        check_in = combine_branch(work_date, time(hour, rng.randint(0, 55)), branch.timezone)
        db.add(
            AttendanceEvent(
                branch_id=branch.id,
                person_type=PersonType.MEMBER,
                user_id=member.user_id,
                event_type=EventType.CHECK_IN,
                method=CaptureMethod.QR,
                occurred_at=check_in,
                work_date=work_date,
                device_info="DEMO seed",
            )
        )
        # Leave a handful of today's members inside so live occupancy is not zero.
        still_inside = offset == 0 and rng.random() < 0.5
        if not still_inside:
            db.add(
                AttendanceEvent(
                    branch_id=branch.id,
                    person_type=PersonType.MEMBER,
                    user_id=member.user_id,
                    event_type=EventType.CHECK_OUT,
                    method=CaptureMethod.QR,
                    occurred_at=check_in + timedelta(minutes=rng.randint(45, 95)),
                    work_date=work_date,
                    device_info="DEMO seed",
                )
            )


def ensure_marketing(db: Session, branches: dict[str, Branch]) -> dict[str, Campaign]:
    """The acquisition source list and SLAM's demo campaigns."""
    marketing_service.ensure_sources(db)

    out: dict[str, Campaign] = {}
    today = branch_today(None)
    for code, name, branch_code, starts_ago, ends_in in CAMPAIGNS:
        campaign = db.scalar(select(Campaign).where(Campaign.code == code))
        if campaign is None:
            campaign = Campaign(
                branch_id=branches[branch_code].id if branch_code else None,
                name=name,
                code=code,
                description=f"DEMO campaign — {name}",
                starts_on=today - timedelta(days=starts_ago),
                ends_on=today + timedelta(days=ends_in),
                is_active=ends_in >= 0,
                is_demo=True,
            )
            db.add(campaign)
            db.flush()
        out[code] = campaign
    return out


def seed_journey(
    db: Session,
    member: Member,
    branch: Branch,
    day_number: int,
    trainer: Trainer | None,
    rng: random.Random,
) -> Journey:
    """Put a member at a given day of the journey, with the history to match.

    The journey is *back-dated* rather than fast-forwarded: the start date is
    ``day_number`` days ago, so every day-number the app computes comes out of
    the same arithmetic production uses.
    """
    today = branch_today(branch.timezone)
    start = today - timedelta(days=day_number - 1)
    journey = journey_service.start_journey(
        db, member=member, start_date=start, trainer_id=trainer.id if trainer else None
    )

    if day_number >= 1:
        journey_service.record_assessment(
            db,
            journey=journey,
            trainer_id=trainer.id if trainer else None,
            goal=rng.choice(["Fat loss", "Strength", "General fitness", "Endurance"]),
            notes="DEMO assessment recorded by the seeder.",
            completed=day_number > 1,
        )

    # Cardio for each assessment day the member has already reached.
    for cardio_day in range(2, min(day_number, journey.assessment_days) + 1):
        journey_service.record_cardio(
            db,
            journey=journey,
            day_number=cardio_day,
            duration_minutes=rng.choice([20, 25, 30]),
            machine=rng.choice(["Treadmill", "Cross trainer", "Rower"]),
        )

    # Workouts for the training phase. Not every day — a real member misses
    # some, and a 100% record would make the consistency figure meaningless.
    plan = journey_service.plan_for(db, journey)
    for offset in range(journey.assessment_days + 1, min(day_number, journey.duration_days) + 1):
        if rng.random() < 0.25:
            continue
        session_date = start + timedelta(days=offset - 1)
        day_row = db.scalar(
            select(JourneyDay).where(
                JourneyDay.journey_id == journey.id, JourneyDay.day_number == offset
            )
        )
        if day_row is None:
            continue
        session = WorkoutSession(
            member_id=member.id,
            branch_id=branch.id,
            journey_id=journey.id,
            journey_day_id=day_row.id,
            day_number=offset,
            split=day_row.split,
            session_date=session_date,
            status=SessionStatus.COMPLETED,
            supervising_trainer_id=trainer.id if trainer and rng.random() < 0.2 else None,
            started_at=combine_branch(session_date, time(18, 0), branch.timezone),
            completed_at=combine_branch(session_date, time(19, 10), branch.timezone),
            is_demo=True,
        )
        db.add(session)
        db.flush()
        for item in journey_service.plan_items(db, plan, day_row.split):
            db.add(
                WorkoutSessionItem(
                    session_id=session.id,
                    plan_item_id=item.id,
                    order_index=item.order_index,
                    exercise=item.exercise,
                    sets=item.sets,
                    reps=item.reps,
                    rest_seconds=item.rest_seconds,
                    status=ItemStatus.COMPLETED,
                    completed_at=session.completed_at,
                )
            )
        day_row.status = day_row.status.COMPLETED
        day_row.completed_at = session.completed_at
    db.flush()

    # Day 45 is not staged: the same automation the API runs decides whether
    # this member has finished, from the dates alone.
    journey_service.settle_journey(db, journey)
    return journey


def seed_pt(
    db: Session,
    member: Member,
    branch: Branch,
    journey: Journey | None,
    trainer: Trainer,
    size: int,
    used: int,
    rng: random.Random,
) -> PTPackage:
    """A PT package with its sessions already delivered up to ``used``."""
    today = branch_today(branch.timezone)
    package = pt_service.create_package(
        db,
        member=member,
        sessions_total=size,
        trainer_id=trainer.id,
        start_date=today - timedelta(days=used * 3 + 5),
        journey_id=journey.id if journey else None,
        origin="journey_conversion" if journey else "direct",
    )

    for number in range(1, used + 2):
        session_date = package.start_date + timedelta(days=(number - 1) * 3)
        if session_date > today + timedelta(days=3):
            break
        start_at = combine_branch(session_date, time(rng.choice([7, 8, 18]), 0), branch.timezone)
        session = pt_service.schedule_session(
            db,
            package=package,
            trainer_id=trainer.id,
            scheduled_start=start_at,
            session_date=session_date,
        )
        if number <= used:
            pt_service.mark_arrival(db, session=session, who="member", at=start_at)
            pt_service.mark_arrival(db, session=session, who="trainer", at=start_at)
            pt_service.complete_session(
                db, session=session, completed_by_user_id=trainer.user_id, notes=None
            )
    db.flush()
    return package


def seed_classes(
    db: Session,
    branches: dict[str, Branch],
    trainers_by_name: dict[str, Trainer],
    members_by_branch: dict[int, list[Member]],
    rng: random.Random,
) -> None:
    """Group classes with RSVPs, and real attendance for the ones already run."""
    today = branch_today(None)
    for code, name, day_offset, hour, minute, trainer_name, capacity in CLASSES:
        branch = branches[code]
        class_date = today + timedelta(days=day_offset)
        starts_at = combine_branch(class_date, time(hour, minute), branch.timezone)
        trainer = trainers_by_name.get(trainer_name)

        existing = db.scalar(
            select(GroupClass).where(
                GroupClass.branch_id == branch.id,
                GroupClass.name == name,
                GroupClass.class_date == class_date,
            )
        )
        if existing is not None:
            continue

        group_class = class_service.create_class(
            db,
            branch=branch,
            name=name,
            starts_at=starts_at,
            trainer_id=trainer.id if trainer else None,
            capacity=capacity,
            description=f"DEMO class — {name} at {branch.name}",
            announcement=f"{name} at {branch.name}. Reply YES in the app to hold your spot.",
        )
        group_class.is_demo = True

        roster = members_by_branch.get(branch.id, [])
        said_yes: list[int] = []
        for member in roster:
            answer = rng.choices(
                [RsvpResponse.YES, RsvpResponse.NO, RsvpResponse.PENDING], weights=[6, 2, 2]
            )[0]
            if answer is RsvpResponse.PENDING:
                continue
            class_service.set_rsvp(db, group_class=group_class, member=member, answer=answer)
            if answer is RsvpResponse.YES:
                said_yes.append(member.id)

        # Only a class that has already happened has attendance to record.
        if day_offset < 0 and said_yes:
            turned_up = [m for m in said_yes if rng.random() < 0.75]
            missed = [m for m in said_yes if m not in turned_up]
            if turned_up:
                class_service.record_attendance(
                    db,
                    group_class=group_class,
                    member_ids=turned_up,
                    attended=True,
                    recorded_by_user_id=trainer.user_id if trainer else None,
                )
            if missed:
                class_service.record_attendance(
                    db,
                    group_class=group_class,
                    member_ids=missed,
                    attended=False,
                    recorded_by_user_id=trainer.user_id if trainer else None,
                )
            class_service.close_class(db, group_class)
    db.flush()


def settle_expired_memberships(db: Session) -> int:
    """Mark memberships whose end date has passed.

    The seeder dates some of them into the past on purpose so the expired
    state is testable; without this they would sit there labelled active with
    an end date behind them, which is the one combination that should never
    appear.
    """
    today = branch_today(None)
    rows = list(
        db.scalars(
            select(Membership).where(
                Membership.ends_on < today,
                Membership.status == MembershipStatus.ACTIVE,
            )
        ).all()
    )
    for row in rows:
        row.status = MembershipStatus.EXPIRED
    db.commit()
    return len(rows)


def recompute_incentives(db: Session, branches: dict[str, Branch]) -> int:
    """Run the real incentive rules over the seeded attendance.

    Calculated rather than written: the incentive screen should show what the
    rules actually produce from the demo shifts, so a change to the rules shows
    up here the same way it would in production.
    """
    total = 0
    for branch in branches.values():
        total += incentive_service.recompute_branch(db, branch.id, branch.timezone)
    db.commit()
    return total


def seed_members_currently_inside(
    db: Session, branches: dict[str, Branch], _rng: random.Random
) -> int:
    """Leave a handful of members checked in but not checked out, per branch.

    Live occupancy is derived from the event log — a person is inside when
    their most recent event today is a check-in — so "currently inside" is
    produced by writing an arrival with no departure, exactly as the eSSL sync
    will. No separate presence table and no fake live-gym endpoint.

    Idempotent: a member already inside is left alone rather than given a
    second arrival.
    """
    created = 0
    for branch in branches.values():
        rng = random.Random(f"inside:{branch.id}")
        members = list(
            db.scalars(
                select(Member)
                .where(Member.branch_id == branch.id, Member.is_active.is_(True))
                .limit(12)
            ).all()
        )
        if not members:
            continue

        work_date = branch_today(branch.timezone)
        wanted = min(len(members), rng.randint(3, 5))
        for index, member in enumerate(members[:wanted]):
            if attendance_service.is_inside(db, member.user_id, branch.id, work_date):
                continue
            # Staggered arrivals so the duration column has a range in it.
            minutes_ago = 25 + index * 27 + rng.randint(0, 15)
            db.add(
                AttendanceEvent(
                    branch_id=branch.id,
                    person_type=PersonType.MEMBER,
                    user_id=member.user_id,
                    event_type=EventType.CHECK_IN,
                    method="qr",
                    occurred_at=now_utc() - timedelta(minutes=minutes_ago),
                    work_date=work_date,
                    device_info="DEMO seed",
                )
            )
            created += 1
    db.commit()
    return created


def seed_availability(db: Session, trainers: list[Trainer], _rng: random.Random) -> int:
    """Published PT hours for the next fortnight.

    Idempotent by the same key the table is unique on — trainer, date, start —
    so re-seeding tops up rather than duplicating. Roughly one slot in five is
    marked booked by pointing it at a scheduled PT session, because a grid
    where nothing is taken does not show what a booked hour looks like.
    """
    created = 0
    for trainer in trainers:
        # Seeded from the trainer, not the shared stream: a second run has to
        # make the same choices or the existence check below misses and the
        # table grows without ever duplicating a row.
        booked_sessions = list(
            db.scalars(
                select(PTSession)
                .where(
                    PTSession.trainer_id == trainer.id,
                    PTSession.status == SessionStatus.SCHEDULED,
                )
                .limit(4)
            ).all()
        )
        today = branch_today(None)
        for offset in range(0, 14):
            slot_date = today + timedelta(days=offset)
            # Sunday is closed for PT at SLAM.
            if slot_date.weekday() == 6:
                continue
            # Seeded per trainer *and* day, so the hours chosen for a Tuesday
            # cannot shift because something earlier in the loop consumed a
            # different number of draws. Without this the existence check below
            # misses on a re-run and the table grows every time.
            day_rng = random.Random(f"availability:{trainer.id}:{slot_date.isoformat()}")
            hours = day_rng.sample([6, 7, 8, 17, 18, 19, 20], k=day_rng.randint(2, 4))
            for hour in sorted(hours):
                exists = db.scalar(
                    select(TrainerAvailability).where(
                        TrainerAvailability.trainer_id == trainer.id,
                        TrainerAvailability.slot_date == slot_date,
                        TrainerAvailability.start_time == time(hour, 0),
                    )
                )
                if exists is not None:
                    continue
                booked = (
                    booked_sessions.pop()
                    if booked_sessions and day_rng.random() < 0.2
                    else None
                )
                db.add(
                    TrainerAvailability(
                        trainer_id=trainer.id,
                        branch_id=trainer.branch_id,
                        slot_date=slot_date,
                        start_time=time(hour, 0),
                        end_time=time(hour + 1, 0),
                        booked_session_id=booked.id if booked else None,
                        is_demo=True,
                    )
                )
                created += 1
    db.commit()
    return created


def seed_payments(db: Session, members: list[Member], _rng: random.Random) -> int:
    """Charges across the last quarter, settled and outstanding.

    Receipt numbers are prefixed ``DEMO-`` so a row is identifiable in a
    payment report even by someone who cannot see the ``is_demo`` column.
    """
    created = 0

    for member in members:
        # Same reasoning as availability: the set of charges a member gets must
        # not change between runs, or the receipt numbers shift and the
        # existence check stops matching.
        rng = random.Random(f"payments:{member.id}")
        membership = db.scalar(
            select(Membership)
            .where(Membership.member_id == member.id)
            .order_by(Membership.ends_on.desc())
            .limit(1)
        )
        package = db.scalar(select(PTPackage).where(PTPackage.member_id == member.id).limit(1))

        charges: list[tuple[PaymentKind, float, int, bool]] = []
        # (kind, amount, days_ago, settled)
        # Spread across the quarter so a 30-day report is neither empty nor
        # everything — the window has to be visibly doing something.
        charges.append(
            (
                PaymentKind.MEMBERSHIP,
                rng.choice([4500, 12000, 38000]),
                rng.choice([8, 19, 26, 75]),
                True,
            )
        )
        if rng.random() < 0.5:
            charges.append(
                (PaymentKind.RENEWAL, rng.choice([4500, 12000]), rng.choice([3, 12, 24]), True)
            )
        if package is not None:
            charges.append(
                (PaymentKind.PT, rng.choice([12000, 18000, 24000]), 30, rng.random() < 0.7)
            )
        if rng.random() < 0.25:
            charges.append((PaymentKind.GROUP_CLASS, rng.choice([500, 800]), 8, False))

        for index, (kind, amount, days_ago, settled) in enumerate(charges):
            receipt = f"DEMO-{member.member_code}-{index}"
            if db.scalar(select(Payment).where(Payment.receipt_no == receipt)) is not None:
                continue
            raised = now_utc() - timedelta(days=days_ago)
            db.add(
                Payment(
                    branch_id=member.branch_id,
                    member_id=member.id,
                    kind=kind,
                    status=PaymentStatus.PAID if settled else PaymentStatus.PENDING,
                    method=rng.choice(list(PaymentMethod)) if settled else None,
                    amount=float(amount),
                    discount=0.0,
                    tax=0.0,
                    membership_id=membership.id
                    if membership and kind is not PaymentKind.PT
                    else None,
                    pt_package_id=package.id if package and kind is PaymentKind.PT else None,
                    trainer_id=member.assigned_trainer_id if kind is PaymentKind.PT else None,
                    due_on=(raised + timedelta(days=7)).date() if not settled else None,
                    paid_at=raised if settled else None,
                    receipt_no=receipt,
                    notes="Demo record — remove before go-live",
                    is_demo=True,
                )
            )
            created += 1
    db.commit()
    return created


def seed(db: Session, *, reset: bool = False) -> None:
    if reset:
        wipe_demo(db)

    rng = random.Random(20260812)
    roles = ensure_roles(db)
    branches = ensure_branches(db)
    ensure_settings(db)
    ensure_incentive_rules(db, branches)

    ensure_user(
        db,
        email="admin@gymflow.demo",
        full_name="GymFlow Super Admin",
        role=roles[RoleKey.SUPER_ADMIN.value],
        branch=None,
    )
    ensure_user(
        db,
        email="owner@slam.demo",
        full_name="Karan Shetty",
        role=roles[RoleKey.OWNER.value],
        branch=None,
    )

    for code, name in MANAGERS:
        ensure_user(
            db,
            email=_email(name, "slam.demo"),
            full_name=name,
            role=roles[RoleKey.BRANCH_MANAGER.value],
            branch=branches[code],
        )

    trainer_rows: list[tuple[Trainer, Branch, Shift, str]] = []
    for index, (code, name, designation, specialty, start, end, profile) in enumerate(TRAINERS, 1):
        branch = branches[code]
        user = ensure_user(
            db,
            email=_email(name, "slam.demo"),
            full_name=name,
            role=roles[RoleKey.TRAINER.value],
            branch=branch,
            with_pin=True,
        )
        trainer = db.scalar(select(Trainer).where(Trainer.user_id == user.id))
        if trainer is None:
            trainer = Trainer(
                user_id=user.id,
                branch_id=branch.id,
                employee_code=f"{code}-T{index:02d}",
                designation=designation,
                specialty=specialty,
                joined_on=date(2024, 1, 15),
                is_demo=True,
            )
            db.add(trainer)
            db.flush()

        weekly: Shift | None = None
        for weekday in range(0, 6):  # Mon–Sat
            existing = db.scalar(
                select(Shift).where(Shift.trainer_id == trainer.id, Shift.weekday == weekday)
            )
            if existing is None:
                existing = Shift(
                    trainer_id=trainer.id,
                    branch_id=branch.id,
                    weekday=weekday,
                    start_time=start,
                    end_time=end,
                    is_active=True,
                    is_demo=True,
                )
                db.add(existing)
                db.flush()
            weekly = weekly or existing
        assert weekly is not None
        trainer_rows.append((trainer, branch, weekly, profile))

    db.flush()

    if not db.scalar(select(TrainerAttendance).limit(1)):
        for trainer, branch, shift, profile in trainer_rows:
            seed_attendance_history(db, trainer, branch, shift, profile, rng)

    trainers_by_branch: dict[int, list[Trainer]] = {}
    for trainer, branch, _shift, _profile in trainer_rows:
        trainers_by_branch.setdefault(branch.id, []).append(trainer)

    campaigns = ensure_marketing(db, branches)
    sources = {row.key: row for row in db.scalars(select(MarketingSource)).all()}
    trainers_by_name = {t.user.full_name: t for t, _b, _s, _p in trainer_rows if t.user is not None}

    members_by_name: dict[str, Member] = {}
    members_by_branch: dict[int, list[Member]] = {}
    fresh_members: list[tuple[Member, Branch, int | None, int]] = []

    for code, name, plan, pt_sessions, journey_day, source_key, campaign_code, _ref in MEMBERS:
        branch = branches[code]
        user = ensure_user(
            db,
            email=_email(name, "member.slam.demo"),
            full_name=name,
            role=roles[RoleKey.MEMBER.value],
            branch=branch,
        )
        member = db.scalar(select(Member).where(Member.user_id == user.id))
        is_new = member is None
        if is_new:
            roster = trainers_by_branch.get(branch.id, [])
            today = branch_today(branch.timezone)
            # Registration is dated from where they are in the journey, so the
            # marketing report and the journey day agree with each other.
            registered = today - timedelta(days=journey_day - 1 if journey_day else 30)
            member = Member(
                user_id=user.id,
                branch_id=branch.id,
                member_code=f"{code}-M{user.id:04d}",
                assigned_trainer_id=roster[0].id if roster else None,
                joined_on=registered,
                registered_on=registered,
                marketing_source_id=(sources[source_key].id if source_key in sources else None),
                campaign_id=(campaigns[campaign_code].id if campaign_code in campaigns else None),
                is_demo=True,
            )
            db.add(member)
            db.flush()

            db.add(
                Membership(
                    member_id=member.id,
                    branch_id=branch.id,
                    plan_name=plan,
                    status=MembershipStatus.ACTIVE,
                    starts_on=registered,
                    # A spread that always produces all three states: lapsed,
                    # inside the 30-day renewal window, and comfortably clear.
                    ends_on=today + timedelta(days=rng.choice([-21, -4, 9, 18, 96, 240])),
                    pt_sessions_total=pt_sessions,
                    pt_sessions_used=0,
                    is_demo=True,
                )
            )
            seed_member_visits(db, member, branch, rng)

        members_by_name[name] = member
        members_by_branch.setdefault(branch.id, []).append(member)
        if is_new:
            fresh_members.append((member, branch, journey_day, pt_sessions))
    db.flush()

    # Referrals, second pass: the referring member has to exist first.
    for _code, name, _plan, _pt, _day, source_key, _campaign, referred_by in MEMBERS:
        if source_key != "referral" or not referred_by:
            continue
        referrer = members_by_name.get(referred_by)
        referred = members_by_name.get(name)
        if referrer is None or referred is None:
            continue
        marketing_service.link_referral(
            db, referrer_member_id=referrer.id, referred_member=referred, note="DEMO referral"
        )

    for member, branch, journey_day, pt_sessions in fresh_members:
        journey = None
        trainer = (
            db.get(Trainer, member.assigned_trainer_id) if member.assigned_trainer_id else None
        )
        if journey_day:
            journey = seed_journey(db, member, branch, journey_day, trainer, rng)
        if pt_sessions and trainer is not None:
            completed_journey = (
                journey if journey is not None and journey.completed_on is not None else None
            )
            seed_pt(
                db,
                member,
                branch,
                completed_journey,
                trainer,
                size=pt_sessions,
                # A spread that always lands at least one member inside the
                # low-balance threshold, so that alert is visible in the demo.
                used=max(1, pt_sessions - rng.choice([2, 4, 9])),
                rng=rng,
            )

    seed_classes(db, branches, trainers_by_name, members_by_branch, rng)

    # Published PT hours and the money ledger. Both are seeded after members and
    # PT exist, because each hangs off those rows.
    all_trainers = list(db.scalars(select(Trainer).where(Trainer.is_demo.is_(True))).all())
    all_members = list(db.scalars(select(Member).where(Member.is_demo.is_(True))).all())
    seed_availability(db, all_trainers, rng)
    seed_payments(db, all_members, rng)
    seed_members_currently_inside(db, branches, rng)
    settle_expired_memberships(db)
    recompute_incentives(db, branches)

    # Finish the way production does: run the real automations rather than
    # writing alerts by hand, so the demo shows exactly what the rules produce.
    automation_service.run_all(db)
    db.commit()


def main() -> None:
    parser = argparse.ArgumentParser(description="Seed the GymFlow demo database")
    parser.add_argument("--reset", action="store_true", help="Delete demo rows first")
    parser.add_argument(
        "--clear-demo",
        action="store_true",
        help="Delete demo rows and stop. Real records are never touched.",
    )
    args = parser.parse_args()

    # Removing demo data is a different intent from seeding it, so it exits
    # here rather than falling through and immediately writing the rows back.
    if args.clear_demo:
        with SessionLocal() as db:
            wipe_demo(db)
            db.commit()
        print("Demo rows deleted. Real records were not touched.")
        return

    with SessionLocal() as db:
        seed(db, reset=args.reset)

        branches = db.scalars(select(Branch)).all()
        trainers = db.scalars(select(Trainer)).all()
        members = db.scalars(select(Member)).all()
        days = db.scalars(select(TrainerAttendance)).all()
        late = sum(
            1
            for d in days
            if d.status in (AttendanceStatus.LATE, AttendanceStatus.LATE_AND_EARLY_EXIT)
        )

    print("GymFlow demo data seeded (all rows flagged DEMO)")
    print(f"  branches            : {len(branches)}")
    print(f"  trainers            : {len(trainers)}")
    print(f"  members             : {len(members)}")
    print(f"  trainer-days        : {len(days)} ({late} late)")
    print()
    print(f"  owner login         : owner@slam.demo / {DEMO_PASSWORD}")
    print(f"  trainer login       : vikas.menon@slam.demo / {DEMO_PASSWORD}")
    print(f"  member login        : aditya.rao@member.slam.demo / {DEMO_PASSWORD}")
    print(f"  trainer check-in PIN: {DEMO_PIN}")


if __name__ == "__main__":
    main()

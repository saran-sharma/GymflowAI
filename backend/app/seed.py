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
    AttendanceEvent,
    AttendanceStatus,
    AuditLog,
    Branch,
    CaptureMethod,
    EventType,
    IncentiveResult,
    IncentiveRule,
    Member,
    Membership,
    MembershipStatus,
    Notification,
    PersonType,
    RefreshToken,
    Role,
    RoleKey,
    Setting,
    Shift,
    Trainer,
    TrainerAttendance,
    User,
)
from app.db.session import SessionLocal
from app.services import settings_service
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

MEMBERS = [
    ("SLAM-NGK", "Aditya Rao", "Elite Annual + PT", 12),
    ("SLAM-NGK", "Kavya Nair", "Quarterly + PT", 6),
    ("SLAM-NGK", "Sameer Khan", "Monthly", 0),
    ("SLAM-BGH", "Arjun Mehta", "Annual + PT", 12),
    ("SLAM-BGH", "Isha Patel", "Annual", 0),
    ("SLAM-ALD", "Nikhil Verma", "Quarterly", 0),
    ("SLAM-ALD", "Tara Suresh", "Elite Annual + PT", 12),
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
    db.execute(delete(TrainerAttendance))
    db.execute(delete(Shift).where(Shift.is_demo.is_(True)))
    db.execute(delete(Membership).where(Membership.is_demo.is_(True)))
    db.execute(delete(Member).where(Member.is_demo.is_(True)))
    db.execute(delete(Trainer).where(Trainer.is_demo.is_(True)))
    db.execute(delete(IncentiveRule).where(IncentiveRule.is_demo.is_(True)))
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

    for code, name, plan, pt_sessions in MEMBERS:
        branch = branches[code]
        user = ensure_user(
            db,
            email=_email(name, "member.slam.demo"),
            full_name=name,
            role=roles[RoleKey.MEMBER.value],
            branch=branch,
        )
        member = db.scalar(select(Member).where(Member.user_id == user.id))
        if member is None:
            roster = trainers_by_branch.get(branch.id, [])
            member = Member(
                user_id=user.id,
                branch_id=branch.id,
                member_code=f"{code}-M{user.id:04d}",
                assigned_trainer_id=roster[0].id if roster and pt_sessions else None,
                joined_on=date(2025, 6, 1),
                is_demo=True,
            )
            db.add(member)
            db.flush()

            today = branch_today(branch.timezone)
            db.add(
                Membership(
                    member_id=member.id,
                    branch_id=branch.id,
                    plan_name=plan,
                    status=MembershipStatus.ACTIVE,
                    starts_on=today - timedelta(days=120),
                    ends_on=today + timedelta(days=rng.choice([18, 96, 240])),
                    pt_sessions_total=pt_sessions,
                    pt_sessions_used=rng.randint(0, pt_sessions) if pt_sessions else 0,
                    is_demo=True,
                )
            )
            seed_member_visits(db, member, branch, rng)

    db.commit()


def main() -> None:
    parser = argparse.ArgumentParser(description="Seed the GymFlow demo database")
    parser.add_argument("--reset", action="store_true", help="Delete demo rows first")
    args = parser.parse_args()

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

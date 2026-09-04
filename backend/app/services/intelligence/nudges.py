"""Contextual nudges — the foundation.

A *nudge* is a small, timely, factual prompt derived from the deterministic
intelligence signals: "you haven't trained in a while", "new personal record",
"day 30 of your journey", "your client X has gone quiet". This module decides
*what* would be worth nudging about; it does not invent a new delivery channel.

Nudges ride the existing :class:`~app.db.models.Alert` table via
:func:`app.services.alert_service.raise_alert` — same idempotent ``dedupe_key``,
same audit trail, same in-app feed (``GET /alerts`` already shows a user their
own alerts). On top of that this adds:

* **Deterministic source.** Every candidate comes from
  :mod:`app.services.intelligence.signals` — no model, no guesswork.
* **Deduplication.** The ``dedupe_key`` carries a period bucket (an ISO week, a
  date, a milestone), so the same nudge cannot stack within that period, and
  ``raise_alert`` is idempotent on it.
* **Cooldown.** Before emitting, the last alert sharing this nudge's identity
  (its ``dedupe_base``) is checked — if one went out inside ``cooldown_days``,
  the new one is suppressed. This is what stops a slipping member being nudged
  every day.
* **Role-aware, deep-linkable, auditable.** ``target_user_id`` scopes it to one
  person; ``action_route`` is where it opens; the ``Alert`` row is the record.

No push infrastructure is added — V1 has none. Nudges surface in the app's
existing alert list.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date, datetime

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.clock import branch_today, now_utc
from app.db.models import Alert, AlertSeverity, Branch, Member, Trainer
from app.services import alert_service, journey_service
from app.services.intelligence import signals as sig

# -- nudge type keys (Alert.key) ------------------------------------------
NUDGE_MEMBER_INACTIVITY = "nudge.member.inactivity"
NUDGE_MEMBER_PR = "nudge.member.personal_record"
NUDGE_MEMBER_MILESTONE = "nudge.member.journey_milestone"
NUDGE_TRAINER_MEMBER_INACTIVE = "nudge.trainer.member_inactive"
NUDGE_TRAINER_MISSED_DAYS = "nudge.trainer.missed_days"

#: Journey days worth a "you're X% through" nudge. Completion (day == duration)
#: is handled separately with its own copy.
_MILESTONE_DAYS = (15, 30)


@dataclass(frozen=True)
class NudgeCandidate:
    key: str
    #: Identity across periods: "nudge:<type>:<scope>". The cooldown looks at
    #: the newest alert whose dedupe_key starts with this.
    dedupe_base: str
    #: The period bucket appended to the dedupe_key — an ISO week, a date, a
    #: milestone number. Makes the nudge fire at most once per period.
    period: str
    target_user_id: int
    target_role: str  # "member" | "trainer"
    severity: AlertSeverity
    title: str
    body: str
    action_route: str
    branch_id: int | None = None
    evidence: dict = field(default_factory=dict)
    #: Minimum days between two nudges sharing this dedupe_base.
    cooldown_days: int = 5

    @property
    def dedupe_key(self) -> str:
        return f"{self.dedupe_base}:{self.period}"


def _iso_week(d: date) -> str:
    year, week, _ = d.isocalendar()
    return f"{year}-W{week:02d}"


# --------------------------------------------------------------- member


def member_nudge_candidates(
    db: Session, member: Member, *, today: date | None = None
) -> list[NudgeCandidate]:
    if today is None:
        branch = db.get(Branch, member.branch_id)
        today = branch_today(branch.timezone if branch else None)
    s = sig.member_signals(db, member, today=today)
    uid = member.user_id
    out: list[NudgeCandidate] = []

    inact = s.inactivity
    if inact.level in ("slipping", "inactive") and inact.days_since_training is not None:
        out.append(
            NudgeCandidate(
                key=NUDGE_MEMBER_INACTIVITY,
                dedupe_base=f"nudge:member_inactivity:{member.id}",
                period=_iso_week(today),
                target_user_id=uid,
                target_role="member",
                severity=AlertSeverity.WARNING,
                title="Time for a session?",
                body=(
                    f"No workout logged in {inact.days_since_training} days. A short one "
                    f"this week keeps the habit going."
                ),
                action_route="/(member)/workout",
                branch_id=member.branch_id,
                evidence={"days_since_training": inact.days_since_training},
                cooldown_days=5,
            )
        )

    for rec in s.records.records:
        if (today - rec.achieved_on).days <= 3:
            out.append(
                NudgeCandidate(
                    key=NUDGE_MEMBER_PR,
                    dedupe_base=f"nudge:member_pr:{member.id}:{rec.exercise}",
                    period=rec.achieved_on.isoformat(),
                    target_user_id=uid,
                    target_role="member",
                    severity=AlertSeverity.INFO,
                    title="New personal record",
                    body=f"{rec.exercise} — {rec.weight_kg:g} kg for {rec.reps}. Nicely done.",
                    action_route="/(member)/progress",
                    branch_id=member.branch_id,
                    evidence={
                        "exercise": rec.exercise,
                        "weight_kg": rec.weight_kg,
                        "reps": rec.reps,
                    },
                    cooldown_days=1,
                )
            )

    journey = journey_service.latest_journey(db, member.id)
    if journey is not None:
        progress = journey_service.progress(db, journey, today)
        if journey.status.value == "completed":
            out.append(
                NudgeCandidate(
                    key=NUDGE_MEMBER_MILESTONE,
                    dedupe_base=f"nudge:member_milestone:{member.id}:{journey.id}",
                    period="complete",
                    target_user_id=uid,
                    target_role="member",
                    severity=AlertSeverity.INFO,
                    title="Programme complete",
                    body="You finished the 45-day journey. Your trainer plans what comes next.",
                    action_route="/(member)/pt",
                    branch_id=member.branch_id,
                    evidence={"completion_pct": progress.completion_pct},
                    cooldown_days=30,
                )
            )
        elif progress.current_day in _MILESTONE_DAYS:
            out.append(
                NudgeCandidate(
                    key=NUDGE_MEMBER_MILESTONE,
                    dedupe_base=f"nudge:member_milestone:{member.id}:{journey.id}",
                    period=f"day{progress.current_day}",
                    target_user_id=uid,
                    target_role="member",
                    severity=AlertSeverity.INFO,
                    title=f"Day {progress.current_day} of your journey",
                    body=(
                        f"{progress.completion_pct:g}% of the way through, "
                        f"{progress.workouts_completed} workouts recorded. Keep going."
                    ),
                    action_route="/(member)/progress",
                    branch_id=member.branch_id,
                    evidence={
                        "current_day": progress.current_day,
                        "completion_pct": progress.completion_pct,
                    },
                    cooldown_days=30,
                )
            )

    return out


# --------------------------------------------------------------- trainer


def trainer_nudge_candidates(
    db: Session, trainer: Trainer, *, today: date | None = None
) -> list[NudgeCandidate]:
    if today is None:
        branch = db.get(Branch, trainer.branch_id)
        today = branch_today(branch.timezone if branch else None)

    members = (
        db.scalars(
            select(Member).where(
                Member.assigned_trainer_id == trainer.id, Member.is_active.is_(True)
            )
        )
        .unique()
        .all()
    )
    uid = trainer.user_id
    out: list[NudgeCandidate] = []

    for member in members:
        name = member.user.full_name if member.user else f"Member {member.id}"
        s = sig.member_signals(db, member, today=today)

        if s.inactivity.level == "inactive" and s.inactivity.days_since_training is not None:
            out.append(
                NudgeCandidate(
                    key=NUDGE_TRAINER_MEMBER_INACTIVE,
                    dedupe_base=f"nudge:trainer_inactive:{trainer.id}:{member.id}",
                    period=_iso_week(today),
                    target_user_id=uid,
                    target_role="trainer",
                    severity=AlertSeverity.WARNING,
                    title=f"{name} has gone quiet",
                    body=f"No session in {s.inactivity.days_since_training} days. Worth a check-in.",
                    action_route=f"/(trainer)/client/{member.id}",
                    branch_id=trainer.branch_id,
                    evidence={
                        "member_id": member.id,
                        "days_since_training": s.inactivity.days_since_training,
                    },
                    cooldown_days=7,
                )
            )

        if s.journey.missed_days >= sig.T.journey_missed_days_attention:
            out.append(
                NudgeCandidate(
                    key=NUDGE_TRAINER_MISSED_DAYS,
                    dedupe_base=f"nudge:trainer_missed:{trainer.id}:{member.id}",
                    period=_iso_week(today),
                    target_user_id=uid,
                    target_role="trainer",
                    severity=AlertSeverity.WARNING,
                    title=f"{name}: {s.journey.missed_days} journey days missed",
                    body="Reschedule or adjust the plan.",
                    action_route=f"/(trainer)/client/{member.id}",
                    branch_id=trainer.branch_id,
                    evidence={"member_id": member.id, "missed_days": s.journey.missed_days},
                    cooldown_days=7,
                )
            )

    return out


# --------------------------------------------------------------- emit / sweep


def _last_raised_at(db: Session, dedupe_base: str) -> datetime | None:
    """When a nudge sharing this identity last went out.

    Read from ``payload["raised_at"]`` (written by :func:`emit` from
    :func:`app.core.clock.now_utc`) so the cooldown uses the one authoritative
    clock — the same one tests can freeze — rather than the database's
    ``created_at``. Falls back to ``created_at`` for any legacy row."""
    row = db.scalar(
        select(Alert)
        .where(Alert.dedupe_key.like(f"{dedupe_base}:%"))
        .order_by(Alert.created_at.desc())
        .limit(1)
    )
    if row is None:
        return None
    stamp = (row.payload or {}).get("raised_at")
    if isinstance(stamp, str):
        try:
            return datetime.fromisoformat(stamp)
        except ValueError:
            pass
    created = row.created_at
    if created is not None and created.tzinfo is None:
        from datetime import UTC

        created = created.replace(tzinfo=UTC)
    return created


def _in_cooldown(db: Session, candidate: NudgeCandidate, *, now: datetime) -> bool:
    last = _last_raised_at(db, candidate.dedupe_base)
    if last is None:
        return False
    return (now - last).days < candidate.cooldown_days


def emit(db: Session, candidate: NudgeCandidate) -> Alert | None:
    """Raise the nudge, unless an identical one is still inside its cooldown.

    Returns the ``Alert`` (new or the standing one for this exact period), or
    ``None`` when suppressed by cooldown.
    """
    now = now_utc()
    if _in_cooldown(db, candidate, now=now):
        return None
    return alert_service.raise_alert(
        db,
        key=candidate.key,
        dedupe_key=candidate.dedupe_key,
        title=candidate.title,
        body=candidate.body,
        severity=candidate.severity,
        branch_id=candidate.branch_id,
        target_role=None,
        target_user_id=candidate.target_user_id,
        entity_type="nudge",
        entity_id=candidate.dedupe_base,
        action_route=candidate.action_route,
        payload={
            "evidence": candidate.evidence,
            "nudge_type": candidate.key,
            "raised_at": now.isoformat(),
        },
    )


def sweep_member(db: Session, member: Member, *, today: date | None = None) -> list[Alert]:
    raised = [emit(db, c) for c in member_nudge_candidates(db, member, today=today)]
    return [a for a in raised if a is not None]


def sweep_trainer(db: Session, trainer: Trainer, *, today: date | None = None) -> list[Alert]:
    raised = [emit(db, c) for c in trainer_nudge_candidates(db, trainer, today=today)]
    return [a for a in raised if a is not None]


__all__ = [
    "NUDGE_MEMBER_INACTIVITY",
    "NUDGE_MEMBER_MILESTONE",
    "NUDGE_MEMBER_PR",
    "NUDGE_TRAINER_MEMBER_INACTIVE",
    "NUDGE_TRAINER_MISSED_DAYS",
    "NudgeCandidate",
    "emit",
    "member_nudge_candidates",
    "sweep_member",
    "sweep_trainer",
    "trainer_nudge_candidates",
]

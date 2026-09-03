"""The trainer-facing views of the intelligence layer.

Two things, both built entirely from the deterministic member signals:

* ``build_trainer_brief`` — one member, framed for the coach about to train
  them: current state, what is going well, what to watch, what to work on.
* ``build_attention_queue`` — the trainer's assigned members ranked by a
  transparent priority score, each with the specific reason it scored.

Neither carries owner-only information. Incentive standing, revenue and payment
status are not read here.
"""

from __future__ import annotations

from datetime import date

from sqlalchemy import select
from sqlalchemy.orm import Session, joinedload

from app.core.clock import branch_today, now_utc
from app.db.models import Branch, Member, PTSession, SessionStatus, Trainer
from app.services.intelligence import signals as sig
from app.services.intelligence.member import build_member_intelligence
from app.services.intelligence.narrator import TemplateNarrator
from app.services.intelligence.schemas import (
    AttentionItem,
    InsightEvidence,
    TrainerAttentionQueue,
    TrainerBrief,
)

_MEMBER_ROUTE = "/(trainer)/client/{member_id}"

#: Priority weights for the attention queue. One dict so the ranking is
#: auditable and stable; the highest-scoring signal is the one whose reason is
#: shown.
_ATTENTION_WEIGHTS = {
    "inactive": 100,
    "membership_expiring": 80,
    "journey_missed": 70,
    "inactivity_slipping": 60,
    "consistency_low": 55,
    "trend_declining": 45,
    "plateau": 25,
}


def _next_pt_session(db: Session, member_id: int, trainer_id: int, today: date):
    return db.scalar(
        select(PTSession)
        .where(
            PTSession.member_id == member_id,
            PTSession.trainer_id == trainer_id,
            PTSession.session_date >= today,
            PTSession.status.in_([SessionStatus.SCHEDULED, SessionStatus.IN_PROGRESS]),
        )
        .order_by(PTSession.session_date, PTSession.scheduled_start)
    )


def _today_facts(
    db: Session, member: Member, s: sig.MemberSignals, *, trainer_id: int | None, today: date
) -> list[InsightEvidence]:
    facts: list[InsightEvidence] = []

    j = s.journey
    if j.status == "active" and j.current_day and j.duration_days:
        facts.append(
            InsightEvidence(label="Journey", value=f"Day {j.current_day} of {j.duration_days}")
        )
    elif j.status == "completed":
        facts.append(InsightEvidence(label="Journey", value="Programme complete"))
    else:
        facts.append(InsightEvidence(label="Journey", value="No active programme"))

    inact = s.inactivity
    if inact.last_training_on is not None and inact.days_since_training is not None:
        facts.append(
            InsightEvidence(
                label="Last session",
                value=(
                    "today"
                    if inact.days_since_training == 0
                    else f"{inact.days_since_training} d ago"
                ),
            )
        )
    else:
        facts.append(InsightEvidence(label="Last session", value="none logged"))

    c = s.consistency
    if c.level != "insufficient_data":
        facts.append(
            InsightEvidence(
                label=f"Last {c.window_weeks} wks", value=f"{c.sessions_in_window} sessions"
            )
        )

    if trainer_id is not None:
        nxt = _next_pt_session(db, member.id, trainer_id, today)
        if nxt is not None:
            facts.append(InsightEvidence(label="Next PT", value=nxt.session_date.isoformat()))

    m = s.membership
    if m.expiring_soon and m.days_remaining is not None:
        facts.append(InsightEvidence(label="Membership", value=f"ends in {m.days_remaining} d"))

    return facts


def _suggested_focus(s: sig.MemberSignals) -> list[str]:
    out: list[str] = []
    if s.inactivity.level in ("inactive", "slipping") and s.inactivity.days_since_training:
        out.append(f"Reach out — no session logged in {s.inactivity.days_since_training} days.")
    if s.plateau.detected and s.plateau.exercise:
        out.append(
            f"{s.plateau.exercise} has been flat for {s.plateau.span_days} days — a small "
            f"load increase or a variation next block."
        )
    if s.trend.direction == "declining" and s.trend.volume_change_pct is not None:
        out.append(
            f"Training volume is down {abs(s.trend.volume_change_pct):g}% — check load, "
            f"recovery and targets."
        )
    if s.consistency.level == "low":
        out.append(
            f"Only {s.consistency.sessions_in_window} sessions in "
            f"{s.consistency.window_weeks} weeks — agree a realistic weekly cadence."
        )
    if s.journey.missed_days >= sig.T.journey_missed_days_attention:
        out.append(f"{s.journey.missed_days} journey days missed — reschedule or adjust the plan.")
    if not out:
        out.append("On track — keep progressing loads where form allows.")
    return out[:3]


def build_trainer_brief(
    db: Session,
    member: Member,
    *,
    trainer_id: int | None = None,
    today: date | None = None,
    narrator=None,
) -> TrainerBrief:
    narrator = narrator or TemplateNarrator()
    if today is None:
        branch = db.get(Branch, member.branch_id)
        today = branch_today(branch.timezone if branch else None)

    s = sig.member_signals(db, member, today=today)
    intel = build_member_intelligence(db, member, today=today, narrator=narrator)
    member_name = member.user.full_name if member.user else f"Member {member.id}"

    progress = [i for i in intel.insights if i.severity in ("positive", "info")]
    watch = [i for i in intel.insights if i.severity in ("attention", "critical")]

    return TrainerBrief(
        member_id=member.id,
        member_name=member_name,
        generated_at=now_utc(),
        state=intel.state,
        today=_today_facts(db, member, s, trainer_id=trainer_id, today=today),
        progress=progress,
        watch=watch,
        suggested_focus=(
            ["Not enough history yet — log a few sessions to build a picture."]
            if intel.state == "insufficient_data"
            else _suggested_focus(s)
        ),
        coverage=intel.coverage,
    )


# --------------------------------------------------------------- attention queue


def _score_member(s: sig.MemberSignals) -> tuple[int, str, str, str | None, list[InsightEvidence]]:
    """Return ``(score, severity, reason, detail, metrics)`` for one member.

    ``score`` is 0 when nothing is wrong. The reason belongs to the single
    highest-weighted contributing signal.
    """
    contributions: list[tuple[int, str, str, str | None, list[InsightEvidence]]] = []

    inact = s.inactivity
    if inact.level == "inactive" and inact.days_since_training is not None:
        contributions.append(
            (
                _ATTENTION_WEIGHTS["inactive"],
                "critical",
                f"No training in {inact.days_since_training} days",
                f"Last session {inact.last_training_on.isoformat()}"
                if inact.last_training_on
                else None,
                [
                    InsightEvidence(
                        label="Since last session", value=f"{inact.days_since_training} d"
                    )
                ],
            )
        )
    elif inact.level == "slipping" and inact.days_since_training is not None:
        contributions.append(
            (
                _ATTENTION_WEIGHTS["inactivity_slipping"],
                "attention",
                f"Slipping — {inact.days_since_training} days since a session",
                None,
                [
                    InsightEvidence(
                        label="Since last session", value=f"{inact.days_since_training} d"
                    )
                ],
            )
        )

    m = s.membership
    if m.expiring_soon and m.days_remaining is not None:
        contributions.append(
            (
                _ATTENTION_WEIGHTS["membership_expiring"],
                "attention",
                f"Membership ends in {m.days_remaining} days",
                m.ends_on.isoformat() if m.ends_on else None,
                [InsightEvidence(label="Ends", value=m.ends_on.isoformat() if m.ends_on else "—")],
            )
        )

    if s.journey.missed_days >= sig.T.journey_missed_days_attention:
        contributions.append(
            (
                _ATTENTION_WEIGHTS["journey_missed"],
                "attention",
                f"{s.journey.missed_days} journey days missed",
                None,
                [InsightEvidence(label="Missed days", value=str(s.journey.missed_days))],
            )
        )

    if s.consistency.level == "low":
        contributions.append(
            (
                _ATTENTION_WEIGHTS["consistency_low"],
                "attention",
                f"Only {s.consistency.sessions_in_window} sessions in "
                f"{s.consistency.window_weeks} weeks",
                None,
                [InsightEvidence(label="Weekly average", value=f"{s.consistency.per_week:g}")],
            )
        )

    if s.trend.direction == "declining" and s.trend.volume_change_pct is not None:
        contributions.append(
            (
                _ATTENTION_WEIGHTS["trend_declining"],
                "attention",
                f"Training volume down {abs(s.trend.volume_change_pct):g}%",
                None,
                [InsightEvidence(label="Change", value=f"{s.trend.volume_change_pct:g}%")],
            )
        )

    if s.plateau.detected and s.plateau.exercise:
        contributions.append(
            (
                _ATTENTION_WEIGHTS["plateau"],
                "info",
                f"{s.plateau.exercise} has plateaued",
                s.plateau.reason,
                [InsightEvidence(label="Top set", value=f"{s.plateau.top_weight_kg:g} kg")],
            )
        )

    if not contributions:
        return (0, "info", "", None, [])
    contributions.sort(key=lambda c: c[0], reverse=True)
    return contributions[0]


def build_attention_queue(
    db: Session,
    trainer: Trainer,
    *,
    today: date | None = None,
    limit: int = 20,
) -> TrainerAttentionQueue:
    if today is None:
        branch = db.get(Branch, trainer.branch_id)
        today = branch_today(branch.timezone if branch else None)

    members = (
        db.scalars(
            select(Member)
            .options(joinedload(Member.user))
            .where(Member.assigned_trainer_id == trainer.id, Member.is_active.is_(True))
            .order_by(Member.id)
        )
        .unique()
        .all()
    )

    scored: list[tuple[int, AttentionItem]] = []
    for member in members:
        s = sig.member_signals(db, member, today=today)
        score, severity, reason, detail, metrics = _score_member(s)
        if score <= 0:
            continue
        scored.append(
            (
                score,
                AttentionItem(
                    member_id=member.id,
                    member_name=member.user.full_name if member.user else f"Member {member.id}",
                    priority=0,  # set after sorting
                    severity=severity,  # type: ignore[arg-type]
                    reason=reason,
                    detail=detail,
                    route=_MEMBER_ROUTE.format(member_id=member.id),
                    metrics=metrics,
                ),
            )
        )

    # Higher score first; ties broken by member id (already the query order) for
    # a stable list across calls.
    scored.sort(key=lambda pair: (-pair[0], pair[1].member_id))
    items = []
    for index, (_score, item) in enumerate(scored[:limit]):
        item.priority = index
        items.append(item)

    return TrainerAttentionQueue(
        generated_at=now_utc(),
        considered=len(members),
        items=items,
    )


__all__ = ["build_attention_queue", "build_trainer_brief"]

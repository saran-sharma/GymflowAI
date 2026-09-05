"""Ask GymFlow — a constrained question answerer over the intelligence layer.

Not a chatbot and not a database console. A question is matched against a small
fixed set of intents for the asker's role; the matched intent calls the same
deterministic builders the screens use, with the same authorization, and
formats a short answer plus the figures behind it. An unrecognised question is
answered honestly with what *can* be asked.

No model is involved — ``source`` is always ``deterministic`` in V1. When a
provider is wired in it would only ever rephrase the ``answer`` string; the
``data`` rows and the ``action`` are computed here and are not its to touch.
"""

from __future__ import annotations

import re
from collections.abc import Callable
from dataclasses import dataclass, field
from datetime import date
from urllib.parse import quote

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.clock import branch_today
from app.db.models import Branch, Member, RoleKey, Trainer, User
from app.services import journey_service
from app.services.intelligence import signals as sig
from app.services.intelligence.member import build_member_intelligence
from app.services.intelligence.owner import build_owner_daily_brief
from app.services.intelligence.progression import recommendation_for
from app.services.intelligence.schemas import AskAnswer, InsightAction, InsightEvidence
from app.services.intelligence.trainer import build_attention_queue, build_trainer_brief
from app.services.intelligence.weekly import member_weekly_summary, owner_weekly_summary


@dataclass
class AskContext:
    db: Session
    user: User
    today: date
    #: The member the question is about — the asker themselves, or a client a
    #: trainer/owner passed in context. ``None`` for owner-wide questions.
    member: Member | None = None
    branch_ids: list[int] | None = None
    match: re.Match | None = None
    ev: list[InsightEvidence] = field(default_factory=list)


Handler = Callable[[AskContext], tuple[str, InsightAction | None]]


def _ev(ctx: AskContext, label: str, value: str) -> None:
    ctx.ev.append(InsightEvidence(label=label, value=value))


# --------------------------------------------------------------- member intents


def _member_overview(ctx: AskContext) -> tuple[str, InsightAction | None]:
    intel = build_member_intelligence(ctx.db, ctx.member, today=ctx.today)
    if intel.state == "insufficient_data":
        return intel.headline, intel.next_action
    # Headline, then just the titles of the top few insights — the numbers
    # behind them ride in the data rows, so the prose stays short.
    lines = [intel.headline]
    for insight in intel.insights[:3]:
        lines.append(f"• {insight.title}")
        for e in insight.evidence[:1]:
            _ev(ctx, e.label, e.value)
    return "\n".join(lines), intel.next_action


def _member_consistency(ctx: AskContext) -> tuple[str, InsightAction | None]:
    c = sig.consistency(ctx.db, ctx.member.id, today=ctx.today)
    if c.level == "insufficient_data":
        return (
            "Not enough sessions yet to judge your consistency — keep logging workouts.",
            None,
        )
    _ev(ctx, f"Last {c.window_weeks} weeks", f"{c.sessions_in_window} sessions")
    _ev(ctx, "Weekly average", f"{c.per_week:g}")
    _ev(ctx, "Target", f"{c.target_per_week:g} / week")
    verdict = {
        "strong": "You are training consistently.",
        "steady": "Your training is fairly steady, a little under target.",
        "low": "Your training has dropped below the cadence the programme assumes.",
    }[c.level]
    return (
        f"{verdict} {c.sessions_in_window} sessions over the last {c.window_weeks} weeks, "
        f"about {c.per_week:g} a week against a {c.target_per_week:g}-a-week target."
    ), None


def _member_last_trained(ctx: AskContext) -> tuple[str, InsightAction | None]:
    i = sig.inactivity(ctx.db, ctx.member, today=ctx.today)
    if i.last_training_on is None:
        return "You have no completed training sessions on record yet.", None
    _ev(ctx, "Last session", i.last_training_on.isoformat())
    _ev(ctx, "Days since", str(i.days_since_training))
    if i.days_since_training == 0:
        return "You trained today.", None
    tail = {
        "active": "You are training regularly.",
        "slipping": "It has been a while — a session this week keeps the habit going.",
        "inactive": "That is a long gap. A short session back is the way in.",
        "no_history": "",
    }[i.level]
    return (
        f"Your last recorded session was {i.days_since_training} days ago, on "
        f"{i.last_training_on.isoformat()}. {tail}".strip()
    ), None


def _member_records(ctx: AskContext) -> tuple[str, InsightAction | None]:
    r = sig.recent_records(ctx.db, ctx.member.id, today=ctx.today)
    if r.count == 0:
        return (
            f"No personal records in the last {r.window_days} days — hold your loads and "
            f"the reps will come.",
            None,
        )
    for rec in r.records[:3]:
        _ev(ctx, rec.exercise, f"{rec.weight_kg:g} kg × {rec.reps} · {rec.achieved_on.isoformat()}")
    top = r.records[0]
    return (
        f"{r.count} personal record{'s' if r.count != 1 else ''} in the last {r.window_days} "
        f"days. The heaviest: {top.exercise} at {top.weight_kg:g} kg for {top.reps}."
    ), InsightAction(label="See progress", route="/(member)/progress")


def _member_last_week(ctx: AskContext) -> tuple[str, InsightAction | None]:
    s = member_weekly_summary(ctx.db, ctx.member)
    for m in s.metrics:
        _ev(ctx, m.label, m.value + (f" (was {m.previous})" if m.previous else ""))
    return s.headline, None


def _member_slowdown(ctx: AskContext) -> tuple[str, InsightAction | None]:
    """ "Why has my progress slowed / stalled / plateaued?" — the specific
    reason from the trend, plateau and consistency signals."""
    s = sig.member_signals(ctx.db, ctx.member, today=ctx.today)
    reasons: list[str] = []
    if s.trend.direction == "declining" and s.trend.volume_change_pct is not None:
        reasons.append(
            f"training volume is down {abs(s.trend.volume_change_pct):g}% over the last "
            f"{s.trend.window_days} days"
        )
        _ev(ctx, "Volume change", f"{s.trend.volume_change_pct:g}%")
    if s.consistency.level == "low":
        reasons.append(
            f"only {s.consistency.sessions_in_window} sessions in the last "
            f"{s.consistency.window_weeks} weeks"
        )
        _ev(
            ctx,
            f"Last {s.consistency.window_weeks} weeks",
            f"{s.consistency.sessions_in_window} sessions",
        )
    if s.plateau.detected and s.plateau.exercise:
        reasons.append(f"{s.plateau.exercise} has been flat for {s.plateau.span_days} days")
        _ev(ctx, "Plateau", s.plateau.exercise)
    if s.inactivity.level in ("slipping", "inactive") and s.inactivity.days_since_training:
        reasons.append(f"no session logged in {s.inactivity.days_since_training} days")

    if not reasons:
        return (
            "Nothing in your data points to a slowdown — consistency, volume and your key "
            "lifts are all holding or improving.",
            InsightAction(label="See progress", route="/(member)/progress"),
        )
    return (
        "The likely reasons: " + "; ".join(reasons) + ".",
        InsightAction(label="See progress", route="/(member)/progress"),
    )


def _member_next_weight(ctx: AskContext) -> tuple[str, InsightAction | None]:
    trained = journey_service.trained_exercises(ctx.db, member_id=ctx.member.id, limit=25)
    text = ctx.match.group(0).lower() if ctx.match else ""
    hit = next((e for e in trained if e.lower() in text), None)
    if hit is None:
        listed = ", ".join(trained[:6]) or "your logged lifts"
        return (
            f"Tell me which lift — for example: {listed}. I can suggest a next weight from "
            f"your last session of it.",
            None,
        )
    rec = recommendation_for(ctx.db, member_id=ctx.member.id, exercise=hit)
    if rec.recommended_weight_kg is not None and rec.last_weight_kg is not None:
        _ev(ctx, "Last set", f"{rec.last_weight_kg:g} kg × {rec.last_reps}")
        _ev(ctx, "Suggested next", f"{rec.recommended_weight_kg:g} kg")
    return f"{rec.rationale} This is a suggestion, not a change to your programme.", InsightAction(
        label=f"Open {hit}", route=f"/(member)/progress-exercise?exercise={quote(hit)}"
    )


# --------------------------------------------------------------- trainer intents


def _trainer_member(ctx: AskContext) -> tuple[str, InsightAction | None]:
    if ctx.member is None:
        return "Open a client first, then ask about them.", None
    brief = build_trainer_brief(ctx.db, ctx.member, today=ctx.today)
    lines = [f"{brief.member_name}: " + (brief.today[0].value if brief.today else "no journey")]
    for i in brief.watch[:2]:
        lines.append(f"• Watch — {i.title}: {i.summary}")
    for i in brief.progress[:1]:
        lines.append(f"• Going well — {i.title}")
    for e in brief.today[:4]:
        _ev(ctx, e.label, e.value)
    return "\n".join(lines), InsightAction(
        label="Open client", route=f"/(trainer)/client/{ctx.member.id}"
    )


def _trainer_focus(ctx: AskContext) -> tuple[str, InsightAction | None]:
    if ctx.member is None:
        return "Open a client first, then ask what to focus on.", None
    brief = build_trainer_brief(ctx.db, ctx.member, today=ctx.today)
    for idx, line in enumerate(brief.suggested_focus, start=1):
        _ev(ctx, f"Focus {idx}", line)
    return (f"With {brief.member_name}: " + " ".join(brief.suggested_focus)), InsightAction(
        label="Open client", route=f"/(trainer)/client/{ctx.member.id}"
    )


def _trainer_attention(ctx: AskContext) -> tuple[str, InsightAction | None]:
    trainer = ctx.db.scalar(select(Trainer).where(Trainer.user_id == ctx.user.id))
    if trainer is None:
        return "This account is not a trainer.", None
    q = build_attention_queue(ctx.db, trainer, today=ctx.today, limit=5)
    if not q.items:
        return f"All {q.considered} of your clients are on track right now.", None
    for item in q.items[:5]:
        _ev(ctx, item.member_name, item.reason)
    top = q.items[0]
    return (
        f"{len(q.items)} of your {q.considered} clients need a look. Start with "
        f"{top.member_name}: {top.reason.lower()}."
    ), InsightAction(label="Open Desk", route="/(trainer)")


def _trainer_focus_today(ctx: AskContext) -> tuple[str, InsightAction | None]:
    """ "What should I focus on today?" with no client in context — the single
    most pressing client across the trainer's list."""
    if ctx.member is not None:
        return _trainer_focus(ctx)
    trainer = ctx.db.scalar(select(Trainer).where(Trainer.user_id == ctx.user.id))
    if trainer is None:
        return "This account is not a trainer.", None
    q = build_attention_queue(ctx.db, trainer, today=ctx.today, limit=3)
    if not q.items:
        return (
            f"Nothing pressing — all {q.considered} of your clients are on track. Focus on "
            f"today's scheduled sessions.",
            InsightAction(label="Open Desk", route="/(trainer)"),
        )
    for item in q.items:
        _ev(ctx, item.member_name, item.reason)
    top = q.items[0]
    return (
        f"Start with {top.member_name} — {top.reason.lower()}. "
        f"{len(q.items)} client{'s' if len(q.items) != 1 else ''} to look at in all."
    ), InsightAction(label=f"Open {top.member_name}", route=top.route)


# --------------------------------------------------------------- owner intents


def _owner_attention(ctx: AskContext) -> tuple[str, InsightAction | None]:
    brief = build_owner_daily_brief(ctx.db, branch_ids=ctx.branch_ids, today=ctx.today)
    if not brief.issues:
        return "Nothing needs your attention this morning.", None
    for issue in brief.issues[:4]:
        _ev(ctx, issue.title, issue.summary)
    return brief.headline, brief.issues[0].action


def _owner_member_visits(ctx: AskContext) -> tuple[str, InsightAction | None]:
    """ "How is attendance trending?" — for an owner or member this means
    *member* visits, not trainer shifts. Reads the weekly Member visits row
    (distinct member check-in days, this week vs last)."""
    s = owner_weekly_summary(ctx.db, branch_ids=ctx.branch_ids)
    row = next((m for m in s.metrics if m.label == "Member visits"), None)
    if row is None or (row.value == "0" and not row.previous):
        return "No member check-ins recorded for last week yet.", None
    _ev(ctx, "Member visits last week", row.value)
    if row.previous:
        _ev(ctx, "Week before", row.previous)
    move = {
        "up": "up on the week before",
        "down": "down on the week before",
        "flat": "about level with the week before",
    }.get(row.direction or "", "recorded")
    prev = f", against {row.previous} the week before" if row.previous else ""
    return (
        f"Member attendance last week: {row.value} visit-days{prev} — {move}.",
        InsightAction(label="Open members", route="/(owner)/members"),
    )


def _owner_punctuality(ctx: AskContext) -> tuple[str, InsightAction | None]:
    """Trainer punctuality — only reached when the question names trainers,
    staff, shifts or punctuality; bare "attendance" routes to member visits."""
    s = owner_weekly_summary(ctx.db, branch_ids=ctx.branch_ids)
    row = next((m for m in s.metrics if m.label == "Trainer punctuality"), None)
    if row is None or row.value == "—":
        return "No trainer shifts recorded for last week yet.", None
    _ev(ctx, "Trainer punctuality last week", row.value)
    if row.previous:
        _ev(ctx, "Week before", row.previous)
    return s.headline, InsightAction(label="Open trainers", route="/(owner)/trainers")


def _owner_last_week(ctx: AskContext) -> tuple[str, InsightAction | None]:
    s = owner_weekly_summary(ctx.db, branch_ids=ctx.branch_ids)
    for m in s.metrics:
        _ev(ctx, m.label, m.value + (f" (was {m.previous})" if m.previous else ""))
    return s.headline, None


def _owner_branch(ctx: AskContext) -> tuple[str, InsightAction | None]:
    """ "Which branch needs attention?" — the branch flagged in the daily brief,
    or the one with the lowest month-to-date punctuality in scope."""
    brief = build_owner_daily_brief(ctx.db, branch_ids=ctx.branch_ids, today=ctx.today)
    lag = next((i for i in brief.issues if i.id == "branch_lag"), None)
    if lag is not None:
        for e in lag.evidence:
            _ev(ctx, e.label, e.value)
        return lag.summary, lag.action

    from app.db.models import Branch
    from app.services.incentive_service import month_bounds

    from .owner import _punctuality

    stmt = select(Branch).where(Branch.is_active.is_(True))
    if ctx.branch_ids is not None:
        stmt = stmt.where(Branch.id.in_(ctx.branch_ids))
    branches = list(ctx.db.scalars(stmt).all())
    if len(branches) < 2:
        return (
            "You have one branch in scope, so there is no branch comparison to make.",
            InsightAction(label="Open trainers", route="/(owner)/trainers"),
        )
    start, end = month_bounds(ctx.today)
    scored = []
    for b in branches:
        on_time, present = _punctuality(ctx.db, [b.id], start, end)
        if present:
            scored.append((b, round(on_time * 100 / present, 1)))
    if not scored:
        return "No trainer shifts recorded this month yet.", None
    worst, pct = min(scored, key=lambda r: r[1])
    _ev(ctx, worst.name, f"{pct:g}% on time (MTD)")
    return (
        f"{worst.name} has the lowest trainer punctuality this month at {pct:g}%.",
        InsightAction(label=f"Open {worst.name}", route=f"/(owner)/branch/{worst.id}"),
    )


def _owner_explain(ctx: AskContext) -> tuple[str, InsightAction | None]:
    """ "Tell me more" / "why is this flagged" for one dashboard issue.

    Re-runs the daily brief (same authorization, same branch scope) and picks
    the issue whose title/id shares the most words with the question. Nothing
    outside the owner's scope is ever reached — ``branch_ids`` is the caller's
    ``scoped_branch_filter``.
    """
    brief = build_owner_daily_brief(ctx.db, branch_ids=ctx.branch_ids, today=ctx.today)
    if not brief.issues:
        return "Nothing is flagged right now — nothing needs your attention this morning.", None

    text = (ctx.match.group(0) if ctx.match else "").lower()
    words = set(re.findall(r"[a-z]{4,}", text))

    def _overlap(issue) -> int:
        hay = set(re.findall(r"[a-z]{4,}", f"{issue.id} {issue.title}".lower()))
        return len(words & hay)

    best = max(brief.issues, key=_overlap)
    if _overlap(best) == 0:
        best = brief.issues[0]  # no match — explain the top one

    for e in best.evidence:
        _ev(ctx, e.label, e.value)
    trend = {"up": " Trend: up.", "down": " Trend: down.", "flat": " Trend: flat."}.get(
        best.direction or "", ""
    )
    return f"{best.title}. {best.summary}{trend}", best.action


# --------------------------------------------------------------- registry

_INTENTS: dict[str, list[tuple[str, re.Pattern, Handler]]] = {
    "member": [
        (
            "consistency",
            re.compile(
                r"\bconsist|\bregular|\bcadence|often enough\b|"
                r"\battendance\b|how often|my visits?\b",
                re.I,
            ),
            _member_consistency,
        ),
        (
            "last_trained",
            re.compile(r"last (train|session|workout)|when did i|how long since", re.I),
            _member_last_trained,
        ),
        (
            "records",
            re.compile(r"\bprs?\b|personal record|\brecords?\b|new best|heaviest", re.I),
            _member_records,
        ),
        (
            "last_week",
            re.compile(r"last week|this week|past week|weekly|what changed", re.I),
            _member_last_week,
        ),
        (
            "slowdown",
            re.compile(
                r"why.*(slow|slowed|stall|stalled|plateau|not improv|no progress|flat)|"
                r"progress slowed|why.*not.*(gain|improv)",
                re.I,
            ),
            _member_slowdown,
        ),
        (
            "next_weight",
            re.compile(
                r"heavier|more weight|next (weight|set)|go up|add (weight|load)|"
                r"progress(ion)? on|what.*(lift|weight)",
                re.I,
            ),
            _member_next_weight,
        ),
        (
            "overview",
            re.compile(r"how('?s| am| is| are)|how.*doing|progress|what should i", re.I),
            _member_overview,
        ),
    ],
    "trainer": [
        (
            "attention",
            re.compile(r"\bwho\b|attention|needs? a look|triage|check in on", re.I),
            _trainer_attention,
        ),
        (
            "focus_today",
            re.compile(
                r"focus.*(today|now)|what should i (focus|do) (on )?today|today.*focus", re.I
            ),
            _trainer_focus_today,
        ),
        ("focus", re.compile(r"focus|work on|priorit|what should i", re.I), _trainer_focus),
        ("member", re.compile(r"how('?s| is)|doing|state|status|update on", re.I), _trainer_member),
    ],
    "owner": [
        (
            "explain",
            re.compile(
                r"tell me more|more detail|why (is|are|was|were).*(flag|this|that)|"
                r"^why\b|explain|what does (this|that) mean",
                re.I,
            ),
            _owner_explain,
        ),
        (
            # Trainer punctuality — only when the question actually names
            # trainers / staff / shifts / punctuality / lateness. Bare
            # "attendance" is member attendance and falls through to
            # member_visits below.
            "punctuality",
            re.compile(
                r"punctual|\bon.?time\b|\blate\b|(trainer|staff|coach)s?\b.*"
                r"(attend|shift|punctual|on.?time|late|show)|"
                r"(attend|shift|punctual).*(trainer|staff|coach)|unworked|no.?show",
                re.I,
            ),
            _owner_punctuality,
        ),
        (
            # Member attendance / visits / footfall — the default reading of
            # "attendance" for an owner.
            "member_visits",
            re.compile(
                r"member.?(attend|visit|check)|attendance|\bvisits?\b|footfall|"
                r"walk.?ins?|how busy|how many (people|members)|traffic",
                re.I,
            ),
            _owner_member_visits,
        ),
        (
            "last_week",
            re.compile(r"last week|this week|weekly|past week|what changed", re.I),
            _owner_last_week,
        ),
        (
            "branch",
            re.compile(r"which branch|what branch|branch.*(attention|worst|behind|lag)", re.I),
            _owner_branch,
        ),
        (
            "attention",
            re.compile(r"attention|needs?|issue|problem|what should i|priorit", re.I),
            _owner_attention,
        ),
    ],
}

_SUGGESTIONS = {
    "member": [
        "How am I progressing?",
        "What changed this week?",
        "What should I focus on?",
        "Why has my progress slowed?",
        "Any recent personal records?",
    ],
    "trainer_member": [
        "How is {name} progressing?",
        "What should I focus on with {name}?",
        "Who needs attention?",
    ],
    "trainer": [
        "Who needs attention?",
        "What should I focus on today?",
    ],
    "owner": [
        "What needs my attention?",
        "How is member attendance trending?",
        "How are trainers doing on punctuality?",
        "Which branch needs attention?",
    ],
}

_FALLBACK = {
    "member": "I can answer about how you are doing, your training consistency, recent personal "
    "records, what weight to try next on a lift, and how last week went.",
    "trainer": "Open a client and ask how they are or what to focus on, or ask who needs "
    "attention across your clients.",
    "owner": "I can answer about what needs your attention today, how member attendance is "
    "trending, trainer punctuality, and how last week went.",
}


def _audience(user: User) -> str:
    key = user.role.key
    if key == RoleKey.MEMBER.value:
        return "member"
    if key == RoleKey.TRAINER.value:
        return "trainer"
    return "owner"


def suggestions_for(user: User, member: Member | None) -> list[str]:
    audience = _audience(user)
    if audience == "trainer" and member is not None:
        name = member.user.full_name.split(" ")[0] if member.user else "them"
        return [s.format(name=name) for s in _SUGGESTIONS["trainer_member"]]
    return list(_SUGGESTIONS.get(audience, []))


def answer(
    db: Session,
    user: User,
    question: str,
    *,
    member: Member | None = None,
    branch_ids: list[int] | None = None,
) -> AskAnswer:
    audience = _audience(user)
    q = (question or "").strip()
    branch = db.get(Branch, member.branch_id) if member else None
    today = branch_today(branch.timezone if branch else None)

    ctx = AskContext(db=db, user=user, today=today, member=member, branch_ids=branch_ids)
    # A member asking about themselves needs their own record loaded.
    if audience == "member" and member is None:
        ctx.member = db.scalar(select(Member).where(Member.user_id == user.id))

    # Intents that need the whole question text, not just the matched slice —
    # to hunt for an exercise name, or to word-match an owner issue.
    _WANT_FULL_QUESTION = {"next_weight", "explain"}

    for intent_name, pattern, handler in _INTENTS[audience]:
        m = pattern.search(q)
        if m:
            ctx.match = re.match(r".*", q) if intent_name in _WANT_FULL_QUESTION else m
            try:
                text, action = handler(ctx)
            except Exception:  # noqa: BLE001 — never 500 on a question
                break
            return AskAnswer(
                question=q,
                intent=intent_name,
                answer=text,
                source="deterministic",
                data=ctx.ev,
                action=action,
                suggestions=suggestions_for(user, member),
            )

    return AskAnswer(
        question=q,
        intent="unrecognised",
        answer=_FALLBACK[audience],
        source="deterministic",
        data=[],
        action=None,
        suggestions=suggestions_for(user, member),
    )


__all__ = ["answer", "suggestions_for"]

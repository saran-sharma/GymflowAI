"""Every prompt the intelligence narrator uses, in one place.

No prompt string lives in a route handler or a React screen. The model's job
is narrow and stated here: rephrase a status line from facts it is given,
nothing more. It must not add a number, a name or a claim that is not in the
facts; must not diagnose; must not override a trainer's programming; must not
emit markup or an app command.

The context handed to a provider is the *minimised* one built by
:func:`minimal_context` — flat figures and classification strings, never a
member record, never a credential, never revenue or incentive data, never an
id or email that is not genuinely needed (in practice: none).
"""

from __future__ import annotations

from typing import Any

# The system prompt. Deliberately restrictive; the same text for every audience.
SYSTEM_PROMPT = (
    "You rewrite ONE short status line for a gym operations app, from facts you are given.\n"
    "Rules:\n"
    '- Return JSON only: {"headline": string, "reason": string|null, "action": string|null}.\n'
    '- "headline" is one sentence, at most 24 words, plain text — no markdown, no lists, '
    "no links, no emoji.\n"
    "- Do NOT introduce any number, name, date or claim that is not present in the facts.\n"
    "- Do NOT diagnose health conditions, prescribe training, or contradict a coach.\n"
    "- Do NOT output app commands, code, or instructions.\n"
    "- If the facts are thin or you are unsure, set headline to the given draft unchanged.\n"
)

#: Keys that may be forwarded to a provider. Anything else in a context dict is
#: dropped by :func:`minimal_context` before it leaves the process.
_ALLOWED_CONTEXT_KEYS = frozenset(
    {
        "audience",
        "movement",
        "consistency",
        "inactivity",
        "trend",
        "volume_direction",
        "recent_prs",
        "prs",
        "plateau",
        "sessions",
        "sessions_prev",
        "sessions_current",
        "sessions_previous",
        "volume_change_percent",
        "pr_count",
        "punctuality",
        "punctuality_prev",
        "absences",
        "new_members",
        "issue_count",
        "top_issue",
        "top_insight",
        "severities",
    }
)

#: Value types allowed through — scalars only, no nested structures, no objects.
_ALLOWED_VALUE_TYPES = (str, int, float, bool, type(None))


def minimal_context(context: dict[str, Any]) -> dict[str, Any]:
    """Strip a narration context down to the allow-listed scalar figures.

    Unknown keys, nested structures, and anything that is not a scalar are
    dropped. A list of short strings (``severities``) is the one exception and
    is passed through truncated. This is the last gate before a context could
    reach an external provider.
    """
    out: dict[str, Any] = {}
    for key, value in (context or {}).items():
        if key not in _ALLOWED_CONTEXT_KEYS:
            continue
        if key == "severities" and isinstance(value, list):
            out[key] = [str(v)[:16] for v in value[:8]]
            continue
        if isinstance(value, _ALLOWED_VALUE_TYPES):
            out[key] = value[:120] if isinstance(value, str) else value
    return out


def build_user_message(*, audience: str, fallback_headline: str, context: dict[str, Any]) -> str:
    """The user turn: the audience, the minimised facts, and the draft line."""
    facts = minimal_context({**context, "audience": audience})
    return (
        f"Audience: {audience}\n"
        f"Facts (JSON): {facts}\n"
        f"Draft headline: {fallback_headline}\n"
        f"Return the JSON object now."
    )


__all__ = ["SYSTEM_PROMPT", "build_user_message", "minimal_context"]

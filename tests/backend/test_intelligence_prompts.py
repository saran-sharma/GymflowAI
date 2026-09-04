"""What the model is — and is not — allowed to see.

``minimal_context`` is the last gate before a narration context could reach an
external provider: allow-listed scalar keys only, nothing nested, nothing
identifying.
"""

from __future__ import annotations

from app.services.intelligence.prompts import (
    SYSTEM_PROMPT,
    build_user_message,
    minimal_context,
)


def test_minimal_context_keeps_only_allow_listed_scalars():
    ctx = {
        "consistency": "strong",
        "trend": "declining",
        "recent_prs": 2,
        "movement": "behind",
        # None of these may pass:
        "member_id": 4173,
        "email": "aditya.rao@member.slam.demo",
        "full_name": "Aditya Rao",
        "phone": "+91 90000 00000",
        "password_hash": "x",
        "token": "sk-abc",
        "incentive_amount": 5000,
        "revenue": 120000,
        "entire_member_record": {"a": 1},
        "nested": {"deep": True},
        "list_of_objects": [{"x": 1}],
    }
    out = minimal_context(ctx)
    assert out == {
        "consistency": "strong",
        "trend": "declining",
        "recent_prs": 2,
        "movement": "behind",
    }


def test_minimal_context_truncates_long_strings_and_the_severities_list():
    out = minimal_context({"top_issue": "x" * 500, "severities": ["critical"] * 40})
    assert len(out["top_issue"]) <= 120
    assert len(out["severities"]) <= 8


def test_build_user_message_never_carries_pii():
    msg = build_user_message(
        audience="member",
        fallback_headline="Steady week.",
        context={
            "consistency": "steady",
            "email": "who@slam.demo",
            "full_name": "Someone Real",
            "member_id": 99,
        },
    )
    assert "who@slam.demo" not in msg
    assert "Someone Real" not in msg
    assert "99" not in msg
    assert "consistency" in msg
    assert "Steady week." in msg


def test_system_prompt_states_the_hard_boundaries():
    p = SYSTEM_PROMPT.lower()
    assert "json only" in p
    assert "not introduce any number" in p
    assert "not diagnose" in p
    assert "not output app commands" in p

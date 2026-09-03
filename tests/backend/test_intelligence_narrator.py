"""The narration layer — the one place an LLM is allowed near the output.

It may only rephrase a sentence GymFlow already wrote, and every failure mode
(provider error, timeout, markup, over-long, off-brief) must land back on the
deterministic template.
"""

from __future__ import annotations

import pytest

from app.services.intelligence.narrator import (
    LLMNarrator,
    NarrationRequest,
    TemplateNarrator,
    validate_headline,
)

REQ = NarrationRequest(
    audience="member",
    fallback_headline="Going well — training is consistent.",
    context={"consistency": "strong", "recent_prs": 1},
)


# --------------------------------------------------------------- validation


@pytest.mark.parametrize(
    "text",
    [
        "",
        "   ",
        "See <b>progress</b>",
        "Check https://example.com for details",
        "```code```",
        "x" * 200,
        "One. Two. Three. Four. Five.",
    ],
)
def test_validate_rejects_untrusted_text(text):
    assert validate_headline(text) is None


def test_validate_accepts_and_trims_a_plain_sentence():
    assert validate_headline("  Training   is  consistent.  ") == "Training is consistent."


# --------------------------------------------------------------- template


def test_template_narrator_returns_the_fallback_verbatim():
    result = TemplateNarrator().narrate(REQ)
    assert result.headline == REQ.fallback_headline
    assert result.source == "deterministic"


# --------------------------------------------------------------- llm path


class _Provider:
    def __init__(self, reply=None, boom=None):
        self._reply = reply
        self._boom = boom
        self.calls = 0

    def complete(self, *, system, user, timeout, max_tokens):
        self.calls += 1
        if self._boom is not None:
            raise self._boom
        return self._reply


def test_llm_narration_used_when_valid():
    provider = _Provider(reply="You're training consistently and just hit a PR.")
    result = LLMNarrator(provider, timeout=1.0, max_tokens=100).narrate(REQ)
    assert result.source == "llm"
    assert result.headline == "You're training consistently and just hit a PR."


def test_llm_provider_error_falls_back_to_template():
    provider = _Provider(boom=TimeoutError("slow"))
    result = LLMNarrator(provider, timeout=0.01, max_tokens=100).narrate(REQ)
    assert result.source == "deterministic"
    assert result.headline == REQ.fallback_headline


def test_llm_malformed_output_falls_back_to_template():
    provider = _Provider(reply="<script>alert(1)</script>")
    result = LLMNarrator(provider, timeout=1.0, max_tokens=100).narrate(REQ)
    assert result.source == "deterministic"
    assert result.headline == REQ.fallback_headline


def test_llm_empty_output_falls_back_to_template():
    result = LLMNarrator(_Provider(reply="   "), timeout=1.0, max_tokens=100).narrate(REQ)
    assert result.source == "deterministic"


def test_build_narrator_is_template_without_a_provider(monkeypatch):
    from app.services.intelligence import narrator as mod

    monkeypatch.setattr(mod.settings, "intelligence_narrator", "llm", raising=False)
    assert isinstance(mod.build_narrator(), TemplateNarrator)

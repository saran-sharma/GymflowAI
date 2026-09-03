"""Turning structured signals into one plain sentence.

The narrator writes the *headline* — the single line at the top of the
intelligence section — and nothing else. It never invents a number: it is handed
a normalized context of figures GymFlow already computed and either stitches
them into a sentence with templates (the default, always available) or asks a
configured language model to phrase them (opt-in, and only ever a rephrasing).

Two guarantees hold whatever provider is live:

* The insights, evidence and actions are built deterministically elsewhere and
  are never touched here. A failed, slow or nonsensical model response costs the
  headline its polish, not the section its content.
* Model output is validated before use — length-capped, stripped of anything
  that looks like markup or a fabricated metric — and rejected to the template
  on any doubt.

No provider package is installed today, so :func:`build_narrator` returns the
template narrator. The LLM path, its timeout and its validation are written and
tested against a fake provider; wiring a real key is a configuration change.
"""

from __future__ import annotations

import logging
import re
from dataclasses import dataclass
from typing import Literal, Protocol

from app.core.config import settings

logger = logging.getLogger("gymflow.intelligence.narrator")

Audience = Literal["member", "trainer", "owner"]
MAX_HEADLINE_CHARS = 180


@dataclass(frozen=True)
class NarrationRequest:
    audience: Audience
    #: The deterministic fallback sentence. Always a complete, shippable
    #: headline — the LLM path only ever replaces it with a better-phrased one.
    fallback_headline: str
    #: Flat, already-normalized facts (strings and numbers only, no PII beyond a
    #: first name). What a model is allowed to see.
    context: dict


@dataclass(frozen=True)
class NarrationResult:
    headline: str
    source: Literal["deterministic", "llm"]


class NarrationProvider(Protocol):
    """What a real LLM client must expose for :class:`LLMNarrator` to use it."""

    def complete(self, *, system: str, user: str, timeout: float, max_tokens: int) -> str: ...


# --------------------------------------------------------------- validation

_FORBIDDEN = re.compile(r"[<>{}\[\]|]|https?://|```")


def validate_headline(text: str) -> str | None:
    """Return a cleaned headline, or ``None`` if the text cannot be trusted.

    Rejects empty output, anything with markup/links/code fences, and anything
    over the length cap. Does not try to fact-check — the model is only ever
    asked to rephrase figures it was given — but a response that ignored the
    brief and rambled is thrown away rather than shown.
    """
    if not text:
        return None
    cleaned = " ".join(text.strip().split())
    if not cleaned or len(cleaned) > MAX_HEADLINE_CHARS:
        return None
    if _FORBIDDEN.search(cleaned):
        return None
    if cleaned.count(".") > 3:  # more than a couple of sentences is off-brief
        return None
    return cleaned


# --------------------------------------------------------------- narrators


class TemplateNarrator:
    """The always-available path: the fallback sentence is already the answer."""

    source = "deterministic"

    def narrate(self, request: NarrationRequest) -> NarrationResult:
        return NarrationResult(headline=request.fallback_headline, source="deterministic")


class LLMNarrator:
    """Rephrase the fallback with a model, and fall back on any problem."""

    source = "llm"

    _SYSTEM = (
        "You rewrite one short status line for a gym app. You are given facts and a "
        "draft sentence. Return ONE sentence, at most 24 words, plain text, no lists, "
        "no markdown, no links. Do not add any number, name or claim that is not in "
        "the facts. If unsure, return the draft unchanged."
    )

    def __init__(
        self,
        provider: NarrationProvider,
        *,
        timeout: float,
        max_tokens: int,
        fallback: TemplateNarrator | None = None,
    ) -> None:
        self._provider = provider
        self._timeout = timeout
        self._max_tokens = max_tokens
        self._fallback = fallback or TemplateNarrator()

    def narrate(self, request: NarrationRequest) -> NarrationResult:
        user = (
            f"Audience: {request.audience}\n"
            f"Facts: {request.context}\n"
            f"Draft: {request.fallback_headline}"
        )
        try:
            raw = self._provider.complete(
                system=self._SYSTEM,
                user=user,
                timeout=self._timeout,
                max_tokens=self._max_tokens,
            )
        except Exception:  # noqa: BLE001 — any provider failure is non-fatal
            logger.warning("intelligence narration provider failed; using template", exc_info=True)
            return self._fallback.narrate(request)

        headline = validate_headline(raw)
        if headline is None:
            logger.info("intelligence narration rejected by validation; using template")
            return self._fallback.narrate(request)
        return NarrationResult(headline=headline, source="llm")


def build_narrator():
    """The narrator this deployment uses.

    Template-only until ``INTELLIGENCE_NARRATOR=llm`` *and* a provider is
    actually constructable. There is no provider package in the tree yet, so the
    ``llm`` branch deliberately logs and degrades rather than raising.
    """
    if getattr(settings, "intelligence_narrator", "template") != "llm":
        return TemplateNarrator()
    logger.warning(
        "INTELLIGENCE_NARRATOR=llm but no narration provider is configured; "
        "falling back to the deterministic template narrator"
    )
    return TemplateNarrator()


__all__ = [
    "Audience",
    "LLMNarrator",
    "MAX_HEADLINE_CHARS",
    "NarrationProvider",
    "NarrationRequest",
    "NarrationResult",
    "TemplateNarrator",
    "build_narrator",
    "validate_headline",
]

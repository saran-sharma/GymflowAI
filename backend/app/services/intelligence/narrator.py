"""Turning structured signals into one plain sentence.

The narrator writes the *headline* — the single line at the top of an
intelligence section — and nothing else. It never invents a number: it is
handed a minimised context of figures GymFlow already computed and either
stitches them into a sentence with templates (the default, always available)
or asks a configured model to rephrase them (opt-in).

Guarantees that hold whatever provider is live:

* The insights, evidence and actions are built deterministically elsewhere and
  are never touched here. A failed, slow, unauthorized or off-brief model
  response costs the headline its polish, not the section its content.
* Model output is validated before use — parsed as the ``{headline, reason,
  action}`` JSON the prompt demands, length-capped, stripped of markup/links —
  and rejected to the template on any doubt.
* The provider only ever sees ``prompts.minimal_context`` — allow-listed
  scalars, no member record, no credential, no revenue/incentive data.

The ``llm`` path speaks the OpenAI chat-completions wire format over the stdlib
HTTP client (no new dependency). It is inert until a key *and* a model are
configured. With no key in this environment, live verification is pending; the
path, its parsing, timeout, auth handling and fallback are covered by tests
against a fake provider.
"""

from __future__ import annotations

import json
import logging
import re
import urllib.error
import urllib.request
from dataclasses import dataclass
from typing import Literal, Protocol

from app.core.config import settings
from app.services.intelligence import prompts

logger = logging.getLogger("gymflow.intelligence.narrator")

Audience = Literal["member", "trainer", "owner"]
MAX_HEADLINE_CHARS = 180


class NarrationError(Exception):
    """Any provider-side failure — network, timeout, auth, bad status."""


class NarrationAuthError(NarrationError):
    """The provider rejected the credential (401/403)."""


@dataclass(frozen=True)
class NarrationRequest:
    audience: Audience
    #: The deterministic fallback sentence. Always a complete, shippable
    #: headline — the LLM path only ever replaces it with a better-phrased one.
    fallback_headline: str
    #: Flat facts. Passed through ``prompts.minimal_context`` before a provider
    #: ever sees it.
    context: dict


@dataclass(frozen=True)
class NarrationResult:
    headline: str
    source: Literal["deterministic", "llm"]


class NarrationProvider(Protocol):
    """What a model client must expose for :class:`LLMNarrator`."""

    def complete(self, *, system: str, user: str, timeout: float, max_tokens: int) -> str: ...


# --------------------------------------------------------------- validation

_FORBIDDEN = re.compile(r"[<>{}\[\]|]|https?://|```|`")


def validate_headline(text: str | None) -> str | None:
    """Return a cleaned headline, or ``None`` if it cannot be trusted.

    Rejects empty output, markup/links/code fences, anything over the length
    cap, and more than a couple of sentences (a response that ignored the
    brief). Does not fact-check — the model only rephrases figures it was
    given.
    """
    if not text or not isinstance(text, str):
        return None
    cleaned = " ".join(text.strip().split())
    if not cleaned or len(cleaned) > MAX_HEADLINE_CHARS:
        return None
    if _FORBIDDEN.search(cleaned):
        return None
    if cleaned.count(".") > 3:
        return None
    return cleaned


def parse_structured(raw: str) -> str | None:
    """Pull a validated headline out of the model's reply.

    The prompt asks for ``{"headline": ..., "reason": ..., "action": ...}``.
    A bare string is also accepted (some providers ignore the JSON ask). Only
    ``headline`` is consumed; ``reason``/``action`` are validated for safety
    and then discarded — the app's action is computed deterministically.
    Returns ``None`` on anything malformed.
    """
    if raw is None:
        return None
    text = raw.strip()
    # Tolerate a ```json fence around the object.
    fenced = re.match(r"^```(?:json)?\s*(.*?)\s*```$", text, re.S)
    if fenced:
        text = fenced.group(1).strip()

    if text.startswith("{"):
        try:
            obj = json.loads(text)
        except (ValueError, TypeError):
            return None
        if not isinstance(obj, dict):
            return None
        headline = validate_headline(obj.get("headline"))
        # reason/action are not used, but a response stuffing markup or an
        # essay into them is still a signal the model went off-brief.
        for extra in ("reason", "action"):
            value = obj.get(extra)
            if value is not None and (
                not isinstance(value, str) or len(value) > 400 or _FORBIDDEN.search(value)
            ):
                return None
        return headline

    return validate_headline(text)


# --------------------------------------------------------------- providers


class HttpNarrationProvider:
    """An OpenAI-compatible chat-completions client, over the stdlib.

    Works against ``api.openai.com``, Azure OpenAI, a proxy, or a local server
    that speaks the same shape. No SDK, no new dependency. The key is sent only
    in the ``Authorization`` header to the configured base URL and is never
    logged.
    """

    def __init__(self, *, base_url: str, api_key: str, model: str) -> None:
        self._url = base_url.rstrip("/") + "/chat/completions"
        self._key = api_key
        self._model = model

    def complete(self, *, system: str, user: str, timeout: float, max_tokens: int) -> str:
        body = json.dumps(
            {
                "model": self._model,
                "messages": [
                    {"role": "system", "content": system},
                    {"role": "user", "content": user},
                ],
                "max_tokens": max_tokens,
                "temperature": 0.3,
                "response_format": {"type": "json_object"},
            }
        ).encode()
        req = urllib.request.Request(
            self._url,
            data=body,
            method="POST",
            headers={
                "Authorization": f"Bearer {self._key}",
                "Content-Type": "application/json",
            },
        )
        try:
            with urllib.request.urlopen(req, timeout=timeout) as resp:
                payload = json.loads(resp.read().decode())
        except urllib.error.HTTPError as exc:  # noqa: PERF203
            if exc.code in (401, 403):
                raise NarrationAuthError(f"provider rejected the credential ({exc.code})") from None
            raise NarrationError(f"provider returned HTTP {exc.code}") from None
        except (TimeoutError, urllib.error.URLError) as exc:
            raise NarrationError(f"provider unreachable: {exc}") from None
        except (ValueError, OSError) as exc:
            raise NarrationError(f"provider response unreadable: {exc}") from None

        try:
            return payload["choices"][0]["message"]["content"] or ""
        except (KeyError, IndexError, TypeError):
            raise NarrationError("provider response missing content") from None


# --------------------------------------------------------------- narrators


class TemplateNarrator:
    """The always-available path: the fallback sentence is already the answer."""

    source = "deterministic"

    def narrate(self, request: NarrationRequest) -> NarrationResult:
        return NarrationResult(headline=request.fallback_headline, source="deterministic")


class LLMNarrator:
    """Rephrase the fallback with a model, and fall back on any problem."""

    source = "llm"

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
        user = prompts.build_user_message(
            audience=request.audience,
            fallback_headline=request.fallback_headline,
            context=request.context,
        )
        try:
            raw = self._provider.complete(
                system=prompts.SYSTEM_PROMPT,
                user=user,
                timeout=self._timeout,
                max_tokens=self._max_tokens,
            )
        except NarrationAuthError:
            logger.error("intelligence narration provider rejected the credential; using template")
            return self._fallback.narrate(request)
        except Exception:  # noqa: BLE001 — any provider failure is non-fatal
            logger.warning("intelligence narration provider failed; using template", exc_info=True)
            return self._fallback.narrate(request)

        headline = parse_structured(raw)
        if headline is None:
            logger.info("intelligence narration rejected by validation; using template")
            return self._fallback.narrate(request)
        return NarrationResult(headline=headline, source="llm")


def safe_narrate(narrator, request: NarrationRequest) -> NarrationResult:
    """Call ``narrator.narrate`` and never propagate.

    The built-in narrators handle their own failures; the orchestrators route
    through here so a misbehaving *custom* narrator degrades the headline to
    the deterministic fallback instead of taking the read down (§21).
    """
    try:
        return narrator.narrate(request)
    except Exception:  # noqa: BLE001 — narration is never load-bearing
        logger.warning("intelligence narrator raised; using fallback headline", exc_info=True)
        return NarrationResult(headline=request.fallback_headline, source="deterministic")


def build_narrator():
    """The narrator this deployment uses.

    Template unless ``INTELLIGENCE_NARRATOR=llm`` *and* both a key and a model
    are configured. Anything short of that logs once and returns the template
    narrator — the app behaves identically either way.
    """
    if getattr(settings, "intelligence_narrator", "template") != "llm":
        return TemplateNarrator()

    key = getattr(settings, "intelligence_llm_api_key", "")
    model = getattr(settings, "intelligence_llm_model", "")
    if not key or not model:
        logger.warning(
            "INTELLIGENCE_NARRATOR=llm but no API key/model is set; using the template narrator"
        )
        return TemplateNarrator()

    provider = HttpNarrationProvider(
        base_url=getattr(settings, "intelligence_llm_base_url", "https://api.openai.com/v1"),
        api_key=key,
        model=model,
    )
    return LLMNarrator(
        provider,
        timeout=float(getattr(settings, "intelligence_llm_timeout_seconds", 6.0)),
        max_tokens=int(getattr(settings, "intelligence_llm_max_output_tokens", 400)),
    )


__all__ = [
    "Audience",
    "HttpNarrationProvider",
    "LLMNarrator",
    "MAX_HEADLINE_CHARS",
    "NarrationAuthError",
    "NarrationError",
    "NarrationProvider",
    "NarrationRequest",
    "NarrationResult",
    "TemplateNarrator",
    "build_narrator",
    "parse_structured",
    "safe_narrate",
    "validate_headline",
]

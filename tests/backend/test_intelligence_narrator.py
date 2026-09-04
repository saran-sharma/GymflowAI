"""The narration layer — the one place an LLM is allowed near the output.

It may only rephrase a sentence GymFlow already wrote, and every failure mode
(provider error, timeout, markup, over-long, off-brief) must land back on the
deterministic template.
"""

from __future__ import annotations

import pytest

from app.services.intelligence.narrator import (
    LLMNarrator,
    NarrationAuthError,
    NarrationError,
    NarrationRequest,
    NarrationResult,
    TemplateNarrator,
    parse_structured,
    safe_narrate,
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
    monkeypatch.setattr(mod.settings, "intelligence_llm_api_key", "", raising=False)
    assert isinstance(mod.build_narrator(), TemplateNarrator)


def test_build_narrator_is_llm_when_key_and_model_are_set(monkeypatch):
    from app.services.intelligence import narrator as mod

    monkeypatch.setattr(mod.settings, "intelligence_narrator", "llm", raising=False)
    monkeypatch.setattr(mod.settings, "intelligence_llm_api_key", "sk-not-real", raising=False)
    monkeypatch.setattr(mod.settings, "intelligence_llm_model", "gpt-4o-mini", raising=False)
    narr = mod.build_narrator()
    assert isinstance(narr, LLMNarrator)


# --------------------------------------------------------------- structured output


def test_structured_json_headline_is_used():
    provider = _Provider(reply='{"headline": "Consistent month, one PR.", "reason": null}')
    result = LLMNarrator(provider, timeout=1.0, max_tokens=100).narrate(REQ)
    assert result.source == "llm"
    assert result.headline == "Consistent month, one PR."


def test_structured_json_inside_a_code_fence_is_tolerated():
    provider = _Provider(reply='```json\n{"headline": "Steady week."}\n```')
    result = LLMNarrator(provider, timeout=1.0, max_tokens=100).narrate(REQ)
    assert result.headline == "Steady week."


@pytest.mark.parametrize(
    "reply",
    [
        "{not json",
        '{"headline": 123}',
        '{"headline": null}',
        '{"nope": "no headline key"}',
        '{"headline": "' + "x" * 200 + '"}',
        '{"headline": "See <b>this</b>"}',
        '{"headline": "ok", "reason": "<script>x</script>"}',
        '{"headline": "ok", "reason": "' + "y" * 500 + '"}',
        '["not", "an", "object"]',
        '{"headline": "Visit https://x.co now"}',
    ],
)
def test_structured_output_that_cannot_be_trusted_falls_back(reply):
    result = LLMNarrator(_Provider(reply=reply), timeout=1.0, max_tokens=100).narrate(REQ)
    assert result.source == "deterministic"
    assert result.headline == REQ.fallback_headline


def test_parse_structured_accepts_a_bare_string():
    assert parse_structured("Just a plain sentence.") == "Just a plain sentence."


# --------------------------------------------------------------- auth / http provider


def test_llm_auth_error_falls_back_quietly():
    provider = _Provider(boom=NarrationAuthError("401"))
    result = LLMNarrator(provider, timeout=1.0, max_tokens=100).narrate(REQ)
    assert result.source == "deterministic"


class _FakeResponse:
    def __init__(self, body: bytes):
        self._body = body

    def read(self):
        return self._body

    def __enter__(self):
        return self

    def __exit__(self, *a):
        return False


def _ok_body(content: str) -> bytes:
    import json

    return json.dumps({"choices": [{"message": {"content": content}}]}).encode()


def test_http_provider_sends_the_key_only_in_the_authorization_header(monkeypatch):
    import urllib.request

    from app.services.intelligence import narrator as mod

    captured = {}

    def fake_urlopen(req, timeout=None):
        captured["headers"] = dict(req.header_items())
        captured["body"] = req.data.decode()
        captured["url"] = req.full_url
        return _FakeResponse(_ok_body('{"headline": "Nice week."}'))

    monkeypatch.setattr(mod.urllib.request, "urlopen", fake_urlopen)
    provider = mod.HttpNarrationProvider(
        base_url="https://api.example.com/v1", api_key="sk-secret-xyz", model="m"
    )
    out = provider.complete(system="s", user="u", timeout=3, max_tokens=50)

    assert out == '{"headline": "Nice week."}'
    assert captured["headers"].get("Authorization") == "Bearer sk-secret-xyz"
    # The key is nowhere in the request body.
    assert "sk-secret-xyz" not in captured["body"]
    assert captured["url"] == "https://api.example.com/v1/chat/completions"
    assert urllib.request is not None  # import kept meaningful


def test_http_provider_maps_401_to_an_auth_error(monkeypatch):
    import urllib.error

    from app.services.intelligence import narrator as mod

    def boom(req, timeout=None):
        raise urllib.error.HTTPError(req.full_url, 401, "Unauthorized", {}, None)

    monkeypatch.setattr(mod.urllib.request, "urlopen", boom)
    provider = mod.HttpNarrationProvider(base_url="https://x/v1", api_key="k", model="m")
    with pytest.raises(NarrationAuthError):
        provider.complete(system="s", user="u", timeout=1, max_tokens=10)


def test_http_provider_maps_a_timeout_to_a_narration_error(monkeypatch):
    from app.services.intelligence import narrator as mod

    def slow(req, timeout=None):
        raise TimeoutError("timed out")

    monkeypatch.setattr(mod.urllib.request, "urlopen", slow)
    provider = mod.HttpNarrationProvider(base_url="https://x/v1", api_key="k", model="m")
    with pytest.raises(NarrationError):
        provider.complete(system="s", user="u", timeout=0.01, max_tokens=10)


def test_http_provider_maps_403_to_an_auth_error(monkeypatch):
    import urllib.error

    from app.services.intelligence import narrator as mod

    def boom(req, timeout=None):
        raise urllib.error.HTTPError(req.full_url, 403, "Forbidden", {}, None)

    monkeypatch.setattr(mod.urllib.request, "urlopen", boom)
    provider = mod.HttpNarrationProvider(base_url="https://x/v1", api_key="k", model="m")
    with pytest.raises(NarrationAuthError):
        provider.complete(system="s", user="u", timeout=1, max_tokens=10)


def test_http_provider_maps_an_unreachable_host_to_a_narration_error(monkeypatch):
    import urllib.error

    from app.services.intelligence import narrator as mod

    def down(req, timeout=None):
        raise urllib.error.URLError("name or service not known")

    monkeypatch.setattr(mod.urllib.request, "urlopen", down)
    provider = mod.HttpNarrationProvider(base_url="https://x/v1", api_key="k", model="m")
    with pytest.raises(NarrationError):
        provider.complete(system="s", user="u", timeout=1, max_tokens=10)


def test_http_provider_rejects_a_response_with_no_content(monkeypatch):
    from app.services.intelligence import narrator as mod

    def missing(req, timeout=None):
        return _FakeResponse(b'{"choices": []}')

    monkeypatch.setattr(mod.urllib.request, "urlopen", missing)
    provider = mod.HttpNarrationProvider(base_url="https://x/v1", api_key="k", model="m")
    with pytest.raises(NarrationError):
        provider.complete(system="s", user="u", timeout=1, max_tokens=10)


def test_http_provider_end_to_end_through_the_narrator(monkeypatch):
    from app.services.intelligence import narrator as mod

    monkeypatch.setattr(
        mod.urllib.request,
        "urlopen",
        lambda req, timeout=None: _FakeResponse(_ok_body('{"headline": "Strong month."}')),
    )
    provider = mod.HttpNarrationProvider(base_url="https://x/v1", api_key="k", model="m")
    result = LLMNarrator(provider, timeout=2, max_tokens=50).narrate(REQ)
    assert result.source == "llm"
    assert result.headline == "Strong month."


# --------------------------------------------------------------- safe_narrate


class _RaisingNarrator:
    def narrate(self, request):
        raise RuntimeError("a custom narrator misbehaved")


class _GoodNarrator:
    def narrate(self, request):
        return NarrationResult(headline="rephrased", source="llm")


def test_safe_narrate_swallows_a_raising_narrator():
    result = safe_narrate(_RaisingNarrator(), REQ)
    assert result.source == "deterministic"
    assert result.headline == REQ.fallback_headline


def test_safe_narrate_passes_a_good_result_through():
    result = safe_narrate(_GoodNarrator(), REQ)
    assert result.source == "llm"
    assert result.headline == "rephrased"

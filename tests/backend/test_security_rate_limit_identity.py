"""X-Forwarded-For is only trusted from a configured proxy.

A directly-connected client must not be able to change its own rate-limit
bucket by sending ``X-Forwarded-For`` — otherwise the login/PIN limits are
trivially bypassed by rotating a header value.
"""

from __future__ import annotations

import pytest

from app.core import rate_limit as rl


class _Peer:
    def __init__(self, host):
        self.host = host


class _Req:
    def __init__(self, peer, headers):
        self.client = _Peer(peer)
        self.headers = headers


@pytest.fixture(autouse=True)
def _restore_trusted():
    original = rl.settings.rate_limit_trusted_proxies
    yield
    rl.settings.rate_limit_trusted_proxies = original


def test_forwarded_header_ignored_when_no_trusted_proxy_configured():
    rl.settings.rate_limit_trusted_proxies = ""
    req = _Req("203.0.113.9", {"x-forwarded-for": "1.1.1.1"})
    assert rl._client_ip(req) == "203.0.113.9"
    # And the bucket key does not move when the attacker rotates the header.
    a = rl.client_key(_Req("203.0.113.9", {"x-forwarded-for": "1.1.1.1"}))
    b = rl.client_key(_Req("203.0.113.9", {"x-forwarded-for": "2.2.2.2"}))
    assert a == b == "203.0.113.9"


def test_forwarded_header_ignored_from_an_untrusted_peer():
    rl.settings.rate_limit_trusted_proxies = "10.0.0.1"
    req = _Req("203.0.113.9", {"x-forwarded-for": "1.1.1.1"})
    assert rl._client_ip(req) == "203.0.113.9"


def test_forwarded_header_trusted_only_from_the_configured_proxy():
    rl.settings.rate_limit_trusted_proxies = "10.0.0.1, 10.0.0.2"
    req = _Req("10.0.0.1", {"x-forwarded-for": "198.51.100.7"})
    assert rl._client_ip(req) == "198.51.100.7"
    # Chain: client, our-edge — rightmost non-proxy wins.
    chain = _Req("10.0.0.1", {"x-forwarded-for": "198.51.100.7, 10.0.0.2"})
    assert rl._client_ip(chain) == "198.51.100.7"


def test_login_rate_limit_cannot_be_bypassed_with_a_rotating_forwarded_header(client, world):
    rl.settings.rate_limit_trusted_proxies = ""
    rl.limiter.reset()
    monkey = rl.settings.rate_limit_enabled
    rl.settings.rate_limit_enabled = True
    try:
        codes = []
        for i in range(40):
            r = client.post(
                "/api/v1/auth/login",
                json={"email": "nobody@slam.demo", "password": "wrong"},
                headers={"x-forwarded-for": f"9.9.9.{i}"},
            )
            codes.append(r.status_code)
        assert 429 in codes, "rotating X-Forwarded-For must not dodge the login limit"
    finally:
        rl.settings.rate_limit_enabled = monkey
        rl.limiter.reset()

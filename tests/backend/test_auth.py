"""Authentication and session handling."""

from __future__ import annotations

from conftest import PASSWORD
from sqlalchemy import select

from app.core.rate_limit import limiter
from app.core.security import decode_token
from app.db.models import AuditLog
from app.services import audit


def login(client, user, password=PASSWORD):
    return client.post("/api/v1/auth/login", json={"email": user.email, "password": password})


def test_login_returns_a_token_pair_and_the_user(client, world):
    response = login(client, world["owner"])
    assert response.status_code == 200
    body = response.json()

    assert body["user"]["role"] == "owner"
    assert body["user"]["branch_id"] is None
    assert decode_token(body["tokens"]["access_token"], "access")["role"] == "owner"
    assert body["tokens"]["token_type"] == "bearer"
    # Nothing credential-shaped comes back on the user object.
    assert "password_hash" not in body["user"]
    assert "pin_hash" not in body["user"]


def test_wrong_password_is_rejected(client, world):
    assert login(client, world["owner"], "WrongPassword1!").status_code == 401


def test_unknown_and_known_accounts_fail_identically(client, world):
    unknown = client.post(
        "/api/v1/auth/login", json={"email": "nobody@gymflow.demo", "password": PASSWORD}
    )
    known = login(client, world["owner"], "WrongPassword1!")
    assert unknown.status_code == known.status_code == 401
    assert unknown.json()["detail"] == known.json()["detail"]


def test_protected_routes_require_a_token(client, world):
    assert client.get("/api/v1/auth/me").status_code == 401
    assert client.get("/api/v1/reports/dashboard").status_code == 401
    assert client.get("/api/v1/branches").status_code == 401


def test_a_garbage_token_is_rejected(client, world):
    response = client.get("/api/v1/auth/me", headers={"Authorization": "Bearer not.a.jwt"})
    assert response.status_code == 401


def test_an_access_token_cannot_be_used_as_a_refresh_token(client, world):
    tokens = login(client, world["owner"]).json()["tokens"]
    response = client.post("/api/v1/auth/refresh", json={"refresh_token": tokens["access_token"]})
    assert response.status_code == 401


def test_refresh_rotates_and_retires_the_old_token(client, world):
    tokens = login(client, world["owner"]).json()["tokens"]

    first = client.post("/api/v1/auth/refresh", json={"refresh_token": tokens["refresh_token"]})
    assert first.status_code == 200

    replay = client.post("/api/v1/auth/refresh", json={"refresh_token": tokens["refresh_token"]})
    assert replay.status_code == 401, "a used refresh token must not work twice"


def test_logout_revokes_the_refresh_token(client, world, auth):
    tokens = login(client, world["owner"]).json()["tokens"]
    headers = {"Authorization": f"Bearer {tokens['access_token']}"}

    assert (
        client.post(
            "/api/v1/auth/logout",
            json={"refresh_token": tokens["refresh_token"]},
            headers=headers,
        ).status_code
        == 200
    )
    assert (
        client.post(
            "/api/v1/auth/refresh", json={"refresh_token": tokens["refresh_token"]}
        ).status_code
        == 401
    )


def test_repeated_failures_lock_the_account(client, world, db):
    from app.api.v1.auth import MAX_FAILED_LOGINS

    for _ in range(MAX_FAILED_LOGINS):
        login(client, world["owner"], "WrongPassword1!")
    assert login(client, world["owner"]).status_code == 423


def test_login_and_failures_are_audited(client, world, db):
    login(client, world["owner"])
    login(client, world["owner"], "WrongPassword1!")

    actions = set(db.scalars(select(AuditLog.action)).all())
    assert audit.ACTION_LOGIN in actions
    assert audit.ACTION_LOGIN_FAILED in actions


def test_audit_entries_never_hold_credentials(client, world, db):
    login(client, world["owner"], "WrongPassword1!")
    for entry in db.scalars(select(AuditLog)).all():
        blob = str(entry.details).lower()
        assert "wrongpassword1!" not in blob
        assert PASSWORD.lower() not in blob


def test_setting_a_pin_requires_the_password(client, world, auth):
    headers = auth(world["trainer_ngk_user"])

    refused = client.post(
        "/api/v1/auth/pin",
        json={"current_password": "Nope12345!", "pin": "918273"},
        headers=headers,
    )
    assert refused.status_code == 403

    accepted = client.post(
        "/api/v1/auth/pin", json={"current_password": PASSWORD, "pin": "918273"}, headers=headers
    )
    assert accepted.status_code == 200


def test_weak_pins_are_rejected(client, world, auth):
    headers = auth(world["trainer_ngk_user"])
    for bad in ("1111", "abcd", "12"):
        response = client.post(
            "/api/v1/auth/pin",
            json={"current_password": PASSWORD, "pin": bad},
            headers=headers,
        )
        assert response.status_code == 422, bad


def test_changing_the_password_signs_other_devices_out(client, world, auth):
    tokens = login(client, world["owner"]).json()["tokens"]
    headers = {"Authorization": f"Bearer {tokens['access_token']}"}

    response = client.post(
        "/api/v1/auth/password",
        json={"current_password": PASSWORD, "new_password": "BrandNewPass1!"},
        headers=headers,
    )
    assert response.status_code == 200
    assert (
        client.post(
            "/api/v1/auth/refresh", json={"refresh_token": tokens["refresh_token"]}
        ).status_code
        == 401
    )


def test_login_is_rate_limited(client, world, monkeypatch):
    from app.core import rate_limit as rl

    monkeypatch.setattr(rl.settings, "rate_limit_enabled", True)
    limiter.reset()

    codes = [login(client, world["owner"], "WrongPassword1!").status_code for _ in range(30)]
    assert 429 in codes, "brute-forcing login must eventually be throttled"


def test_a_trainer_can_sign_in_with_their_mobile_number(client, db, world):
    """SLAM knows some staff by phone, not email — both must reach the account."""
    user = world["trainer_ngk_user"]
    user.phone = "+91 90000 12345"
    db.commit()

    for typed in ("+91 90000 12345", "9000012345", "09000012345"):
        response = client.post("/api/v1/auth/login", json={"email": typed, "password": PASSWORD})
        assert response.status_code == 200, f"{typed}: {response.text}"
        assert response.json()["user"]["id"] == user.id


def test_an_unknown_mobile_number_fails_the_same_way_an_unknown_email_does(client, world):
    response = client.post("/api/v1/auth/login", json={"email": "9999900000", "password": PASSWORD})
    assert response.status_code == 401
    assert response.json()["detail"] == "Incorrect email or password"

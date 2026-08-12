"""Password hashing, PIN hashing and JWT issue/verify."""

from __future__ import annotations

import hmac
import secrets
import uuid
from datetime import timedelta
from typing import Any, Literal

from jose import JWTError, jwt
from passlib.context import CryptContext

from app.core.clock import now_utc
from app.core.config import settings

pwd_context = CryptContext(
    schemes=["bcrypt"], deprecated="auto", bcrypt__rounds=settings.bcrypt_rounds
)

TokenType = Literal["access", "refresh"]


# ------------------------------------------------------------------ secrets


def hash_password(raw: str) -> str:
    return pwd_context.hash(raw)


def verify_password(raw: str, hashed: str | None) -> bool:
    if not hashed:
        # Still burn a hash cycle so a missing credential and a wrong one take
        # roughly the same time to answer.
        pwd_context.dummy_verify() if hasattr(pwd_context, "dummy_verify") else None
        return False
    try:
        return pwd_context.verify(raw, hashed)
    except ValueError:
        return False


hash_pin = hash_password
verify_pin = verify_password


def new_token_secret(n_bytes: int | None = None) -> str:
    return secrets.token_urlsafe(n_bytes or settings.qr_token_bytes)


def constant_time_equals(a: str, b: str) -> bool:
    return hmac.compare_digest(a.encode(), b.encode())


# --------------------------------------------------------------------- jwt


def _create_token(
    subject: str,
    token_type: TokenType,
    expires: timedelta,
    claims: dict[str, Any] | None = None,
) -> tuple[str, str]:
    """Returns (encoded token, jti)."""
    issued = now_utc()
    jti = uuid.uuid4().hex
    payload: dict[str, Any] = {
        "sub": subject,
        "typ": token_type,
        "jti": jti,
        "iat": int(issued.timestamp()),
        "exp": int((issued + expires).timestamp()),
    }
    if claims:
        payload.update(claims)
    return jwt.encode(payload, settings.secret_key, algorithm=settings.jwt_algorithm), jti


def create_access_token(user_id: int, role: str, branch_id: int | None) -> str:
    token, _ = _create_token(
        str(user_id),
        "access",
        timedelta(minutes=settings.access_token_minutes),
        {"role": role, "branch_id": branch_id},
    )
    return token


def create_refresh_token(user_id: int) -> tuple[str, str]:
    return _create_token(str(user_id), "refresh", timedelta(days=settings.refresh_token_days))


def decode_token(token: str, expect: TokenType) -> dict[str, Any] | None:
    try:
        payload = jwt.decode(token, settings.secret_key, algorithms=[settings.jwt_algorithm])
    except JWTError:
        return None
    if payload.get("typ") != expect:
        return None
    return payload


__all__ = [
    "constant_time_equals",
    "create_access_token",
    "create_refresh_token",
    "decode_token",
    "hash_password",
    "hash_pin",
    "new_token_secret",
    "verify_password",
    "verify_pin",
]

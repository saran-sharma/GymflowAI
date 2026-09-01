"""Authentication: login, refresh, logout, profile, PIN and push token."""

from __future__ import annotations

from datetime import timedelta

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy import select
from sqlalchemy.orm import Session, joinedload

from app.core.clock import now_utc
from app.core.config import settings
from app.core.deps import get_current_user
from app.core.rate_limit import login_rate_limit
from app.core.security import (
    create_access_token,
    create_refresh_token,
    decode_token,
    hash_password,
    hash_pin,
    verify_password,
)
from app.db.models import RefreshToken, User
from app.db.session import get_db
from app.schemas.common import (
    ChangePasswordRequest,
    LoginRequest,
    LoginResponse,
    MessageOut,
    PushTokenRequest,
    RefreshRequest,
    SetPinRequest,
    TokenPair,
    UserOut,
)
from app.services import audit

router = APIRouter(prefix="/auth", tags=["auth"])

# After this many consecutive failures the account is briefly locked, which
# blunts an attack that rotates IPs to dodge the per-IP rate limit.
MAX_FAILED_LOGINS = 8
LOCKOUT_MINUTES = 15


def normalise_phone(value: str) -> str:
    """Reduce a typed mobile number to comparable digits.

    SLAM's records carry numbers in several shapes ("+91 90000 00000",
    "09000000000"), so both sides are reduced to the last ten digits before
    they are compared.
    """
    digits = "".join(ch for ch in value if ch.isdigit())
    return digits[-10:] if len(digits) >= 10 else digits


def find_user_by_identifier(db: Session, identifier: str) -> User | None:
    """Look a person up by email address or by mobile number."""
    options = (joinedload(User.role), joinedload(User.branch))
    if "@" in identifier:
        return db.scalar(select(User).options(*options).where(User.email == identifier.lower()))

    phone = normalise_phone(identifier)
    if len(phone) < 10:
        return None
    # Fast, unambiguous path: an account whose Login ID *is* this mobile number
    # carries it in normalised form under a unique index.
    exact = db.scalar(select(User).options(*options).where(User.login_phone == phone))
    if exact is not None:
        return exact
    # Legacy accounts predate `login_phone`. Phone numbers are stored as typed,
    # so the normalisation happens in Python over the candidates rather than as
    # a LIKE the index cannot use.
    for candidate in db.scalars(
        select(User).options(*options).where(User.phone.isnot(None), User.is_active.is_(True))
    ).all():
        if normalise_phone(candidate.phone or "") == phone:
            return candidate
    return None


def _issue_tokens(db: Session, user: User, user_agent: str | None) -> TokenPair:
    access = create_access_token(user.id, user.role.key, user.branch_id)
    refresh, jti = create_refresh_token(user.id)
    db.add(
        RefreshToken(
            user_id=user.id,
            jti=jti,
            expires_at=now_utc() + timedelta(days=settings.refresh_token_days),
            user_agent=(user_agent or "")[:255] or None,
        )
    )
    db.flush()
    return TokenPair(
        access_token=access,
        refresh_token=refresh,
        expires_in=settings.access_token_minutes * 60,
    )


@router.post("/login", response_model=LoginResponse, dependencies=[Depends(login_rate_limit)])
def login(
    request: Request,
    payload: LoginRequest,
    db: Session = Depends(get_db),
) -> LoginResponse:
    user = find_user_by_identifier(db, payload.email)

    # One message for every failure mode, so the response cannot be used to
    # enumerate which addresses have accounts.
    invalid = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED, detail="Incorrect email or password"
    )

    if user is None:
        # Still spend the time a real verification would, then log the attempt.
        verify_password(payload.password, None)
        audit.record(
            db,
            action=audit.ACTION_LOGIN_FAILED,
            request=request,
            details={"identifier": payload.email.lower(), "reason": "unknown_account"},
        )
        raise invalid

    if user.locked_until and user.locked_until > now_utc():
        audit.record(
            db,
            action=audit.ACTION_LOGIN_FAILED,
            actor=user,
            request=request,
            details={"reason": "locked"},
        )
        raise HTTPException(
            status_code=status.HTTP_423_LOCKED,
            detail="Too many failed attempts. Try again shortly.",
        )

    if not user.is_active or not verify_password(payload.password, user.password_hash):
        user.failed_login_count += 1
        if user.failed_login_count >= MAX_FAILED_LOGINS:
            user.locked_until = now_utc() + timedelta(minutes=LOCKOUT_MINUTES)
            user.failed_login_count = 0
        audit.record(
            db,
            action=audit.ACTION_LOGIN_FAILED,
            actor=user,
            request=request,
            details={"reason": "bad_credentials" if user.is_active else "inactive"},
        )
        db.commit()
        raise invalid

    user.failed_login_count = 0
    user.locked_until = None
    user.last_login_at = now_utc()
    tokens = _issue_tokens(db, user, request.headers.get("user-agent"))

    audit.record(
        db,
        action=audit.ACTION_LOGIN,
        actor=user,
        branch_id=user.branch_id,
        request=request,
        details={"device": payload.device_name},
    )
    return LoginResponse(user=UserOut.from_user(user), tokens=tokens)


@router.post("/refresh", response_model=TokenPair, dependencies=[Depends(login_rate_limit)])
def refresh_tokens(
    request: Request,
    payload: RefreshRequest,
    db: Session = Depends(get_db),
) -> TokenPair:
    claims = decode_token(payload.refresh_token, "refresh")
    invalid = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid refresh token"
    )
    if claims is None:
        raise invalid

    stored = db.scalar(select(RefreshToken).where(RefreshToken.jti == claims.get("jti", "")))
    if stored is None or stored.revoked_at is not None or stored.expires_at <= now_utc():
        raise invalid

    user = db.scalar(
        select(User)
        .options(joinedload(User.role), joinedload(User.branch))
        .where(User.id == int(claims["sub"]))
    )
    if user is None or not user.is_active:
        raise invalid

    # Rotate: the presented token is retired as the new pair is issued, so a
    # stolen refresh token is usable at most once before it stops working.
    stored.revoked_at = now_utc()
    tokens = _issue_tokens(db, user, request.headers.get("user-agent"))
    audit.record(db, action=audit.ACTION_TOKEN_REFRESH, actor=user, request=request, details={})
    return tokens


@router.post("/logout", response_model=MessageOut)
def logout(
    request: Request,
    payload: RefreshRequest,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> MessageOut:
    claims = decode_token(payload.refresh_token, "refresh")
    if claims:
        stored = db.scalar(select(RefreshToken).where(RefreshToken.jti == claims.get("jti", "")))
        if stored is not None and stored.user_id == user.id:
            stored.revoked_at = now_utc()
    audit.record(db, action=audit.ACTION_LOGOUT, actor=user, request=request, details={})
    return MessageOut(message="Signed out")


@router.get("/me", response_model=UserOut)
def me(user: User = Depends(get_current_user)) -> UserOut:
    return UserOut.from_user(user)


@router.post("/pin", response_model=MessageOut)
def set_pin(
    request: Request,
    payload: SetPinRequest,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> MessageOut:
    if not verify_password(payload.current_password, user.password_hash):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Password is incorrect")
    user.pin_hash = hash_pin(payload.pin)
    audit.record(
        db,
        action=audit.ACTION_ADMIN_ACTION,
        actor=user,
        entity_type="user",
        entity_id=user.id,
        request=request,
        details={"change": "pin_set"},
    )
    return MessageOut(message="Check-in PIN updated")


@router.post("/password", response_model=MessageOut)
def change_password(
    request: Request,
    payload: ChangePasswordRequest,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> MessageOut:
    if not verify_password(payload.current_password, user.password_hash):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Password is incorrect")
    user.password_hash = hash_password(payload.new_password)
    # Existing sessions are cut off; a password change is usually a response to
    # a suspected compromise.
    for token in db.scalars(
        select(RefreshToken).where(
            RefreshToken.user_id == user.id, RefreshToken.revoked_at.is_(None)
        )
    ).all():
        token.revoked_at = now_utc()
    audit.record(
        db,
        action=audit.ACTION_ADMIN_ACTION,
        actor=user,
        entity_type="user",
        entity_id=user.id,
        request=request,
        details={"change": "password"},
    )
    return MessageOut(message="Password updated. Sign in again on your other devices.")


@router.post("/push-token", response_model=MessageOut)
def register_push_token(
    payload: PushTokenRequest,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> MessageOut:
    user.push_token = payload.push_token
    return MessageOut(message="Push token registered")


__all__ = ["router"]

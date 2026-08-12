"""User administration and configurable settings."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy import select
from sqlalchemy.orm import Session, joinedload

from app.core.deps import (
    assert_branch_access,
    get_current_user,
    require_admin,
    require_management,
    scoped_branch_filter,
)
from app.core.security import hash_password
from app.db.models import Notification, Role, RoleKey, Setting, User
from app.db.session import get_db
from app.schemas.common import (
    MessageOut,
    NotificationOut,
    SettingOut,
    SettingUpdate,
    UserOut,
)
from app.services import audit, settings_service

router = APIRouter(prefix="/users", tags=["users"])


class UserCreate(BaseModel):
    email: EmailStr
    full_name: str = Field(min_length=2, max_length=120)
    password: str = Field(min_length=10, max_length=128)
    role: RoleKey
    branch_id: int | None = None
    phone: str | None = Field(default=None, max_length=24)


class UserUpdate(BaseModel):
    full_name: str | None = Field(default=None, max_length=120)
    phone: str | None = Field(default=None, max_length=24)
    is_active: bool | None = None
    branch_id: int | None = None


@router.get("", response_model=list[UserOut])
def list_users(
    branch_id: int | None = Query(default=None),
    role: RoleKey | None = Query(default=None),
    db: Session = Depends(get_db),
    user: User = Depends(require_management),
) -> list[UserOut]:
    stmt = (
        select(User)
        .options(joinedload(User.role), joinedload(User.branch))
        .order_by(User.full_name)
    )
    allowed = scoped_branch_filter(user, branch_id)
    if allowed is not None:
        stmt = stmt.where(User.branch_id.in_(allowed))
    if role is not None:
        stmt = stmt.join(Role).where(Role.key == role.value)
    return [UserOut.from_user(u) for u in db.scalars(stmt).all()]


@router.post("", response_model=UserOut, status_code=201)
def create_user(
    payload: UserCreate,
    request: Request,
    db: Session = Depends(get_db),
    actor: User = Depends(require_admin),
) -> UserOut:
    if db.scalar(select(User).where(User.email == payload.email.lower())):
        raise HTTPException(status_code=409, detail="That email is already registered")

    role = db.scalar(select(Role).where(Role.key == payload.role.value))
    if role is None:
        raise HTTPException(status_code=400, detail="Unknown role")

    # Everyone except the chain-wide roles must be pinned to a branch, or
    # branch isolation has nothing to isolate on.
    if payload.role in (RoleKey.BRANCH_MANAGER, RoleKey.TRAINER, RoleKey.MEMBER):
        if payload.branch_id is None:
            raise HTTPException(status_code=400, detail="This role requires a branch")
        assert_branch_access(actor, payload.branch_id)

    new_user = User(
        email=payload.email.lower(),
        full_name=payload.full_name,
        phone=payload.phone,
        password_hash=hash_password(payload.password),
        role_id=role.id,
        branch_id=payload.branch_id,
    )
    db.add(new_user)
    db.flush()
    db.refresh(new_user)

    audit.record(
        db,
        action=audit.ACTION_ADMIN_ACTION,
        actor=actor,
        entity_type="user",
        entity_id=new_user.id,
        branch_id=new_user.branch_id,
        request=request,
        details={"created_role": payload.role.value, "email": new_user.email},
    )
    return UserOut.from_user(new_user)


@router.patch("/{user_id}", response_model=UserOut)
def update_user(
    user_id: int,
    payload: UserUpdate,
    request: Request,
    db: Session = Depends(get_db),
    actor: User = Depends(require_admin),
) -> UserOut:
    target = db.scalar(
        select(User)
        .options(joinedload(User.role), joinedload(User.branch))
        .where(User.id == user_id)
    )
    if target is None:
        raise HTTPException(status_code=404, detail="User not found")
    assert_branch_access(actor, target.branch_id)

    changes = payload.model_dump(exclude_unset=True)
    if "branch_id" in changes and changes["branch_id"] is not None:
        assert_branch_access(actor, changes["branch_id"])
    for key, value in changes.items():
        setattr(target, key, value)
    db.flush()
    db.refresh(target)

    audit.record(
        db,
        action=audit.ACTION_ADMIN_ACTION,
        actor=actor,
        entity_type="user",
        entity_id=target.id,
        branch_id=target.branch_id,
        request=request,
        details={"changes": {k: str(v) for k, v in changes.items()}},
    )
    return UserOut.from_user(target)


# ------------------------------------------------------------- notifications


@router.get("/me/notifications", response_model=list[NotificationOut])
def my_notifications(
    limit: int = Query(default=50, ge=1, le=200),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> list[Notification]:
    stmt = (
        select(Notification)
        .where((Notification.user_id == user.id) | (Notification.user_id.is_(None)))
        .order_by(Notification.created_at.desc())
        .limit(limit)
    )
    allowed = scoped_branch_filter(user, None)
    if allowed is not None:
        stmt = stmt.where(
            (Notification.branch_id.in_(allowed)) | (Notification.branch_id.is_(None))
        )
    return list(db.scalars(stmt).all())


# ----------------------------------------------------------------- settings


@router.get("/settings/all", response_model=list[SettingOut])
def list_settings(
    branch_id: int | None = Query(default=None),
    db: Session = Depends(get_db),
    user: User = Depends(require_management),
) -> list[SettingOut]:
    """Effective business rules, with code defaults filled in where unset."""
    stmt = select(Setting).order_by(Setting.key)
    allowed = scoped_branch_filter(user, branch_id)
    if allowed is not None:
        stmt = stmt.where((Setting.branch_id.in_(allowed)) | (Setting.branch_id.is_(None)))
    rows = list(db.scalars(stmt).all())

    seen = {(r.branch_id, r.key) for r in rows}
    out = [
        SettingOut(
            key=r.key,
            value=r.value.get("value") if isinstance(r.value, dict) else r.value,
            branch_id=r.branch_id,
            description=r.description,
        )
        for r in rows
    ]
    for key, default in settings_service.DEFAULTS.items():
        if (None, key) not in seen:
            out.append(SettingOut(key=key, value=default, branch_id=None, description="default"))
    return sorted(out, key=lambda s: (s.key, s.branch_id or 0))


@router.put("/settings/{key}", response_model=SettingOut)
def update_setting(
    key: str,
    payload: SettingUpdate,
    request: Request,
    db: Session = Depends(get_db),
    user: User = Depends(require_admin),
) -> SettingOut:
    if key not in settings_service.DEFAULTS:
        raise HTTPException(status_code=400, detail=f"Unknown setting '{key}'")
    if payload.branch_id is not None:
        assert_branch_access(user, payload.branch_id)

    before = settings_service.get_setting(db, key, payload.branch_id)
    row = settings_service.set_setting(
        db, key, payload.value, branch_id=payload.branch_id, updated_by_user_id=user.id
    )
    audit.record(
        db,
        action=audit.ACTION_SETTING_CHANGE,
        actor=user,
        entity_type="setting",
        entity_id=key,
        branch_id=payload.branch_id,
        request=request,
        details={"before": before, "after": payload.value},
    )
    return SettingOut(
        key=row.key,
        value=payload.value,
        branch_id=row.branch_id,
        description=row.description,
    )


@router.get("/me/profile", response_model=UserOut)
def my_profile(user: User = Depends(get_current_user)) -> UserOut:
    return UserOut.from_user(user)


__all__ = ["router", "MessageOut"]

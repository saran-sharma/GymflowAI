"""Authentication and authorization dependencies.

Permissions are enforced here, on the server, for every request. The mobile app
also hides what a role cannot use, but that is presentation only — nothing in
the client is trusted to gate access.
"""

from __future__ import annotations

from collections.abc import Callable, Iterable

from fastapi import Depends, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import select
from sqlalchemy.orm import Session, joinedload

from app.core.clock import now_utc
from app.core.security import decode_token
from app.db.models import Branch, RoleKey, User
from app.db.session import get_db

bearer_scheme = HTTPBearer(auto_error=False)

#: Roles that see every branch.
ALL_BRANCH_ROLES = {RoleKey.SUPER_ADMIN.value, RoleKey.OWNER.value}
#: Roles that may administer configuration.
ADMIN_ROLES = {RoleKey.SUPER_ADMIN.value, RoleKey.OWNER.value}
#: Roles that manage a branch's trainers and attendance.
MANAGEMENT_ROLES = ADMIN_ROLES | {RoleKey.BRANCH_MANAGER.value}


def _unauthorized(detail: str = "Not authenticated") -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail=detail,
        headers={"WWW-Authenticate": "Bearer"},
    )


def _forbidden(detail: str = "Not permitted") -> HTTPException:
    return HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=detail)


def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
    db: Session = Depends(get_db),
) -> User:
    if credentials is None or not credentials.credentials:
        raise _unauthorized()

    payload = decode_token(credentials.credentials, "access")
    if payload is None:
        raise _unauthorized("Invalid or expired token")

    try:
        user_id = int(payload["sub"])
    except (KeyError, TypeError, ValueError):
        raise _unauthorized("Invalid token subject") from None

    user = db.scalar(
        select(User)
        .options(joinedload(User.role), joinedload(User.branch))
        .where(User.id == user_id)
    )
    if user is None or not user.is_active:
        raise _unauthorized("Account is not active")
    if user.locked_until and user.locked_until > now_utc():
        raise _forbidden("Account is temporarily locked")

    # The role in the token is a hint for the client; the database row is the
    # authority, so a role change takes effect without waiting for expiry.
    return user


def require_roles(*roles: str | RoleKey) -> Callable[..., User]:
    allowed = {r.value if isinstance(r, RoleKey) else r for r in roles}

    def dependency(user: User = Depends(get_current_user)) -> User:
        if user.role.key not in allowed:
            raise _forbidden(f"Requires one of: {', '.join(sorted(allowed))}")
        return user

    return dependency


require_admin = require_roles(*ADMIN_ROLES)
require_management = require_roles(*MANAGEMENT_ROLES)
require_trainer = require_roles(RoleKey.TRAINER)
require_member = require_roles(RoleKey.MEMBER)


# ------------------------------------------------------------ branch scope


def sees_all_branches(user: User) -> bool:
    return user.role.key in ALL_BRANCH_ROLES


def visible_branch_ids(db: Session, user: User) -> list[int] | None:
    """Branch ids this user may read. ``None`` means "every branch"."""
    if sees_all_branches(user):
        return None
    if user.branch_id is None:
        return []
    return [user.branch_id]


def assert_branch_access(user: User, branch_id: int | None) -> None:
    """The single predicate behind branch isolation."""
    if branch_id is None:
        return
    if sees_all_branches(user):
        return
    if user.branch_id != branch_id:
        raise _forbidden("This branch is outside your access")


def resolve_branch(db: Session, user: User, branch_id: int) -> Branch:
    assert_branch_access(user, branch_id)
    branch = db.get(Branch, branch_id)
    if branch is None or not branch.is_active:
        raise HTTPException(status_code=404, detail="Branch not found")
    return branch


def scoped_branch_filter(user: User, branch_id: int | None) -> list[int] | None:
    """Turn an optional ?branch_id= into the id list a query should restrict to."""
    if branch_id is not None:
        assert_branch_access(user, branch_id)
        return [branch_id]
    if sees_all_branches(user):
        return None
    return [user.branch_id] if user.branch_id else []


def get_request(request: Request) -> Request:
    return request


def roles_in(user: User, roles: Iterable[str]) -> bool:
    return user.role.key in set(roles)


__all__ = [
    "ADMIN_ROLES",
    "ALL_BRANCH_ROLES",
    "MANAGEMENT_ROLES",
    "assert_branch_access",
    "get_current_user",
    "get_request",
    "require_admin",
    "require_management",
    "require_member",
    "require_roles",
    "require_trainer",
    "resolve_branch",
    "roles_in",
    "scoped_branch_filter",
    "sees_all_branches",
    "visible_branch_ids",
]

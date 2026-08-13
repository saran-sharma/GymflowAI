"""Configurable business rules.

Nothing SLAM might want to retune is compiled into the app: grace periods,
journey length, PT package sizes, class capacity, alert thresholds and the
marketing source list all resolve through here, branch row → global row →
code default.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.clock import now_utc
from app.core.deps import (
    assert_branch_access,
    get_current_user,
    require_admin,
    require_management,
    scoped_branch_filter,
)
from app.db.models import Setting, User
from app.db.session import get_db
from app.schemas.common import SettingOut, SettingUpdate
from app.schemas.operations import AutomationRunOut
from app.services import audit, automation_service, settings_service

router = APIRouter(prefix="/settings", tags=["settings"])

#: Keys the app is allowed to write. An unknown key is rejected rather than
#: silently stored, so a typo cannot create a setting nothing ever reads.
EDITABLE_KEYS = set(settings_service.DEFAULTS)


@router.get("", response_model=list[SettingOut])
def list_settings(
    branch_id: int | None = Query(default=None),
    db: Session = Depends(get_db),
    user: User = Depends(require_management),
) -> list[SettingOut]:
    """Every rule with its effective value for this scope."""
    if branch_id is not None:
        assert_branch_access(user, branch_id)

    rows = {
        (row.branch_id, row.key): row
        for row in db.scalars(
            select(Setting).where(
                Setting.branch_id.is_(None)
                if branch_id is None
                else (Setting.branch_id == branch_id) | Setting.branch_id.is_(None)
            )
        ).all()
    }

    out: list[SettingOut] = []
    for key in sorted(EDITABLE_KEYS):
        row = rows.get((branch_id, key)) or rows.get((None, key))
        out.append(
            SettingOut(
                key=key,
                value=settings_service.get_setting(db, key, branch_id),
                branch_id=row.branch_id if row else None,
                description=row.description if row else None,
            )
        )
    return out


@router.put("/{key}", response_model=SettingOut)
def update_setting(
    key: str,
    payload: SettingUpdate,
    request: Request,
    db: Session = Depends(get_db),
    user: User = Depends(require_admin),
) -> SettingOut:
    if key not in EDITABLE_KEYS:
        raise HTTPException(status_code=404, detail="Unknown setting")
    if payload.branch_id is not None:
        assert_branch_access(user, payload.branch_id)

    before = settings_service.get_setting(db, key, payload.branch_id)
    row = settings_service.set_setting(
        db,
        key,
        payload.value,
        branch_id=payload.branch_id,
        updated_by_user_id=user.id,
    )
    audit.record(
        db,
        action=audit.ACTION_SETTING_CHANGE,
        actor=user,
        entity_type="setting",
        entity_id=row.id,
        branch_id=payload.branch_id,
        request=request,
        details={"key": key, "before": before, "after": payload.value},
    )
    return SettingOut(
        key=key,
        value=settings_service.get_setting(db, key, payload.branch_id),
        branch_id=payload.branch_id,
        description=row.description,
    )


@router.get("/defaults")
def defaults(user: User = Depends(get_current_user)) -> dict:
    """The code-level fallbacks, so an operator can see what "unset" means."""
    return settings_service.DEFAULTS


@router.post("/automations/run", response_model=AutomationRunOut)
def run_automations(
    request: Request,
    branch_id: int | None = Query(default=None),
    db: Session = Depends(get_db),
    user: User = Depends(require_management),
) -> AutomationRunOut:
    """Run the server-side business automations now.

    They also run on their own and on the reads that depend on them; this is
    the manual handle for an operator who does not want to wait.
    """
    allowed = scoped_branch_filter(user, branch_id)
    results = automation_service.run_all(db, allowed)
    audit.record(
        db,
        action="admin.automations_run",
        actor=user,
        branch_id=branch_id,
        request=request,
        details={"branches": len(results)},
    )
    return AutomationRunOut(ran_at=now_utc(), branches=results)


__all__ = ["EDITABLE_KEYS", "router"]

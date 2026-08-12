"""Health and integration status."""

from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.core.clock import now_utc
from app.core.config import settings
from app.core.deps import require_management
from app.db.models import User
from app.db.session import get_db
from app.integrations.registry import status as integration_status

router = APIRouter(tags=["system"])


@router.get("/health")
def health(db: Session = Depends(get_db)) -> dict:
    """Unauthenticated liveness probe. Reports no version or config detail."""
    try:
        db.execute(text("SELECT 1"))
        database = "up"
    except Exception:
        database = "down"
    return {
        "status": "ok" if database == "up" else "degraded",
        "database": database,
        "server_time": now_utc().isoformat(),
    }


@router.get("/integrations")
def integrations(user: User = Depends(require_management)) -> dict:
    """What is wired up and what is still contract-only.

    Every flag here is off in V1 — the product is required to work that way.
    """
    return {
        "core_works_without_integrations": True,
        "flags": {
            "yoactiv": settings.yoactiv_enabled,
            "inbody": settings.inbody_enabled,
            "access_control": settings.access_control_enabled,
            "whatsapp": settings.whatsapp_enabled,
            "intelligence": settings.intelligence_enabled,
            "push": settings.push_enabled,
        },
        "providers": integration_status(),
    }


__all__ = ["router"]

"""v1 API assembly."""

from __future__ import annotations

from fastapi import APIRouter

from app.api.v1 import (
    attendance,
    auth,
    branches,
    incentives,
    members,
    reports,
    system,
    trainers,
    users,
)

api_router = APIRouter()
api_router.include_router(system.router)
api_router.include_router(auth.router)
api_router.include_router(users.router)
api_router.include_router(branches.router)
api_router.include_router(trainers.router)
api_router.include_router(attendance.router)
api_router.include_router(incentives.router)
api_router.include_router(members.router)
api_router.include_router(reports.router)

__all__ = ["api_router"]

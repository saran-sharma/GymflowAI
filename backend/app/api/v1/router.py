"""v1 API assembly."""

from __future__ import annotations

from fastapi import APIRouter

from app.api.v1 import (
    alerts,
    attendance,
    auth,
    branches,
    classes,
    hardware,
    inbody,
    incentives,
    journeys,
    marketing,
    members,
    payments,
    performance,
    pt,
    reports,
    sessions,
    settings,
    system,
    trainers,
    users,
    workout_templates,
    yoactiv,
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
# V1.5 — the SLAM programme, PT, classes, marketing and the alert centre.
api_router.include_router(journeys.router)
api_router.include_router(pt.router)
api_router.include_router(classes.router)
api_router.include_router(sessions.router)
api_router.include_router(payments.router)
api_router.include_router(marketing.router)
api_router.include_router(performance.router)
api_router.include_router(alerts.router)
api_router.include_router(settings.router)
api_router.include_router(hardware.router)
api_router.include_router(inbody.router)
api_router.include_router(workout_templates.router)
api_router.include_router(yoactiv.router)

__all__ = ["api_router"]

"""GymFlow AI API entry point."""

from __future__ import annotations

import logging

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from starlette.middleware.trustedhost import TrustedHostMiddleware

from app.api.v1.router import api_router
from app.core.config import settings

logging.basicConfig(
    level=logging.INFO if not settings.debug else logging.DEBUG,
    format="%(asctime)s %(levelname)s %(name)s %(message)s",
)
logger = logging.getLogger("gymflow")

DESCRIPTION = """
GymFlow AI — trainer accountability for SLAM Fitness Studio.

The mobile app talks only to this API; it never reaches PostgreSQL directly.
All attendance times are recorded from the server clock.
"""


def create_app() -> FastAPI:
    app = FastAPI(
        title=settings.app_name,
        description=DESCRIPTION,
        version="1.0.0",
        docs_url="/docs" if not settings.is_production else None,
        redoc_url=None,
        openapi_url="/openapi.json" if not settings.is_production else None,
    )

    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origin_list,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    if settings.is_production:
        # Blocks Host-header games behind the load balancer.
        app.add_middleware(TrustedHostMiddleware, allowed_hosts=settings.cors_origin_list or ["*"])

    @app.middleware("http")
    async def security_headers(request: Request, call_next):
        response = await call_next(request)
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["Referrer-Policy"] = "no-referrer"
        if settings.is_production:
            response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
        return response

    @app.exception_handler(RequestValidationError)
    async def validation_error(request: Request, exc: RequestValidationError):
        # Echoing the raw body back would risk logging or returning a password.
        return JSONResponse(
            status_code=422,
            content={
                "detail": {
                    "code": "invalid_request",
                    "message": "Some fields are invalid.",
                    "fields": [
                        {"field": ".".join(str(p) for p in e["loc"][1:]), "error": e["msg"]}
                        for e in exc.errors()
                    ],
                }
            },
        )

    @app.exception_handler(Exception)
    async def unhandled(request: Request, exc: Exception):
        logger.exception("Unhandled error on %s %s", request.method, request.url.path)
        return JSONResponse(
            status_code=500,
            content={"detail": {"code": "server_error", "message": "Something went wrong."}},
        )

    app.include_router(api_router, prefix=settings.api_v1_prefix)

    @app.get("/", include_in_schema=False)
    def root() -> dict:
        return {"name": settings.app_name, "docs": "/docs", "api": settings.api_v1_prefix}

    return app


app = create_app()

__all__ = ["app", "create_app"]

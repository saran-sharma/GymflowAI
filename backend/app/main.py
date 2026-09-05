"""GymFlow AI API entry point."""

from __future__ import annotations

import logging
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from starlette.middleware.trustedhost import TrustedHostMiddleware

from app.api.v1.hardware import dev_ip_mode_router
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


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    """Say once, at boot, whether this database has been migrated.

    A database one migration behind serves most of the app perfectly well and
    then throws opaque 500s from exactly the endpoints that touch the newer
    tables — which reads as "those features are broken" rather than "this
    database needs migrating". One log line turns that into an obvious action.

    Best-effort by design: a diagnostic must never be why the API fails to
    start, so a database that is unreachable here is left to `/health`.
    """
    # Say which database this process actually opened. A silent disagreement
    # between the API and the CLI about that is invisible until an import
    # "does nothing" — see app/core/config.py. Credentials are never logged.
    try:
        from sqlalchemy.engine import make_url

        url = make_url(settings.database_url)
        logger.info("Database target: %s/%s", url.host or "local", url.database)
    except Exception:  # pragma: no cover - a diagnostic must not block startup
        logger.debug("Could not report the database target", exc_info=True)

    try:
        from app.db.schema_state import check
        from app.db.session import engine

        state = check(engine)
        if state.is_current:
            logger.info("Database schema: %s", state.detail)
        else:
            logger.warning("Database schema out of date — %s", state.detail)
    except Exception:  # pragma: no cover - never block startup on a report
        logger.debug("Could not determine the database schema state", exc_info=True)

    try:
        from app.core.rate_limit import using_in_process_store

        if settings.is_production and settings.rate_limit_enabled and using_in_process_store():
            logger.warning(
                "Rate limiting is using the in-process store. Correct for a single "
                "API instance; a multi-instance deployment needs a shared store or "
                "the effective limits are multiplied by the instance count "
                "(see docs/DEPLOYMENT.md)."
            )
    except Exception:  # pragma: no cover
        logger.debug("Could not report the rate-limit store state", exc_info=True)
    yield


def create_app() -> FastAPI:
    app = FastAPI(
        lifespan=lifespan,
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
    # No prefix, deliberately: the X2008's IP-address ADMS mode requests a
    # bare `/iclock/cdata` with no path of its own to customize. Always
    # mounted, same as every other route here — gated at request time by
    # `FINGERPRINT_ADMS_DEV_IP_MODE` inside the handler, not by conditional
    # registration, matching the pattern the rest of this file already uses.
    app.include_router(dev_ip_mode_router, include_in_schema=False)

    @app.get("/", include_in_schema=False)
    def root() -> dict:
        return {"name": settings.app_name, "docs": "/docs", "api": settings.api_v1_prefix}

    return app


app = create_app()

__all__ = ["app", "create_app"]

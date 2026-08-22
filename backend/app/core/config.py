"""Runtime configuration.

Everything that differs between a laptop, staging and SLAM's production box
lives here and is read from the environment. Nothing in this file may carry a
real secret — the defaults are development-only and the app refuses to boot in
production if they have not been replaced.
"""

from __future__ import annotations

from functools import lru_cache
from typing import Literal

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

DEV_SECRET = "dev-only-insecure-secret-change-me"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=(".env", "../.env"),
        env_file_encoding="utf-8",
        extra="ignore",
    )

    # ---------------------------------------------------------------- app
    app_name: str = "GymFlow AI API"
    api_v1_prefix: str = "/api/v1"
    environment: Literal["development", "test", "staging", "production"] = "development"
    debug: bool = True

    # --------------------------------------------------------------- data
    database_url: str = "postgresql+psycopg://gymflow:gymflow@localhost:5432/gymflow"

    # ------------------------------------------------------------ security
    secret_key: str = DEV_SECRET
    jwt_algorithm: str = "HS256"
    access_token_minutes: int = 30
    refresh_token_days: int = 30
    # 12 rounds is the production cost; the test environment lowers it so the
    # suite is not dominated by deliberate slowness.
    bcrypt_rounds: int = 12
    # Trainer check-in PINs are short by design (they are typed on a gym floor),
    # so they are always paired with a branch-bound QR token or a rate limit.
    pin_min_length: int = 4
    pin_max_length: int = 8

    # QR tokens rotate on this cadence. A scanned token is accepted for the
    # current window and the previous one, so a scan straddling a rollover
    # still works without widening the window itself.
    qr_window_seconds: int = 60
    qr_token_bytes: int = 12

    # ---------------------------------------------------------- rate limits
    rate_limit_enabled: bool = True
    rate_limit_login: str = "10/minute"
    rate_limit_checkin: str = "20/minute"
    rate_limit_default: str = "240/minute"
    # The ADMS push endpoint has no user session to key a per-trainer bucket
    # off, so it gets its own, deliberately generous, scope.
    rate_limit_hardware_push: str = "60/minute"

    # ------------------------------------------------------------- clients
    cors_origins: str = "*"

    # -------------------------------------------------------- integrations
    # V1 ships with every external integration disabled. The core product must
    # work with all of these off; turning one on only swaps a mock provider for
    # a real one behind the same interface.
    yoactiv_enabled: bool = False
    # Placeholder config slots only — nothing reads these yet. Yoactiv's real
    # base URL and auth scheme are not documented to us (see the "Yoactiv —
    # ACTION REQUIRED" section of docs/INTEGRATIONS.md). Do not invent a
    # value; leave both empty until that documentation exists.
    yoactiv_base_url: str = ""
    yoactiv_api_key: str = ""
    inbody_enabled: bool = False
    access_control_enabled: bool = False
    whatsapp_enabled: bool = False
    intelligence_enabled: bool = False
    push_enabled: bool = False

    # ------------------------------------------- fingerprint / X2008 (ADMS)
    # SLAM's confirmed real device (X2008, serial CUB7250201499) authenticates
    # itself to GymFlow's older-style "pull" protocols with a numeric
    # Communication Key set on the terminal. It is a secret, never hardcoded,
    # never logged, and never written into the DB-readable `Setting` table —
    # see docs/INTEGRATIONS.md. The device is currently configured with the
    # factory default (0 / unset); this field holds whatever SLAM's IT sets it
    # to and is never written here without one.
    fingerprint_comm_key: str | None = None
    # A secret GymFlow itself controls and requires in the ADMS push URL
    # before it will accept a batch. This is a different secret from the
    # comm key above: it authenticates the *push* HTTP request to us, not
    # GymFlow to the device. See docs/INTEGRATIONS.md for exactly how it is
    # meant to be embedded in the device's configured "ADMS Server" URL.
    fingerprint_adms_shared_secret: str | None = None

    # ---------------------------------------------------------------- demo
    seed_demo_data: bool = True

    @field_validator("environment")
    @classmethod
    def _normalise_environment(cls, value: str) -> str:
        return value.lower()

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]

    @property
    def is_production(self) -> bool:
        return self.environment in ("production", "staging")

    def assert_production_safe(self) -> None:
        """Fail fast rather than serve production traffic with dev secrets."""
        if not self.is_production:
            return
        problems: list[str] = []
        if self.secret_key == DEV_SECRET or len(self.secret_key) < 32:
            problems.append("SECRET_KEY must be set to a random value of >= 32 chars")
        if "gymflow:gymflow@localhost" in self.database_url:
            problems.append("DATABASE_URL still points at the development database")
        if self.debug:
            problems.append("DEBUG must be false")
        if self.cors_origins.strip() == "*":
            problems.append("CORS_ORIGINS must list explicit origins")
        if self.seed_demo_data:
            problems.append("SEED_DEMO_DATA must be false")
        if self.access_control_enabled and not self.fingerprint_adms_shared_secret:
            problems.append(
                "FINGERPRINT_ADMS_SHARED_SECRET must be set when ACCESS_CONTROL_ENABLED is true"
            )
        if problems:
            raise RuntimeError(
                "Refusing to start in " f"{self.environment}: " + "; ".join(problems)
            )


@lru_cache
def get_settings() -> Settings:
    settings = Settings()
    settings.assert_production_safe()
    return settings


settings = get_settings()

__all__ = ["Settings", "get_settings", "settings", "Field"]

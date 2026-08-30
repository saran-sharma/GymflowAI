"""Runtime configuration.

Everything that differs between a laptop, staging and SLAM's production box
lives here and is read from the environment. Nothing in this file may carry a
real secret — the defaults are development-only and the app refuses to boot in
production if they have not been replaced.
"""

from __future__ import annotations

from functools import lru_cache
from pathlib import Path
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
    # The Yoactiv Data API base — the ASMX root, e.g.
    # "https://backstage.yoactiv.com/api/backdata.asmx". Auth is the per-tenant
    # `API_Key` header carried in `yoactiv_api_key`. Both are read only by the
    # server-side connector (app/integrations/yoactiv/); neither is ever sent
    # to the mobile app. Confirmed endpoints under this root: enquires,
    # followups, checkins, invoices, ptTrialConversion (see the Postman
    # collection SLAM supplied and docs/INTEGRATIONS.md). Leave empty until a
    # real, authorised key and an HTTPS base URL are in hand.
    yoactiv_base_url: str = ""
    yoactiv_api_key: str = ""
    # The live Data API host (backstage.yoactiv.com / yoactiv.co.in) sits
    # behind IIS HTTP Basic auth *in front of* the app-level `API_Key` check —
    # confirmed by probe on 2026-08-30 (see docs/INTEGRATIONS.md). These carry
    # that Basic credential pair when SLAM's Yoactiv admin supplies it; empty
    # means "send no Basic header" (correct for a host without the gate).
    # Server-only, same handling as the API key.
    yoactiv_basic_auth_user: str = ""
    yoactiv_basic_auth_password: str = ""
    # Yoactiv's sampled Data API responses carry no branch code, so the
    # tenant -> GymFlow branch mapping is explicit: one SLAM tenant / one API
    # key resolves to this branch id. Required when yoactiv_enabled is true.
    yoactiv_default_branch_id: int | None = None
    # Incremental pull window, and how far each run overlaps the last
    # successful window — the Data API has no `updatedSince` filter, so the
    # overlap is what re-pulls back-dated edits and absorbs timezone skew.
    yoactiv_sync_window_days: int = 7
    yoactiv_sync_overlap_days: int = 3
    # Trailing span the weekly reconciliation re-pulls (idempotent; never
    # moves a cursor backwards).
    yoactiv_reconcile_days: int = 90
    # Client-side request ceiling until Yoactiv confirms real limits, and the
    # per-request timeout.
    yoactiv_rate_limit_per_min: int = 60
    yoactiv_request_timeout_seconds: int = 30
    inbody_enabled: bool = False
    # A separate flag from `inbody_enabled` above (which gates the live
    # `InBodyProvider` interface stub — still unimplemented, no InBody cloud
    # API exists to call). This one gates the automatic-ingestion HTTP
    # endpoint that a local agent on the gym PC pushes LookinBody120's
    # auto-exported CSV files to. Off by default; requires its own shared
    # secret, same shape as the X2008 push receiver's, and for the same
    # reason — the caller has no GymFlow account and can't carry a bearer
    # token.
    inbody_ingest_enabled: bool = False
    inbody_ingest_shared_secret: str | None = None
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
    # Opt-in only, and refused in production/staging by
    # `assert_production_safe` below. When true, the ADMS push receiver
    # additionally logs (at DEBUG level, logger
    # `gymflow.hardware.fingerprint.debug`) the inbound method, path (secret
    # redacted), an allow-listed header subset, content-type, the raw ATTLOG
    # body, the parsed record fields, and the resolved device identity — built
    # for the one real-device capture session against the physical X2008, see
    # docs/INTEGRATIONS.md. Never logs the shared secret, an Authorization/
    # Cookie header, or a fingerprint template.
    fingerprint_adms_debug_capture: bool = False
    # Fallback-only, for the one real-device test where the X2008's own
    # firmware will not carry a path (and therefore the shared secret above)
    # in IP-address ADMS mode. Off by default, and refused at boot in
    # production/staging by `assert_production_safe` below — this is not a
    # weaker version of the real authentication, it is a *different*,
    # explicitly narrower one: a bare `/iclock/cdata` route (no secret path
    # segment reachable in IP mode) that only accepts a request whose source
    # IP matches `fingerprint_adms_dev_ip_mode_allowed_ip` exactly AND whose
    # `SN` matches `fingerprint_adms_dev_ip_mode_allowed_serial` exactly AND
    # is a registered, active `FingerprintDevice` — all three, not any one.
    # Leaving either allowed_* value unset means the IP/serial comparison can
    # never match a real request, so a half-configured flag fails closed
    # rather than open.
    fingerprint_adms_dev_ip_mode: bool = False
    fingerprint_adms_dev_ip_mode_allowed_ip: str | None = None
    fingerprint_adms_dev_ip_mode_allowed_serial: str | None = None

    # ------------------------------------------ feedback & progress media
    # The version string a member acknowledges when submitting a trainer
    # review — recorded on the row so "which terms did they agree to" is
    # answerable later. Bump when the review/testimonial policy text changes.
    feedback_policy_version: str = "2026-08-30"
    # Shown in-app wherever user-generated content (a testimonial) can be
    # reported, so there is always a way to reach a human.
    support_contact: str = "support@slam.fitness"

    # Where private progress-photo bytes are written. Never a directory that
    # is statically served, never inside the repo. Relative paths resolve
    # against the process CWD in development; production must set an absolute
    # path on a private, ideally encrypted volume (checked in
    # `assert_production_safe`). The DB stores only an opaque key into this
    # store — see `app.services.photo_storage`.
    progress_photo_dir: str = "var/progress_photos"
    progress_photo_max_bytes: int = 10 * 1024 * 1024
    progress_photo_allowed_types: str = "image/jpeg,image/png,image/webp,image/heic"
    # How long a signed image URL stays valid. Short: the app fetches a fresh
    # one from the list/detail response each time it renders the gallery.
    progress_photo_url_ttl_seconds: int = 600

    @property
    def progress_photo_allowed_type_list(self) -> list[str]:
        return [t.strip() for t in self.progress_photo_allowed_types.split(",") if t.strip()]

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
        if self.fingerprint_adms_debug_capture:
            problems.append(
                "FINGERPRINT_ADMS_DEBUG_CAPTURE must be false in production/staging — it is a "
                "development-only capture aid for the real-device test"
            )
        if self.fingerprint_adms_dev_ip_mode:
            problems.append(
                "FINGERPRINT_ADMS_DEV_IP_MODE must be false in production/staging — it is a "
                "development-only fallback receiver for the real-device test"
            )
        if self.inbody_ingest_enabled and not self.inbody_ingest_shared_secret:
            problems.append(
                "INBODY_INGEST_SHARED_SECRET must be set when INBODY_INGEST_ENABLED is true"
            )
        if not Path(self.progress_photo_dir).is_absolute():
            problems.append(
                "PROGRESS_PHOTO_DIR must be an absolute path outside the app directory "
                "in production/staging — progress photos are private personal data"
            )
        if self.yoactiv_enabled:
            if not self.yoactiv_api_key:
                problems.append("YOACTIV_API_KEY must be set when YOACTIV_ENABLED is true")
            if not self.yoactiv_base_url.startswith("https://"):
                problems.append(
                    "YOACTIV_BASE_URL must be an https:// URL when YOACTIV_ENABLED is true"
                )
            if self.yoactiv_default_branch_id is None:
                problems.append(
                    "YOACTIV_DEFAULT_BRANCH_ID must be set when YOACTIV_ENABLED is true"
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

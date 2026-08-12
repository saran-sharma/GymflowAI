"""Integrations stay off in V1, and the schema matches the migrations."""

from __future__ import annotations

import pytest

from app.core.config import DEV_SECRET, Settings
from app.integrations.access_control.provider import SoftwareAccessControlProvider
from app.integrations.base import (
    IAccessControlProvider,
    IIntelligenceProvider,
    IMemberProvider,
    INotificationProvider,
    IntegrationDisabled,
)
from app.integrations.inbody.provider import InBodyProvider, NullBodyCompositionProvider
from app.integrations.whatsapp.provider import (
    OutboxNotificationProvider,
    WhatsAppProvider,
)
from app.integrations.yoactiv.provider import LocalMemberProvider, YoactivClient

# -------------------------------------------------------- disabled by default


def test_every_integration_flag_is_off(client, world, auth):
    body = client.get("/api/v1/integrations", headers=auth(world["owner"])).json()
    assert body["core_works_without_integrations"] is True
    assert all(enabled is False for enabled in body["flags"].values())


def test_the_default_providers_are_the_local_ones():
    from app.integrations import registry

    registry.member_provider.cache_clear()
    registry.body_composition_provider.cache_clear()
    registry.access_control_provider.cache_clear()
    registry.notification_provider.cache_clear()

    assert isinstance(registry.member_provider(), LocalMemberProvider)
    assert isinstance(registry.body_composition_provider(), NullBodyCompositionProvider)
    assert isinstance(registry.access_control_provider(), SoftwareAccessControlProvider)
    assert isinstance(registry.notification_provider(), OutboxNotificationProvider)


def test_the_whole_dashboard_works_with_everything_disabled(client, world, auth):
    assert client.get("/api/v1/reports/dashboard", headers=auth(world["owner"])).status_code == 200
    assert client.get("/api/v1/reports/insights", headers=auth(world["owner"])).status_code == 200


# ------------------------------------------------------- contracts, not fakes


def test_yoactiv_refuses_rather_than_inventing_data():
    """A guessed client returning [] would read as "Yoactiv has no members"."""
    with pytest.raises(IntegrationDisabled) as excinfo:
        YoactivClient().list_members()
    assert "documentation" in str(excinfo.value)


def test_inbody_refuses_rather_than_inventing_readings():
    with pytest.raises(IntegrationDisabled):
        InBodyProvider().latest_reading("SLAM-M0001")


def test_whatsapp_refuses_until_it_has_an_account():
    from app.integrations.base import NotificationMessage

    with pytest.raises(IntegrationDisabled):
        WhatsAppProvider().send(NotificationMessage(to="+910000000000", title="t", body="b"))


def test_the_v1_access_control_provider_only_declares_qr_and_pin():
    provider = SoftwareAccessControlProvider()
    assert set(provider.supported_methods) == {"qr", "pin"}
    assert provider.health()["biometric_templates_stored"] is False


def test_hardware_methods_are_declined_by_the_software_provider():
    provider = SoftwareAccessControlProvider()
    decision = provider.verify("SLAM-NGK", "fingerprint", "whatever")
    assert decision.allowed is False


def test_providers_satisfy_their_protocols():
    assert isinstance(LocalMemberProvider(), IMemberProvider)
    assert isinstance(SoftwareAccessControlProvider(), IAccessControlProvider)
    assert isinstance(OutboxNotificationProvider(), INotificationProvider)

    from app.integrations.intelligence.provider import RuleBasedIntelligenceProvider

    assert isinstance(RuleBasedIntelligenceProvider(), IIntelligenceProvider)


def test_the_intelligence_provider_makes_no_prediction():
    from app.integrations.intelligence.provider import RuleBasedIntelligenceProvider

    # Returning zeros would be a claim that nobody is at risk.
    assert RuleBasedIntelligenceProvider().churn_risk(["M1", "M2"]) == {}


# ------------------------------------------------------------ configuration


def test_production_refuses_to_boot_with_development_secrets():
    unsafe = Settings(
        environment="production",
        secret_key=DEV_SECRET,
        debug=True,
        cors_origins="*",
        seed_demo_data=True,
    )
    with pytest.raises(RuntimeError) as excinfo:
        unsafe.assert_production_safe()

    message = str(excinfo.value)
    assert "SECRET_KEY" in message
    assert "DEBUG" in message
    assert "CORS_ORIGINS" in message
    assert "SEED_DEMO_DATA" in message


def test_a_properly_configured_production_boots():
    safe = Settings(
        environment="production",
        secret_key="x" * 48,
        debug=False,
        cors_origins="https://api.gymflow.example",
        seed_demo_data=False,
        database_url="postgresql+psycopg://u:p@db.internal:5432/gymflow",
    )
    safe.assert_production_safe()


def test_business_rules_are_configurable_not_hardcoded(client, world, auth, db):
    from app.services import settings_service

    assert settings_service.get_int(db, "shift.grace_minutes") == 10

    client.put(
        "/api/v1/users/settings/shift.grace_minutes",
        json={"value": 20},
        headers=auth(world["admin"]),
    )
    db.expire_all()
    assert settings_service.get_int(db, "shift.grace_minutes") == 20


def test_a_branch_setting_overrides_the_chain_default(client, world, auth, db):
    from app.services import settings_service

    bgh = world["branches"]["bgh"].id
    client.put(
        "/api/v1/users/settings/shift.grace_minutes",
        json={"value": 25, "branch_id": bgh},
        headers=auth(world["admin"]),
    )
    db.expire_all()

    assert settings_service.get_int(db, "shift.grace_minutes", bgh) == 25
    assert settings_service.get_int(db, "shift.grace_minutes", world["branches"]["ngk"].id) == 10


def test_unknown_settings_are_rejected(client, world, auth):
    response = client.put(
        "/api/v1/users/settings/shift.make_everyone_punctual",
        json={"value": True},
        headers=auth(world["admin"]),
    )
    assert response.status_code == 400


def test_settings_changes_are_audited(client, world, auth, db):
    from sqlalchemy import select

    from app.db.models import AuditLog
    from app.services import audit

    client.put(
        "/api/v1/users/settings/shift.grace_minutes",
        json={"value": 12},
        headers=auth(world["admin"]),
    )
    entry = db.scalar(select(AuditLog).where(AuditLog.action == audit.ACTION_SETTING_CHANGE))
    assert entry is not None
    assert entry.details["after"] == 12


# ------------------------------------------------------------------ health


def test_health_needs_no_token_and_leaks_no_config(client):
    response = client.get("/api/v1/health")
    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "ok"
    assert set(body) == {"status", "database", "server_time"}


def test_security_headers_are_present(client):
    headers = client.get("/api/v1/health").headers
    assert headers["X-Content-Type-Options"] == "nosniff"
    assert headers["X-Frame-Options"] == "DENY"

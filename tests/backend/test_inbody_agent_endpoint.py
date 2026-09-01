"""POST /api/v1/inbody/agent/heartbeat/{secret} and GET /api/v1/inbody/agent/status.

The gym-PC agent reports a small, PII-free heartbeat; an owner/manager reads
the resulting per-branch status (connected / last scan / pending / quarantined
/ last error) without touching the gym PC. Persistence is a row in the
existing `settings` table — no schema change.
"""

from __future__ import annotations

from datetime import timedelta

import pytest
from sqlalchemy import select

from app.core.clock import now_utc
from app.core.config import settings
from app.db.models import Setting

HB = "/api/v1/inbody/agent/heartbeat"
STATUS = "/api/v1/inbody/agent/status"
SECRET = "test-inbody-ingest-secret"


@pytest.fixture
def enable(monkeypatch):
    monkeypatch.setattr(settings, "inbody_ingest_enabled", True)
    monkeypatch.setattr(settings, "inbody_ingest_shared_secret", SECRET)
    yield


def _beat(client, branch_id, *, secret=SECRET, **over):
    body = {
        "branch_id": branch_id,
        "agent_version": "1.0.0",
        "pending_files": 0,
        "quarantined_files": 0,
        "failed_files": 0,
        "processed_total": 0,
        "last_successful_scan_at": None,
        "last_error": None,
    }
    body.update(over)
    return client.post(f"{HB}/{secret}", json=body)


# --------------------------------------------------------------- heartbeat


def test_heartbeat_hidden_when_integration_off(client, world):
    assert _beat(client, world["branches"]["ngk"].id).status_code == 404


def test_heartbeat_wrong_secret_rejected(client, world, enable):
    assert _beat(client, world["branches"]["ngk"].id, secret="nope").status_code == 401


def test_heartbeat_unknown_branch_rejected(client, enable):
    assert _beat(client, 987654).status_code == 404


def test_heartbeat_rejects_negative_counts(client, world, enable):
    assert _beat(client, world["branches"]["ngk"].id, pending_files=-1).status_code == 422


def test_heartbeat_is_stored_once_per_branch(client, db, world, enable):
    ngk = world["branches"]["ngk"].id
    assert _beat(client, ngk, pending_files=1).status_code == 200
    assert _beat(client, ngk, pending_files=4).status_code == 200

    rows = db.scalars(
        select(Setting).where(Setting.key == "inbody_agent_heartbeat", Setting.branch_id == ngk)
    ).all()
    assert len(rows) == 1
    assert rows[0].value["value"]["pending_files"] == 4  # last write wins


# ----------------------------------------------------------------- status


def test_status_reflects_the_last_heartbeat(client, db, world, enable, auth):
    ngk = world["branches"]["ngk"].id
    scan_at = (now_utc() - timedelta(minutes=5)).isoformat()
    resp = _beat(
        client,
        ngk,
        pending_files=2,
        quarantined_files=1,
        failed_files=3,
        processed_total=41,
        last_successful_scan_at=scan_at,
        last_error="transient error uploading file-abc123: timeout",
    )
    assert resp.status_code == 200

    out = client.get(STATUS, headers=auth(world["owner"]))
    assert out.status_code == 200
    body = out.json()
    assert body["ingest_enabled"] is True
    agent = next(a for a in body["agents"] if a["branch_id"] == ngk)
    assert agent["connected"] is True
    assert agent["pending_files"] == 2
    assert agent["quarantined_files"] == 1
    assert agent["failed_files"] == 3
    assert agent["processed_total"] == 41
    assert agent["last_successful_scan_at"] == scan_at
    assert agent["last_error"].startswith("transient error")
    assert agent["agent_version"] == "1.0.0"
    assert agent["branch_code"] == world["branches"]["ngk"].code


def test_status_reports_offline_after_the_window(client, world, enable, auth, monkeypatch):
    ngk = world["branches"]["ngk"].id
    assert _beat(client, ngk).status_code == 200
    monkeypatch.setattr(settings, "inbody_agent_offline_after_seconds", 0)

    body = client.get(STATUS, headers=auth(world["owner"])).json()
    agent = next(a for a in body["agents"] if a["branch_id"] == ngk)
    assert agent["connected"] is False
    assert agent["last_heartbeat_at"] is not None  # we still know when we last heard from it


def test_status_empty_before_any_heartbeat(client, world, enable, auth):
    body = client.get(STATUS, headers=auth(world["owner"])).json()
    assert body["agents"] == []
    assert body["ingest_enabled"] is True
    assert body["offline_after_seconds"] == settings.inbody_agent_offline_after_seconds


def test_status_requires_management(client, world, enable, auth):
    _beat(client, world["branches"]["ngk"].id)
    assert client.get(STATUS, headers=auth(world["member_ngk_user"])).status_code == 403
    assert client.get(STATUS, headers=auth(world["trainer_ngk_user"])).status_code == 403


def test_status_branch_manager_sees_only_their_branch(client, world, enable, auth):
    ngk = world["branches"]["ngk"].id
    bgh = world["branches"]["bgh"].id
    _beat(client, ngk)
    _beat(client, bgh)

    body = client.get(STATUS, headers=auth(world["manager_bgh"])).json()
    assert [a["branch_id"] for a in body["agents"]] == [bgh]


def test_status_owner_sees_all_and_can_filter(client, world, enable, auth):
    ngk = world["branches"]["ngk"].id
    bgh = world["branches"]["bgh"].id
    _beat(client, ngk)
    _beat(client, bgh)

    all_body = client.get(STATUS, headers=auth(world["owner"])).json()
    assert sorted(a["branch_id"] for a in all_body["agents"]) == sorted([ngk, bgh])

    filtered = client.get(STATUS, params={"branch_id": bgh}, headers=auth(world["owner"])).json()
    assert [a["branch_id"] for a in filtered["agents"]] == [bgh]


def test_the_real_agent_payload_validates_against_the_endpoint(client, world, enable, tmp_path):
    """Contract test: whatever `inbody_agent.heartbeat_payload()` produces must
    be exactly what `AgentHeartbeatIn` accepts, so the two can never drift."""
    from app.scripts.inbody_agent import (
        AgentConfig,
        State,
        build_status,
        heartbeat_payload,
    )

    folder = tmp_path / "csv"
    folder.mkdir()
    cfg = AgentConfig(
        folder=folder,
        api_url="https://gymflow.test",
        branch_id=world["branches"]["ngk"].id,
        secret="unused-here",
        work_dir=tmp_path / "work",
    )
    payload = heartbeat_payload(build_status(cfg, State(cfg.state_file), pending=2))
    resp = client.post(f"{HB}/{SECRET}", json=payload)
    assert resp.status_code == 200, resp.text

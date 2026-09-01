"""Logic-level acceptance tests for the production InBody agent
(`app/scripts/inbody_agent.py`).

The gym-PC OS bits (Task Scheduler AtStartup, RestartOnFailure, run whether
logged in or not) are covered by the manual runbook in
`deploy/windows/inbody-agent/README.md`. Everything the agent itself does —
baseline, detect-once, stability, transient retry, quarantine, idempotent
state across restart, PII-free status/heartbeat — is pinned here with a fake
uploader and no network.

Maps to the requested A–J acceptance:
  C detect        -> test_new_file_is_detected_and_uploaded_once
  D upload        -> same
  G duplicate     -> test_same_file_is_never_re_uploaded / test_server_dedupe_response_is_terminal
  H net failure   -> test_transient_failure_is_retried_until_it_succeeds
  I malformed     -> test_permanent_400_is_quarantined_and_left_in_place
  J restart       -> test_state_survives_a_restart
  11/17 status    -> test_status_and_heartbeat_carry_no_pii
"""

from __future__ import annotations

import json

import pytest
from app.scripts.inbody_agent import (
    AgentConfig,
    ConfigError,
    Outcome,
    State,
    UploadResult,
    _RedactFilter,
    classify_status,
    file_hint,
    is_stable,
    load_config,
    run,
)

NO_SLEEP = lambda *_a, **_k: None  # noqa: E731


class FakeUploader:
    def __init__(self, script=None):
        self._script = list(script or [])
        self.calls: list[str] = []

    def upload(self, path, *, sleep=NO_SLEEP):
        self.calls.append(path.name)
        result = (
            self._script.pop(0) if self._script else UploadResult(Outcome.UPLOADED, 200, 1, "{}")
        )
        return result(path) if callable(result) else result


class FakeHeartbeat:
    def __init__(self):
        self.payloads: list[dict] = []

    def send(self, payload):
        self.payloads.append(payload)
        return True


def _config(tmp_path, **over):
    folder = tmp_path / "csv"
    folder.mkdir(exist_ok=True)
    work = tmp_path / "work"
    work.mkdir(exist_ok=True)
    base = {
        "folder": folder,
        "api_url": "https://gymflow.test",
        "branch_id": 3,
        "secret": "s3cr3t-not-a-real-token",
        "work_dir": work,
        "poll_seconds": 0,
        "heartbeat_seconds": 0,
    }
    base.update(over)
    return AgentConfig(**base)


def _csv(folder, name, body=b"Name,ID\nx,9\n"):
    p = folder / name
    p.write_bytes(body)
    return p


def _once(config, uploader, heartbeat=None):
    return run(
        config,
        uploader=uploader,
        heartbeat=heartbeat or FakeHeartbeat(),
        once=True,
        sleep=NO_SLEEP,
    )


# ------------------------------------------------------------- stability (7, C)


def test_static_file_is_stable(tmp_path):
    assert is_stable(_csv(tmp_path, "a.csv"), sleep=NO_SLEEP) is True


def test_empty_file_is_not_stable(tmp_path):
    p = tmp_path / "e.csv"
    p.touch()
    assert is_stable(p, sleep=NO_SLEEP) is False


def test_growing_file_is_not_stable(tmp_path):
    p = _csv(tmp_path, "g.csv", b"a" * 10)

    def grow(_):
        p.write_bytes(p.read_bytes() + b"b" * 10)

    assert is_stable(p, sleep=grow) is False


def test_still_writing_file_is_not_uploaded(tmp_path):
    config = _config(tmp_path)
    up = FakeUploader()
    _once(config, up)  # baseline
    p = _csv(config.folder, "w.csv", b"a" * 5)

    # a file that keeps growing across the stability window is skipped this pass
    def grow(_):
        p.write_bytes(p.read_bytes() + b"z" * 5)

    run(config, uploader=up, heartbeat=FakeHeartbeat(), once=True, sleep=grow)
    assert up.calls == []


# --------------------------------------------------------------- baseline (6)


def test_baseline_records_preexisting_files_and_uploads_nothing(tmp_path):
    config = _config(tmp_path)
    _csv(config.folder, "old1.csv")
    _csv(config.folder, "old2.csv")
    up = FakeUploader()

    _once(config, up)

    assert up.calls == []
    state = State.load(config.state_file)
    assert state.baselined is True
    assert {n: e["result"] for n, e in state.entries.items()} == {
        "old1.csv": "baseline",
        "old2.csv": "baseline",
    }


def test_file_arriving_into_an_initially_empty_folder_is_uploaded(tmp_path):
    """Regression: baseline is gated on an explicit flag, not 'state is empty',
    so the first file into an empty folder is not baselined away."""
    config = _config(tmp_path)
    up = FakeUploader()
    _once(config, up)  # baseline of an empty folder
    _csv(config.folder, "first.csv")
    _once(config, up)
    assert up.calls == ["first.csv"]


# --------------------------------------------------- detect / upload once (C,D,G)


def test_new_file_is_detected_and_uploaded_once(tmp_path):
    config = _config(tmp_path)
    up = FakeUploader()
    _once(config, up)  # baseline
    _csv(config.folder, "9990001111.csv")

    _once(config, up)
    _once(config, up)
    _once(config, up)

    assert up.calls == ["9990001111.csv"]
    assert State.load(config.state_file).entries["9990001111.csv"]["result"] == "uploaded"


def test_same_file_is_never_re_uploaded(tmp_path):
    config = _config(tmp_path)
    up = FakeUploader()
    _once(config, up)
    _csv(config.folder, "dup.csv")
    _once(config, up)
    for _ in range(5):
        _once(config, up)
    assert up.calls == ["dup.csv"]


def test_server_dedupe_response_is_terminal(tmp_path):
    """If a file is re-sent (e.g. bytes unchanged but state lost) the server
    answers 200 written=0; the agent still treats it as done."""
    config = _config(tmp_path)
    up = FakeUploader([UploadResult(Outcome.UPLOADED, 200, 0, '{"duplicate": 1}')])
    _once(config, up)
    _csv(config.folder, "d.csv")
    _once(config, up)
    _once(config, up)
    assert up.calls == ["d.csv"]
    assert State.load(config.state_file).entries["d.csv"]["result"] == "uploaded"


def test_changed_file_bytes_are_reprocessed(tmp_path):
    config = _config(tmp_path)
    up = FakeUploader()
    _once(config, up)
    p = _csv(config.folder, "c.csv", b"Name,ID\nx,9\n")
    _once(config, up)
    p.write_bytes(b"Name,ID\nx,9\ny,8\n")  # size + mtime change
    _once(config, up)
    assert up.calls == ["c.csv", "c.csv"]


# ------------------------------------------------ transient failure (8, H)


def test_transient_failure_is_retried_until_it_succeeds(tmp_path):
    config = _config(tmp_path)
    up = FakeUploader(
        [
            UploadResult(Outcome.TRANSIENT, 503, None, "connection reset"),
            UploadResult(Outcome.TRANSIENT, 503, None, "timeout"),
            UploadResult(Outcome.UPLOADED, 200, 1, "{}"),
        ]
    )
    _once(config, up)
    _csv(config.folder, "t.csv")

    _once(config, up)
    s1 = State.load(config.state_file)
    assert s1.entries["t.csv"]["result"] == "transient_failed"
    assert s1.last_success_at is None

    _once(config, up)  # still failing
    _once(config, up)  # succeeds
    s2 = State.load(config.state_file)
    assert s2.entries["t.csv"]["result"] == "uploaded"
    assert s2.last_success_at is not None
    assert up.calls == ["t.csv", "t.csv", "t.csv"]
    assert (config.quarantine_dir.exists() is False) or not list(config.quarantine_dir.iterdir())


# ------------------------------------------------ malformed -> quarantine (9, I)


def test_permanent_400_is_quarantined_and_left_in_place(tmp_path):
    config = _config(tmp_path)
    up = FakeUploader(
        [UploadResult(Outcome.PERMANENT, 400, None, "InBody export missing column: PBF")]
    )
    _once(config, up)
    bad = _csv(config.folder, "9876543210.csv", b"garbage,not,inbody\n1,2,3\n")

    _once(config, up)
    _once(config, up)  # must NOT retry

    assert up.calls == ["9876543210.csv"]  # tried exactly once
    assert bad.exists()  # the watched folder is never modified
    state = State.load(config.state_file)
    assert state.entries["9876543210.csv"]["result"] == "quarantined"
    assert state.quarantined_count == 1

    notes = list(config.quarantine_dir.iterdir())
    assert len(notes) == 1
    note = json.loads(notes[0].read_text())
    assert note["reason"].startswith("HTTP 400")
    assert "9876543210" not in json.dumps(note)  # phone-named file, redacted to a hint
    assert note["file_hint"] == file_hint("9876543210.csv")


def test_auth_or_config_error_is_surfaced_not_quarantined(tmp_path):
    config = _config(tmp_path)
    up = FakeUploader(
        [
            UploadResult(Outcome.CONFIG_ERROR, 401, None, "unauthorized"),
            UploadResult(Outcome.CONFIG_ERROR, 401, None, "unauthorized"),
            UploadResult(Outcome.UPLOADED, 200, 1, "{}"),
        ]
    )
    _once(config, up)
    _csv(config.folder, "x.csv")

    _once(config, up)
    s = State.load(config.state_file)
    assert "x.csv" not in s.entries or s.entries["x.csv"]["result"] not in State.TERMINAL
    assert s.last_error and "config/auth" in s.last_error
    assert not config.quarantine_dir.exists() or not list(config.quarantine_dir.iterdir())

    _once(config, up)  # retried
    _once(config, up)  # now succeeds
    assert State.load(config.state_file).entries["x.csv"]["result"] == "uploaded"
    assert up.calls == ["x.csv", "x.csv", "x.csv"]


# ------------------------------------------------------- restart / state (10, J)


def test_state_survives_a_restart(tmp_path):
    config = _config(tmp_path)
    up = FakeUploader()
    _once(config, up)
    _csv(config.folder, "keep.csv")
    _once(config, up)
    assert up.calls == ["keep.csv"]

    # "restart": a brand-new process reads the same state dir
    fresh = State.load(config.state_file)
    assert fresh.baselined is True
    assert fresh.seen(config.folder / "keep.csv") is True
    assert fresh.processed_total == 1
    assert fresh.last_success_at is not None

    up2 = FakeUploader()
    _once(config, up2)
    assert up2.calls == []  # nothing re-sent after the restart


# --------------------------------------------------- status / heartbeat (11, 17)


def test_status_and_heartbeat_carry_no_pii(tmp_path):
    config = _config(tmp_path)
    hb = FakeHeartbeat()
    up = FakeUploader(
        [
            UploadResult(Outcome.PERMANENT, 400, None, "bad"),
            UploadResult(Outcome.UPLOADED, 200, 1, "{}"),
        ]
    )
    _once(config, up, hb)
    _csv(config.folder, "9123456780.csv")  # phone-named
    _csv(config.folder, "9123456781.csv")
    _once(config, up, hb)

    status = json.loads(config.status_file.read_text())
    for key in (
        "agent_version",
        "branch_id",
        "pending_files",
        "quarantined_files",
        "failed_files",
        "processed_total",
        "last_successful_scan_at",
        "last_error",
    ):
        assert key in status
    blob = json.dumps(status)
    assert "9123456780" not in blob and "9123456781" not in blob
    assert config.secret not in blob

    assert hb.payloads
    hp = hb.payloads[-1]
    assert set(hp) == {
        "branch_id",
        "agent_version",
        "pending_files",
        "quarantined_files",
        "failed_files",
        "processed_total",
        "last_successful_scan_at",
        "last_error",
    }
    assert "watch_folder" not in hp
    hpblob = json.dumps(hp)
    assert "9123456780" not in hpblob and config.secret not in hpblob
    assert hp["branch_id"] == 3


# --------------------------------------------------------- pure helpers


@pytest.mark.parametrize(
    "code,expected",
    [
        (200, Outcome.UPLOADED),
        (400, Outcome.PERMANENT),
        (401, Outcome.CONFIG_ERROR),
        (403, Outcome.CONFIG_ERROR),
        (404, Outcome.CONFIG_ERROR),
        (408, Outcome.TRANSIENT),
        (429, Outcome.TRANSIENT),
        (500, Outcome.TRANSIENT),
        (503, Outcome.TRANSIENT),
        (418, Outcome.PERMANENT),
    ],
)
def test_classify_status(code, expected):
    assert classify_status(code) is expected


def test_redact_filter_scrubs_the_secret_in_msg_and_args():
    import logging

    rec = logging.LogRecord("x", logging.INFO, "f", 1, "url has SEKRET in it", None, None)
    _RedactFilter("SEKRET").filter(rec)
    assert "SEKRET" not in rec.getMessage() and "***" in rec.msg

    # the secret arriving as a %-arg (e.g. an exception string) is also scrubbed
    rec2 = logging.LogRecord(
        "x", logging.WARNING, "f", 1, "failed: %s", ("boom SEKRET boom",), None
    )
    _RedactFilter("SEKRET").filter(rec2)
    assert "SEKRET" not in rec2.getMessage()


def test_scrub_removes_the_secret():
    from app.scripts.inbody_agent import _scrub

    assert (
        _scrub("POST https://x/ingest/abc123 failed", "abc123")
        == "POST https://x/ingest/*** failed"
    )
    assert _scrub("nothing here", "abc123") == "nothing here"


def test_upload_and_heartbeat_errors_never_expose_the_secret(tmp_path, monkeypatch):
    """A network error's message contains the URL, and the secret is in the URL
    path. It must not reach the returned detail, the log, status.json, or the
    heartbeat."""
    import logging

    from app.scripts.inbody_agent import Heartbeat, Uploader

    config = _config(tmp_path)
    captured: list[str] = []

    class _Cap(logging.Handler):
        def emit(self, record):
            captured.append(self.format(record))

    lg = logging.getLogger("gymflow.inbody.agent")
    handler = _Cap()
    handler.setFormatter(logging.Formatter("%(message)s"))
    from app.scripts.inbody_agent import _RedactFilter as RF

    handler.addFilter(RF(config.secret))
    lg.addHandler(handler)
    try:

        class _Boom(Exception):
            pass

        class _FakeRequests:
            class exceptions:  # noqa: N801
                class RequestException(Exception):
                    pass

                class SSLError(RequestException):
                    pass

            @staticmethod
            def post(url, **_kw):
                raise _FakeRequests.exceptions.RequestException(f"cannot reach {url}")

        monkeypatch.setitem(__import__("sys").modules, "requests", _FakeRequests)

        src = _csv(config.folder, "9998887777.csv")
        res = Uploader(config).upload(src, sleep=NO_SLEEP)
        assert config.secret not in res.detail
        assert "***" in res.detail

        Heartbeat(config).send({"branch_id": 3})
    finally:
        lg.removeHandler(handler)

    assert all(config.secret not in line for line in captured)


def test_file_hint_is_stable_and_hides_the_name():
    assert file_hint("9876543210.csv") == file_hint("9876543210.csv")
    assert "9876543210" not in file_hint("9876543210.csv")


# ------------------------------------------------------------- config (16)


def _write_ini(path, body):
    path.write_text(body)
    return path


def test_load_config_happy_path(tmp_path):
    folder = tmp_path / "emr"
    folder.mkdir()
    ini = _write_ini(
        tmp_path / "c.ini",
        f"[inbody-agent]\nfolder = {folder}\napi_url = https://gymflow.example/\n"
        f"branch_id = 7\nsecret = abc123\n",
    )
    cfg = load_config(ini)
    assert cfg.folder == folder
    assert cfg.api_url == "https://gymflow.example"  # trailing slash trimmed
    assert cfg.branch_id == 7
    assert cfg.secret == "abc123"
    assert cfg.verify_tls is True
    assert cfg.work_dir == tmp_path  # defaults next to the config file


def test_load_config_secret_from_sidecar_file(tmp_path):
    folder = tmp_path / "emr"
    folder.mkdir()
    (tmp_path / "secret").write_text("  file-secret\n")
    ini = _write_ini(
        tmp_path / "c.ini",
        f"[inbody-agent]\nfolder = {folder}\napi_url = https://x.test\n"
        f"branch_id = 1\nsecret_file = secret\ninsecure = true\n",
    )
    cfg = load_config(ini)
    assert cfg.secret == "file-secret"
    assert cfg.verify_tls is False


@pytest.mark.parametrize(
    "body,msg",
    [
        ("[wrong]\n", "no [inbody-agent] section"),
        (
            "[inbody-agent]\napi_url = https://x\nbranch_id = 1\nsecret = s\n",
            "'folder' is required",
        ),
        ("[inbody-agent]\nfolder = {f}\nbranch_id = 1\nsecret = s\n", "'api_url' is required"),
        (
            "[inbody-agent]\nfolder = {f}\napi_url = http://evil.example\nbranch_id = 1\nsecret = s\n",
            "must be an https",
        ),
        (
            "[inbody-agent]\nfolder = {f}\napi_url = https://x\nbranch_id = nope\nsecret = s\n",
            "'branch_id' must be an integer",
        ),
        ("[inbody-agent]\nfolder = {f}\napi_url = https://x\nbranch_id = 1\n", "no shared secret"),
    ],
)
def test_load_config_rejects_bad_input(tmp_path, body, msg):
    folder = tmp_path / "emr"
    folder.mkdir()
    ini = _write_ini(tmp_path / "c.ini", body.replace("{f}", str(folder)))
    with pytest.raises(ConfigError) as exc:
        load_config(ini)
    assert msg in str(exc.value)


def test_load_config_allows_http_only_for_localhost(tmp_path):
    folder = tmp_path / "emr"
    folder.mkdir()
    ini = _write_ini(
        tmp_path / "c.ini",
        f"[inbody-agent]\nfolder = {folder}\napi_url = http://127.0.0.1:8000\n"
        f"branch_id = 1\nsecret = s\n",
    )
    assert load_config(ini).api_url == "http://127.0.0.1:8000"

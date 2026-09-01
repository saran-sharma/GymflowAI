"""GymFlow InBody Agent — production, hands-off.

Runs continuously on the gym Windows PC (installed as a Task Scheduler task,
no console window). Watches the folder LookinBody120 auto-exports one CSV per
scan into and pushes every NEW file to GymFlow over outbound HTTPS. It never
listens on a port, never exposes the folder, and needs no manual step after
installation.

    python -m app.scripts.inbody_agent --config <path>          # run (foreground)
    pythonw  app\\scripts\\inbody_agent.py --config <path>       # run (no window)
    python -m app.scripts.inbody_agent --config <path> --check  # validate + 1 heartbeat, exit
    python -m app.scripts.inbody_agent --config <path> --once   # 1 pass, exit
    python -m app.scripts.inbody_agent --config <path> --print-config

Config is an INI file, never the command line, so the shared secret is not
visible in the process list or Task Scheduler. See
``deploy/windows/inbody-agent/config.example.ini``.

Relationship to ``inbody_watch_agent.py``: that script stays the *validation*
tool (``--dry-run``, ``--resend``, ``--once`` against ad-hoc arguments). This
one is the unattended production runner. Neither imports GymFlow's backend —
the parser lives on the server; the agent only detects, stabilises, uploads,
and reports a heartbeat. Dependencies: Python standard library + ``requests``.

Trust model (unchanged): a dedicated machine credential
(``INBODY_INGEST_SHARED_SECRET``) in the URL path — not a user login, no
user's privileges. See ``app/api/v1/inbody.py``.
"""

from __future__ import annotations

import argparse
import configparser
import contextlib
import dataclasses
import hashlib
import json
import logging
import logging.handlers
import os
import signal
import sys
import threading
import time
from datetime import UTC, datetime
from enum import Enum
from pathlib import Path

AGENT_VERSION = "1.0.0"

SUPPORTED_SUFFIXES = (".csv", ".xlsx")

# A file mid-write from LookinBody must never be uploaded half-done: require
# this many consecutive equal size reads, this far apart, before touching it.
STABILITY_CHECKS = 3
STABILITY_DELAY_SECONDS = 2.0

# In-call retry for a transient upload failure (a blip). If it still fails the
# poll loop retries the file on the next cycle, indefinitely — a transient
# failure is never quarantined.
UPLOAD_TRANSIENT_RETRIES = 3
UPLOAD_RETRY_BACKOFF = (5, 15, 45)

DEFAULT_POLL_SECONDS = 30
DEFAULT_HEARTBEAT_SECONDS = 120
UPLOAD_TIMEOUT_SECONDS = 60
HEARTBEAT_TIMEOUT_SECONDS = 15

logger = logging.getLogger("gymflow.inbody.agent")


# --------------------------------------------------------------------- config


@dataclasses.dataclass(frozen=True)
class AgentConfig:
    folder: Path
    api_url: str
    branch_id: int
    secret: str
    work_dir: Path
    cacert: str | None = None
    verify_tls: bool = True
    poll_seconds: int = DEFAULT_POLL_SECONDS
    heartbeat_seconds: int = DEFAULT_HEARTBEAT_SECONDS

    @property
    def state_file(self) -> Path:
        return self.work_dir / "state.json"

    @property
    def status_file(self) -> Path:
        return self.work_dir / "status.json"

    @property
    def quarantine_dir(self) -> Path:
        return self.work_dir / "quarantine"

    @property
    def log_dir(self) -> Path:
        return self.work_dir / "logs"

    def redacted(self) -> dict:
        d = dataclasses.asdict(self)
        d["folder"] = str(self.folder)
        d["work_dir"] = str(self.work_dir)
        d["secret"] = "***set***" if self.secret else "***missing***"
        return d


class ConfigError(Exception):
    """The agent's INI config is missing or invalid."""


def load_config(path: Path) -> AgentConfig:
    if not path.is_file():
        raise ConfigError(f"config file not found: {path}")
    parser = configparser.ConfigParser()
    try:
        parser.read(path)
    except configparser.Error as exc:
        raise ConfigError(f"config file is not valid INI: {exc}") from exc
    if not parser.has_section("inbody-agent"):
        raise ConfigError("config file has no [inbody-agent] section")
    sec = parser["inbody-agent"]

    folder_raw = sec.get("folder", "").strip()
    api_url = sec.get("api_url", "").strip().rstrip("/")
    branch_raw = sec.get("branch_id", "").strip()

    if not folder_raw:
        raise ConfigError("'folder' is required")
    folder = Path(folder_raw)
    if not folder.is_dir():
        raise ConfigError(f"'folder' is not a directory: {folder}")

    if not api_url:
        raise ConfigError("'api_url' is required")
    _local = api_url.startswith(("http://localhost", "http://127.0.0.1"))
    if not api_url.startswith("https://") and not _local:
        raise ConfigError("'api_url' must be an https:// URL")

    try:
        branch_id = int(branch_raw)
    except ValueError as exc:
        raise ConfigError(f"'branch_id' must be an integer, got {branch_raw!r}") from exc
    if branch_id <= 0:
        raise ConfigError("'branch_id' must be a positive integer")

    secret = _resolve_secret(sec, path.parent)
    if not secret:
        raise ConfigError(
            "no shared secret: set 'secret' or 'secret_file' in the config, "
            "or the INBODY_INGEST_SHARED_SECRET environment variable"
        )

    work_dir = Path(sec.get("work_dir", "").strip() or path.parent)
    cacert = sec.get("cacert", "").strip() or None
    if cacert and not Path(cacert).is_file():
        raise ConfigError(f"'cacert' file not found: {cacert}")
    insecure = sec.getboolean("insecure", fallback=False)

    return AgentConfig(
        folder=folder,
        api_url=api_url,
        branch_id=branch_id,
        secret=secret,
        work_dir=work_dir,
        cacert=cacert,
        verify_tls=not insecure,
        poll_seconds=sec.getint("poll_seconds", fallback=DEFAULT_POLL_SECONDS),
        heartbeat_seconds=sec.getint("heartbeat_seconds", fallback=DEFAULT_HEARTBEAT_SECONDS),
    )


def _resolve_secret(sec: configparser.SectionProxy, config_dir: Path) -> str:
    inline = sec.get("secret", "").strip()
    if inline:
        return inline
    secret_file = sec.get("secret_file", "").strip()
    if secret_file:
        p = Path(secret_file)
        if not p.is_absolute():
            p = config_dir / p
        if not p.is_file():
            raise ConfigError(f"'secret_file' not found: {p}")
        return p.read_text(encoding="utf-8").strip()
    return os.environ.get("INBODY_INGEST_SHARED_SECRET", "").strip()


# ---------------------------------------------------------------- primitives


def _now() -> datetime:
    return datetime.now(tz=UTC)


def _iso(dt: datetime | None) -> str | None:
    return dt.isoformat() if dt is not None else None


def file_hint(name: str) -> str:
    """A stable stand-in for a filename in logs and status. LookinBody names
    its exports after the member's phone / InBody ID, so the real name never
    leaves the gym PC."""
    return "file-" + hashlib.sha1(name.encode()).hexdigest()[:8]  # noqa: S324 - not security


def _scrub(text: str, secret: str) -> str:
    """Remove the shared secret from a string before it is logged, written to
    ``status.json``, or sent in a heartbeat. It lives in the URL path, so a
    network error's message often contains it verbatim."""
    return text.replace(secret, "***") if secret and secret in text else text


def file_key(path: Path) -> str:
    try:
        st = path.stat()
        return f"{path.name}:{st.st_size}:{int(st.st_mtime)}"
    except OSError:
        return f"{path.name}:gone"


def export_files(folder: Path) -> list[Path]:
    try:
        return sorted(
            p for p in folder.iterdir() if p.is_file() and p.suffix.lower() in SUPPORTED_SUFFIXES
        )
    except OSError:
        return []


def is_stable(path: Path, *, sleep=time.sleep) -> bool:
    """True only after STABILITY_CHECKS consecutive equal, non-zero size reads."""
    try:
        last = path.stat().st_size
    except OSError:
        return False
    if last == 0:
        return False
    for _ in range(STABILITY_CHECKS - 1):
        sleep(STABILITY_DELAY_SECONDS)
        try:
            size = path.stat().st_size
        except OSError:
            return False
        if size != last or size == 0:
            return False
        last = size
    return True


# ------------------------------------------------------------------ outcomes


class Outcome(str, Enum):
    UPLOADED = "uploaded"  # server accepted it (written >= 0; duplicates included)
    TRANSIENT = "transient"  # network / timeout / 5xx / 429 — retry later, never quarantine
    PERMANENT = "permanent"  # 400 / unreadable file — quarantine, never retry
    CONFIG_ERROR = "config"  # 401 / 403 / 404 / TLS — do not quarantine, surface, keep trying


def classify_status(code: int) -> Outcome:
    if code == 200:
        return Outcome.UPLOADED
    if code == 400:
        return Outcome.PERMANENT
    if code in (401, 403, 404):
        return Outcome.CONFIG_ERROR
    if code in (408, 425, 429) or 500 <= code <= 599:
        return Outcome.TRANSIENT
    return Outcome.PERMANENT  # an unexpected 4xx: make it visible, don't loop on it


@dataclasses.dataclass(frozen=True)
class UploadResult:
    outcome: Outcome
    status_code: int | None = None
    written: int | None = None
    detail: str = ""


# ------------------------------------------------------------------- state


class State:
    """Local idempotency ledger — kept next to the agent, never in the watched
    folder. One entry per filename: ``{key, result, error, at}`` where ``key``
    is ``name:size:mtime``. A terminal ``result`` (uploaded / baseline /
    quarantined) means "done, do not touch again unless the file's bytes
    change". ``transient_failed`` is not terminal — it is retried every cycle.
    """

    TERMINAL = {"uploaded", "baseline", "quarantined"}

    def __init__(self, path: Path):
        self.path = path
        self.entries: dict[str, dict] = {}
        self.last_success_at: datetime | None = None
        self.last_error: str | None = None
        self.processed_total = 0
        # Whether the one-time "record everything already here as seen, upload
        # nothing" pass has run. An explicit flag, not "entries is empty", so a
        # first file that arrives into an empty folder is uploaded, not
        # baselined away.
        self.baselined = False

    @classmethod
    def load(cls, path: Path) -> State:
        self = cls(path)
        if not path.exists():
            return self
        try:
            raw = json.loads(path.read_text(encoding="utf-8"))
        except (json.JSONDecodeError, OSError):
            logger.warning("state file unreadable, starting fresh: %s", path)
            return self
        self.entries = raw.get("files", {}) if isinstance(raw, dict) else {}
        meta = raw.get("meta", {}) if isinstance(raw, dict) else {}
        self.processed_total = int(meta.get("processed_total", 0) or 0)
        self.baselined = bool(meta.get("baselined", False))
        self.last_error = meta.get("last_error")
        las = meta.get("last_success_at")
        if las:
            try:
                self.last_success_at = datetime.fromisoformat(las)
            except ValueError:
                self.last_success_at = None
        return self

    def save(self) -> None:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        payload = {
            "files": self.entries,
            "meta": {
                "processed_total": self.processed_total,
                "baselined": self.baselined,
                "last_success_at": _iso(self.last_success_at),
                "last_error": self.last_error,
                "agent_version": AGENT_VERSION,
                "saved_at": _iso(_now()),
            },
        }
        tmp = self.path.with_suffix(self.path.suffix + ".tmp")
        tmp.write_text(json.dumps(payload, indent=2, sort_keys=True), encoding="utf-8")
        tmp.replace(self.path)

    def seen(self, path: Path) -> bool:
        entry = self.entries.get(path.name)
        if not entry:
            return False
        if entry.get("key") != file_key(path):
            return False  # the file's bytes changed — treat as new content
        return entry.get("result") in self.TERMINAL

    def mark(self, path: Path, result: str, *, error: str | None = None) -> None:
        self.entries[path.name] = {
            "key": file_key(path),
            "result": result,
            "error": error,
            "at": _iso(_now()),
        }
        if result == "uploaded":
            self.processed_total += 1
            self.last_success_at = _now()
        if error:
            self.last_error = error

    def baseline(self, paths: list[Path]) -> None:
        for path in paths:
            self.entries[path.name] = {
                "key": file_key(path),
                "result": "baseline",
                "error": None,
                "at": _iso(_now()),
            }
        self.baselined = True

    @property
    def quarantined_count(self) -> int:
        return sum(1 for e in self.entries.values() if e.get("result") == "quarantined")

    @property
    def transient_failed_count(self) -> int:
        return sum(1 for e in self.entries.values() if e.get("result") == "transient_failed")


def quarantine(path: Path, config: AgentConfig, reason: str) -> None:
    """Record a permanently-bad file WITHOUT modifying the watched folder —
    LookinBody's EMR store is never touched by this agent. The file stays put;
    ``state`` marks it ``quarantined`` so it is never retried, and a redacted
    note lands in ``work_dir/quarantine/`` for an operator to inspect."""
    config.quarantine_dir.mkdir(parents=True, exist_ok=True)
    note = config.quarantine_dir / f"{file_hint(path.name)}.json"
    try:
        size = path.stat().st_size
    except OSError:
        size = None
    note.write_text(
        json.dumps(
            {
                "file_hint": file_hint(path.name),
                "size": size,
                "reason": reason,
                "detected_at": _iso(_now()),
                "note": "the file was left in place; GymFlow rejected it as unparseable",
            },
            indent=2,
            sort_keys=True,
        ),
        encoding="utf-8",
    )


# ----------------------------------------------------------------- uploader


class Uploader:
    """POSTs one export file to the ingest endpoint. Injectable so the loop is
    testable without a network."""

    def __init__(self, config: AgentConfig):
        self.config = config

    def _verify(self):
        if not self.config.verify_tls:
            return False
        return self.config.cacert or True

    def upload(self, path: Path, *, sleep=time.sleep) -> UploadResult:
        import requests  # local import: a missing dependency fails at call time

        endpoint = f"{self.config.api_url}/api/v1/inbody/ingest/{self.config.secret}"
        content_type = (
            "text/csv"
            if path.suffix.lower() == ".csv"
            else "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        )
        last = UploadResult(Outcome.TRANSIENT, detail="not attempted")
        for attempt in range(UPLOAD_TRANSIENT_RETRIES + 1):
            try:
                with path.open("rb") as fh:
                    resp = requests.post(
                        endpoint,
                        params={"branch_id": self.config.branch_id},
                        files={"file": (path.name, fh, content_type)},
                        timeout=UPLOAD_TIMEOUT_SECONDS,
                        verify=self._verify(),
                    )
            except requests.exceptions.SSLError as exc:
                return UploadResult(
                    Outcome.CONFIG_ERROR,
                    detail=_scrub(f"TLS verify failed: {exc}", self.config.secret),
                )
            except requests.exceptions.RequestException as exc:
                last = UploadResult(Outcome.TRANSIENT, detail=_scrub(str(exc), self.config.secret))
            else:
                outcome = classify_status(resp.status_code)
                written = None
                detail = ""
                try:
                    body = resp.json()
                    written = body.get("written")
                    detail = json.dumps(body.get("counts", {}), sort_keys=True)
                except ValueError:
                    detail = _scrub(resp.text[:200], self.config.secret)
                last = UploadResult(outcome, resp.status_code, written, detail)
                if outcome is not Outcome.TRANSIENT:
                    return last
            if attempt < UPLOAD_TRANSIENT_RETRIES:
                sleep(UPLOAD_RETRY_BACKOFF[min(attempt, len(UPLOAD_RETRY_BACKOFF) - 1)])
        return last


class Heartbeat:
    """Best-effort status POST. Never raises into the loop."""

    def __init__(self, config: AgentConfig):
        self.config = config

    def send(self, payload: dict) -> bool:
        try:
            import requests

            endpoint = f"{self.config.api_url}/api/v1/inbody/agent/heartbeat/{self.config.secret}"
            verify = (self.config.cacert or True) if self.config.verify_tls else False
            resp = requests.post(
                endpoint, json=payload, timeout=HEARTBEAT_TIMEOUT_SECONDS, verify=verify
            )
            return resp.status_code == 200
        except Exception as exc:  # noqa: BLE001 - heartbeat failure is non-fatal
            logger.warning("heartbeat failed: %s", _scrub(str(exc), self.config.secret))
            return False


# ------------------------------------------------------------------- status


def pending_count(config: AgentConfig, state: State, *, sleep=time.sleep) -> int:
    """Stable, not-yet-terminal export files sitting in the folder right now."""
    n = 0
    for path in export_files(config.folder):
        if state.seen(path):
            continue
        if is_stable(path, sleep=sleep):
            n += 1
    return n


def build_status(config: AgentConfig, state: State, *, pending: int) -> dict:
    """The operational snapshot. Carries counts and timestamps only — no
    filename, no phone number, no secret."""
    return {
        "agent_version": AGENT_VERSION,
        "branch_id": config.branch_id,
        "generated_at": _iso(_now()),
        "watch_folder": str(config.folder),
        "pending_files": pending,
        "quarantined_files": state.quarantined_count,
        "failed_files": state.transient_failed_count,
        "processed_total": state.processed_total,
        "last_successful_scan_at": _iso(state.last_success_at),
        "last_error": state.last_error,
    }


def heartbeat_payload(status: dict) -> dict:
    """What goes over the wire to GymFlow — drops the local folder path."""
    return {
        "branch_id": status["branch_id"],
        "agent_version": status["agent_version"],
        "pending_files": status["pending_files"],
        "quarantined_files": status["quarantined_files"],
        "failed_files": status["failed_files"],
        "processed_total": status["processed_total"],
        "last_successful_scan_at": status["last_successful_scan_at"],
        "last_error": status["last_error"],
    }


def write_status_file(config: AgentConfig, status: dict) -> None:
    config.work_dir.mkdir(parents=True, exist_ok=True)
    tmp = config.status_file.with_suffix(".json.tmp")
    tmp.write_text(json.dumps(status, indent=2, sort_keys=True), encoding="utf-8")
    tmp.replace(config.status_file)
    with contextlib.suppress(OSError):
        os.chmod(config.status_file, 0o600)


# -------------------------------------------------------------------- loop


def process_file(
    path: Path, config: AgentConfig, state: State, uploader: Uploader, *, sleep
) -> None:
    if state.seen(path):
        return
    if not is_stable(path, sleep=sleep):
        logger.info("still being written, will retry: %s", file_hint(path.name))
        return

    result = uploader.upload(path, sleep=sleep)
    hint = file_hint(path.name)
    if result.outcome is Outcome.UPLOADED:
        state.mark(path, "uploaded")
        logger.info("uploaded %s written=%s %s", hint, result.written, result.detail)
    elif result.outcome is Outcome.PERMANENT:
        reason = f"HTTP {result.status_code}: {result.detail}".strip()
        quarantine(path, config, reason)
        state.mark(path, "quarantined", error=reason)
        logger.error("quarantined %s (%s)", hint, reason)
    elif result.outcome is Outcome.CONFIG_ERROR:
        state.last_error = f"config/auth error uploading {hint}: {result.detail}"
        logger.error(state.last_error)  # file NOT marked — retried once config is fixed
    else:  # TRANSIENT
        state.entries[path.name] = {
            "key": file_key(path),
            "result": "transient_failed",
            "error": result.detail,
            "at": _iso(_now()),
        }
        state.last_error = f"transient error uploading {hint}: {result.detail}"
        logger.warning("transient failure %s: %s (retry next cycle)", hint, result.detail)


def run(
    config: AgentConfig,
    *,
    uploader: Uploader | None = None,
    heartbeat: Heartbeat | None = None,
    once: bool = False,
    max_cycles: int | None = None,
    sleep=time.sleep,
    stop_event: threading.Event | None = None,
) -> int:
    uploader = uploader or Uploader(config)
    heartbeat = heartbeat or Heartbeat(config)
    stop = stop_event or threading.Event()

    config.work_dir.mkdir(parents=True, exist_ok=True)
    state = State.load(config.state_file)

    if not state.baselined:
        baseline = export_files(config.folder)
        state.baseline(baseline)
        state.save()
        logger.info(
            "baseline: %d existing file(s) recorded as seen, none uploaded. "
            "Only files created after now are processed.",
            len(baseline),
        )

    logger.info(
        "watching %s branch_id=%s poll=%ds heartbeat=%ds work_dir=%s version=%s",
        config.folder,
        config.branch_id,
        config.poll_seconds,
        config.heartbeat_seconds,
        config.work_dir,
        AGENT_VERSION,
    )

    last_heartbeat = 0.0
    cycles = 0
    while not stop.is_set():
        cycles += 1
        try:
            for path in export_files(config.folder):
                if stop.is_set():
                    break
                process_file(path, config, state, uploader, sleep=sleep)
            state.save()

            now_mono = time.monotonic()
            if (
                once
                or last_heartbeat == 0.0
                or now_mono - last_heartbeat >= config.heartbeat_seconds
            ):
                status = build_status(
                    config, state, pending=pending_count(config, state, sleep=sleep)
                )
                write_status_file(config, status)
                heartbeat.send(heartbeat_payload(status))
                last_heartbeat = now_mono
        except Exception:  # noqa: BLE001 - one bad cycle must not kill the agent
            logger.exception("cycle failed; continuing")

        if once or (max_cycles is not None and cycles >= max_cycles):
            break
        stop.wait(config.poll_seconds)

    # final snapshot on the way out
    try:
        status = build_status(config, state, pending=pending_count(config, state, sleep=sleep))
        write_status_file(config, status)
        heartbeat.send(heartbeat_payload(status))
    except Exception:  # noqa: BLE001
        logger.exception("final status write failed")
    logger.info("stopped")
    return 0


# ------------------------------------------------------------------- entry


class _RedactFilter(logging.Filter):
    def __init__(self, secret: str):
        super().__init__()
        self._secret = secret

    def filter(self, record: logging.LogRecord) -> bool:
        if not self._secret:
            return True
        # Redact the fully-formatted message (covers %-args and exception
        # objects, not just the format string), then neutralise the args so
        # the handler's own formatting can't re-expand them.
        try:
            rendered = record.getMessage()
        except Exception:  # noqa: BLE001 - never let logging-hygiene raise
            return True
        if self._secret in rendered:
            record.msg = rendered.replace(self._secret, "***")
            record.args = ()
        return True


def _setup_logging(config: AgentConfig) -> None:
    config.log_dir.mkdir(parents=True, exist_ok=True)
    root = logging.getLogger("gymflow.inbody.agent")
    root.setLevel(logging.INFO)
    root.handlers.clear()
    fmt = logging.Formatter("%(asctime)s %(levelname)s %(message)s")

    file_handler = logging.handlers.RotatingFileHandler(
        config.log_dir / "inbody-agent.log", maxBytes=2_000_000, backupCount=5, encoding="utf-8"
    )
    file_handler.setFormatter(fmt)
    stream = logging.StreamHandler()
    stream.setFormatter(fmt)
    for h in (file_handler, stream):
        h.addFilter(_RedactFilter(config.secret))
        root.addHandler(h)


def _install_signal_handlers(stop: threading.Event) -> None:
    def _handler(signum, _frame):
        logger.info("signal %s received, shutting down", signum)
        stop.set()

    for sig in (signal.SIGINT, signal.SIGTERM):
        # not the main thread, or unsupported on this platform
        with contextlib.suppress(ValueError, OSError):
            signal.signal(sig, _handler)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="GymFlow InBody Agent (production).")
    parser.add_argument(
        "--config",
        type=Path,
        default=Path(os.environ.get("INBODY_AGENT_CONFIG", "")) or None,
        help="Path to the agent INI config. Or set INBODY_AGENT_CONFIG.",
    )
    parser.add_argument("--once", action="store_true", help="One pass + one heartbeat, then exit.")
    parser.add_argument(
        "--check",
        action="store_true",
        help="Validate the config, send one heartbeat, and exit 0/1. Used by the installer.",
    )
    parser.add_argument(
        "--print-config", action="store_true", help="Print the resolved config (secret redacted)."
    )
    args = parser.parse_args(argv)

    if args.config is None:
        print("ERROR: --config <path> is required (or set INBODY_AGENT_CONFIG).", file=sys.stderr)
        return 2
    try:
        config = load_config(args.config)
    except ConfigError as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        return 2

    if args.print_config:
        print(json.dumps(config.redacted(), indent=2, sort_keys=True))
        return 0

    _setup_logging(config)

    if args.check:
        logger.info("config OK: %s", json.dumps(config.redacted(), sort_keys=True))
        state = State.load(config.state_file)
        status = build_status(config, state, pending=0)
        ok = Heartbeat(config).send(heartbeat_payload(status))
        logger.info("heartbeat %s", "delivered" if ok else "FAILED")
        return 0 if ok else 1

    stop = threading.Event()
    _install_signal_handlers(stop)
    try:
        return run(config, once=args.once, stop_event=stop)
    except KeyboardInterrupt:
        return 0


if __name__ == "__main__":
    raise SystemExit(main())

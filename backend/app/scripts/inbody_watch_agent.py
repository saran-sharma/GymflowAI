"""InBody watch agent — runs on the GYM PC, not on GymFlow's server.

Watches the folder LookinBody120 auto-exports to (Setup Menu -> "Export Data
as CSV/Image Files") and pushes each new file to GymFlow's ingestion endpoint
over outbound HTTPS. Deliberately the only thing that ever touches that
folder — GymFlow's backend never reaches into the gym PC, and this script
never listens on a port or exposes the folder to the network. See the module
docstring in `app/api/v1/inbody.py` for the server side of this contract.

Standalone by design: this is meant to run on a gym's own Windows/Mac PC,
which will not have GymFlow's backend or its virtualenv installed. Only
Python's standard library plus `requests` (a single, small, pure-Python
dependency — install with `pip install requests`) are used, not FastAPI,
SQLAlchemy, or anything else from `app/`.

Usage:

    python inbody_watch_agent.py \\
        --folder "C:\\LookinBody120\\Export" \\
        --url https://api.gymflow.example \\
        --secret <INBODY_INGEST_SHARED_SECRET> \\
        --branch-id 1

Run it under a process supervisor (Task Scheduler on Windows, launchd on
Mac, or just a terminal left open) — it polls forever until stopped.
"""

from __future__ import annotations

import argparse
import json
import logging
import sys
import time
from pathlib import Path

logger = logging.getLogger("inbody_watch_agent")

SUPPORTED_SUFFIXES = (".csv", ".xlsx")
STABLE_CHECK_DELAY_SECONDS = 2
MAX_RETRIES = 3
RETRY_BACKOFF_SECONDS = 5


def _is_stable(path: Path) -> bool:
    """A file mid-write from LookinBody120 must never be uploaded half-done.
    Two size checks a couple of seconds apart is a simple, dependency-free
    way to tell "still being written" from "done" without any cooperation
    from the exporting software."""
    try:
        size_before = path.stat().st_size
        time.sleep(STABLE_CHECK_DELAY_SECONDS)
        size_after = path.stat().st_size
    except FileNotFoundError:
        return False
    return size_before == size_after and size_before > 0


def _load_state(state_file: Path) -> dict:
    if not state_file.exists():
        return {}
    try:
        return json.loads(state_file.read_text())
    except (json.JSONDecodeError, OSError):
        logger.warning("state file unreadable, starting fresh: %s", state_file)
        return {}


def _save_state(state_file: Path, state: dict) -> None:
    state_file.write_text(json.dumps(state, indent=2))


def _upload(*, url: str, secret: str, branch_id: int, path: Path) -> dict:
    import requests  # imported here so a missing dependency fails loudly at call time

    endpoint = f"{url.rstrip('/')}/api/v1/inbody/ingest/{secret}"
    content_type = (
        "text/csv"
        if path.suffix.lower() == ".csv"
        else ("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
    )
    with path.open("rb") as fh:
        response = requests.post(
            endpoint,
            params={"branch_id": branch_id},
            files={"file": (path.name, fh, content_type)},
            timeout=60,
        )
    response.raise_for_status()
    return response.json()


def _process_one(
    path: Path, *, url: str, secret: str, branch_id: int, processed_dir: Path, quarantine_dir: Path
) -> None:
    if not _is_stable(path):
        logger.info("skipping still-writing file: %s", path.name)
        return

    last_error: Exception | None = None
    for attempt in range(1, MAX_RETRIES + 1):
        try:
            result = _upload(url=url, secret=secret, branch_id=branch_id, path=path)
            logger.info("uploaded %s -> %s", path.name, result)
            path.rename(processed_dir / path.name)
            return
        except Exception as exc:  # noqa: BLE001 - retried below; final failure is quarantined
            last_error = exc
            logger.warning(
                "upload attempt %d/%d failed for %s: %s", attempt, MAX_RETRIES, path.name, exc
            )
            if attempt < MAX_RETRIES:
                time.sleep(RETRY_BACKOFF_SECONDS * attempt)

    logger.error("quarantining %s after %d failed attempts: %s", path.name, MAX_RETRIES, last_error)
    path.rename(quarantine_dir / path.name)


def watch(*, folder: Path, url: str, secret: str, branch_id: int, poll_interval: int) -> None:
    processed_dir = folder / "processed"
    quarantine_dir = folder / "quarantine"
    processed_dir.mkdir(exist_ok=True)
    quarantine_dir.mkdir(exist_ok=True)
    state_file = folder / ".inbody_agent_state.json"
    state = _load_state(state_file)

    logger.info("watching %s (branch_id=%s) every %ds", folder, branch_id, poll_interval)
    while True:
        for path in sorted(folder.iterdir()):
            if not path.is_file() or path.suffix.lower() not in SUPPORTED_SUFFIXES:
                continue
            key = f"{path.name}:{path.stat().st_size}"
            if state.get(path.name) == key:
                continue  # already handled this exact file
            _process_one(
                path,
                url=url,
                secret=secret,
                branch_id=branch_id,
                processed_dir=processed_dir,
                quarantine_dir=quarantine_dir,
            )
            state[path.name] = key
            _save_state(state_file, state)
        time.sleep(poll_interval)


def main() -> None:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
    parser = argparse.ArgumentParser(
        description="Watch a LookinBody120 export folder and push new files to GymFlow."
    )
    parser.add_argument("--folder", required=True, type=Path, help="LookinBody120 export folder")
    parser.add_argument(
        "--url", required=True, help="GymFlow API base URL, e.g. https://api.gymflow.example"
    )
    parser.add_argument("--secret", required=True, help="INBODY_INGEST_SHARED_SECRET")
    parser.add_argument("--branch-id", required=True, type=int)
    parser.add_argument("--poll-interval", type=int, default=30)
    args = parser.parse_args()

    if not args.folder.is_dir():
        print(f"Folder not found: {args.folder}")
        raise SystemExit(1)

    try:
        watch(
            folder=args.folder,
            url=args.url,
            secret=args.secret,
            branch_id=args.branch_id,
            poll_interval=args.poll_interval,
        )
    except KeyboardInterrupt:
        sys.exit(0)


if __name__ == "__main__":
    main()

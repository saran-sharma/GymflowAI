"""InBody watch agent — runs on the GYM PC, not on GymFlow's server.

Watches the folder LookinBody120 auto-exports to (Setup Menu -> "Export Data
as CSV/Image Files") and pushes each new file to GymFlow's ingestion endpoint
over outbound HTTPS. Deliberately the only thing that ever *reads* that
folder — GymFlow's backend never reaches into the gym PC, and this script
never listens on a port or exposes the folder to the network. See the module
docstring in `app/api/v1/inbody.py` for the server side of this contract.

By default it does NOT move, rename, or delete anything in the watched
folder (`--no-move`, on): it is LookinBody's own EMR store. Idempotency
comes from a small state file kept *next to this script*, not in the watched
folder, keyed on name+size+mtime. And by default it ignores every file that
already existed when it started (`--only-new`, on) — the first run captures a
baseline and uploads nothing, so historical exports are never swept up. Use
`--process-existing` (deliberately) for a later back-fill.

Standalone by design: this runs on a gym's own Windows PC, which will not
have GymFlow's backend or its virtualenv. Only Python's standard library
plus `requests` (`pip install requests`) is used.

Auth is a dedicated machine credential — the `--secret`
(`INBODY_INGEST_SHARED_SECRET`) embedded in the URL path. It is NOT a user
login and carries no user's privileges; it only lets this one script POST an
export file to this one endpoint.

Typical Windows run (Task Scheduler, or a terminal left open):

    python inbody_watch_agent.py ^
        --folder "C:\\LookinBody120\\EMR\\CSV" ^
        --url https://<gymflow-host> ^
        --secret <INBODY_INGEST_SHARED_SECRET> ^
        --branch-id 1 ^
        --cacert "C:\\GymFlow\\InBodyAgent\\gymflow-dev.crt"

Controlled first test (one pass, then exit):

    python inbody_watch_agent.py ... --once

Prove server-side de-duplication (send one specific file, ignoring state):

    python inbody_watch_agent.py ... --resend "C:\\LookinBody120\\EMR\\CSV\\<file>.csv"
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


def _file_key(path: Path) -> str:
    st = path.stat()
    return f"{path.name}:{st.st_size}:{int(st.st_mtime)}"


def _is_stable(path: Path) -> bool:
    """A file mid-write from LookinBody120 must never be uploaded half-done.
    Two size checks a couple of seconds apart is a simple, dependency-free
    way to tell "still being written" from "done"."""
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
    tmp = state_file.with_suffix(state_file.suffix + ".tmp")
    tmp.write_text(json.dumps(state, indent=2, sort_keys=True))
    tmp.replace(state_file)


def _export_files(folder: Path) -> list[Path]:
    return sorted(
        p
        for p in folder.iterdir()
        if p.is_file() and p.suffix.lower() in SUPPORTED_SUFFIXES
    )


def _upload(*, url: str, secret: str, branch_id: int, path: Path, verify) -> dict:
    import requests  # imported here so a missing dependency fails loudly at call time

    endpoint = f"{url.rstrip('/')}/api/v1/inbody/ingest/{secret}"
    content_type = (
        "text/csv"
        if path.suffix.lower() == ".csv"
        else "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    )
    with path.open("rb") as fh:
        response = requests.post(
            endpoint,
            params={"branch_id": branch_id},
            files={"file": (path.name, fh, content_type)},
            timeout=60,
            verify=verify,
        )
    response.raise_for_status()
    return response.json()


def _process_one(
    path: Path,
    *,
    url: str,
    secret: str,
    branch_id: int,
    verify,
    state: dict,
    state_file: Path,
    move_processed: bool,
) -> None:
    if not _is_stable(path):
        logger.info("skipping still-writing file: %s", path.name)
        return

    last_error: Exception | None = None
    for attempt in range(1, MAX_RETRIES + 1):
        try:
            result = _upload(
                url=url, secret=secret, branch_id=branch_id, path=path, verify=verify
            )
            logger.info("uploaded %s -> %s", path.name, json.dumps(result, sort_keys=True))
            state[path.name] = {"key": _file_key_safe(path), "result": "uploaded"}
            _save_state(state_file, state)
            if move_processed:
                processed_dir = path.parent / "processed"
                processed_dir.mkdir(exist_ok=True)
                path.rename(processed_dir / path.name)
            return
        except Exception as exc:  # noqa: BLE001 - retried below; final state is "failed"
            last_error = exc
            logger.warning(
                "upload attempt %d/%d failed for %s: %s", attempt, MAX_RETRIES, path.name, exc
            )
            if attempt < MAX_RETRIES:
                time.sleep(RETRY_BACKOFF_SECONDS * attempt)

    logger.error("giving up on %s after %d attempts: %s", path.name, MAX_RETRIES, last_error)
    # No move — the file stays where LookinBody put it. It is marked failed so
    # a later pass retries it once it changes, or an operator can --resend it.
    state[path.name] = {"key": _file_key_safe(path), "result": "failed", "error": str(last_error)}
    _save_state(state_file, state)


def _file_key_safe(path: Path) -> str:
    try:
        return _file_key(path)
    except FileNotFoundError:
        return f"{path.name}:gone"


def _seen(state: dict, path: Path) -> bool:
    entry = state.get(path.name)
    if not isinstance(entry, dict):
        # migrate the old "name -> 'name:size'" string form
        return entry == _file_key_safe(path) if entry is not None else False
    if entry.get("result") == "failed":
        return entry.get("key") == _file_key_safe(path)  # retry once the file changes
    return entry.get("key") == _file_key_safe(path)


def watch(
    *,
    folder: Path,
    url: str,
    secret: str,
    branch_id: int,
    verify,
    poll_interval: int,
    state_file: Path,
    only_new: bool,
    move_processed: bool,
    once: bool,
) -> None:
    state = _load_state(state_file)

    if only_new and not state:
        baseline = _export_files(folder)
        for path in baseline:
            state[path.name] = {"key": _file_key_safe(path), "result": "baseline"}
        _save_state(state_file, state)
        logger.info(
            "baseline captured: %d existing file(s) recorded as seen, none uploaded. "
            "Only files created after now will be processed.",
            len(baseline),
        )

    logger.info(
        "watching %s (branch_id=%s) every %ds | state=%s | move_processed=%s",
        folder,
        branch_id,
        poll_interval,
        state_file,
        move_processed,
    )
    while True:
        for path in _export_files(folder):
            if _seen(state, path):
                continue
            _process_one(
                path,
                url=url,
                secret=secret,
                branch_id=branch_id,
                verify=verify,
                state=state,
                state_file=state_file,
                move_processed=move_processed,
            )
        if once:
            logger.info("--once: single pass complete, exiting.")
            return
        time.sleep(poll_interval)


def resend(*, path: Path, url: str, secret: str, branch_id: int, verify) -> None:
    """Upload one specific file once, ignoring the state file. For proving the
    server de-duplicates: run this twice on the same file — the first import
    writes a BodyComposition, the second is reported DUPLICATE with none."""
    if not path.is_file():
        print(f"File not found: {path}")
        raise SystemExit(1)
    try:
        result = _upload(url=url, secret=secret, branch_id=branch_id, path=path, verify=verify)
    except Exception as exc:  # noqa: BLE001
        print(f"resend failed: {exc}")
        raise SystemExit(1) from exc
    print(json.dumps(result, indent=2, sort_keys=True))


def _resolve_verify(args: argparse.Namespace):
    if args.insecure:
        logger.warning(
            "TLS verification DISABLED (--insecure). Only acceptable on a trusted LAN "
            "for a short test. Use --cacert with the server's certificate instead."
        )
        return False
    if args.cacert:
        if not Path(args.cacert).is_file():
            print(f"--cacert file not found: {args.cacert}")
            raise SystemExit(1)
        return args.cacert
    return True  # system trust store (a real public certificate)


def main() -> None:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
    parser = argparse.ArgumentParser(
        description="Watch a LookinBody120 export folder and push new files to GymFlow."
    )
    parser.add_argument("--folder", required=True, type=Path, help="LookinBody120 export folder")
    parser.add_argument(
        "--url", required=True, help="GymFlow API base URL (https), e.g. https://gymflow.example"
    )
    parser.add_argument("--secret", required=True, help="INBODY_INGEST_SHARED_SECRET (machine credential)")
    parser.add_argument("--branch-id", required=True, type=int)
    parser.add_argument("--poll-interval", type=int, default=30)
    parser.add_argument(
        "--state-file",
        type=Path,
        default=Path(__file__).resolve().with_name("inbody_agent_state.json"),
        help="Where processing state is kept. Default: next to this script, NOT in the watched folder.",
    )
    parser.add_argument(
        "--process-existing",
        action="store_true",
        help="Also process files that already existed at startup (a deliberate back-fill). Off by default.",
    )
    parser.add_argument(
        "--move-processed",
        action="store_true",
        help="Move uploaded files into a 'processed' subfolder. Off by default — the watched folder is not modified.",
    )
    parser.add_argument("--once", action="store_true", help="Do a single pass and exit.")
    parser.add_argument(
        "--resend",
        type=Path,
        metavar="PATH",
        help="Upload exactly this one file once, ignoring state (to prove server-side de-dupe).",
    )
    parser.add_argument("--cacert", help="PEM file to verify the server's TLS certificate against.")
    parser.add_argument(
        "--insecure", action="store_true", help="Skip TLS verification (trusted LAN test only)."
    )
    args = parser.parse_args()

    verify = _resolve_verify(args)

    if args.resend is not None:
        resend(
            path=args.resend,
            url=args.url,
            secret=args.secret,
            branch_id=args.branch_id,
            verify=verify,
        )
        return

    if not args.folder.is_dir():
        print(f"Folder not found: {args.folder}")
        raise SystemExit(1)

    try:
        watch(
            folder=args.folder,
            url=args.url,
            secret=args.secret,
            branch_id=args.branch_id,
            verify=verify,
            poll_interval=args.poll_interval,
            state_file=args.state_file,
            only_new=not args.process_existing,
            move_processed=args.move_processed,
            once=args.once,
        )
    except KeyboardInterrupt:
        sys.exit(0)


if __name__ == "__main__":
    main()


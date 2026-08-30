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

One-time historical back-fill, step 1 — classify everything, write nothing:

    python inbody_watch_agent.py ... --dry-run

Writes a review report next to this script (member_code + Local ID +
measurement time only, no names or phones) and no BodyComposition rows. Read
it before running the real MATCHED-only import.
"""

from __future__ import annotations

import argparse
import contextlib
import json
import logging
import re
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


def _post_dry_run(
    *, url: str, secret: str, branch_id: int, path: Path, verify
) -> tuple[bool, dict]:
    """POST one file with ``dry_run=true``. Returns ``(ok, payload)`` — the
    server's JSON on success, or ``{"error": "..."}`` on any failure — so a
    batch run over hundreds of files is never derailed by one bad file.

    A 429 (the ingest endpoint is rate-limited) is retried a few times with a
    growing back-off, honouring ``Retry-After`` when the server sends it, so a
    whole-folder run rides through the limit rather than losing files to it."""
    import requests

    endpoint = f"{url.rstrip('/')}/api/v1/inbody/ingest/{secret}"
    content_type = (
        "text/csv"
        if path.suffix.lower() == ".csv"
        else "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    )
    for attempt in range(1, MAX_RETRIES + 2):
        try:
            with path.open("rb") as fh:
                response = requests.post(
                    endpoint,
                    params={"branch_id": branch_id, "dry_run": "true"},
                    files={"file": (path.name, fh, content_type)},
                    timeout=60,
                    verify=verify,
                )
            if response.status_code == 429 and attempt <= MAX_RETRIES:
                wait = float(response.headers.get("Retry-After") or RETRY_BACKOFF_SECONDS * attempt)
                time.sleep(wait)
                continue
            if response.status_code >= 400:
                try:
                    detail = str(response.json().get("detail", "") or response.json())
                except Exception:  # noqa: BLE001 - body may not be JSON
                    detail = response.text[:200]
                return False, {"error": f"HTTP {response.status_code}: {detail}"}
            return True, response.json()
        except Exception as exc:  # noqa: BLE001 - reported per-file, never fatal
            if attempt <= MAX_RETRIES:
                time.sleep(RETRY_BACKOFF_SECONDS * attempt)
                continue
            return False, {"error": str(exc)}
    return False, {"error": "exhausted retries (rate limited)"}


def _mask(name: str) -> str:
    """A stable stand-in for a filename in console output — LookinBody names
    its exports after the member's phone/InBody ID, so the real name only ever
    goes into the local report file, never to stdout."""
    import hashlib

    return "file-" + hashlib.sha1(name.encode()).hexdigest()[:8]  # noqa: S324


def dry_run_folder(
    *,
    folder: Path,
    url: str,
    secret: str,
    branch_id: int,
    verify,
    report_path: Path,
    interval: float,
) -> None:
    """Classify every export in ``folder`` against GymFlow without writing a
    thing, and produce the review summary for the one-time historical
    back-fill. Consults and touches no state file. The watched folder is only
    read.

    ``interval`` is the minimum gap between requests — the ingest endpoint is
    rate-limited (default 60/min), so the default 1.1s keeps a whole-folder
    run just under that ceiling instead of losing most files to 429s."""
    files = [
        p
        for p in _export_files(folder)
        if "processed" not in p.parts and "quarantine" not in p.parts
    ]
    eta_min = round(len(files) * interval / 60, 1)
    logger.info(
        "dry run: %d export file(s) under %s (~%s min at %.1fs/file)",
        len(files),
        folder,
        eta_min,
        interval,
    )
    if not files:
        print("No .csv/.xlsx export files found.")
        return

    per_file: dict[str, dict] = {}
    errors: list[tuple[str, str]] = []
    for i, path in enumerate(files, start=1):
        started = time.monotonic()
        ok, payload = _post_dry_run(
            url=url, secret=secret, branch_id=branch_id, path=path, verify=verify
        )
        per_file[path.name] = payload
        if not ok:
            errors.append((path.name, payload.get("error", "unknown error")))
        if i % 100 == 0 or i == len(files):
            logger.info("  ...%d/%d files", i, len(files))
        if i < len(files):
            time.sleep(max(0.0, interval - (time.monotonic() - started)))

    totals = {k: 0 for k in ("matched", "duplicate", "ambiguous", "unmatched", "invalid")}
    total_rows = 0
    members: set[str] = set()
    identity: dict[str, dict] = {}
    earliest: str | None = None
    latest: str | None = None
    schema: dict[str, dict] = {}
    reasons: dict[str, int] = {}

    for name, payload in per_file.items():
        if "counts" not in payload:
            continue
        total_rows += int(payload.get("total_rows", 0))
        for k, v in payload["counts"].items():
            if k in totals:
                totals[k] += int(v)
        fp = payload.get("header_fingerprint") or "none"
        bucket = schema.setdefault(
            fp, {"column_count": payload.get("column_count"), "files": 0, "examples": []}
        )
        bucket["files"] += 1
        if len(bucket["examples"]) < 5:
            bucket["examples"].append(name)
        for r in payload.get("rows", []):
            code = r.get("member_code")
            cls = r["classification"]
            if cls in ("matched", "duplicate") and code:
                members.add(code)
            if cls in ("unmatched", "invalid", "ambiguous"):
                # collapse the last-4-digits / member-code specifics so the
                # shape of the failure is countable
                key = re.sub(r"\d{2,}", "N", r.get("detail", "") or "").strip()
                reasons[f"{cls}: {key}"] = reasons.get(f"{cls}: {key}", 0) + 1
            if cls == "matched":
                ma = r.get("measured_at")
                if ma:
                    earliest = ma if earliest is None or ma < earliest else earliest
                    latest = ma if latest is None or ma > latest else latest
                if code and code not in identity:
                    identity[code] = {
                        "member_code": code,
                        "local_id": r.get("external_ref"),
                        "measured_at": r.get("measured_at"),
                        "source_file": name,
                    }

    report = {
        "generated_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "folder": str(folder),
        "branch_id": branch_id,
        "files_seen": len(files),
        "files_classified": len(files) - len(errors),
        "files_errored": len(errors),
        "total_rows": total_rows,
        "counts": totals,
        "unmatched_invalid_reasons": dict(sorted(reasons.items(), key=lambda kv: -kv[1])),
        "unique_members": len(members),
        "earliest_measurement": earliest,
        "latest_measurement": latest,
        "identity_samples": list(identity.values())[:20],
        "schema_variations": schema,
        "errors": [{"file": n, "error": e} for n, e in errors],
        "per_file": per_file,
    }
    report_path.write_text(json.dumps(report, indent=2, sort_keys=True))
    with contextlib.suppress(OSError):
        report_path.chmod(0o600)

    print("\n===== InBody historical dry run =====")
    print(f"folder                : {folder}")
    print(f"CSV/XLSX files         : {len(files)}")
    print(f"files classified       : {len(files) - len(errors)}")
    print(f"files errored          : {len(errors)}")
    print(f"total rows             : {total_rows}")
    print(f"  matched              : {totals['matched']}")
    print(f"  duplicate            : {totals['duplicate']}")
    print(f"  ambiguous            : {totals['ambiguous']}")
    print(f"  unmatched            : {totals['unmatched']}")
    print(f"  invalid              : {totals['invalid']}")
    print(f"unique members (match) : {len(members)}")
    print(f"earliest measurement   : {earliest or '-'}")
    print(f"latest measurement     : {latest or '-'}")
    print("\nexample identity mappings (member_code  <-  Local ID @ measured_at):")
    for s in list(identity.values())[:10]:
        print(f"  {s['member_code']:<16} <- {str(s['local_id']):<14} @ {s['measured_at']}")
    if reasons:
        print("\nwhy rows did not match (shape of the failure, counts):")
        for key, n in sorted(reasons.items(), key=lambda kv: -kv[1])[:12]:
            print(f"  {n:>5}  {key}")
    print("\nschema variations (header fingerprint -> files):")
    for fp, b in schema.items():
        print(f"  {fp}  cols={b['column_count']}  files={b['files']}  e.g. {b['examples'][:3]}")
    if errors:
        print(f"\n{len(errors)} file(s) errored (details in the report):")
        for name, err in errors[:10]:
            print(f"  {_mask(name)}: {err}")
    print(f"\nFull report written to: {report_path}")
    print("Nothing was written to GymFlow. Review the report before any real import.")


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
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Classify every export in --folder against GymFlow and write a review "
        "report. Writes nothing, touches no state file. Use before the one-time "
        "historical back-fill.",
    )
    parser.add_argument(
        "--report",
        type=Path,
        default=None,
        help="Where --dry-run writes its JSON report. Default: next to this script, "
        "timestamped. Never inside the watched folder.",
    )
    parser.add_argument(
        "--dry-run-interval",
        type=float,
        default=1.1,
        help="Seconds between --dry-run requests. Default 1.1 keeps a full-folder "
        "run just under the ingest endpoint's 60/min rate limit.",
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

    if args.dry_run:
        report_path = args.report or Path(__file__).resolve().with_name(
            "inbody_dryrun_" + time.strftime("%Y%m%dT%H%M%SZ", time.gmtime()) + ".json"
        )
        dry_run_folder(
            folder=args.folder,
            url=args.url,
            secret=args.secret,
            branch_id=args.branch_id,
            verify=verify,
            report_path=report_path,
            interval=args.dry_run_interval,
        )
        return

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


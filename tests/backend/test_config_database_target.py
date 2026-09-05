"""One checkout, one database — whatever directory the process starts in.

``Settings`` used to read ``env_file=(".env", "../.env")``, which is resolved
against the *working directory*. Launching `uvicorn` from the repo root found
no ``.env`` and silently fell back to the ``database_url`` default, while the
same code launched from ``backend/`` read ``backend/.env``. The result was two
separately-populated databases — one of them the one the mobile app was
actually talking to — and an import that appeared to do nothing.

These tests pin the fix: the env files are resolved from ``config.py``'s own
location, and an explicit ``DATABASE_URL`` still wins so CI and this suite can
pin their own database.
"""

from __future__ import annotations

import os
import subprocess
import sys
from pathlib import Path

BACKEND = Path(__file__).resolve().parents[2] / "backend"
REPO_ROOT = BACKEND.parent

_PROBE = "from app.core.config import Settings; print(Settings().database_url)"


def _resolve_from(cwd: Path, env: dict[str, str] | None = None) -> str:
    """Read the settings' database_url in a fresh interpreter under ``cwd``."""
    child = {
        **{k: v for k, v in os.environ.items() if k != "DATABASE_URL"},
        "PYTHONPATH": str(BACKEND),
        **(env or {}),
    }
    out = subprocess.run(
        [sys.executable, "-c", _PROBE],
        cwd=str(cwd),
        env=child,
        capture_output=True,
        text=True,
        timeout=60,
    )
    assert out.returncode == 0, out.stderr
    return out.stdout.strip()


def test_the_database_target_does_not_depend_on_the_working_directory():
    targets = {
        str(cwd): _resolve_from(cwd)
        for cwd in (REPO_ROOT, BACKEND, REPO_ROOT / "database", Path("/tmp"))
    }
    assert len(set(targets.values())) == 1, (
        "The resolved database differs by launch directory — the env_file is "
        f"CWD-relative again: {targets}"
    )


def test_an_explicit_database_url_still_wins():
    """CI and this suite pin their own database through the environment; the
    absolute env_file must not take that away."""
    pinned = "postgresql+psycopg://u:p@localhost:5432/gymflow_pinned_probe"
    assert _resolve_from(REPO_ROOT, {"DATABASE_URL": pinned}) == pinned


def test_the_env_files_are_absolute_paths():
    from app.core.config import Settings

    env_file = Settings.model_config["env_file"]
    assert all(Path(p).is_absolute() for p in env_file), env_file

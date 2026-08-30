"""Where private progress-photo bytes live.

The database never holds a progress image and there is never a public URL for
one. A `ProgressPhoto` row carries an opaque ``storage_key``; this module is
the only thing that turns that key into bytes, and it does so behind an
authenticated, authorisation-checked API endpoint.

The pilot ships `LocalDiskPhotoStorage` — files under a private directory
(`settings.progress_photo_dir`) that is never statically served, written
``0o600`` in ``0o700`` directories. `PhotoStorage` is a Protocol so an
S3/GCS-backed store drops in for production without a schema change or a
change to any caller; that adapter is specced in docs/NEXT_STEPS.md and is
BLOCKED only on a bucket + credentials.

`sign_photo_token` / `verify_photo_token` mint a short-lived HMAC token (same
construction as `app.domain.qr`) so an image URL can be handed to a plain
``<Image>`` that cannot attach an Authorization header. The image endpoint
still enforces full per-request authorisation regardless of the token.
"""

from __future__ import annotations

import base64
import contextlib
import hashlib
import hmac
import os
from datetime import datetime
from pathlib import Path
from typing import BinaryIO, Protocol
from uuid import uuid4

from app.core.clock import now_utc
from app.core.config import settings

_EXT_FOR_TYPE = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
    "image/heic": "heic",
    "image/heif": "heic",
}


class PhotoStorage(Protocol):
    """The contract every backend implements. Keys are opaque to callers."""

    def put(self, key: str, data: bytes, *, content_type: str) -> None: ...

    def open(self, key: str) -> BinaryIO: ...

    def read(self, key: str) -> bytes: ...

    def delete(self, key: str) -> None: ...

    def exists(self, key: str) -> bool: ...


class LocalDiskPhotoStorage:
    """Files under a private directory. The default for development and the
    pilot; a production deploy points `PROGRESS_PHOTO_DIR` at an absolute
    path on a private, ideally encrypted volume."""

    def __init__(self, root: str | Path) -> None:
        self._root = Path(root).expanduser().resolve()

    def _path(self, key: str) -> Path:
        # `key` is built by `build_storage_key` and is always relative with no
        # `..`; verify anyway so a crafted key can never escape the root.
        candidate = (self._root / key).resolve()
        root_prefix = f"{self._root}{os.sep}"
        if not str(candidate).startswith(root_prefix):
            raise ValueError("storage key escapes the storage root")
        return candidate

    def put(self, key: str, data: bytes, *, content_type: str) -> None:
        path = self._path(key)
        path.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
        # Write to a temp sibling then rename, so a reader never sees a
        # half-written file.
        tmp = path.with_suffix(path.suffix + ".part")
        tmp.write_bytes(data)
        os.chmod(tmp, 0o600)
        os.replace(tmp, path)

    def open(self, key: str) -> BinaryIO:
        return self._path(key).open("rb")

    def read(self, key: str) -> bytes:
        return self._path(key).read_bytes()

    def delete(self, key: str) -> None:
        with contextlib.suppress(FileNotFoundError):
            self._path(key).unlink()

    def exists(self, key: str) -> bool:
        return self._path(key).is_file()


def get_photo_storage() -> PhotoStorage:
    """The active store. Constructed per call (cheap) so a test can point
    `settings.progress_photo_dir` at a tmp directory without cache games."""
    return LocalDiskPhotoStorage(settings.progress_photo_dir)


def ext_for_content_type(content_type: str) -> str:
    return _EXT_FOR_TYPE.get(content_type.lower().split(";")[0].strip(), "bin")


def build_storage_key(*, branch_id: int, member_id: int, content_type: str) -> str:
    return f"{branch_id}/{member_id}/{uuid4().hex}.{ext_for_content_type(content_type)}"


# --------------------------------------------------------------- signed URLs

_TOKEN_PREFIX = "GFPP1"


def _b64(raw: bytes) -> str:
    return base64.urlsafe_b64encode(raw).rstrip(b"=").decode()


def _digest(message: str) -> str:
    return _b64(hmac.new(settings.secret_key.encode(), message.encode(), hashlib.sha256).digest())


def sign_photo_token(
    photo_id: int, user_id: int, *, ttl: int | None = None, at: datetime | None = None
) -> str:
    exp = int((at or now_utc()).timestamp()) + (
        ttl if ttl is not None else settings.progress_photo_url_ttl_seconds
    )
    body = f"{_TOKEN_PREFIX}.{photo_id}.{user_id}.{exp}"
    return f"{body}.{_digest(body)}"


def verify_photo_token(token: str, *, at: datetime | None = None) -> tuple[int, int] | None:
    """Returns (photo_id, user_id) when the token is well-formed, correctly
    signed and unexpired; None otherwise."""
    parts = (token or "").split(".")
    if len(parts) != 5 or parts[0] != _TOKEN_PREFIX:
        return None
    try:
        photo_id, user_id, exp = int(parts[1]), int(parts[2]), int(parts[3])
    except ValueError:
        return None
    body = f"{_TOKEN_PREFIX}.{photo_id}.{user_id}.{exp}"
    if not hmac.compare_digest(parts[4], _digest(body)):
        return None
    if int((at or now_utc()).timestamp()) > exp:
        return None
    return photo_id, user_id


# ------------------------------------------------- best-effort image sniffing


def image_dimensions(data: bytes, content_type: str) -> tuple[int | None, int | None]:
    """Pull width/height from the file header without a decode library.

    Covers PNG and baseline JPEG, which is every export the mobile picker
    produces in practice. Returns (None, None) for anything else (WebP/HEIC)
    or a header it cannot read — the columns are nullable and the mobile
    gallery lays out from the rendered image regardless.
    """
    try:
        if content_type.startswith("image/png") and data[:8] == b"\x89PNG\r\n\x1a\n":
            width = int.from_bytes(data[16:20], "big")
            height = int.from_bytes(data[20:24], "big")
            return (width or None, height or None)
        if content_type.startswith("image/jpeg") and data[:2] == b"\xff\xd8":
            i = 2
            n = len(data)
            while i + 9 < n:
                if data[i] != 0xFF:
                    i += 1
                    continue
                marker = data[i + 1]
                if marker in (0xC0, 0xC1, 0xC2, 0xC3, 0xC5, 0xC6, 0xC7, 0xC9, 0xCA, 0xCB):
                    height = int.from_bytes(data[i + 5 : i + 7], "big")
                    width = int.from_bytes(data[i + 7 : i + 9], "big")
                    return (width or None, height or None)
                seg_len = int.from_bytes(data[i + 2 : i + 4], "big")
                if seg_len < 2:
                    break
                i += 2 + seg_len
    except (IndexError, ValueError):
        pass
    return (None, None)


__all__ = [
    "LocalDiskPhotoStorage",
    "PhotoStorage",
    "build_storage_key",
    "ext_for_content_type",
    "get_photo_storage",
    "image_dimensions",
    "sign_photo_token",
    "verify_photo_token",
]

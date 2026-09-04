"""Private progress photos, and the branded card a member may hand to the OS.

The bytes go straight to `app.services.photo_storage` (a private local dir in
the pilot, an object store later) and never touch this database or a public
URL. The row is the member's alone by default — ``trainer_visible`` /
``owner_visible`` are explicit per-photo consent, and a viewer who has that
consent still has to be the member's assigned trainer or same-branch
management. Every read of the bytes is authorised per request and audited.

`build_share_payload` returns *only* the fields the member selected for a
share card. Phone, email, member id, trainer notes and health data are never
in it.
"""

from __future__ import annotations

import contextlib
import hashlib
from datetime import date

from fastapi import Request
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.clock import branch_today, now_utc
from app.core.config import settings
from app.core.deps import MANAGEMENT_ROLES
from app.db.models import (
    Branch,
    Member,
    ProgressPhoto,
    ProgressPhotoAngle,
    ProgressPhotoShare,
    User,
)
from app.services import audit, photo_storage

ACTION_PHOTO_UPLOADED = "progress_photo.uploaded"
ACTION_PHOTO_UPDATED = "progress_photo.updated"
ACTION_PHOTO_DELETED = "progress_photo.deleted"
ACTION_PHOTO_VIEWED = "progress_photo.viewed"
ACTION_PHOTO_SHARED = "progress_photo.shared"

NOTE_MAX = 500
CAPTION_MAX = 280
# Anything not in this set is stripped from a share payload even if the client
# asks for it — a belt to `build_share_payload`'s braces.
SHARE_FIELD_ALLOW = frozenset({"date", "period", "message"})
SHARE_MESSAGE_MAX = 120


class PhotoError(ValueError):
    """A rule the caller broke — mapped to 4xx by the router."""


class PhotoAccessDenied(PermissionError):
    """The viewer may not see this photo — mapped to 403/404 by the router."""


# ------------------------------------------------------------------ upload


def add_photo(
    db: Session,
    *,
    member: Member,
    angle: ProgressPhotoAngle,
    taken_on: date,
    note: str | None,
    data: bytes,
    content_type: str,
    request: Request | None = None,
) -> ProgressPhoto:
    ctype = (content_type or "").lower().split(";")[0].strip()
    if ctype not in settings.progress_photo_allowed_type_list:
        raise PhotoError(f"Unsupported image type: {ctype or 'unknown'}.")
    if not data:
        raise PhotoError("The image is empty.")
    if len(data) > settings.progress_photo_max_bytes:
        raise PhotoError("The image is larger than the allowed size.")
    # "Future" is judged against the member's branch-local date, not UTC: a
    # member picks "today" from their phone's date picker, and near midnight
    # UTC a legitimate local-today is a calendar day ahead of the UTC date.
    branch = db.get(Branch, member.branch_id)
    if taken_on > branch_today(branch.timezone if branch else None):
        raise PhotoError("A photo cannot be dated in the future.")

    key = photo_storage.build_storage_key(
        branch_id=member.branch_id, member_id=member.id, content_type=ctype
    )
    photo_storage.get_photo_storage().put(key, data, content_type=ctype)
    width, height = photo_storage.image_dimensions(data, ctype)

    photo = ProgressPhoto(
        member_id=member.id,
        branch_id=member.branch_id,
        angle=angle,
        taken_on=taken_on,
        note=(note or "").strip()[:NOTE_MAX] or None,
        storage_key=key,
        content_type=ctype,
        byte_size=len(data),
        width=width,
        height=height,
        checksum_sha256=hashlib.sha256(data).hexdigest(),
        trainer_visible=False,
        owner_visible=False,
    )
    db.add(photo)
    db.flush()
    audit.record(
        db,
        action=ACTION_PHOTO_UPLOADED,
        actor=member.user,
        entity_type="progress_photo",
        entity_id=photo.id,
        branch_id=member.branch_id,
        request=request,
        details={"angle": angle.value, "taken_on": taken_on.isoformat(), "bytes": len(data)},
    )
    return photo


# --------------------------------------------------------------- read paths


def list_member_photos(
    db: Session, member: Member, *, angle: ProgressPhotoAngle | None = None
) -> list[ProgressPhoto]:
    stmt = select(ProgressPhoto).where(
        ProgressPhoto.member_id == member.id, ProgressPhoto.deleted_at.is_(None)
    )
    if angle is not None:
        stmt = stmt.where(ProgressPhoto.angle == angle)
    return list(db.scalars(stmt.order_by(ProgressPhoto.taken_on.desc(), ProgressPhoto.id.desc())))


def get_photo(db: Session, photo_id: int) -> ProgressPhoto | None:
    photo = db.get(ProgressPhoto, photo_id)
    if photo is None or photo.deleted_at is not None:
        return None
    return photo


def _is_owning_member(viewer: User, member: Member) -> bool:
    return member.user_id == viewer.id


def _is_assigned_trainer(db: Session, viewer: User, member: Member) -> bool:
    if viewer.role.key != "trainer" or member.assigned_trainer_id is None:
        return False
    trainer = member.assigned_trainer
    return trainer is not None and trainer.user_id == viewer.id


def _is_scoped_management(viewer: User, photo_branch_id: int) -> bool:
    if viewer.role.key not in MANAGEMENT_ROLES:
        return False
    if viewer.role.key in ("owner", "super_admin"):
        return True
    return viewer.branch_id == photo_branch_id


def can_view(db: Session, *, viewer: User, member: Member, photo: ProgressPhoto) -> bool:
    if _is_owning_member(viewer, member):
        return True
    if photo.trainer_visible and _is_assigned_trainer(db, viewer, member):
        return True
    return bool(photo.owner_visible and _is_scoped_management(viewer, photo.branch_id))


def photo_for_viewer(db: Session, *, photo_id: int, viewer: User) -> ProgressPhoto:
    """The single-photo authorisation gate the image endpoint uses. Raises
    `PhotoAccessDenied` for both "not found" and "not permitted" so the two
    are indistinguishable to a caller who should see neither."""
    photo = get_photo(db, photo_id)
    if photo is None:
        raise PhotoAccessDenied("not found")
    member = db.get(Member, photo.member_id)
    if member is None or not can_view(db, viewer=viewer, member=member, photo=photo):
        raise PhotoAccessDenied("not permitted")
    return photo


def photos_visible_to(db: Session, *, viewer: User, member: Member) -> list[ProgressPhoto]:
    """The gallery a trainer or owner sees for a member — only the photos the
    member consented to share with that role."""
    if _is_owning_member(viewer, member):
        return list_member_photos(db, member)
    all_photos = list_member_photos(db, member)
    return [p for p in all_photos if can_view(db, viewer=viewer, member=member, photo=p)]


def signed_image_url(photo: ProgressPhoto, viewer: User) -> str:
    token = photo_storage.sign_photo_token(photo.id, viewer.id)
    return f"{settings.api_v1_prefix}/progress-photos/{photo.id}/image?token={token}"


def record_view(
    db: Session, *, photo: ProgressPhoto, viewer: User, request: Request | None = None
) -> None:
    audit.record(
        db,
        action=ACTION_PHOTO_VIEWED,
        actor=viewer,
        entity_type="progress_photo",
        entity_id=photo.id,
        branch_id=photo.branch_id,
        request=request,
        details={"member_id": photo.member_id},
    )


# ---------------------------------------------------------------- mutations


def update_photo(
    db: Session,
    photo: ProgressPhoto,
    *,
    actor: User,
    note: str | None = None,
    note_set: bool = False,
    trainer_visible: bool | None = None,
    owner_visible: bool | None = None,
    request: Request | None = None,
) -> ProgressPhoto:
    changed: dict[str, object] = {}
    if note_set:
        photo.note = (note or "").strip()[:NOTE_MAX] or None
        changed["note"] = photo.note is not None
    if trainer_visible is not None:
        photo.trainer_visible = bool(trainer_visible)
        changed["trainer_visible"] = photo.trainer_visible
    if owner_visible is not None:
        photo.owner_visible = bool(owner_visible)
        changed["owner_visible"] = photo.owner_visible
    db.flush()
    if changed:
        audit.record(
            db,
            action=ACTION_PHOTO_UPDATED,
            actor=actor,
            entity_type="progress_photo",
            entity_id=photo.id,
            branch_id=photo.branch_id,
            request=request,
            details=changed,
        )
    return photo


def delete_photo(
    db: Session, photo: ProgressPhoto, *, actor: User, request: Request | None = None
) -> None:
    """Soft-delete the row so the member's retract is instant, and purge the
    bytes now. The row stays (invisible to every read) for the audit trail."""
    photo.deleted_at = now_utc()
    photo.trainer_visible = False
    photo.owner_visible = False
    db.flush()
    with contextlib.suppress(OSError):
        photo_storage.get_photo_storage().delete(photo.storage_key)
    audit.record(
        db,
        action=ACTION_PHOTO_DELETED,
        actor=actor,
        entity_type="progress_photo",
        entity_id=photo.id,
        branch_id=photo.branch_id,
        request=request,
        details={"member_id": photo.member_id},
    )


# ------------------------------------------------------------------ share


def _period_label(before: ProgressPhoto, after: ProgressPhoto | None) -> str | None:
    if after is None:
        return None
    days = abs((after.taken_on - before.taken_on).days)
    if days >= 14:
        return f"{days // 7} weeks"
    return f"{days} days"


def build_share_payload(
    db: Session,
    *,
    member: Member,
    photo: ProgressPhoto,
    compare_photo: ProgressPhoto | None,
    caption: str | None,
    fields: dict,
    request: Request | None = None,
) -> tuple[ProgressPhotoShare, dict]:
    """Record the share and return the *sanitised* payload the device renders
    the branded card from. Only the member's selected fields survive; nothing
    identifying or clinical is ever included."""
    caption_text = (caption or "").strip()[:CAPTION_MAX] or None
    wants = {k: v for k, v in (fields or {}).items() if k in SHARE_FIELD_ALLOW}

    row = ProgressPhotoShare(
        member_id=member.id,
        photo_id=photo.id,
        compare_photo_id=compare_photo.id if compare_photo else None,
        template="slam_default",
        caption=caption_text,
        included_fields={k: True for k in wants},
    )
    db.add(row)
    db.flush()

    included: dict[str, str] = {}
    if wants.get("date"):
        latest = compare_photo.taken_on if compare_photo else photo.taken_on
        included["date"] = latest.strftime("%d %b %Y")
    if wants.get("period"):
        label = _period_label(photo, compare_photo)
        if label:
            included["period"] = label
    if wants.get("message"):
        msg = (
            str(wants["message"]).strip()[:SHARE_MESSAGE_MAX]
            if isinstance(wants["message"], str)
            else ""
        )
        if not msg and caption_text:
            msg = caption_text[:SHARE_MESSAGE_MAX]
        if msg:
            included["message"] = msg

    payload = {
        "share_id": row.id,
        "template": "slam_default",
        "brand": {"studio": "SLAM", "product": "GymFlow"},
        "caption": caption_text or "",
        "photo_url": signed_image_url(photo, member.user),
        "compare_photo_url": signed_image_url(compare_photo, member.user)
        if compare_photo
        else None,
        "included": included,
    }
    audit.record(
        db,
        action=ACTION_PHOTO_SHARED,
        actor=member.user,
        entity_type="progress_photo",
        entity_id=photo.id,
        branch_id=member.branch_id,
        request=request,
        details={"share_id": row.id, "included": sorted(included.keys())},
    )
    return row, payload


__all__ = [
    "ACTION_PHOTO_DELETED",
    "ACTION_PHOTO_SHARED",
    "ACTION_PHOTO_UPLOADED",
    "ACTION_PHOTO_VIEWED",
    "PhotoAccessDenied",
    "PhotoError",
    "add_photo",
    "build_share_payload",
    "can_view",
    "delete_photo",
    "get_photo",
    "list_member_photos",
    "photo_for_viewer",
    "photos_visible_to",
    "record_view",
    "signed_image_url",
    "update_photo",
]

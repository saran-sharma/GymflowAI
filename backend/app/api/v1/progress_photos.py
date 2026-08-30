"""Private progress photos: upload, the member's gallery, a consented
trainer/owner view, the authenticated image stream, and the branded-share
record.

The bytes are never in this database and never behind a public URL. Every
route that returns an image URL returns one that only works with a valid
bearer or a short-lived signed token, and the image route re-checks
per-photo authorisation regardless of how the caller authenticated.
"""

from __future__ import annotations

from datetime import date

from fastapi import (
    APIRouter,
    Depends,
    File,
    Form,
    HTTPException,
    Query,
    Request,
    UploadFile,
    status,
)
from fastapi.responses import StreamingResponse
from fastapi.security import HTTPAuthorizationCredentials
from sqlalchemy import select
from sqlalchemy.orm import Session, joinedload

from app.core.deps import (
    assert_branch_access,
    bearer_scheme,
    get_current_user,
)
from app.core.security import decode_token
from app.db.models import Member, ProgressPhoto, ProgressPhotoAngle, RoleKey, User
from app.db.session import get_db
from app.schemas.common import MessageOut
from app.schemas.feedback import (
    ProgressPhotoOut,
    ProgressPhotoUpdateRequest,
    ProgressSharePayloadOut,
    ProgressShareRequest,
)
from app.services import photo_storage, progress_photo_service

router = APIRouter(tags=["progress-photos"])


# --------------------------------------------------------------- helpers


def _current_member(db: Session, user: User) -> Member:
    member = db.scalar(
        select(Member)
        .options(joinedload(Member.user), joinedload(Member.branch))
        .where(Member.user_id == user.id)
    )
    if member is None:
        raise HTTPException(status_code=403, detail="This account is not a member")
    return member


def _load_member(db: Session, member_id: int) -> Member:
    member = db.scalar(
        select(Member)
        .options(joinedload(Member.user), joinedload(Member.assigned_trainer))
        .where(Member.id == member_id)
    )
    if member is None:
        raise HTTPException(status_code=404, detail="Member not found")
    return member


def _photo_out(photo: ProgressPhoto, viewer: User) -> ProgressPhotoOut:
    return ProgressPhotoOut(
        id=photo.id,
        member_id=photo.member_id,
        angle=photo.angle,
        taken_on=photo.taken_on,
        note=photo.note,
        width=photo.width,
        height=photo.height,
        content_type=photo.content_type,
        byte_size=photo.byte_size,
        trainer_visible=photo.trainer_visible,
        owner_visible=photo.owner_visible,
        image_url=progress_photo_service.signed_image_url(photo, viewer),
        created_at=photo.created_at,
    )


def image_viewer(
    photo_id: int,
    token: str | None = Query(default=None),
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
    db: Session = Depends(get_db),
) -> User:
    """Resolve the viewer for the image stream from either a signed token
    (for an `<Image>` that cannot set headers) or a bearer. The token only
    identifies who asked; `progress_photo_service.photo_for_viewer` still
    decides whether they may actually see this photo."""
    if token:
        resolved = photo_storage.verify_photo_token(token)
        if resolved is not None:
            tok_photo_id, tok_user_id = resolved
            if tok_photo_id == photo_id:
                user = db.get(User, tok_user_id)
                if user is not None and user.is_active:
                    return user
    if credentials and credentials.credentials:
        payload = decode_token(credentials.credentials, "access")
        if payload is not None:
            try:
                user = db.get(User, int(payload["sub"]))
            except (KeyError, TypeError, ValueError):
                user = None
            if user is not None and user.is_active:
                return user
    raise HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Not authenticated",
        headers={"WWW-Authenticate": "Bearer"},
    )


# ------------------------------------------------------------ member: mine


@router.post("/members/me/progress-photos", response_model=ProgressPhotoOut, status_code=201)
def upload_progress_photo(
    request: Request,
    file: UploadFile = File(...),
    angle: ProgressPhotoAngle = Form(...),
    taken_on: date = Form(...),
    note: str | None = Form(default=None),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> ProgressPhotoOut:
    member = _current_member(db, user)
    data = file.file.read()
    try:
        photo = progress_photo_service.add_photo(
            db,
            member=member,
            angle=angle,
            taken_on=taken_on,
            note=note,
            data=data,
            content_type=file.content_type or "",
            request=request,
        )
    except progress_photo_service.PhotoError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    return _photo_out(photo, user)


@router.get("/members/me/progress-photos", response_model=list[ProgressPhotoOut])
def my_progress_photos(
    angle: ProgressPhotoAngle | None = Query(default=None),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> list[ProgressPhotoOut]:
    member = _current_member(db, user)
    return [
        _photo_out(p, user)
        for p in progress_photo_service.list_member_photos(db, member, angle=angle)
    ]


@router.get("/members/{member_id}/progress-photos", response_model=list[ProgressPhotoOut])
def member_progress_photos(
    member_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> list[ProgressPhotoOut]:
    """A trainer or owner viewing a member's photos — only the ones the member
    consented to share with that role, and only within branch scope."""
    member = _load_member(db, member_id)
    if user.role.key == RoleKey.MEMBER.value and member.user_id != user.id:
        raise HTTPException(status_code=403, detail="Not permitted")
    if user.role.key != RoleKey.MEMBER.value:
        assert_branch_access(user, member.branch_id)
    return [
        _photo_out(p, user)
        for p in progress_photo_service.photos_visible_to(db, viewer=user, member=member)
    ]


@router.get("/progress-photos/{photo_id}/image")
def progress_photo_image(
    photo_id: int,
    request: Request,
    db: Session = Depends(get_db),
    viewer: User = Depends(image_viewer),
) -> StreamingResponse:
    try:
        photo = progress_photo_service.photo_for_viewer(db, photo_id=photo_id, viewer=viewer)
    except progress_photo_service.PhotoAccessDenied as exc:
        # Same response whether the photo is missing or forbidden.
        raise HTTPException(status_code=404, detail="Not found") from exc

    store = photo_storage.get_photo_storage()
    if not store.exists(photo.storage_key):
        raise HTTPException(status_code=404, detail="Not found")
    progress_photo_service.record_view(db, photo=photo, viewer=viewer, request=request)
    db.commit()

    def _stream():
        with store.open(photo.storage_key) as handle:
            while chunk := handle.read(64 * 1024):
                yield chunk

    return StreamingResponse(
        _stream(),
        media_type=photo.content_type,
        headers={
            "Cache-Control": "private, max-age=300",
            "Content-Disposition": "inline",
            "X-Content-Type-Options": "nosniff",
        },
    )


@router.patch("/progress-photos/{photo_id}", response_model=ProgressPhotoOut)
def update_progress_photo(
    photo_id: int,
    payload: ProgressPhotoUpdateRequest,
    request: Request,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> ProgressPhotoOut:
    member = _current_member(db, user)
    photo = progress_photo_service.get_photo(db, photo_id)
    if photo is None or photo.member_id != member.id:
        raise HTTPException(status_code=404, detail="Not found")
    progress_photo_service.update_photo(
        db,
        photo,
        actor=user,
        note=payload.note,
        note_set=payload.note_set,
        trainer_visible=payload.trainer_visible,
        owner_visible=payload.owner_visible,
        request=request,
    )
    return _photo_out(photo, user)


@router.delete("/progress-photos/{photo_id}", response_model=MessageOut)
def delete_progress_photo(
    photo_id: int,
    request: Request,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> MessageOut:
    member = _current_member(db, user)
    photo = progress_photo_service.get_photo(db, photo_id)
    if photo is None or photo.member_id != member.id:
        raise HTTPException(status_code=404, detail="Not found")
    progress_photo_service.delete_photo(db, photo, actor=user, request=request)
    return MessageOut(message="Photo deleted.")


@router.post("/members/me/progress-photos/share", response_model=ProgressSharePayloadOut)
def share_progress(
    payload: ProgressShareRequest,
    request: Request,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> ProgressSharePayloadOut:
    member = _current_member(db, user)
    photo = progress_photo_service.get_photo(db, payload.photo_id)
    if photo is None or photo.member_id != member.id:
        raise HTTPException(status_code=404, detail="Photo not found")

    compare_photo = None
    if payload.compare_photo_id is not None:
        compare_photo = progress_photo_service.get_photo(db, payload.compare_photo_id)
        if compare_photo is None or compare_photo.member_id != member.id:
            raise HTTPException(status_code=404, detail="Comparison photo not found")

    fields: dict = {}
    if payload.include_date:
        fields["date"] = True
    if payload.include_period:
        fields["period"] = True
    if payload.message:
        fields["message"] = payload.message

    _, out = progress_photo_service.build_share_payload(
        db,
        member=member,
        photo=photo,
        compare_photo=compare_photo,
        caption=payload.caption,
        fields=fields,
        request=request,
    )
    return ProgressSharePayloadOut(**out)


__all__ = ["router"]

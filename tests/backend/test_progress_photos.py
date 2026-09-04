"""Private progress photos: authenticated upload, per-request authorisation on
every read, consent-gated trainer/owner access, branch isolation, deletion,
and a share payload that never leaks anything identifying.
"""

from __future__ import annotations

import json
from datetime import UTC, date, datetime, timedelta

import pytest
from conftest import make_member

from app.core import clock
from app.core.clock import branch_today
from app.core.config import settings
from app.db.models import AuditLog, ProgressPhoto, ProgressPhotoShare
from app.services import photo_storage

API = "/api/v1"

# A genuine 1x1 PNG — valid header, IHDR says 1x1, one IDAT, IEND.
PNG_1x1 = bytes.fromhex(
    "89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c489"
    "0000000d49444154789c6200010000050001"
    "0d0a2db40000000049454e44ae426082"
)


@pytest.fixture(autouse=True)
def _private_store(tmp_path, monkeypatch):
    monkeypatch.setattr(settings, "progress_photo_dir", str(tmp_path / "photos"))
    yield


def _upload(
    client,
    headers,
    *,
    angle="front",
    taken_on=None,
    note=None,
    data=PNG_1x1,
    ctype="image/png",
):
    files = {"file": ("p.png", data, ctype)}
    form = {"angle": angle, "taken_on": (taken_on or date.today()).isoformat()}
    if note is not None:
        form["note"] = note
    return client.post(f"{API}/members/me/progress-photos", headers=headers, files=files, data=form)


# ------------------------------------------------------------------ upload


def test_a_member_uploads_a_private_photo(client, world, auth):
    headers = auth(world["member_ngk_user"])
    response = _upload(client, headers, angle="side", note="week 1")
    assert response.status_code == 201, response.text
    body = response.json()
    assert body["angle"] == "side"
    assert body["note"] == "week 1"
    assert body["trainer_visible"] is False
    assert body["owner_visible"] is False
    assert body["width"] == 1 and body["height"] == 1
    assert body["image_url"].startswith(f"{API}/progress-photos/")
    assert "token=" in body["image_url"]


def test_only_a_member_may_upload(client, world, auth):
    assert _upload(client, auth(world["trainer_ngk_user"])).status_code == 403


def test_the_image_type_is_checked(client, world, auth):
    r = _upload(client, auth(world["member_ngk_user"]), data=b"not an image", ctype="text/plain")
    assert r.status_code == 422


def test_the_size_limit_is_enforced(client, world, auth, monkeypatch):
    monkeypatch.setattr(settings, "progress_photo_max_bytes", 10)
    r = _upload(client, auth(world["member_ngk_user"]), data=PNG_1x1)
    assert r.status_code == 422


def test_a_future_date_is_rejected(client, world, auth):
    r = _upload(
        client,
        auth(world["member_ngk_user"]),
        taken_on=date.today() + timedelta(days=1),
    )
    assert r.status_code == 422


# --------------------------------------------------------- taken_on date semantics
#
# "Future" is judged against the *member's branch-local* date, not the UTC
# date. The seed branch is Asia/Kolkata; these freeze the clock at an instant
# where the IST calendar day is already ahead of the UTC one, which is exactly
# the window the old ``> now_utc().date()`` check wrongly rejected a legitimate
# "today" upload.

# 2026-06-03 20:00 UTC == 2026-06-04 01:30 IST — UTC still on the 3rd, IST on the 4th.
_ACROSS_MIDNIGHT_UTC = datetime(2026, 6, 3, 20, 0, tzinfo=UTC)
_IST = "Asia/Kolkata"


@pytest.fixture
def _at_ist_midnight():
    """Freeze the server clock straddling the UTC/IST date boundary."""
    clock.freeze(_ACROSS_MIDNIGHT_UTC)
    yield
    clock.freeze(None)


def test_todays_photo_in_the_branch_timezone_is_accepted(client, world, auth, _at_ist_midnight):
    """The regression: a member picks today (IST) from the date picker while
    UTC is still on the previous calendar day."""
    headers = auth(world["member_ngk_user"])
    ist_today = branch_today(_IST)
    assert ist_today == date(2026, 6, 4)
    assert ist_today > _ACROSS_MIDNIGHT_UTC.date()  # UTC would have called this "future"

    r = _upload(client, headers, taken_on=ist_today)
    assert r.status_code == 201, r.text
    assert r.json()["taken_on"] == ist_today.isoformat()


def test_the_utc_date_is_still_a_valid_past_date(client, world, auth, _at_ist_midnight):
    """Yesterday in IST is still fine — nothing about the fix rejects real
    historical dates."""
    r = _upload(client, auth(world["member_ngk_user"]), taken_on=_ACROSS_MIDNIGHT_UTC.date())
    assert r.status_code == 201, r.text


def test_a_date_beyond_branch_today_is_still_rejected(client, world, auth, _at_ist_midnight):
    r = _upload(
        client,
        auth(world["member_ngk_user"]),
        taken_on=branch_today(_IST) + timedelta(days=1),
    )
    assert r.status_code == 422


def test_a_valid_historical_date_is_accepted(client, world, auth, _at_ist_midnight):
    r = _upload(
        client,
        auth(world["member_ngk_user"]),
        taken_on=branch_today(_IST) - timedelta(days=45),
    )
    assert r.status_code == 201, r.text


def test_the_bytes_are_not_in_the_database(client, db, world, auth):
    _upload(client, auth(world["member_ngk_user"]))
    photo = db.query(ProgressPhoto).one()
    # The row holds a key, a checksum and dimensions — never the image itself.
    row = {c.name: getattr(photo, c.name) for c in photo.__table__.columns}
    assert PNG_1x1 not in json.dumps(row, default=str).encode()
    assert photo.storage_key and "/" in photo.storage_key


# ------------------------------------------------------ read authorisation


def test_the_owning_member_can_stream_their_image(client, world, auth):
    headers = auth(world["member_ngk_user"])
    url = _upload(client, headers).json()["image_url"]
    got = client.get(url, headers=headers)
    assert got.status_code == 200
    assert got.headers["content-type"].startswith("image/png")
    assert got.content == PNG_1x1


def test_the_image_needs_authentication(client, world, auth):
    url = _upload(client, auth(world["member_ngk_user"])).json()["image_url"].split("?")[0]
    assert client.get(url).status_code == 401


def test_a_stranger_member_is_refused(client, db, world, auth):
    photo_id = _upload(client, auth(world["member_ngk_user"])).json()["id"]
    other, other_user = make_member(db, world["roles"], world["branches"]["ngk"], "Nosy Neighbour")
    db.commit()
    denied = client.get(f"{API}/progress-photos/{photo_id}/image", headers=auth(other_user))
    assert denied.status_code == 404  # indistinguishable from "no such photo"


def test_the_assigned_trainer_needs_the_members_consent(client, world, auth):
    member_headers = auth(world["member_ngk_user"])
    photo = _upload(client, member_headers).json()
    trainer_headers = auth(world["trainer_ngk_user"])

    # Default: private even to the assigned trainer.
    assert client.get(photo["image_url"].split("?")[0], headers=trainer_headers).status_code == 404
    assert (
        client.get(
            f"{API}/members/{world['member_ngk'].id}/progress-photos",
            headers=trainer_headers,
        ).json()
        == []
    )

    # Member consents -> the assigned trainer can now see that photo.
    client.patch(
        f"{API}/progress-photos/{photo['id']}",
        headers=member_headers,
        json={"trainer_visible": True},
    )
    listed = client.get(
        f"{API}/members/{world['member_ngk'].id}/progress-photos",
        headers=trainer_headers,
    ).json()
    assert [p["id"] for p in listed] == [photo["id"]]
    fresh_url = listed[0]["image_url"]
    assert client.get(fresh_url.split("?")[0], headers=trainer_headers).status_code == 200


def test_a_different_branch_trainer_never_sees_the_photo_even_with_consent(client, world, auth):
    member_headers = auth(world["member_ngk_user"])
    photo = _upload(client, member_headers).json()
    client.patch(
        f"{API}/progress-photos/{photo['id']}",
        headers=member_headers,
        json={"trainer_visible": True, "owner_visible": True},
    )
    # The Boganhalli trainer is not this member's assigned trainer and is out of branch.
    bgh_trainer = auth(world["trainer_bgh_user"])
    assert (
        client.get(
            f"{API}/members/{world['member_ngk'].id}/progress-photos",
            headers=bgh_trainer,
        ).status_code
        == 403
    )
    assert client.get(photo["image_url"].split("?")[0], headers=bgh_trainer).status_code == 404


def test_owner_access_is_also_consent_gated(client, world, auth):
    member_headers = auth(world["member_ngk_user"])
    photo = _upload(client, member_headers).json()
    owner_headers = auth(world["owner"])

    assert (
        client.get(
            f"{API}/members/{world['member_ngk'].id}/progress-photos",
            headers=owner_headers,
        ).json()
        == []
    )
    client.patch(
        f"{API}/progress-photos/{photo['id']}",
        headers=member_headers,
        json={"owner_visible": True},
    )
    listed = client.get(
        f"{API}/members/{world['member_ngk'].id}/progress-photos", headers=owner_headers
    ).json()
    assert [p["id"] for p in listed] == [photo["id"]]


def test_a_signed_token_streams_without_a_bearer_but_a_bad_one_does_not(client, world, auth):
    url = _upload(client, auth(world["member_ngk_user"])).json()["image_url"]
    # The signed URL works on its own.
    assert client.get(url).status_code == 200
    # Tampering with the token fails, and with no bearer to fall back to it is a 401.
    assert client.get(url[:-3] + "zzz").status_code == 401


def test_an_expired_token_is_rejected(client, world, auth):
    photo_id = _upload(client, auth(world["member_ngk_user"])).json()["id"]
    member_user_id = world["member_ngk_user"].id
    stale = photo_storage.sign_photo_token(photo_id, member_user_id, ttl=-10)
    assert client.get(f"{API}/progress-photos/{photo_id}/image?token={stale}").status_code == 401


# ------------------------------------------------------------- deletion


def test_delete_is_a_soft_delete_that_purges_the_bytes(client, db, world, auth):
    headers = auth(world["member_ngk_user"])
    photo = _upload(client, headers).json()
    key = db.get(ProgressPhoto, photo["id"]).storage_key
    assert photo_storage.LocalDiskPhotoStorage(settings.progress_photo_dir).exists(key)

    assert client.delete(f"{API}/progress-photos/{photo['id']}", headers=headers).status_code == 200

    row = db.get(ProgressPhoto, photo["id"])
    assert row is not None and row.deleted_at is not None  # kept for the audit trail
    assert not photo_storage.LocalDiskPhotoStorage(settings.progress_photo_dir).exists(key)
    assert client.get(f"{API}/members/me/progress-photos", headers=headers).json() == []
    assert client.get(photo["image_url"].split("?")[0], headers=headers).status_code == 404


def test_a_member_cannot_delete_another_members_photo(client, db, world, auth):
    photo_id = _upload(client, auth(world["member_ngk_user"])).json()["id"]
    _, other_user = make_member(db, world["roles"], world["branches"]["ngk"], "Someone Else")
    db.commit()
    assert (
        client.delete(f"{API}/progress-photos/{photo_id}", headers=auth(other_user)).status_code
        == 404
    )


# --------------------------------------------------------------- share


def test_share_returns_only_the_selected_fields_and_nothing_identifying(client, db, world, auth):
    headers = auth(world["member_ngk_user"])
    before = _upload(
        client, headers, angle="front", taken_on=date.today() - timedelta(days=84)
    ).json()
    after = _upload(client, headers, angle="front", taken_on=date.today()).json()

    response = client.post(
        f"{API}/members/me/progress-photos/share",
        headers=headers,
        json={
            "photo_id": before["id"],
            "compare_photo_id": after["id"],
            "caption": "12 weeks in.",
            "include_date": True,
            "include_period": True,
            "message": "Consistency wins.",
        },
    )
    assert response.status_code == 200, response.text
    payload = response.json()
    assert payload["brand"] == {"studio": "SLAM", "product": "GymFlow"}
    assert payload["caption"] == "12 weeks in."
    assert payload["included"]["period"] == "12 weeks"
    assert "date" in payload["included"]
    assert payload["included"]["message"] == "Consistency wins."
    assert payload["photo_url"] and payload["compare_photo_url"]

    blob = json.dumps(payload)
    member = world["member_ngk"]
    assert member.user.email not in blob
    assert str(member.id) not in blob.replace(str(before["id"]), "").replace(str(after["id"]), "")
    assert "phone" not in blob.lower()

    # The share is recorded with exactly the member's field selection.
    row = db.query(ProgressPhotoShare).one()
    assert set(row.included_fields) == {"date", "period", "message"}


def test_share_withholds_fields_the_member_did_not_pick(client, world, auth):
    headers = auth(world["member_ngk_user"])
    photo = _upload(client, headers).json()
    payload = client.post(
        f"{API}/members/me/progress-photos/share",
        headers=headers,
        json={"photo_id": photo["id"], "caption": "just me"},
    ).json()
    assert payload["included"] == {}
    assert payload["caption"] == "just me"


def test_share_of_another_members_photo_is_refused(client, db, world, auth):
    photo_id = _upload(client, auth(world["member_ngk_user"])).json()["id"]
    _, other_user = make_member(db, world["roles"], world["branches"]["ngk"], "Not Me")
    db.commit()
    r = client.post(
        f"{API}/members/me/progress-photos/share",
        headers=auth(other_user),
        json={"photo_id": photo_id},
    )
    assert r.status_code == 404


# ------------------------------------------------------------- auditing


def test_upload_view_and_delete_are_audited(client, db, world, auth):
    headers = auth(world["member_ngk_user"])
    photo = _upload(client, headers).json()
    client.get(photo["image_url"], headers=headers)
    client.delete(f"{API}/progress-photos/{photo['id']}", headers=headers)

    actions = {
        a.action for a in db.query(AuditLog).filter(AuditLog.entity_type == "progress_photo").all()
    }
    assert {
        "progress_photo.uploaded",
        "progress_photo.viewed",
        "progress_photo.deleted",
    } <= actions

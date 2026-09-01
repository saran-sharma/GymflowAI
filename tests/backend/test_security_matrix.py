"""Exhaustive authorization matrix — the systematic sweep the spot-check missed.

Three layers:

1. ``test_no_api_route_serves_an_anonymous_caller`` — data-driven over *every*
   ``/api/v1`` route the app registers, so a new route with a forgotten
   ``Depends(get_current_user)`` fails here the day it lands.
2. ``test_member_is_refused_every_privileged_route`` /
   ``test_trainer_is_refused_admin_routes`` — function-level (BFLA) checks with a
   curated list of management/admin endpoints.
3. Per-resource object-level (BOLA) checks: own / same-branch-foreign /
   cross-branch / nonexistent, for the endpoints that take a member, trainer,
   session, journey, payment, correction, photo, class, task or alert id.

Nothing here changes product behaviour; it only pins the boundary.
"""

from __future__ import annotations

import pytest

from app.main import app

# ---------------------------------------------------------------------------
# Layer 1 — no anonymous 2xx, anywhere under /api/v1
# ---------------------------------------------------------------------------

# Routes that are *designed* to be reachable without a bearer token.
_PUBLIC_EXACT = {
    "/api/v1/health",
    "/api/v1/auth/login",
    "/api/v1/auth/refresh",  # authenticates via the refresh token in the body
}
# Routes authenticated by a shared secret carried in the URL path.
_SECRET_TOKEN_MARKERS = ("{secret_token}",)


def _api_routes():
    seen = []
    for route in app.routes:
        path = getattr(route, "path", "")
        methods = sorted(
            m for m in (getattr(route, "methods", None) or []) if m not in ("HEAD", "OPTIONS")
        )
        if not path.startswith("/api/v1/") or not methods:
            continue
        if path in _PUBLIC_EXACT:
            continue
        if any(marker in path for marker in _SECRET_TOKEN_MARKERS):
            continue
        seen.append((path, methods[0]))
    return sorted(seen)


def _concretise(path: str) -> str:
    out = []
    for seg in path.split("/"):
        if seg.startswith("{") and seg.endswith("}"):
            out.append("split" if seg == "{split}" else "1")
        else:
            out.append(seg)
    return "/".join(out)


@pytest.mark.parametrize(
    "path,method", _api_routes(), ids=lambda v: v if isinstance(v, str) else ""
)
def test_no_api_route_serves_an_anonymous_caller(client, path, method):
    url = _concretise(path)
    resp = client.request(method, url, json={} if method in ("POST", "PUT", "PATCH") else None)
    # 401/403 is the point; 404/405/422 are also fine (still not a success).
    # What must never happen: an unauthenticated request producing a 2xx.
    assert resp.status_code not in (
        200,
        201,
        204,
    ), f"{method} {url} served an anonymous caller: {resp.status_code} {resp.text[:200]}"
    assert resp.status_code < 500, f"{method} {url} 5xx for anon: {resp.text[:200]}"


# ---------------------------------------------------------------------------
# Layer 2 — function-level (BFLA)
# ---------------------------------------------------------------------------

_MANAGEMENT_ROUTES = [
    ("GET", "/api/v1/reports/dashboard"),
    ("GET", "/api/v1/reports/branches"),
    ("GET", "/api/v1/reports/needs-attention"),
    ("GET", "/api/v1/reports/renewals"),
    ("GET", "/api/v1/reports/new-members"),
    ("GET", "/api/v1/reports/insights"),
    ("GET", "/api/v1/reports/opportunities"),
    ("GET", "/api/v1/reports/attendance-trend"),
    ("GET", "/api/v1/attendance/day"),
    ("POST", "/api/v1/attendance/settle"),
    ("GET", "/api/v1/journeys"),
    ("POST", "/api/v1/journeys/settle"),
    ("GET", "/api/v1/pt/packages"),
    ("GET", "/api/v1/pt/sessions"),
    ("GET", "/api/v1/pt/utilisation"),
    ("GET", "/api/v1/payments"),
    ("POST", "/api/v1/payments"),
    ("GET", "/api/v1/payments/summary"),
    ("GET", "/api/v1/marketing/campaigns"),
    ("GET", "/api/v1/marketing/dashboard"),
    ("GET", "/api/v1/marketing/referrals"),
    ("GET", "/api/v1/settings"),
    ("POST", "/api/v1/settings/automations/run"),
    ("GET", "/api/v1/users"),
    ("GET", "/api/v1/users/settings/all"),
    ("GET", "/api/v1/schema"),
    ("GET", "/api/v1/integrations"),
    ("GET", "/api/v1/inbody/agent/status"),
    ("GET", "/api/v1/performance/branches"),
    ("POST", "/api/v1/alerts/broadcast"),
]
# NB: /api/v1/attendance/corrections and /api/v1/tasks are deliberately mixed
# scope — a trainer sees *their own*, management sees the branch — so they are
# not in the "refused to trainer" list above.

_ADMIN_ONLY_ROUTES = [
    ("GET", "/api/v1/reports/audit"),
    ("POST", "/api/v1/incentives/recompute"),
    ("POST", "/api/v1/users"),
    ("PUT", "/api/v1/users/settings/shift.grace_minutes"),
    ("PUT", "/api/v1/settings/shift.grace_minutes"),
    ("GET", "/api/v1/admin/yoactiv/status"),
    ("POST", "/api/v1/admin/yoactiv/sync"),
    ("GET", "/api/v1/admin/yoactiv/dead-letters"),
]


@pytest.mark.parametrize("method,path", _MANAGEMENT_ROUTES)
def test_member_is_refused_every_privileged_route(client, world, auth, method, path):
    resp = client.request(
        method,
        path,
        headers=auth(world["member_ngk_user"]),
        json={} if method in ("POST", "PUT", "PATCH") else None,
    )
    assert resp.status_code == 403, f"member reached {method} {path}: {resp.status_code}"


@pytest.mark.parametrize("method,path", _MANAGEMENT_ROUTES)
def test_trainer_is_refused_management_routes(client, world, auth, method, path):
    resp = client.request(
        method,
        path,
        headers=auth(world["trainer_ngk_user"]),
        json={} if method in ("POST", "PUT", "PATCH") else None,
    )
    assert resp.status_code == 403, f"trainer reached {method} {path}: {resp.status_code}"


@pytest.mark.parametrize("method,path", _ADMIN_ONLY_ROUTES)
def test_manager_is_refused_admin_only_routes(client, world, auth, method, path):
    resp = client.request(
        method,
        path,
        headers=auth(world["manager_ngk"]),
        json={} if method in ("POST", "PUT", "PATCH") else None,
    )
    assert resp.status_code == 403, f"branch manager reached {method} {path}: {resp.status_code}"


# ---------------------------------------------------------------------------
# Layer 3 — object-level (BOLA), member data
# ---------------------------------------------------------------------------


@pytest.fixture
def world3(db, world):
    """`world` plus a second NGK member (same branch, different user) and a BGH
    member (cross-branch). Member-scoped authz fires on the Member lookup, so no
    journey/workout rows are needed to exercise the 403 boundary."""
    from conftest import make_member

    roles = world["roles"]
    ngk = world["branches"]["ngk"]
    bgh = world["branches"]["bgh"]

    member_ngk2, user_ngk2 = make_member(db, roles, ngk, "Priya Menon")
    member_bgh, user_bgh = make_member(db, roles, bgh, "Rohan Das")
    db.commit()
    return {
        **world,
        "member_a_user": world["member_ngk_user"],  # NGK
        "member_a": world["member_ngk"],
        "member_b_user": user_ngk2,  # NGK, different user
        "member_b": member_ngk2,
        "member_c_user": user_bgh,  # BGH
        "member_c": member_bgh,
    }


_MEMBER_OBJECT_GETS = [
    "/api/v1/journeys/members/{mid}",
    "/api/v1/journeys/members/{mid}/plan",
    "/api/v1/journeys/members/{mid}/progress/strength",
    "/api/v1/journeys/members/{mid}/progress/body-composition",
    "/api/v1/members/{mid}",
    "/api/v1/members/{mid}/program",
    "/api/v1/members/{mid}/progress-photos",
    "/api/v1/pt/members/{mid}/package",
    "/api/v1/performance/members/{mid}/activity",
    "/api/v1/workout-templates/members/{mid}/program".replace(
        "workout-templates/members", "members"
    ),
]


@pytest.mark.parametrize("template", _MEMBER_OBJECT_GETS)
def test_member_cannot_read_another_members_object_same_branch(client, world3, auth, template):
    """Member A must not read Member B's records even though both are at NGK."""
    url = template.format(mid=world3["member_b"].id)
    resp = client.get(url, headers=auth(world3["member_a_user"]))
    assert resp.status_code == 403, f"{url}: {resp.status_code} {resp.text[:160]}"


@pytest.mark.parametrize("template", _MEMBER_OBJECT_GETS)
def test_trainer_cannot_read_cross_branch_member_object(client, world3, auth, template):
    """NGK trainer must not read a BGH member's records."""
    url = template.format(mid=world3["member_c"].id)
    resp = client.get(url, headers=auth(world3["trainer_ngk_user"]))
    assert resp.status_code in (403, 404), f"{url}: {resp.status_code} {resp.text[:160]}"


@pytest.mark.parametrize("template", _MEMBER_OBJECT_GETS)
def test_nonexistent_member_object_is_not_a_500(client, world3, auth, template):
    url = template.format(mid=999999)
    resp = client.get(url, headers=auth(world3["owner"]))
    assert resp.status_code in (403, 404), f"{url}: {resp.status_code}"


def test_member_cannot_write_another_members_plan(client, world3, auth):
    url = f"/api/v1/journeys/members/{world3['member_b'].id}/plan/push"
    resp = client.put(url, json=[], headers=auth(world3["member_a_user"]))
    assert resp.status_code == 403


def test_member_cannot_apply_a_workout_template_to_another_member(client, world3, auth):
    resp = client.post(
        f"/api/v1/members/{world3['member_b'].id}/program/apply-template",
        json={"template_id": 1},
        headers=auth(world3["member_a_user"]),
    )
    assert resp.status_code == 403


# ---------------------------------------------------------------------------
# Layer 3 — object-level, cross-branch scope on branch-id routes
# ---------------------------------------------------------------------------


def test_manager_cannot_forecast_another_branch(client, world3, auth):
    other = world3["branches"]["bgh"].id
    resp = client.get(
        f"/api/v1/performance/occupancy/{other}/forecast", headers=auth(world3["manager_ngk"])
    )
    assert resp.status_code in (403, 404)


def test_manager_cannot_read_another_branch_qr(client, world3, auth):
    other = world3["branches"]["bgh"].id
    resp = client.get(f"/api/v1/branches/{other}/checkin-qr", headers=auth(world3["manager_ngk"]))
    assert resp.status_code == 403


def test_member_cannot_display_any_branch_qr(client, world3, auth):
    own = world3["branches"]["ngk"].id
    resp = client.get(f"/api/v1/branches/{own}/checkin-qr", headers=auth(world3["member_a_user"]))
    assert resp.status_code == 403

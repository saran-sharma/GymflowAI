"""Payments: the charge, the settlement, and who may see either.

GymFlow had no money model at all before this, so these tests pin the parts
that would be expensive to get wrong: that settling is idempotent-by-refusal
rather than silently double-counting, that pending debt is not hidden by the
reporting window, and that a member sees their own bill and nobody else's.
"""

from __future__ import annotations

from datetime import timedelta

from app.core.clock import branch_today
from app.db.models import Payment, PaymentKind, PaymentMethod, PaymentStatus

API = "/api/v1"


def _charge(client, headers, member_id, **overrides):
    body = {
        "member_id": member_id,
        "kind": "membership",
        "amount": 4500,
        **overrides,
    }
    return client.post(f"{API}/payments", headers=headers, json=body)


def test_a_charge_starts_pending_and_records_nothing_collected(client, world, auth):
    """A charge exists the moment SLAM asks for it; collection is a separate act."""
    response = _charge(client, auth(world["admin"]), world["member_ngk"].id)
    assert response.status_code == 201

    body = response.json()
    assert body["status"] == "pending"
    assert body["paid_at"] is None
    assert body["collected_by_user_id"] is None
    assert body["amount"] == 4500


def test_recording_a_settled_charge_stamps_who_took_it(client, world, auth):
    admin = world["admin"]
    response = _charge(client, auth(admin), world["member_ngk"].id, status="paid", method="upi")
    body = response.json()
    assert body["status"] == "paid"
    assert body["paid_at"] is not None
    assert body["collected_by_user_id"] == admin.id


def test_settling_moves_a_charge_once_and_refuses_the_second_time(client, world, auth):
    headers = auth(world["admin"])
    created = _charge(client, headers, world["member_ngk"].id).json()

    first = client.post(
        f"{API}/payments/{created['id']}/settle", headers=headers, json={"method": "cash"}
    )
    assert first.status_code == 200
    assert first.json()["status"] == "paid"
    assert first.json()["method"] == "cash"

    # Double-settling is how revenue gets counted twice.
    second = client.post(
        f"{API}/payments/{created['id']}/settle", headers=headers, json={"method": "cash"}
    )
    assert second.status_code == 409


def test_a_duplicate_receipt_number_is_refused(client, world, auth):
    headers = auth(world["admin"])
    _charge(client, headers, world["member_ngk"].id, receipt_no="SLAM-0001")
    again = _charge(client, headers, world["member_ngk"].id, receipt_no="SLAM-0001")
    assert again.status_code == 409


def test_the_summary_separates_collected_from_outstanding(client, db, world, auth):
    headers = auth(world["admin"])
    member = world["member_ngk"].id

    _charge(client, headers, member, amount=4500, status="paid", method="upi")
    _charge(client, headers, member, amount=1200, kind="pt")

    summary = client.get(f"{API}/payments/summary?days=30", headers=headers).json()
    assert summary["collected_total"] == 4500
    assert summary["pending_total"] == 1200

    by_kind = {line["kind"]: line for line in summary["lines"]}
    assert by_kind["membership"]["collected"] == 4500
    assert by_kind["pt"]["pending"] == 1200


def test_old_debt_still_counts_as_outstanding(client, db, world, auth):
    """An unpaid invoice from March is this month's problem, not March's."""
    headers = auth(world["admin"])
    created = _charge(client, headers, world["member_ngk"].id, amount=999).json()

    stale = db.get(Payment, created["id"])
    stale.created_at = stale.created_at - timedelta(days=200)
    stale.due_on = branch_today(None) - timedelta(days=180)
    db.commit()

    summary = client.get(f"{API}/payments/summary?days=30", headers=headers).json()
    assert summary["pending_total"] == 999


def test_a_member_sees_their_own_charges(client, world, auth):
    _charge(client, auth(world["admin"]), world["member_ngk"].id, amount=4500)
    mine = client.get(f"{API}/payments/me", headers=auth(world["member_ngk_user"])).json()
    assert len(mine) == 1
    assert mine[0]["amount"] == 4500


def test_a_member_cannot_raise_or_settle_a_charge(client, world, auth):
    member_headers = auth(world["member_ngk_user"])
    assert _charge(client, member_headers, world["member_ngk"].id).status_code == 403

    created = _charge(client, auth(world["admin"]), world["member_ngk"].id).json()
    settle = client.post(
        f"{API}/payments/{created['id']}/settle", headers=member_headers, json={"method": "cash"}
    )
    assert settle.status_code == 403


def test_a_member_cannot_list_everyone_elses_payments(client, world, auth):
    response = client.get(f"{API}/payments", headers=auth(world["member_ngk_user"]))
    assert response.status_code == 403


def test_a_charge_against_an_unknown_member_is_refused(client, world, auth):
    response = _charge(client, auth(world["admin"]), 99999)
    assert response.status_code == 404


def test_pt_revenue_can_be_attributed_to_a_trainer(client, world, auth):
    """Trainer revenue must be answerable without inferring it from the package."""
    headers = auth(world["admin"])
    trainer = world["trainer_ngk"]
    created = _charge(
        client,
        headers,
        world["member_ngk"].id,
        kind="pt",
        amount=12000,
        trainer_id=trainer.id,
        status="paid",
        method="card",
    ).json()
    assert created["trainer_id"] == trainer.id
    assert created["trainer_name"] == "Vikas Menon"


def test_the_enums_cover_what_slam_actually_sells(client, world, auth):
    assert {k.value for k in PaymentKind} == {
        "membership",
        "pt",
        "group_class",
        "renewal",
        "addon",
    }
    assert PaymentStatus.PENDING.value == "pending"
    assert PaymentMethod.UPI.value == "upi"

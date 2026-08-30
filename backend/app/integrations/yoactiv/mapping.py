"""Parse Yoactiv Data API rows into typed, normalized shapes.

Every field name and every example value here comes from the response bodies
saved in SLAM's own Postman collection (``Yoactiv_Data_Api.postman_collection``)
— nothing is guessed. Yoactiv dates are ``dd-MM-yyyy``; times appear as
``hh:mm AM/PM``. A row that cannot be parsed into its dataclass is not
silently dropped: the sync layer records it as a dead letter.
"""

from __future__ import annotations

import hashlib
from dataclasses import dataclass, field
from datetime import date, datetime, time
from typing import Any

_DMY = ("%d-%m-%Y",)
_DMY_HM = ("%d-%m-%Y %I:%M %p", "%d-%m-%Y %H:%M", "%d-%m-%Y %I:%M:%S %p")
_HM = ("%I:%M %p", "%H:%M", "%I:%M:%S %p")


def parse_dmy(value: Any) -> date | None:
    text = _clean(value)
    if not text:
        return None
    for fmt in _DMY:
        try:
            return datetime.strptime(text, fmt).date()
        except ValueError:
            continue
    return None


def parse_dmy_datetime(value: Any) -> datetime | None:
    text = _clean(value)
    if not text:
        return None
    for fmt in (*_DMY_HM, *_DMY):
        try:
            return datetime.strptime(text, fmt)
        except ValueError:
            continue
    return None


def parse_clock(value: Any) -> time | None:
    text = _clean(value)
    if not text:
        return None
    for fmt in _HM:
        try:
            return datetime.strptime(text, fmt).time()
        except ValueError:
            continue
    return None


def _clean(value: Any) -> str:
    if value is None:
        return ""
    text = str(value).strip()
    return "" if text in {"-", "--", "NA", "N/A"} else text


def _num(value: Any) -> float | None:
    text = _clean(value)
    if not text:
        return None
    try:
        return float(text.replace(",", ""))
    except ValueError:
        return None


def _int(value: Any) -> int | None:
    n = _num(value)
    return int(n) if n is not None else None


# --------------------------------------------------------------- checkins


@dataclass(frozen=True)
class YoactivCheckin:
    member_id: int
    name: str
    mobile: str
    email: str
    attendance_date: date
    clock_in: time | None
    clock_out: time | None
    service_card_id: int | None
    service_name: str
    is_pt: bool
    medium: str
    pt_staff: str
    raw: dict[str, Any] = field(default_factory=dict)

    @property
    def external_key(self) -> str:
        basis = "|".join(
            str(part)
            for part in (
                self.member_id,
                self.attendance_date.isoformat(),
                self.clock_in.isoformat() if self.clock_in else "",
                self.clock_out.isoformat() if self.clock_out else "",
                self.service_card_id or "",
            )
        )
        return "yoactiv:checkin:" + hashlib.sha1(basis.encode()).hexdigest()  # noqa: S324 - dedup key, not security


def parse_checkin(row: dict[str, Any]) -> YoactivCheckin:
    member_id = _int(row.get("Member_ID"))
    attendance_date = parse_dmy(row.get("Attendance_Date"))
    if member_id is None:
        raise ValueError("checkin row has no numeric Member_ID")
    if attendance_date is None:
        raise ValueError("checkin row has an unparseable Attendance_Date")
    return YoactivCheckin(
        member_id=member_id,
        name=_clean(row.get("Name")),
        mobile=_clean(row.get("Mobile")),
        email=_clean(row.get("Mail_ID")),
        attendance_date=attendance_date,
        clock_in=parse_clock(row.get("clockIn")),
        clock_out=parse_clock(row.get("clockOut")),
        service_card_id=_int(row.get("Service_card_id")),
        service_name=_clean(row.get("service_name")),
        is_pt=_clean(row.get("PT_service")).lower() == "yes",
        medium=_clean(row.get("Medium/Staff")),
        pt_staff=_clean(row.get("PT_Staff")),
        raw=row,
    )


# --------------------------------------------------------------- invoices


@dataclass(frozen=True)
class YoactivBilledService:
    description: str
    duration: str
    base_fee: float | None
    start_date: date | None
    end_date: date | None


@dataclass(frozen=True)
class YoactivInvoice:
    bill_id: int
    member_id: int
    name: str
    mobile: str
    email: str
    purchase_date: date | None
    final_amount: float | None
    paid_amount: float | None
    pt_name: str
    services: tuple[YoactivBilledService, ...]
    raw: dict[str, Any] = field(default_factory=dict)

    @property
    def external_key(self) -> str:
        return f"yoactiv:invoice:{self.bill_id}"

    @property
    def latest_service_end(self) -> date | None:
        ends = [s.end_date for s in self.services if s.end_date is not None]
        return max(ends) if ends else None


def parse_invoice(row: dict[str, Any]) -> YoactivInvoice:
    bill_id = _int(row.get("bill_id"))
    member_id = _int(row.get("Member_Id") or row.get("Member_ID"))
    if bill_id is None:
        raise ValueError("invoice row has no numeric bill_id")
    if member_id is None:
        raise ValueError("invoice row has no numeric Member_Id")
    services = tuple(
        YoactivBilledService(
            description=_clean(s.get("Description")),
            duration=_clean(s.get("Duration")),
            base_fee=_num(s.get("Base_fee")),
            start_date=parse_dmy(s.get("Start_date")),
            end_date=parse_dmy(s.get("End_date")),
        )
        for s in row.get("Billed_Services", []) or []
        if isinstance(s, dict)
    )
    return YoactivInvoice(
        bill_id=bill_id,
        member_id=member_id,
        name=_clean(row.get("Name")),
        mobile=_clean(row.get("Mobile")),
        email=_clean(row.get("Mail_Id") or row.get("Mail_ID")),
        purchase_date=parse_dmy(row.get("Purchase_date")),
        final_amount=_num(row.get("Final_Amount")),
        paid_amount=_num(row.get("Paid")),
        pt_name=_clean(row.get("PT_Name")),
        services=services,
        raw=row,
    )


# ----------------------------------------------- secondary (P1) endpoints


@dataclass(frozen=True)
class YoactivEnquiry:
    enquiry_id: int
    date: date | None
    name: str
    mobile: str
    email: str
    stage: str
    converted: bool
    raw: dict[str, Any] = field(default_factory=dict)

    @property
    def external_key(self) -> str:
        return f"yoactiv:enquiry:{self.enquiry_id}"


def parse_enquiry(row: dict[str, Any]) -> YoactivEnquiry:
    enquiry_id = _int(row.get("Enquiry_ID"))
    if enquiry_id is None:
        raise ValueError("enquiry row has no numeric Enquiry_ID")
    return YoactivEnquiry(
        enquiry_id=enquiry_id,
        date=parse_dmy(row.get("Enquiry_Date")),
        name=_clean(row.get("Name")),
        mobile=_clean(row.get("Mobile")),
        email=_clean(row.get("Mail_ID")),
        stage=_clean(row.get("Enquiry_Stage")),
        converted=str(row.get("Convert_to_member")).strip() == "1",
        raw=row,
    )


@dataclass(frozen=True)
class YoactivFollowup:
    call_id: int
    member_id: int | None
    name: str
    mobile: str
    call_type: str
    call_status: str
    contacted: bool
    raw: dict[str, Any] = field(default_factory=dict)

    @property
    def external_key(self) -> str:
        return f"yoactiv:followup:{self.call_id}"


def parse_followup(row: dict[str, Any]) -> YoactivFollowup:
    call_id = _int(row.get("Call_ID"))
    if call_id is None:
        raise ValueError("followup row has no numeric Call_ID")
    return YoactivFollowup(
        call_id=call_id,
        member_id=_int(row.get("Member_ID")),
        name=_clean(row.get("Name")),
        mobile=_clean(row.get("Mobile")),
        call_type=_clean(row.get("Calltype")),
        call_status=_clean(row.get("Call_Status")),
        contacted=_clean(row.get("Contacted")).lower() == "yes",
        raw=row,
    )


@dataclass(frozen=True)
class YoactivPTTrial:
    member_id: int
    name: str
    mobile: str
    email: str
    trial_purchase_date: date | None
    pt_purchase_date: date | None
    trial_service: str
    pt_service: str
    raw: dict[str, Any] = field(default_factory=dict)

    @property
    def external_key(self) -> str:
        basis = f"{self.member_id}|{self.pt_purchase_date}|{self.pt_service}"
        return "yoactiv:pttrial:" + hashlib.sha1(basis.encode()).hexdigest()  # noqa: S324


def parse_pt_trial(row: dict[str, Any]) -> YoactivPTTrial:
    member_id = _int(row.get("Member_ID"))
    if member_id is None:
        raise ValueError("ptTrialConversion row has no numeric Member_ID")
    return YoactivPTTrial(
        member_id=member_id,
        name=_clean(row.get("Name")),
        mobile=_clean(row.get("Mobile")),
        email=_clean(row.get("Mail_ID")),
        trial_purchase_date=parse_dmy(row.get("Trial_Purchase_date")),
        pt_purchase_date=parse_dmy(row.get("PT_Purchase_date")),
        trial_service=_clean(row.get("Trial_service_name")),
        pt_service=_clean(row.get("PT_Service")),
        raw=row,
    )


__all__ = [
    "YoactivBilledService",
    "YoactivCheckin",
    "YoactivEnquiry",
    "YoactivFollowup",
    "YoactivInvoice",
    "YoactivPTTrial",
    "parse_checkin",
    "parse_clock",
    "parse_dmy",
    "parse_dmy_datetime",
    "parse_enquiry",
    "parse_followup",
    "parse_invoice",
    "parse_pt_trial",
]

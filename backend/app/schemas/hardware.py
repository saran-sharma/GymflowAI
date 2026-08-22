"""Schemas for fingerprint hardware administration.

Split out of ``common`` because this surface (device registry, member
enrollment mapping) is staff configuration for one specific integration, not
part of the everyday member/trainer API shape the rest of ``common`` serves.
"""

from __future__ import annotations

from pydantic import BaseModel, ConfigDict, Field


class ORMModel(BaseModel):
    model_config = ConfigDict(from_attributes=True)


# ------------------------------------------------------------------ devices


class FingerprintDeviceCreate(BaseModel):
    branch_id: int
    device_number: int = Field(ge=0)
    serial: str = Field(min_length=1, max_length=64)
    label: str = Field(min_length=1, max_length=120)
    ip_address: str | None = Field(default=None, max_length=64)
    tcp_port: int | None = Field(default=None, ge=1, le=65535)


class FingerprintDeviceOut(ORMModel):
    id: int
    branch_id: int
    device_number: int
    serial: str
    label: str
    ip_address: str | None
    tcp_port: int | None
    is_active: bool


# -------------------------------------------------------------- enrollments


class FingerprintEnrollmentCreate(BaseModel):
    member_id: int
    device_id: int
    enrolled_id: str = Field(min_length=1, max_length=32)


class FingerprintEnrollmentOut(ORMModel):
    id: int
    member_id: int
    branch_id: int
    device_id: int
    enrolled_id: str


__all__ = [
    "FingerprintDeviceCreate",
    "FingerprintDeviceOut",
    "FingerprintEnrollmentCreate",
    "FingerprintEnrollmentOut",
]

from __future__ import annotations

import re
from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.models.domain import DkimStatus, DomainStatus

DOMAIN_PATTERN = re.compile(
    r"^(?=.{1,255}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$"
)


class DNSRecord(BaseModel):
    type: str = Field(..., examples=["CNAME", "TXT"])
    name: str
    value: str
    ttl: int = 300
    purpose: str | None = Field(default=None, examples=["dkim", "spf", "dmarc"])
    status: str = "pending"


class DomainCreate(BaseModel):
    name: str = Field(..., examples=["example.com"], min_length=3, max_length=255)

    @field_validator("name")
    @classmethod
    def normalize_domain(cls, value: str) -> str:
        domain = value.strip().lower().rstrip(".")
        if domain.startswith("*."):
            raise ValueError("Wildcard domains are not supported")
        if not DOMAIN_PATTERN.match(domain):
            raise ValueError("Invalid domain name")
        return domain


class DomainResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    user_id: UUID
    name: str
    status: DomainStatus
    dkim_status: DkimStatus
    ses_identity_arn: str | None = None
    dns_records: list[DNSRecord] = Field(default_factory=list)
    verified_at: datetime | None = None
    created_at: datetime
    updated_at: datetime


class DomainListResponse(BaseModel):
    items: list[DomainResponse]
    total: int


class DomainVerifyResponse(BaseModel):
    id: UUID
    name: str
    status: DomainStatus
    dkim_status: DkimStatus
    verified: bool
    dns_records: list[DNSRecord] = Field(default_factory=list)

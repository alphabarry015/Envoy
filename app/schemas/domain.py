from __future__ import annotations

import re
from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.models.domain import DkimStatus, DomainStatus

DOMAIN_PATTERN = re.compile(
    r"^(?=.{1,255}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$"
)
ALLOWED_DOMAIN_PROVIDERS = frozenset({"ses", "resend", "brevo", "mailtrap"})


def _normalize_providers(value: list[str] | None) -> list[str]:
    cleaned = [item.strip().lower() for item in (value or []) if item and item.strip()]
    if not cleaned:
        raise ValueError("Select at least one sending tool.")
    unknown = [item for item in cleaned if item not in ALLOWED_DOMAIN_PROVIDERS]
    if unknown or len(set(cleaned)) != len(cleaned):
        raise ValueError("Unknown sending provider.")
    # Ordre stable pour l'UI.
    order = ("ses", "resend", "brevo", "mailtrap")
    return [item for item in order if item in cleaned]


class DNSRecord(BaseModel):
    type: str = Field(..., examples=["CNAME", "TXT", "MX"])
    name: str
    value: str
    ttl: int = 300
    purpose: str | None = Field(default=None, examples=["dkim", "spf", "dmarc"])
    status: str = "pending"
    source: str | None = Field(
        default=None,
        description="Sending tool that owns this record: ses | brevo | resend",
        examples=["ses", "brevo", "resend"],
    )
    priority: int | None = Field(
        default=None,
        description="MX priority when type is MX",
    )


class DomainCreate(BaseModel):
    name: str = Field(..., examples=["example.com"], min_length=3, max_length=255)
    providers: list[str] = Field(
        default_factory=lambda: ["ses"],
        min_length=1,
        examples=[["ses", "resend"]],
    )

    @field_validator("name")
    @classmethod
    def normalize_domain(cls, value: str) -> str:
        domain = value.strip().lower().rstrip(".")
        if domain.startswith("*."):
            raise ValueError("Wildcard domains are not supported")
        if not DOMAIN_PATTERN.match(domain):
            raise ValueError("Invalid domain name")
        return domain

    @field_validator("providers")
    @classmethod
    def known_providers(cls, value: list[str]) -> list[str]:
        return _normalize_providers(value)


class DomainProvidersUpdate(BaseModel):
    providers: list[str] = Field(..., min_length=1)

    @field_validator("providers")
    @classmethod
    def known_providers(cls, value: list[str]) -> list[str]:
        return _normalize_providers(value)


class DomainResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    user_id: UUID
    name: str
    providers: list[str] = Field(default_factory=lambda: ["ses"])
    status: DomainStatus
    dkim_status: DkimStatus
    ses_identity_arn: str | None = None
    dns_records: list[DNSRecord] = Field(default_factory=list)
    verified_at: datetime | None = None
    created_at: datetime
    updated_at: datetime
    region: str = "us-east-2"
    nameservers: list[str] = Field(default_factory=list)
    mail_from: str = ""
    tool_warnings: list[str] = Field(
        default_factory=list,
        description="Outils mal liés / DNS indisponibles après sync",
    )


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

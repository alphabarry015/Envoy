from __future__ import annotations

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, EmailStr, Field


class EmailLogResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    message_id: str
    ses_message_id: str | None = None
    provider: str | None = None
    from_address: str
    to_addresses: list[str]
    cc_addresses: list[str] = Field(default_factory=list)
    bcc_addresses: list[str] = Field(default_factory=list)
    subject: str
    status: str
    error_message: str | None = None
    html: str | None = None
    text: str | None = None
    domain: str | None = None
    api_key_prefix: str | None = None
    created_at: datetime
    sent_at: datetime | None = None


class SuppressionResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    email: str
    reason: str
    source: str
    created_at: datetime


class SuppressionCreate(BaseModel):
    email: EmailStr
    reason: str = Field(default="manual", pattern="^(hard_bounce|complaint|unsubscribe|manual)$")

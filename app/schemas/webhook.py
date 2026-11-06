from __future__ import annotations

from datetime import datetime
from urllib.parse import urlparse
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator

WEBHOOK_EVENTS = {
    "email.sent",
    "email.delivered",
    "email.bounced",
    "email.complained",
    "email.failed",
    "email.suppressed",
}


def _normalize_url(value: str) -> str:
    parsed = urlparse(value.strip())
    host = (parsed.hostname or "").lower()
    local = host in {"localhost", "127.0.0.1"}
    if parsed.scheme == "https" or (parsed.scheme == "http" and local):
        return parsed.geturl()
    raise ValueError("Use an https URL. http is only allowed on localhost.")


class WebhookStatusUpdate(BaseModel):
    active: bool


class WebhookWrite(BaseModel):
    name: str = Field(..., min_length=1, max_length=120)
    url: str = Field(..., min_length=8, max_length=2048)
    events: list[str] = Field(..., min_length=1)

    @field_validator("url")
    @classmethod
    def valid_url(cls, value: str) -> str:
        return _normalize_url(value)

    @field_validator("events")
    @classmethod
    def known_events(cls, value: list[str]) -> list[str]:
        unknown = [event for event in value if event not in WEBHOOK_EVENTS]
        if unknown or len(set(value)) != len(value):
            raise ValueError("Unknown webhook event.")
        return value


class WebhookResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    name: str
    url: str
    events: list[str]
    secret_prefix: str
    is_active: bool
    created_at: datetime
    updated_at: datetime


class WebhookCreatedResponse(WebhookResponse):
    """Secret en clair, renvoyé une seule fois."""

    secret: str

from __future__ import annotations

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.services.url_guard import UnsafeUrlError, check_url_syntax

WEBHOOK_EVENTS = {
    "email.sent",
    "email.delivered",
    "email.bounced",
    "email.complained",
    "email.failed",
    "email.suppressed",
}


def _normalize_url(value: str) -> str:
    try:
        return check_url_syntax(value)
    except UnsafeUrlError as exc:
        raise ValueError(str(exc)) from exc


class WebhookStatusUpdate(BaseModel):
    active: bool


class WebhookWrite(BaseModel):
    name: str = Field(..., min_length=1, max_length=120)
    url: str = Field(..., min_length=8, max_length=2048)
    events: list[str] = Field(..., min_length=1)
    providers: list[str] | None = None

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

    @field_validator("providers")
    @classmethod
    def known_providers(cls, value: list[str] | None) -> list[str] | None:
        if value is None:
            return None
        allowed = {"ses", "resend", "brevo", "mailtrap"}
        cleaned = [item.strip().lower() for item in value if item and item.strip()]
        if not cleaned:
            return None
        unknown = [item for item in cleaned if item not in allowed]
        if unknown or len(set(cleaned)) != len(cleaned):
            raise ValueError("Unknown provider filter.")
        return cleaned


class WebhookResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    name: str
    url: str
    events: list[str]
    providers: list[str] | None = None
    secret_prefix: str
    is_active: bool
    created_at: datetime
    updated_at: datetime


class WebhookCreatedResponse(WebhookResponse):
    """Secret en clair, renvoyé une seule fois."""

    secret: str

from __future__ import annotations

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel


class OverviewActivity(BaseModel):
    id: UUID
    message_id: str
    subject: str
    status: str
    created_at: datetime


class OverviewResponse(BaseModel):
    sends_today: int
    daily_send_quota: int | None
    domains_live: int
    max_domains: int | None
    active_api_keys: int
    bounce_rate: float
    recent: list[OverviewActivity]

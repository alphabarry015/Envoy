from __future__ import annotations

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel


class OverviewActivity(BaseModel):
    id: UUID
    message_id: str
    subject: str
    status: str
    provider: str | None = None
    kind: str = "api"
    created_at: datetime


class OverviewAllTime(BaseModel):
    total: int = 0
    by_status: dict[str, int] = {}
    by_provider: dict[str, int] = {}


class OverviewResponse(BaseModel):
    sends_today: int
    daily_send_quota: int | None
    domains_live: int
    max_domains: int | None
    active_api_keys: int
    bounce_rate: float
    recent: list[OverviewActivity]
    recent_page: int = 1
    recent_page_size: int = 10
    recent_total: int = 0
    all_time: OverviewAllTime = OverviewAllTime()

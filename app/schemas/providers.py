from __future__ import annotations

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, Field


class ProviderUsage(BaseModel):
    sent_today: int = 0
    sent_month: int = 0
    failovers_today: int = 0


class ProviderDomainStats(BaseModel):
    """Domaines liés dans Envoy vs présents chez l'outil (ce que le service offre)."""

    connected: int = 0
    offered: int = 0
    """True when `offered` was read from the remote tool API."""
    offered_known: bool = False


class ProviderStatusCounts(BaseModel):
    queued: int = 0
    sent: int = 0
    delivered: int = 0
    bounced: int = 0
    complained: int = 0
    failed: int = 0
    suppressed: int = 0


class ProviderItem(BaseModel):
    id: str
    label: str
    enabled: bool
    connected: bool
    """True si l'outil peut provisionner / vérifier un domaine (DNS)."""
    domain_capable: bool = True
    role: str
    sort_order: int
    daily_limit: int | None = None
    monthly_limit: int | None = None
    usage: ProviderUsage = Field(default_factory=ProviderUsage)
    domains: ProviderDomainStats = Field(default_factory=ProviderDomainStats)
    testing: bool = False


class ProviderWebhookLink(BaseModel):
    tool: str
    expected_url: str
    linked: bool = False
    remote_id: str | int | None = None
    remote_url: str | None = None
    active: bool | None = None
    detail: str | None = None
    secret_configured: bool = False
    ensured: bool = False
    created: bool = False
    # Returned only once when Envoy creates the remote webhook.
    signing_secret_once: str | None = None


class ProviderConnection(BaseModel):
    api_ok: bool = False
    api_detail: str | None = None
    webhook: ProviderWebhookLink | None = None


class ProviderRecentSend(BaseModel):
    id: UUID
    message_id: str
    subject: str
    status: str
    from_address: str
    created_at: datetime


class ProviderDetailResponse(ProviderItem):
    remaining_today: int | None = None
    remaining_month: int | None = None
    status_today: ProviderStatusCounts = Field(default_factory=ProviderStatusCounts)
    status_month: ProviderStatusCounts = Field(default_factory=ProviderStatusCounts)
    recent: list[ProviderRecentSend] = Field(default_factory=list)
    policy: str
    effective_order: list[str]
    connection: ProviderConnection | None = None


class ProvidersResponse(BaseModel):
    policy: str
    autofailover: bool = True
    effective_order: list[str]
    items: list[ProviderItem]


class ProviderPatchItem(BaseModel):
    id: str
    enabled: bool | None = None
    sort_order: int | None = None
    daily_limit: int | None = Field(default=None, ge=1)
    monthly_limit: int | None = Field(default=None, ge=1)
    clear_daily_limit: bool = False
    clear_monthly_limit: bool = False


class ProvidersUpdateRequest(BaseModel):
    items: list[ProviderPatchItem] = Field(default_factory=list)

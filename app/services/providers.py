from __future__ import annotations

import asyncio
from datetime import datetime, timedelta, timezone

from sqlalchemy import func, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.models.email_log import EmailLog, EmailStatus
from app.models.provider_setting import ProviderSetting
from app.providers.base import PROVIDER_IDS
from app.providers.factory import (
    build_chain,
    build_provider_map,
    clear_email_router_cache,
    default_fallback_order,
)
from app.schemas.providers import (
    ProviderConnection,
    ProviderDetailResponse,
    ProviderDomainStats,
    ProviderItem,
    ProviderRecentSend,
    ProviderStatusCounts,
    ProviderWebhookLink,
    ProvidersResponse,
    ProviderUsage,
    ProvidersUpdateRequest,
)
from app.services import brevo_domains, inbound_webhooks, platform_mail
from app.services.domains import remote_name_sets

_LABELS = {
    "ses": "Amazon SES",
    "resend": "Resend",
    "brevo": "Brevo",
    "mailtrap": "Mailtrap",
}

_COUNTED = (
    EmailStatus.QUEUED,
    EmailStatus.SENT,
    EmailStatus.DELIVERED,
    EmailStatus.BOUNCED,
    EmailStatus.COMPLAINED,
)


class ProviderServiceError(Exception):
    def __init__(self, status_code: int, detail: str) -> None:
        self.status_code = status_code
        self.detail = detail
        super().__init__(detail)


async def list_providers(db: AsyncSession, *, with_health: bool = True) -> ProvidersResponse:
    await _ensure_rows(db)
    rows = {
        row.provider: row
        for row in (await db.execute(select(ProviderSetting))).scalars().all()
    }
    providers = build_provider_map()
    usage = await _usage_by_provider(db)
    remote = await remote_name_sets()
    domain_stats = await _domain_stats_by_provider(db, remote)

    enabled = {name: rows[name].enabled if name in rows else True for name in PROVIDER_IDS}
    fallback = sorted(
        (name for name in PROVIDER_IDS if name != "ses"),
        key=lambda name: (rows[name].sort_order if name in rows else 100, name),
    )
    chain = build_chain(enabled=enabled, fallback_order=fallback)
    effective = [item.name for item in chain]
    connected_map = {name: providers[name].is_configured() for name in PROVIDER_IDS}
    failures = await _recent_failures(db) if with_health else {}
    remote_issues = dict(
        zip(
            PROVIDER_IDS,
            await asyncio.gather(
                *(
                    platform_mail.sending_issues(name)
                    if with_health and connected_map[name] and rows[name].enabled
                    else _no_issues()
                    for name in PROVIDER_IDS
                )
            ),
        )
    )

    items: list[ProviderItem] = []
    for name in PROVIDER_IDS:
        row = rows[name]
        connected = connected_map[name]
        domain_capable = _domain_capable(name, connected, remote)
        issues = (
            _issues(
                connected=connected,
                enabled=row.enabled,
                domain_capable=domain_capable,
                remote=remote_issues[name],
                failure=failures.get(name),
            )
            if with_health
            else []
        )
        role = _role(name, enabled[name], connected, effective)
        stats = usage.get(name, ProviderUsage())
        items.append(
            ProviderItem(
                id=name,
                label=_LABELS[name],
                enabled=row.enabled,
                connected=connected,
                domain_capable=domain_capable,
                role=role,
                sort_order=row.sort_order,
                daily_limit=row.daily_limit,
                monthly_limit=row.monthly_limit,
                usage=stats,
                domains=domain_stats.get(name, ProviderDomainStats()),
                testing=name == "mailtrap",
                healthy=with_health and not issues,
                issues=issues,
            )
        )
    items.sort(key=lambda item: (0 if item.id == "ses" else 1, item.sort_order, item.id))
    return ProvidersResponse(
        policy=settings.provider_policy,
        autofailover=True,
        effective_order=effective,
        items=items,
    )


async def get_provider(db: AsyncSession, provider_id: str) -> ProviderDetailResponse:
    provider_id = provider_id.strip().lower()
    if provider_id not in PROVIDER_IDS:
        raise ProviderServiceError(404, "Provider not found.")

    listing = await list_providers(db)
    item = next((row for row in listing.items if row.id == provider_id), None)
    if item is None:
        raise ProviderServiceError(404, "Provider not found.")

    now = datetime.now(timezone.utc)
    day_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    month_start = day_start.replace(day=1)

    status_today = await _status_counts(db, provider_id, day_start)
    status_month = await _status_counts(db, provider_id, month_start)
    recent_rows = (
        await db.execute(
            select(EmailLog)
            .where(EmailLog.provider == provider_id)
            .order_by(EmailLog.created_at.desc())
            .limit(12)
        )
    ).scalars().all()

    remaining_today = None
    if item.daily_limit is not None:
        remaining_today = max(item.daily_limit - item.usage.sent_today, 0)
    remaining_month = None
    if item.monthly_limit is not None:
        remaining_month = max(item.monthly_limit - item.usage.sent_month, 0)

    probe = await inbound_webhooks.probe_api(provider_id)
    hook = await inbound_webhooks.webhook_status(provider_id)
    connection = ProviderConnection(
        api_ok=bool(probe.get("ok")),
        api_detail=str(probe.get("detail") or "") or None,
        webhook=ProviderWebhookLink(
            **{k: v for k, v in hook.items() if k in ProviderWebhookLink.model_fields and v is not None}
        ),
    )

    return ProviderDetailResponse(
        **item.model_dump(),
        remaining_today=remaining_today,
        remaining_month=remaining_month,
        status_today=status_today,
        status_month=status_month,
        recent=[
            ProviderRecentSend(
                id=row.id,
                message_id=row.message_id,
                subject=row.subject,
                status=row.status.value if hasattr(row.status, "value") else str(row.status),
                from_address=row.from_address,
                created_at=row.created_at,
            )
            for row in recent_rows
        ],
        policy=listing.policy,
        effective_order=listing.effective_order,
        connection=connection,
    )


async def ensure_provider_webhook(provider_id: str) -> ProviderWebhookLink:
    provider_id = provider_id.strip().lower()
    if provider_id not in PROVIDER_IDS:
        raise ProviderServiceError(404, "Provider not found.")
    try:
        result = await inbound_webhooks.ensure_webhook(provider_id)
    except inbound_webhooks.InboundWebhookError as exc:
        raise ProviderServiceError(exc.status_code, exc.detail) from exc
    fields = {k: v for k, v in result.items() if k in ProviderWebhookLink.model_fields and v is not None}
    return ProviderWebhookLink(**fields)


async def update_providers(db: AsyncSession, payload: ProvidersUpdateRequest) -> ProvidersResponse:
    await _ensure_rows(db)
    rows = {
        row.provider: row
        for row in (await db.execute(select(ProviderSetting))).scalars().all()
    }
    for item in payload.items:
        if item.id not in PROVIDER_IDS:
            raise ProviderServiceError(422, f"Unknown provider: {item.id}")
        row = rows[item.id]
        if item.enabled is not None:
            row.enabled = item.enabled
        if item.sort_order is not None:
            row.sort_order = item.sort_order
        if item.clear_daily_limit:
            row.daily_limit = None
        elif item.daily_limit is not None:
            row.daily_limit = item.daily_limit
        if item.clear_monthly_limit:
            row.monthly_limit = None
        elif item.monthly_limit is not None:
            row.monthly_limit = item.monthly_limit
        row.updated_at = datetime.now(timezone.utc)
    await db.commit()
    clear_email_router_cache()
    return await list_providers(db)


async def _ensure_rows(db: AsyncSession) -> None:
    existing = set((await db.execute(select(ProviderSetting.provider))).scalars().all())
    defaults = {
        "ses": 0,
        **{name: (index + 1) * 10 for index, name in enumerate(default_fallback_order())},
    }
    created = False
    for name in PROVIDER_IDS:
        if name in existing:
            continue
        db.add(
            ProviderSetting(
                provider=name,
                enabled=True,
                sort_order=defaults.get(name, 100),
            )
        )
        created = True
    if created:
        await db.commit()


async def _usage_by_provider(db: AsyncSession) -> dict[str, ProviderUsage]:
    now = datetime.now(timezone.utc)
    day_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    month_start = day_start.replace(day=1)
    result = await db.execute(
        select(
            EmailLog.provider,
            func.count().filter(EmailLog.created_at >= day_start),
            func.count().filter(EmailLog.created_at >= month_start),
        )
        .where(EmailLog.provider.is_not(None), EmailLog.status.in_(_COUNTED))
        .group_by(EmailLog.provider)
    )
    usage: dict[str, ProviderUsage] = {name: ProviderUsage() for name in PROVIDER_IDS}
    for provider, day_count, month_count in result.all():
        if provider not in usage:
            usage[str(provider)] = ProviderUsage()
        usage[str(provider)] = ProviderUsage(
            sent_today=int(day_count or 0),
            sent_month=int(month_count or 0),
        )
    return usage


async def _status_counts(
    db: AsyncSession,
    provider_id: str,
    since: datetime,
) -> ProviderStatusCounts:
    result = await db.execute(
        select(EmailLog.status, func.count())
        .where(EmailLog.provider == provider_id, EmailLog.created_at >= since)
        .group_by(EmailLog.status)
    )
    counts = ProviderStatusCounts()
    for status, total in result.all():
        key = status.value if hasattr(status, "value") else str(status)
        if hasattr(counts, key):
            setattr(counts, key, int(total or 0))
    return counts


async def _no_issues() -> list[str]:
    return []


async def _recent_failures(db: AsyncSession) -> dict[str, tuple[int, str | None]]:
    """Failed sends of the last 24 hours per tool: (count, latest error)."""
    since = datetime.now(timezone.utc) - timedelta(hours=24)
    rows = (
        await db.execute(
            select(EmailLog.provider, EmailLog.error_message)
            .where(
                EmailLog.provider.is_not(None),
                EmailLog.status == EmailStatus.FAILED,
                EmailLog.created_at >= since,
            )
            .order_by(EmailLog.created_at.desc())
        )
    ).all()
    failures: dict[str, tuple[int, str | None]] = {}
    for provider, error in rows:
        count, latest = failures.get(str(provider), (0, error))
        failures[str(provider)] = (count + 1, latest)
    return failures


def _issues(
    *,
    connected: bool,
    enabled: bool,
    domain_capable: bool,
    remote: list[str],
    failure: tuple[int, str | None] | None,
) -> list[str]:
    if not connected:
        return ["No API key is set for this tool in Envoy."]
    issues: list[str] = []
    if not enabled:
        issues.append("Disabled in Envoy: no email is sent with it.")
    issues.extend(remote)
    if not domain_capable:
        issues.append("The key can send but cannot add or verify domains.")
    if failure:
        count, latest = failure
        detail = f" Last error: {latest[:160]}" if latest else ""
        issues.append(f"{count} send{'s' if count > 1 else ''} failed in the last 24 hours.{detail}")
    return issues


def _role(name: str, enabled: bool, connected: bool, effective: list[str]) -> str:
    if not enabled:
        return "off"
    if not connected:
        return "not_configured"
    if name not in effective:
        return "skipped"
    index = effective.index(name)
    if index == 0:
        return "primary"
    return f"fallback_{index}"


def _domain_capable(name: str, connected: bool, remote: dict[str, set[str] | None]) -> bool:
    """Indique si l'outil peut réellement provisionner un domaine (pas seulement envoyer)."""
    if not connected:
        return False
    if name == "ses":
        return True
    if name == "brevo":
        return brevo_domains.is_configured()
    # Resend send-only keys and Mailtrap tokens without domain scope cannot list domains.
    return remote.get(name) is not None


async def _domain_stats_by_provider(
    db: AsyncSession, remote: dict[str, set[str] | None]
) -> dict[str, ProviderDomainStats]:
    """Envoy-linked domains vs domains currently hosted on each tool."""
    connected_counts = await _envoy_domain_counts(db)
    offered = {name: (len(names) if names is not None else None) for name, names in remote.items()}
    out: dict[str, ProviderDomainStats] = {}
    for name in PROVIDER_IDS:
        connected = connected_counts.get(name, 0)
        remote = offered.get(name)
        if remote is None:
            # SES / unreachable: fall back to Envoy count so the UI still shows a ratio.
            out[name] = ProviderDomainStats(
                connected=connected,
                offered=connected,
                offered_known=False,
            )
        else:
            out[name] = ProviderDomainStats(
                connected=connected,
                offered=remote,
                offered_known=True,
            )
    return out


async def _envoy_domain_counts(db: AsyncSession) -> dict[str, int]:
    result = await db.execute(
        text(
            """
            SELECT lower(elem) AS provider, COUNT(*)::int AS total
            FROM domains, jsonb_array_elements_text(providers) AS elem
            GROUP BY lower(elem)
            """
        )
    )
    counts: dict[str, int] = {name: 0 for name in PROVIDER_IDS}
    for provider, total in result.all():
        key = str(provider or "").strip().lower()
        if key in counts:
            counts[key] = int(total or 0)
    return counts


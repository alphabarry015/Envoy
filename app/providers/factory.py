from __future__ import annotations

from functools import lru_cache

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import Settings, get_settings
from app.models.provider_setting import ProviderSetting
from app.providers.base import PROVIDER_IDS, BaseEmailProvider
from app.providers.brevo import BrevoProvider
from app.providers.mailtrap import MailtrapProvider
from app.providers.resend import ResendProvider
from app.providers.router import EmailRouter
from app.providers.ses import SesProvider
from app.services.aws_ses import get_ses_service


def build_provider_map(settings: Settings | None = None) -> dict[str, BaseEmailProvider]:
    cfg = settings or get_settings()
    return {
        # Reuse the cached boto3 client; creating one costs ~100 ms of blocking CPU.
        "ses": SesProvider(cfg, service=get_ses_service() if settings is None else None),
        "resend": ResendProvider(cfg),
        "brevo": BrevoProvider(cfg),
        "mailtrap": MailtrapProvider(cfg),
    }


def default_fallback_order(settings: Settings | None = None) -> list[str]:
    cfg = settings or get_settings()
    order: list[str] = []
    for item in cfg.fallback_provider_ids:
        if item in PROVIDER_IDS and item != "ses" and item not in order:
            order.append(item)
    for item in ("resend", "brevo", "mailtrap"):
        if item not in order:
            order.append(item)
    return order


def build_chain(
    *,
    settings: Settings | None = None,
    enabled: dict[str, bool] | None = None,
    fallback_order: list[str] | None = None,
    preferred_provider: str | None = None,
) -> list[BaseEmailProvider]:
    """Construit la chaîne ses_first : SES en tête s'il est prêt, puis les fallbacks.

    Si preferred_provider est défini, il est placé en tête (s'il est utilisable),
    puis le reste de la chaîne suit.
    """
    cfg = settings or get_settings()
    providers = build_provider_map(cfg)
    flags = enabled or {name: True for name in PROVIDER_IDS}
    order = fallback_order or default_fallback_order(cfg)

    chain: list[BaseEmailProvider] = []
    ses = providers["ses"]
    if flags.get("ses", True) and ses.is_configured():
        chain.append(ses)

    for name in order:
        if name == "ses":
            continue
        provider = providers.get(name)
        if provider is None:
            continue
        if not flags.get(name, True):
            continue
        if not provider.is_configured():
            continue
        chain.append(provider)

    if not chain and flags.get("ses", True) and ses.is_configured():
        chain.append(ses)

    preferred = (preferred_provider or "").strip().lower() or None
    if preferred and preferred in providers:
        preferred_provider_obj = providers[preferred]
        if (
            flags.get(preferred, True)
            and preferred_provider_obj.is_configured()
        ):
            rest = [item for item in chain if item.name != preferred]
            return [preferred_provider_obj, *rest]
    return chain


@lru_cache
def get_email_router() -> EmailRouter:
    """Router synchrone basé sur l'env (sans lecture DB). Utilisé par l'envoi live."""
    return EmailRouter(build_chain())


async def get_email_router_async(
    db: AsyncSession | None = None,
    *,
    preferred_provider: str | None = None,
) -> EmailRouter:
    """Router enrichi avec provider_settings si une session DB est fournie."""
    if db is None:
        return EmailRouter(build_chain(preferred_provider=preferred_provider))

    result = await db.execute(select(ProviderSetting))
    rows = {row.provider: row for row in result.scalars().all()}
    enabled = {name: True for name in PROVIDER_IDS}
    ordered: list[tuple[int, str]] = []
    for name in PROVIDER_IDS:
        row = rows.get(name)
        if row is not None:
            enabled[name] = row.enabled
            if name != "ses":
                ordered.append((row.sort_order, name))
    ordered.sort(key=lambda item: (item[0], item[1]))
    fallback = [name for _, name in ordered] or None
    return EmailRouter(
        build_chain(
            enabled=enabled,
            fallback_order=fallback,
            preferred_provider=preferred_provider,
        )
    )


def clear_email_router_cache() -> None:
    get_email_router.cache_clear()

"""Platform emails (invitations, access requests): try every connected tool until one accepts.

A tool is skipped up front when it cannot deliver from the platform domain. Some tools
(Brevo) accept the API call and drop the message later, so an accepted call alone does
not prove the email will arrive.
"""

from __future__ import annotations

import asyncio
import logging
import time
from dataclasses import dataclass, field

from app.core.config import settings
from app.providers import EmailProviderError
from app.providers.factory import build_provider_map
from app.providers.router import EmailRouter

logger = logging.getLogger("envoy.platform_mail")

PROVIDER_LABELS = {
    "ses": "Amazon SES",
    "resend": "Resend",
    "brevo": "Brevo",
    "mailtrap": "Mailtrap",
}

_CACHE_SECONDS = 300
_cache: dict[tuple[str, str], tuple[float, str | None]] = {}


@dataclass
class Delivery:
    sent_with: str | None = None
    provider: str | None = None
    message_id: str | None = None
    failures: list[str] = field(default_factory=list)

    @property
    def sent(self) -> bool:
        return self.sent_with is not None

    @property
    def error(self) -> str | None:
        return "; ".join(self.failures) or None


def _reason(exc: EmailProviderError) -> str:
    text = str(exc)
    prefix = f"{exc.provider}: "
    return (text[len(prefix):] if text.startswith(prefix) else text)[:180]


def _sender_domain() -> str:
    return settings.platform_mail_from.rsplit("@", 1)[-1].strip().lower()


async def _domain_blocker(name: str, domain: str) -> str | None:
    """Why this tool cannot send from the domain, or None when it can (or we cannot tell)."""
    if name == "brevo":
        from app.services import brevo_domains

        config = await brevo_domains.get_domain_config(domain)
        if not config or not config.get("authenticated"):
            return f"{domain} is not authenticated in Brevo"
    elif name == "resend":
        from app.services import resend_domains

        config = await resend_domains.find_domain(domain)
        if not config or str(config.get("status") or "").lower() != "verified":
            return f"{domain} is not verified in Resend"
    elif name == "mailtrap":
        from app.services import mailtrap_domains

        config = await mailtrap_domains.find_domain(domain)
        if not config or not config.get("dns_verified"):
            return f"{domain} is not verified in Mailtrap"
    elif name == "ses":
        identity = await asyncio.to_thread(_sesv2().get_email_identity, EmailIdentity=domain)
        if not identity.get("VerifiedForSendingStatus"):
            return f"{domain} is not verified in Amazon SES"
    return None


_sesv2_client = None


def _sesv2():
    global _sesv2_client
    if _sesv2_client is None:
        import boto3

        _sesv2_client = boto3.client(
            "sesv2",
            region_name=settings.aws_region,
            aws_access_key_id=settings.aws_access_key_id,
            aws_secret_access_key=settings.aws_secret_access_key,
        )
    return _sesv2_client


_ses_account_cache: tuple[float, bool] | None = None


async def _ses_production() -> bool:
    global _ses_account_cache
    now = time.monotonic()
    if _ses_account_cache and now - _ses_account_cache[0] < _CACHE_SECONDS:
        return _ses_account_cache[1]
    account = await asyncio.to_thread(_sesv2().get_account)
    production = bool(account.get("ProductionAccessEnabled"))
    _ses_account_cache = (now, production)
    return production


async def sending_issues(name: str) -> list[str]:
    """What keeps a connected tool from sending platform emails. Empty when nothing is known wrong."""
    domain = _sender_domain()
    issues: list[str] = []
    try:
        cached = _cache.get((name, domain))
        if cached and time.monotonic() - cached[0] < _CACHE_SECONDS:
            reason = cached[1]
        else:
            reason = await _domain_blocker(name, domain)
            _cache[(name, domain)] = (time.monotonic(), reason)
        if reason:
            issues.append(f"{reason}, so invitations skip this tool.")
        if name == "ses" and not await _ses_production():
            issues.append("Amazon SES is in sandbox mode: it only sends to verified addresses.")
    except Exception as exc:  # noqa: BLE001 - an unreachable API is itself the issue
        issues.append(f"Could not reach the tool's API ({str(exc)[:120]}).")
    return issues


async def _ses_sandbox_blocker(recipient: str) -> str | None:
    client = _sesv2()
    if await _ses_production():
        return None
    try:
        identity = await asyncio.to_thread(client.get_email_identity, EmailIdentity=recipient)
    except Exception:  # noqa: BLE001 - unknown identity means not verified
        identity = {}
    if identity.get("VerifiedForSendingStatus"):
        return None
    return "Amazon SES is in sandbox mode and only writes to verified addresses"


async def _blocker(name: str, recipient: str) -> str | None:
    domain = _sender_domain()
    key = (name, domain)
    now = time.monotonic()
    cached = _cache.get(key)
    try:
        if cached and now - cached[0] < _CACHE_SECONDS:
            reason = cached[1]
        else:
            reason = await _domain_blocker(name, domain)
            _cache[key] = (now, reason)
        if reason is None and name == "ses":
            reason = await _ses_sandbox_blocker(recipient)
    except Exception as exc:  # noqa: BLE001 - a failed check must not block sending
        logger.warning("platform_mail_check_failed provider=%s error=%s", name, exc)
        return None
    return reason


async def deliver(
    *,
    to: str,
    subject: str,
    html: str,
    text: str,
    reply_to: str | None = None,
    prefer: str | None = None,
) -> Delivery:
    """The preferred tool goes first; any other ready tool steps in if it refuses."""
    providers = build_provider_map()
    names = [name for name, provider in providers.items() if provider.is_configured()]
    if prefer in names:
        names.remove(prefer)
        names.insert(0, prefer)
    result = Delivery()
    for name in names:
        label = PROVIDER_LABELS.get(name, name)
        reason = await _blocker(name, to)
        if reason:
            result.failures.append(f"{label}: {reason}")
            logger.warning("platform_mail_skipped provider=%s reason=%s", name, reason)
            continue
        try:
            sent = await EmailRouter([providers[name]]).send(
                from_address=f"Envoy <{settings.platform_mail_from}>",
                to_addresses=[to],
                subject=subject,
                html=html,
                text=text,
                reply_to=[reply_to] if reply_to else None,
            )
        except EmailProviderError as exc:
            result.failures.append(f"{label}: {_reason(exc)}")
            logger.warning("platform_mail_failed provider=%s error=%s", name, exc)
            continue
        result.sent_with = label
        result.provider = name
        result.message_id = (sent.message_id or None) if sent else None
        break
    if not names:
        result.failures.append("No sending tool is connected.")
    if not result.sent:
        logger.error("platform_mail_undelivered to_domain=%s reasons=%s", to.rsplit("@", 1)[-1], result.error)
    return result

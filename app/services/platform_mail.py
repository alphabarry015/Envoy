"""Platform emails (invitations, access requests): try every connected tool until one accepts."""

from __future__ import annotations

import logging
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


@dataclass
class Delivery:
    sent_with: str | None = None
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


async def deliver(
    *,
    to: str,
    subject: str,
    html: str,
    text: str,
    reply_to: str | None = None,
    prefer: str | None = None,
) -> Delivery:
    """The preferred tool goes first; any other connected tool steps in if it refuses."""
    providers = build_provider_map()
    names = [name for name, provider in providers.items() if provider.is_configured()]
    if prefer in names:
        names.remove(prefer)
        names.insert(0, prefer)
    result = Delivery()
    for name in names:
        try:
            await EmailRouter([providers[name]]).send(
                from_address=f"Envoy <{settings.platform_mail_from}>",
                to_addresses=[to],
                subject=subject,
                html=html,
                text=text,
                reply_to=[reply_to] if reply_to else None,
            )
        except EmailProviderError as exc:
            result.failures.append(f"{PROVIDER_LABELS.get(name, name)}: {_reason(exc)}")
            logger.warning("platform_mail_failed provider=%s error=%s", name, exc)
            continue
        result.sent_with = PROVIDER_LABELS.get(name, name)
        break
    if not names:
        result.failures.append("No sending tool is connected.")
    return result

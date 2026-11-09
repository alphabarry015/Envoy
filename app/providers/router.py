from __future__ import annotations

import logging
from collections.abc import Sequence

from app.providers.base import BaseEmailProvider, EmailProviderError, SendResult
from app.schemas.email import Attachment

logger = logging.getLogger("envoy.providers")


class EmailRouter:
    """Envoie via une chaîne ordonnée. Bascule seulement sur erreur retryable."""

    def __init__(self, chain: Sequence[BaseEmailProvider]) -> None:
        self._chain = list(chain)

    @property
    def chain(self) -> list[BaseEmailProvider]:
        return list(self._chain)

    async def send(
        self,
        *,
        from_address: str,
        to_addresses: list[str],
        subject: str,
        html: str | None = None,
        text: str | None = None,
        cc_addresses: list[str] | None = None,
        bcc_addresses: list[str] | None = None,
        reply_to: list[str] | None = None,
        attachments: list[Attachment] | None = None,
    ) -> SendResult:
        if not self._chain:
            raise EmailProviderError("router", "No email providers are available", retryable=False)

        errors: list[str] = []
        for index, provider in enumerate(self._chain):
            try:
                result = await provider.send(
                    from_address=from_address,
                    to_addresses=to_addresses,
                    subject=subject,
                    html=html,
                    text=text,
                    cc_addresses=cc_addresses,
                    bcc_addresses=bcc_addresses,
                    reply_to=reply_to,
                    attachments=attachments,
                )
                if index > 0:
                    logger.info(
                        "email_failover_success provider=%s after=%s",
                        result.provider,
                        ",".join(item.name for item in self._chain[:index]),
                    )
                return result
            except EmailProviderError as exc:
                errors.append(str(exc))
                logger.warning(
                    "email_provider_failed provider=%s retryable=%s error=%s",
                    exc.provider,
                    exc.retryable,
                    exc,
                )
                if not exc.retryable or index == len(self._chain) - 1:
                    raise
                continue

        raise EmailProviderError("router", "; ".join(errors) or "All providers failed", retryable=False)

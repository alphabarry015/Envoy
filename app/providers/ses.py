from __future__ import annotations

from botocore.exceptions import BotoCoreError, ClientError

from app.core.config import Settings
from app.providers.base import BaseEmailProvider, EmailProviderError, SendResult
from app.schemas.email import Attachment
from app.services.aws_ses import SESClientError, SESService


class SesProvider(BaseEmailProvider):
    name = "ses"

    def __init__(self, settings: Settings, service: SESService | None = None) -> None:
        self._settings = settings
        self._service = service or SESService(settings)

    def is_configured(self) -> bool:
        return bool(self._settings.aws_access_key_id and self._settings.aws_secret_access_key)

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
        try:
            message_id = await self._service.send_email_async(
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
        except SESClientError as exc:
            raise EmailProviderError(self.name, str(exc), retryable=_ses_retryable(str(exc))) from exc
        except (ClientError, BotoCoreError) as exc:
            raise EmailProviderError(self.name, str(exc), retryable=True) from exc
        return SendResult(provider=self.name, message_id=message_id)


def _ses_retryable(message: str) -> bool:
    lower = message.lower()
    if "not verified" in lower or "message rejected" in lower:
        return False
    if "throttl" in lower or "limit" in lower or "quota" in lower:
        return True
    if "timeout" in lower or "unavailable" in lower or "5" in lower:
        return True
    return True

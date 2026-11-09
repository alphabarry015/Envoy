from __future__ import annotations

from typing import Any

import httpx

from app.core.config import Settings
from app.providers.base import BaseEmailProvider, EmailProviderError, SendResult, parse_from_header
from app.schemas.email import Attachment

_API = "https://api.brevo.com/v3/smtp/email"


class BrevoProvider(BaseEmailProvider):
    name = "brevo"

    def __init__(self, settings: Settings) -> None:
        self._api_key = settings.brevo_api_key

    def is_configured(self) -> bool:
        return bool(self._api_key)

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
        if not self._api_key:
            raise EmailProviderError(self.name, "API key missing", retryable=False)

        name, email = parse_from_header(from_address)
        sender: dict[str, str] = {"email": email}
        if name:
            sender["name"] = name

        body: dict[str, Any] = {
            "sender": sender,
            "to": [{"email": address} for address in to_addresses],
            "subject": subject,
        }
        if html:
            body["htmlContent"] = html
        if text:
            body["textContent"] = text
        if cc_addresses:
            body["cc"] = [{"email": address} for address in cc_addresses]
        if bcc_addresses:
            body["bcc"] = [{"email": address} for address in bcc_addresses]
        if reply_to:
            _, reply_email = parse_from_header(reply_to[0])
            body["replyTo"] = {"email": reply_email}
        if attachments:
            body["attachment"] = [
                {"name": item.filename, "content": item.content} for item in attachments
            ]

        try:
            async with httpx.AsyncClient(timeout=httpx.Timeout(15.0, connect=5.0)) as client:
                response = await client.post(
                    _API,
                    headers={"api-key": self._api_key, "Content-Type": "application/json", "accept": "application/json"},
                    json=body,
                )
        except httpx.HTTPError as exc:
            raise EmailProviderError(self.name, f"network error: {exc}", retryable=True) from exc

        if response.status_code >= 500 or response.status_code == 429:
            raise EmailProviderError(self.name, _error_text(response), retryable=True)
        if response.status_code >= 400:
            raise EmailProviderError(self.name, _error_text(response), retryable=False)

        payload = response.json() if response.content else {}
        message_id = str(payload.get("messageId") or "").strip()
        if not message_id:
            raise EmailProviderError(self.name, "missing message id in response", retryable=True)
        return SendResult(provider=self.name, message_id=message_id, raw=payload)


def _error_text(response: httpx.Response) -> str:
    try:
        data = response.json()
        if isinstance(data, dict):
            return str(data.get("message") or data)[:500]
    except ValueError:
        pass
    return f"HTTP {response.status_code}: {response.text[:300]}"

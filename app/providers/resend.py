from __future__ import annotations

from typing import Any

import httpx

from app.core.config import Settings
from app.providers.base import BaseEmailProvider, EmailProviderError, SendResult
from app.schemas.email import Attachment

_API = "https://api.resend.com/emails"


class ResendProvider(BaseEmailProvider):
    name = "resend"

    def __init__(self, settings: Settings) -> None:
        self._api_key = settings.resend_api_key

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

        body: dict[str, Any] = {
            "from": from_address,
            "to": to_addresses,
            "subject": subject,
        }
        if html:
            body["html"] = html
        if text:
            body["text"] = text
        if cc_addresses:
            body["cc"] = cc_addresses
        if bcc_addresses:
            body["bcc"] = bcc_addresses
        if reply_to:
            body["reply_to"] = reply_to[0] if len(reply_to) == 1 else reply_to
        if attachments:
            body["attachments"] = [
                {"filename": item.filename, "content": item.content} for item in attachments
            ]

        try:
            async with httpx.AsyncClient(timeout=httpx.Timeout(15.0, connect=5.0)) as client:
                response = await client.post(
                    _API,
                    headers={
                        "Authorization": f"Bearer {self._api_key}",
                        "Content-Type": "application/json",
                    },
                    json=body,
                )
        except httpx.HTTPError as exc:
            raise EmailProviderError(self.name, f"network error: {exc}", retryable=True) from exc

        if response.status_code >= 500 or response.status_code == 429:
            raise EmailProviderError(self.name, _error_text(response), retryable=True)
        if response.status_code >= 400:
            raise EmailProviderError(self.name, _error_text(response), retryable=False)

        payload = response.json()
        message_id = str(payload.get("id") or "").strip()
        if not message_id:
            raise EmailProviderError(self.name, "missing message id in response", retryable=True)
        return SendResult(provider=self.name, message_id=message_id, raw=payload)


def _error_text(response: httpx.Response) -> str:
    try:
        data = response.json()
        if isinstance(data, dict):
            return str(data.get("message") or data.get("error") or data)[:500]
    except ValueError:
        pass
    return f"HTTP {response.status_code}: {response.text[:300]}"

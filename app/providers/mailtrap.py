from __future__ import annotations

from typing import Any

import httpx

from app.core.config import Settings
from app.providers.base import BaseEmailProvider, EmailProviderError, SendResult, parse_from_header
from app.schemas.email import Attachment

_API = "https://send.api.mailtrap.io/api/send"


class MailtrapProvider(BaseEmailProvider):
    name = "mailtrap"

    def __init__(self, settings: Settings) -> None:
        self._token = settings.mailtrap_api_token

    def is_configured(self) -> bool:
        return bool(self._token)

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
        if not self._token:
            raise EmailProviderError(self.name, "API token missing", retryable=False)

        name, email = parse_from_header(from_address)
        sender: dict[str, str] = {"email": email}
        if name:
            sender["name"] = name

        body: dict[str, Any] = {
            "from": sender,
            "to": [{"email": address} for address in to_addresses],
            "subject": subject,
        }
        if html:
            body["html"] = html
        if text:
            body["text"] = text
        if cc_addresses:
            body["cc"] = [{"email": address} for address in cc_addresses]
        if bcc_addresses:
            body["bcc"] = [{"email": address} for address in bcc_addresses]
        if reply_to:
            _, reply_email = parse_from_header(reply_to[0])
            body["reply_to"] = {"email": reply_email}
        if attachments:
            body["attachments"] = [
                {
                    "filename": item.filename,
                    "content": item.content,
                    "type": item.content_type or "application/octet-stream",
                    "disposition": "attachment",
                }
                for item in attachments
            ]

        try:
            async with httpx.AsyncClient(timeout=httpx.Timeout(15.0, connect=5.0)) as client:
                response = await client.post(
                    _API,
                    headers={
                        "Authorization": f"Bearer {self._token}",
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

        payload = response.json() if response.content else {}
        message_id = ""
        if isinstance(payload, dict):
            message_ids = payload.get("message_ids") or payload.get("messageIds")
            if isinstance(message_ids, list) and message_ids:
                message_id = str(message_ids[0])
            else:
                message_id = str(payload.get("message_id") or payload.get("id") or "")
        if not message_id:
            raise EmailProviderError(self.name, "missing message id in response", retryable=True)
        return SendResult(
            provider=self.name,
            message_id=message_id,
            raw=payload if isinstance(payload, dict) else None,
        )


def _error_text(response: httpx.Response) -> str:
    try:
        data = response.json()
        if isinstance(data, dict):
            return str(data.get("errors") or data.get("message") or data)[:500]
    except ValueError:
        pass
    return f"HTTP {response.status_code}: {response.text[:300]}"

from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass
from typing import Any

from app.schemas.email import Attachment

PROVIDER_IDS = ("ses", "resend", "brevo", "mailtrap")


@dataclass(frozen=True, slots=True)
class SendResult:
    provider: str
    message_id: str
    raw: dict[str, Any] | None = None


class EmailProviderError(RuntimeError):
    """Erreur d'un transport d'envoi. retryable=True autorise la bascule."""

    def __init__(self, provider: str, message: str, *, retryable: bool = True) -> None:
        self.provider = provider
        self.retryable = retryable
        super().__init__(f"{provider}: {message}")


class BaseEmailProvider(ABC):
    name: str

    @abstractmethod
    def is_configured(self) -> bool:
        """True si les credentials nécessaires sont présents."""

    @abstractmethod
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
        ...


def parse_from_header(header: str) -> tuple[str | None, str]:
    """Retourne (display_name, email) depuis `Name <email>` ou `email`."""
    raw = header.strip()
    if "<" in raw and raw.endswith(">"):
        name, _, rest = raw.partition("<")
        return (name.strip().strip('"') or None), rest[:-1].strip().lower()
    return None, raw.lower()

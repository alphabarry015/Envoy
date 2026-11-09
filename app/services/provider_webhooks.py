from __future__ import annotations

import base64
import hashlib
import hmac
import time
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.models.suppression import SuppressionReason
from app.services.delivery_events import Kind, apply_delivery_event


class ProviderWebhookError(Exception):
    def __init__(self, status_code: int, detail: str) -> None:
        self.status_code = status_code
        self.detail = detail
        super().__init__(detail)


def _require_secret(secret: str | None, tool: str) -> bool:
    """False only in development when no secret is set; otherwise fail closed."""
    if secret:
        return True
    if settings.is_development:
        return False
    raise ProviderWebhookError(503, f"{tool} webhook secret is not configured")


def verify_shared_secret(provided: str | None, expected: str | None) -> None:
    """Brevo bearer token."""
    if not _require_secret(expected, "Brevo"):
        return
    if not provided or not hmac.compare_digest(provided, expected):
        raise ProviderWebhookError(401, "Invalid webhook secret")


def verify_resend_svix(
    *,
    raw_body: bytes,
    headers: dict[str, str],
    signing_secret: str | None,
) -> None:
    """Resend delivers Svix-signed payloads (whsec_…)."""
    if not _require_secret(signing_secret, "Resend"):
        return
    assert signing_secret is not None
    msg_id = headers.get("svix-id") or headers.get("webhook-id")
    timestamp = headers.get("svix-timestamp") or headers.get("webhook-timestamp")
    signature_header = headers.get("svix-signature") or headers.get("webhook-signature")
    if not msg_id or not timestamp or not signature_header:
        raise ProviderWebhookError(401, "Missing Resend/Svix signature headers")
    try:
        ts = int(timestamp)
    except ValueError as exc:
        raise ProviderWebhookError(401, "Invalid Svix timestamp") from exc
    if abs(int(time.time()) - ts) > 60 * 5:
        raise ProviderWebhookError(401, "Stale Svix timestamp")

    secret_bytes = _svix_secret_bytes(signing_secret)
    signed = f"{msg_id}.{timestamp}.".encode("utf-8") + raw_body
    digest = base64.b64encode(hmac.new(secret_bytes, signed, hashlib.sha256).digest()).decode()
    candidates = []
    for part in signature_header.split(" "):
        part = part.strip()
        if not part:
            continue
        if "," in part:
            version, value = part.split(",", 1)
            if version == "v1" and value:
                candidates.append(value)
        else:
            candidates.append(part)
    if not any(hmac.compare_digest(digest, item) for item in candidates):
        raise ProviderWebhookError(401, "Invalid Resend webhook signature")


def verify_mailtrap_signature(
    *,
    raw_body: bytes,
    signature: str | None,
    signing_secret: str | None,
) -> None:
    """Mailtrap: HMAC-SHA256 hex of raw body, header Mailtrap-Signature."""
    if not _require_secret(signing_secret, "Mailtrap"):
        return
    assert signing_secret is not None
    if not signature:
        raise ProviderWebhookError(401, "Missing Mailtrap-Signature header")
    expected = hmac.new(
        signing_secret.encode("utf-8"),
        raw_body,
        hashlib.sha256,
    ).hexdigest()
    if not hmac.compare_digest(expected, signature.strip()):
        raise ProviderWebhookError(401, "Invalid Mailtrap webhook signature")


def _svix_secret_bytes(secret: str) -> bytes:
    value = secret.strip()
    if value.startswith("whsec_"):
        value = value[len("whsec_") :]
    try:
        return base64.b64decode(value)
    except Exception as exc:
        raise ProviderWebhookError(500, "Resend webhook signing secret is invalid") from exc


def _emails(value: Any) -> list[str]:
    if isinstance(value, str):
        email = value.strip().lower()
        return [email] if email else []
    if not isinstance(value, list):
        return []
    found: list[str] = []
    for item in value:
        if isinstance(item, str):
            email = item.strip().lower()
        elif isinstance(item, dict):
            email = str(item.get("email") or item.get("emailAddress") or "").strip().lower()
        else:
            continue
        if email and email not in found:
            found.append(email)
    return found


async def handle_resend_event(db: AsyncSession, body: dict[str, Any]) -> str:
    event_type = str(body.get("type") or "")
    data = body.get("data") if isinstance(body.get("data"), dict) else {}
    if event_type.startswith("domain."):
        from app.services.domains import reconcile_remote_domain

        name = str(data.get("name") or "").strip().lower()
        if name:
            await reconcile_remote_domain(db, name)
        return event_type
    message_id = str(data.get("email_id") or data.get("id") or "") or None
    recipients = _emails(data.get("to") or [])
    mapping: dict[str, tuple[Kind, bool, SuppressionReason]] = {
        "email.delivered": ("delivered", False, SuppressionReason.HARD_BOUNCE),
        "email.bounced": ("bounced", True, SuppressionReason.HARD_BOUNCE),
        "email.complained": ("complained", True, SuppressionReason.COMPLAINT),
        "email.failed": ("failed", False, SuppressionReason.HARD_BOUNCE),
    }
    mapped = mapping.get(event_type)
    if mapped is None:
        return event_type or "ignored"
    kind, suppress, reason = mapped
    return await apply_delivery_event(
        db,
        provider="resend",
        kind=kind,
        provider_message_id=message_id,
        recipients=recipients,
        raw=body,
        suppress=suppress,
        suppress_reason=reason,
    )


async def handle_brevo_event(db: AsyncSession, body: dict[str, Any] | list[Any]) -> str:
    events = body if isinstance(body, list) else [body]
    last = "ignored"
    for event in events:
        if not isinstance(event, dict):
            continue
        event_type = str(event.get("event") or "")
        message_id = str(event.get("message-id") or event.get("messageId") or "") or None
        email = str(event.get("email") or "").strip().lower()
        recipients = [email] if email else []
        mapping: dict[str, tuple[Kind, bool, SuppressionReason]] = {
            "delivered": ("delivered", False, SuppressionReason.HARD_BOUNCE),
            "hard_bounce": ("bounced", True, SuppressionReason.HARD_BOUNCE),
            "soft_bounce": ("bounced", False, SuppressionReason.HARD_BOUNCE),
            "spam": ("complained", True, SuppressionReason.COMPLAINT),
            "blocked": ("failed", False, SuppressionReason.HARD_BOUNCE),
        }
        mapped = mapping.get(event_type)
        if mapped is None:
            last = event_type or last
            continue
        kind, suppress, reason = mapped
        last = await apply_delivery_event(
            db,
            provider="brevo",
            kind=kind,
            provider_message_id=message_id,
            recipients=recipients,
            raw=event,
            suppress=suppress,
            suppress_reason=reason,
        )
    return last


async def handle_mailtrap_event(db: AsyncSession, body: dict[str, Any] | list[Any]) -> str:
    """Mailtrap JSON payloads use {\"events\": [...]} (or a bare event)."""
    if isinstance(body, list):
        events = body
    elif isinstance(body, dict) and isinstance(body.get("events"), list):
        events = body["events"]
    else:
        events = [body] if isinstance(body, dict) else []

    last = "ignored"
    mapping: dict[str, tuple[Kind, bool, SuppressionReason]] = {
        "delivery": ("delivered", False, SuppressionReason.HARD_BOUNCE),
        "bounce": ("bounced", True, SuppressionReason.HARD_BOUNCE),
        "soft_bounce": ("bounced", False, SuppressionReason.HARD_BOUNCE),
        "spam": ("complained", True, SuppressionReason.COMPLAINT),
        "spam_complaint": ("complained", True, SuppressionReason.COMPLAINT),
        "reject": ("failed", False, SuppressionReason.HARD_BOUNCE),
        "suspension": ("failed", False, SuppressionReason.HARD_BOUNCE),
    }
    for event in events:
        if not isinstance(event, dict):
            continue
        event_type = str(event.get("event") or event.get("type") or "").lower()
        message_id = (
            str(event.get("message_id") or event.get("email_id") or event.get("id") or "") or None
        )
        email = str(event.get("email") or event.get("recipient") or "").strip().lower()
        recipients = [email] if email else []
        mapped = mapping.get(event_type)
        if mapped is None:
            last = event_type or last
            continue
        kind, suppress, reason = mapped
        last = await apply_delivery_event(
            db,
            provider="mailtrap",
            kind=kind,
            provider_message_id=message_id,
            recipients=recipients,
            raw=event,
            suppress=suppress,
            suppress_reason=reason,
        )
    return last

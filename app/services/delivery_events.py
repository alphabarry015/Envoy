from __future__ import annotations

from typing import Any, Literal

from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.email_log import EmailLog, EmailStatus
from app.models.suppression import Suppression, SuppressionReason
from app.services.realtime import publish as realtime_publish
from app.services.webhooks import deliver_user_event

Kind = Literal["delivered", "bounced", "complained", "failed"]

_STATUS: dict[Kind, EmailStatus] = {
    "delivered": EmailStatus.DELIVERED,
    "bounced": EmailStatus.BOUNCED,
    "complained": EmailStatus.COMPLAINED,
    "failed": EmailStatus.FAILED,
}

_EVENT: dict[Kind, str] = {
    "delivered": "email.delivered",
    "bounced": "email.bounced",
    "complained": "email.complained",
    "failed": "email.failed",
}


async def apply_delivery_event(
    db: AsyncSession,
    *,
    provider: str,
    kind: Kind,
    provider_message_id: str | None,
    recipients: list[str],
    raw: dict[str, Any],
    suppress: bool = False,
    suppress_reason: SuppressionReason = SuppressionReason.HARD_BOUNCE,
) -> str:
    """Met à jour le journal et éventuellement la suppression, quel que soit le transport."""
    status = _STATUS[kind]
    log = None
    if provider_message_id:
        log = await db.scalar(select(EmailLog).where(EmailLog.ses_message_id == provider_message_id))
    if log is not None:
        log.status = status
        if log.provider is None:
            log.provider = provider

    if suppress and recipients:
        await _suppress(
            db,
            recipients,
            suppress_reason,
            provider=provider,
            raw=raw,
            user_id=log.user_id if log is not None else None,
        )

    user_id = log.user_id if log is not None else None
    await db.commit()
    event = _EVENT[kind]
    payload = {
        "provider": provider,
        "ses_message_id": provider_message_id,
        "email_id": str(log.id) if log is not None else None,
        "kind": kind,
    }
    if user_id is not None:
        await deliver_user_event(db, user_id, event, payload)
        await realtime_publish(user_id, event, payload)
        await realtime_publish(user_id, "emails.changed", payload)
    return kind


async def apply_ses_notification(db: AsyncSession, message: dict[str, Any]) -> str:
    """Adapter SNS SES → apply_delivery_event."""
    kind_raw = str(message.get("notificationType") or message.get("eventType") or "unknown")
    mail = message.get("mail") if isinstance(message.get("mail"), dict) else {}
    provider_message_id = str(mail.get("messageId") or "") or None

    mapping: dict[str, Kind] = {
        "Delivery": "delivered",
        "Bounce": "bounced",
        "Complaint": "complained",
        "Reject": "failed",
    }
    kind = mapping.get(kind_raw)
    if kind is None:
        return kind_raw

    recipients: list[str] = []
    suppress = False
    reason = SuppressionReason.HARD_BOUNCE
    if kind_raw == "Bounce":
        bounce = message.get("bounce") if isinstance(message.get("bounce"), dict) else {}
        recipients = _addresses(bounce.get("bouncedRecipients"))
        if str(bounce.get("bounceType") or "") == "Permanent":
            suppress = True
            reason = SuppressionReason.HARD_BOUNCE
    elif kind_raw == "Complaint":
        complaint = message.get("complaint") if isinstance(message.get("complaint"), dict) else {}
        recipients = _addresses(complaint.get("complainedRecipients"))
        suppress = True
        reason = SuppressionReason.COMPLAINT

    return await apply_delivery_event(
        db,
        provider="ses",
        kind=kind,
        provider_message_id=provider_message_id,
        recipients=recipients,
        raw=message,
        suppress=suppress,
        suppress_reason=reason,
    )


async def _suppress(
    db: AsyncSession,
    emails: list[str],
    reason: SuppressionReason,
    *,
    provider: str,
    raw: dict[str, Any],
    user_id: Any = None,
) -> None:
    for email in emails:
        stmt = insert(Suppression).values(
            user_id=user_id,
            email=email,
            reason=reason.value,
            source=provider,
            extra_metadata={"provider": provider, "event": raw.get("type") or raw.get("event") or raw.get("notificationType")},
        )
        stmt = stmt.on_conflict_do_nothing(index_elements=["email"])
        await db.execute(stmt)


def _addresses(recipients: Any) -> list[str]:
    if not isinstance(recipients, list):
        return []
    found: list[str] = []
    for item in recipients:
        if isinstance(item, str):
            email = item.strip().lower()
        elif isinstance(item, dict):
            email = str(
                item.get("emailAddress")
                or item.get("email")
                or item.get("Email")
                or ""
            ).strip().lower()
        else:
            continue
        if email and email not in found:
            found.append(email)
    return found

from __future__ import annotations

from typing import Any

from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.email_log import EmailLog, EmailStatus
from app.models.suppression import Suppression, SuppressionReason
from app.services.webhooks import deliver_user_event

_STATUS = {
    "Delivery": EmailStatus.DELIVERED,
    "Bounce": EmailStatus.BOUNCED,
    "Complaint": EmailStatus.COMPLAINED,
    "Reject": EmailStatus.FAILED,
}

_EVENT = {
    "Delivery": "email.delivered",
    "Bounce": "email.bounced",
    "Complaint": "email.complained",
    "Reject": "email.failed",
}


async def apply_ses_notification(db: AsyncSession, message: dict[str, Any]) -> str:
    """Met à jour le journal et la liste de suppression à partir d'un événement SES."""
    kind = str(message.get("notificationType") or message.get("eventType") or "unknown")
    mail = message.get("mail") if isinstance(message.get("mail"), dict) else {}
    ses_message_id = str(mail.get("messageId") or "") or None
    status = _STATUS.get(kind)
    log = None
    if ses_message_id:
        log = await db.scalar(select(EmailLog).where(EmailLog.ses_message_id == ses_message_id))
    if log is not None and status is not None:
        log.status = status

    if kind == "Bounce":
        bounce = message.get("bounce") if isinstance(message.get("bounce"), dict) else {}
        if str(bounce.get("bounceType") or "") == "Permanent":
            await _suppress(
                db,
                _addresses(bounce.get("bouncedRecipients")),
                SuppressionReason.HARD_BOUNCE,
                message,
                user_id=log.user_id if log is not None else None,
            )
    elif kind == "Complaint":
        complaint = message.get("complaint") if isinstance(message.get("complaint"), dict) else {}
        await _suppress(
            db,
            _addresses(complaint.get("complainedRecipients")),
            SuppressionReason.COMPLAINT,
            message,
            user_id=log.user_id if log is not None else None,
        )

    user_id = log.user_id if log is not None else None
    await db.commit()
    event = _EVENT.get(kind)
    if user_id is not None and event is not None:
        await deliver_user_event(
            db,
            user_id,
            event,
            {"ses_message_id": ses_message_id, "email_id": str(log.id) if log is not None else None},
        )
    return kind


async def _suppress(
    db: AsyncSession,
    emails: list[str],
    reason: SuppressionReason,
    message: dict[str, Any],
    user_id: Any = None,
) -> None:
    for email in emails:
        stmt = insert(Suppression).values(
            user_id=user_id,
            email=email,
            reason=reason.value,
            source="sns",
            extra_metadata={"notificationType": message.get("notificationType") or message.get("eventType")},
        )
        stmt = stmt.on_conflict_do_nothing(index_elements=["email"])
        await db.execute(stmt)


def _addresses(recipients: Any) -> list[str]:
    if not isinstance(recipients, list):
        return []
    found: list[str] = []
    for item in recipients:
        if not isinstance(item, dict):
            continue
        email = str(item.get("emailAddress") or "").strip().lower()
        if email and email not in found:
            found.append(email)
    return found

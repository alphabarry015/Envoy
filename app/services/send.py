from __future__ import annotations

import uuid
from datetime import datetime, timezone
from uuid import UUID

from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.database import SessionLocal
from app.models.domain import Domain, DomainStatus
from app.models.email_log import EmailLog, EmailStatus
from app.models.suppression import Suppression
from app.models.user import ApiKey, User
from app.schemas.email import EmailSendRequest
from app.services.aws_ses import SESClientError, get_ses_service
from app.services.webhooks import deliver_user_event

_UNCOUNTED = (EmailStatus.FAILED, EmailStatus.SUPPRESSED)


class SendError(Exception):
    def __init__(self, status_code: int, detail: str) -> None:
        self.status_code = status_code
        self.detail = detail
        super().__init__(detail)


def address_in_from(header: str) -> str:
    if "<" in header and header.endswith(">"):
        return header.rsplit("<", 1)[1][:-1].strip().lower()
    return header.strip().lower()


def _recipients(payload: EmailSendRequest) -> list[str]:
    found: list[str] = []
    for group in (payload.to, payload.cc or [], payload.bcc or []):
        for item in group:
            email = str(item).strip().lower()
            if email and email not in found:
                found.append(email)
    return found


async def accept_send(db: AsyncSession, api_key: ApiKey, payload: EmailSendRequest) -> EmailLog:
    """Contrôle domaine, suppression et quotas, puis enregistre l'envoi."""
    user = await db.get(User, api_key.user_id)
    if user is None or not user.is_active:
        raise SendError(401, "Account is not active.")

    from_address, domain = await _choose_sender(db, user, payload.from_address)
    payload.from_address = from_address
    if domain is None and not payload.reply_to:
        payload.reply_to = [user.email]
    recipients = _recipients(payload)
    suppressed = await _suppressed(db, recipients)
    if not suppressed:
        await _enforce_quota(db, user, api_key)

    now = datetime.now(timezone.utc)
    sandbox = api_key.mode == "sandbox"
    if suppressed:
        status = EmailStatus.SUPPRESSED
    elif sandbox:
        status = EmailStatus.SENT
    else:
        status = EmailStatus.QUEUED
    log = EmailLog(
        user_id=user.id,
        domain_id=domain.id if domain is not None else None,
        api_key_id=api_key.id,
        message_id=str(uuid.uuid4()),
        from_address=payload.from_address,
        to_addresses=list(payload.to),
        cc_addresses=list(payload.cc) if payload.cc else None,
        bcc_addresses=list(payload.bcc) if payload.bcc else None,
        subject=payload.subject,
        html=payload.html,
        text_body=payload.text,
        status=status,
        error_message=f"Suppressed: {', '.join(suppressed)}" if suppressed else None,
        sent_at=now if status == EmailStatus.SENT else None,
    )
    db.add(log)
    await db.commit()
    await db.refresh(log)

    if suppressed:
        await deliver_user_event(
            db,
            user.id,
            "email.suppressed",
            {"email_id": str(log.id), "message_id": log.message_id, "ses_message_id": None},
        )
        raise SendError(422, f"Suppressed recipients: {', '.join(suppressed)}")

    if sandbox:
        await deliver_user_event(
            db,
            user.id,
            "email.sent",
            {"email_id": str(log.id), "message_id": log.message_id, "ses_message_id": None},
        )
    return log


async def perform_ses_send(log_id: UUID, payload: EmailSendRequest) -> EmailStatus | None:
    """Expédie un envoi live et notifie le webhook du compte."""
    async with SessionLocal() as db:
        log = await db.get(EmailLog, log_id)
        if log is None or log.status != EmailStatus.QUEUED:
            return None
        try:
            ses_message_id = await get_ses_service().send_email_async(
                from_address=log.from_address,
                to_addresses=list(payload.to),
                subject=payload.subject,
                html=payload.html,
                text=payload.text,
                cc_addresses=list(payload.cc) if payload.cc else None,
                bcc_addresses=list(payload.bcc) if payload.bcc else None,
                reply_to=list(payload.reply_to) if payload.reply_to else None,
                attachments=payload.attachments,
            )
        except SESClientError as exc:
            log.status = EmailStatus.FAILED
            log.error_message = str(exc)[:1000]
            await db.commit()
            await deliver_user_event(
                db,
                log.user_id,
                "email.failed",
                {"email_id": str(log.id), "message_id": log.message_id, "ses_message_id": None},
            )
            return EmailStatus.FAILED

        log.ses_message_id = ses_message_id[:128]
        log.status = EmailStatus.SENT
        log.sent_at = datetime.now(timezone.utc)
        await db.commit()
        await deliver_user_event(
            db,
            log.user_id,
            "email.sent",
            {"email_id": str(log.id), "message_id": log.message_id, "ses_message_id": log.ses_message_id},
        )
        return EmailStatus.SENT


async def _choose_sender(
    db: AsyncSession,
    user: User,
    requested: str | None,
) -> tuple[str, Domain | None]:
    """Domaine vérifié du compte, sinon noreply@ du domaine plateforme."""
    local_part = settings.mail_from_local_part
    if requested:
        return requested, await _verified_domain(db, user.id, address_in_from(requested))
    domain = await _default_verified_domain(db, user.id)
    if domain is not None:
        return f"{local_part}@{domain.name}", domain
    return settings.platform_mail_from, None


async def _default_verified_domain(db: AsyncSession, user_id: UUID) -> Domain | None:
    result = await db.execute(
        select(Domain)
        .where(Domain.user_id == user_id, Domain.status == DomainStatus.VERIFIED)
        .order_by(Domain.verified_at.desc().nulls_last(), Domain.created_at.asc())
    )
    return result.scalars().first()


async def _verified_domain(db: AsyncSession, user_id: UUID, email: str) -> Domain:
    host = email.split("@", 1)[-1]
    result = await db.execute(
        select(Domain).where(Domain.user_id == user_id, Domain.status == DomainStatus.VERIFIED)
    )
    match: Domain | None = None
    for domain in result.scalars().all():
        name = domain.name.lower()
        if host == name or host.endswith(f".{name}"):
            if match is None or len(name) > len(match.name):
                match = domain
    if match is None:
        raise SendError(422, "The from domain is not verified for this account.")
    return match


async def _suppressed(db: AsyncSession, recipients: list[str]) -> list[str]:
    if not recipients:
        return []
    result = await db.execute(select(Suppression.email).where(Suppression.email.in_(recipients)))
    blocked = {email.lower() for email in result.scalars().all()}
    return [email for email in recipients if email in blocked]


async def _enforce_quota(db: AsyncSession, user: User, api_key: ApiKey) -> None:
    if (
        user.daily_send_quota is None
        and user.monthly_send_quota is None
        and api_key.daily_quota is None
        and api_key.monthly_quota is None
    ):
        return
    now = datetime.now(timezone.utc)
    day_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    month_start = day_start.replace(day=1)
    counted = EmailLog.status.notin_(_UNCOUNTED)
    row = (
        await db.execute(
            select(
                func.count().filter(EmailLog.user_id == user.id, EmailLog.created_at >= day_start),
                func.count().filter(EmailLog.user_id == user.id, EmailLog.created_at >= month_start),
                func.count().filter(EmailLog.api_key_id == api_key.id, EmailLog.created_at >= day_start),
                func.count().filter(EmailLog.api_key_id == api_key.id, EmailLog.created_at >= month_start),
            )
            .select_from(EmailLog)
            .where(
                counted,
                EmailLog.created_at >= month_start,
                or_(EmailLog.user_id == user.id, EmailLog.api_key_id == api_key.id),
            )
        )
    ).one()
    user_day, user_month, key_day, key_month = (int(value or 0) for value in row)
    checks = (
        (user.daily_send_quota, user_day),
        (user.monthly_send_quota, user_month),
        (api_key.daily_quota, key_day),
        (api_key.monthly_quota, key_month),
    )
    for limit, count in checks:
        if limit is not None and count >= limit:
            raise SendError(429, "Send quota exceeded.")

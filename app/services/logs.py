from __future__ import annotations

from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import aliased, defer

from app.models.domain import Domain
from app.models.email_log import EmailLog
from app.models.user import ApiKey, User
from app.schemas.logs import EmailLogResponse


async def list_email_logs(db: AsyncSession, user: User) -> list[EmailLogResponse]:
    domain = aliased(Domain)
    api_key = aliased(ApiKey)
    result = await db.execute(
        select(EmailLog, domain.name, api_key.key_prefix)
        .outerjoin(domain, EmailLog.domain_id == domain.id)
        .outerjoin(api_key, EmailLog.api_key_id == api_key.id)
        .where(EmailLog.user_id == user.id)
        .order_by(EmailLog.created_at.desc())
        .limit(200)
        .options(defer(EmailLog.html), defer(EmailLog.text_body))
    )
    return [_response(log, domain_name, prefix, include_body=False) for log, domain_name, prefix in result.all()]


async def get_email_log(db: AsyncSession, user: User, log_id: UUID) -> EmailLogResponse | None:
    domain = aliased(Domain)
    api_key = aliased(ApiKey)
    result = await db.execute(
        select(EmailLog, domain.name, api_key.key_prefix)
        .outerjoin(domain, EmailLog.domain_id == domain.id)
        .outerjoin(api_key, EmailLog.api_key_id == api_key.id)
        .where(EmailLog.id == log_id, EmailLog.user_id == user.id)
    )
    row = result.one_or_none()
    if row is None:
        return None
    log, domain_name, prefix = row
    return _response(log, domain_name, prefix)


def _response(
    log: EmailLog,
    domain_name: str | None,
    prefix: str | None,
    *,
    include_body: bool = True,
) -> EmailLogResponse:
    return EmailLogResponse(
        id=log.id,
        message_id=log.message_id,
        ses_message_id=log.ses_message_id,
        from_address=log.from_address,
        to_addresses=list(log.to_addresses or []),
        cc_addresses=list(log.cc_addresses or []),
        bcc_addresses=list(log.bcc_addresses or []),
        subject=log.subject,
        status=log.status.value,
        error_message=log.error_message,
        html=log.html if include_body else None,
        text=log.text_body if include_body else None,
        domain=domain_name,
        api_key_prefix=prefix,
        created_at=log.created_at,
        sent_at=log.sent_at,
    )

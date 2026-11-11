from __future__ import annotations

from datetime import datetime, timedelta, timezone

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import load_only

from app.models.domain import Domain, DomainStatus
from app.models.email_log import EmailLog, EmailStatus
from app.models.user import ApiKey, User
from app.schemas.overview import OverviewActivity, OverviewAllTime, OverviewResponse

_ACCEPTED = (
    EmailStatus.QUEUED,
    EmailStatus.SENT,
    EmailStatus.DELIVERED,
    EmailStatus.BOUNCED,
    EmailStatus.COMPLAINED,
)
_FINISHED = (
    EmailStatus.SENT,
    EmailStatus.DELIVERED,
    EmailStatus.BOUNCED,
    EmailStatus.COMPLAINED,
)


RECENT_PAGE_SIZE = 10


async def account_overview(db: AsyncSession, user: User, *, recent_page: int = 1) -> OverviewResponse:
    now = datetime.now(timezone.utc)
    day_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    week_start = now - timedelta(days=7)
    owned = EmailLog.user_id == user.id

    counts = await db.execute(
        select(
            _count_query(owned, EmailLog.created_at >= day_start, EmailLog.status.in_(_ACCEPTED)),
            _count_query(Domain.user_id == user.id, Domain.status == DomainStatus.VERIFIED, model=Domain),
            _count_query(ApiKey.user_id == user.id, ApiKey.is_active.is_(True), model=ApiKey),
            _count_query(owned, EmailLog.created_at >= week_start, EmailLog.status.in_(_FINISHED)),
            _count_query(owned, EmailLog.created_at >= week_start, EmailLog.status == EmailStatus.BOUNCED),
        )
    )
    sends_today, domains_live, active_keys, finished, bounced = (int(value or 0) for value in counts.one())
    recent = await db.execute(
        select(EmailLog)
        .where(owned)
        .order_by(EmailLog.created_at.desc(), EmailLog.id.desc())
        .offset((recent_page - 1) * RECENT_PAGE_SIZE)
        .limit(RECENT_PAGE_SIZE)
        .options(
            load_only(
                EmailLog.id,
                EmailLog.message_id,
                EmailLog.subject,
                EmailLog.status,
                EmailLog.provider,
                EmailLog.kind,
                EmailLog.created_at,
            )
        )
    )
    grouped = await db.execute(
        select(EmailLog.status, EmailLog.provider, func.count())
        .where(owned)
        .group_by(EmailLog.status, EmailLog.provider)
    )
    all_time = OverviewAllTime()
    for status, provider, count in grouped.all():
        all_time.total += count
        all_time.by_status[status.value] = all_time.by_status.get(status.value, 0) + count
        key = provider or "unknown"
        all_time.by_provider[key] = all_time.by_provider.get(key, 0) + count

    return OverviewResponse(
        all_time=all_time,
        recent_page=recent_page,
        recent_page_size=RECENT_PAGE_SIZE,
        recent_total=all_time.total,
        sends_today=sends_today,
        daily_send_quota=user.daily_send_quota,
        domains_live=domains_live,
        max_domains=user.max_domains,
        active_api_keys=active_keys,
        bounce_rate=0 if finished == 0 else round(bounced * 100 / finished, 1),
        recent=[
            OverviewActivity(
                id=log.id,
                message_id=log.message_id,
                subject=log.subject,
                status=log.status.value,
                provider=log.provider,
                kind=log.kind,
                created_at=log.created_at,
            )
            for log in recent.scalars().all()
        ],
    )


def _count_query(*filters: object, model: type = EmailLog):
    return select(func.count()).select_from(model).where(*filters).scalar_subquery()

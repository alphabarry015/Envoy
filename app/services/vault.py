from __future__ import annotations

import logging

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.security import reseal_if_legacy
from app.models.domain import Domain
from app.models.webhook import Webhook

logger = logging.getLogger("envoy.vault")


async def reseal_legacy_secrets(db: AsyncSession) -> int:
    """Re-encrypts values still sealed with SECRET_KEY under ENCRYPTION_KEY."""
    if not settings.encryption_key:
        return 0
    changed = 0
    webhooks = await db.execute(select(Webhook).where(Webhook.encrypted_secret.is_not(None)))
    for record in webhooks.scalars():
        token = reseal_if_legacy(record.encrypted_secret)
        if token:
            record.encrypted_secret = token
            changed += 1
    domains = await db.execute(select(Domain).where(Domain.encrypted_dkim_key.is_not(None)))
    for record in domains.scalars():
        token = reseal_if_legacy(record.encrypted_dkim_key)
        if token:
            record.encrypted_dkim_key = token
            changed += 1
    if changed:
        await db.commit()
        logger.info("Re-sealed %s stored secret(s) with ENCRYPTION_KEY", changed)
    return changed

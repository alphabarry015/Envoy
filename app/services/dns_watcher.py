"""Re-checks in the background the domains whose DNS is not fully configured yet."""

from __future__ import annotations

import asyncio
import logging
import time
from uuid import UUID

from sqlalchemy import select

from app.core.config import settings
from app.core.database import SessionLocal
from app.models.domain import Domain, DomainStatus
from app.models.user import User
from app.services.aws_ses import get_ses_service
from app.services.domains import DomainError, _finalize_dns_records, _notify_domains, refresh_domain

logger = logging.getLogger("envoy.dns_watcher")

# Provider APIs are rate-limited: the live DNS check runs every tick, but asking the
# sending tool to re-verify a domain happens at most this often per domain.
_TOOL_SYNC_SECONDS = 300
_last_tool_sync: dict[UUID, float] = {}


def _statuses(records: list | None) -> list[str]:
    return [str(item.get("status") or "") for item in records or [] if isinstance(item, dict)]


def _needs_watch(domain: Domain) -> bool:
    return domain.status != DomainStatus.VERIFIED or any(
        status != "verified" for status in _statuses(domain.dns_records)
    )


async def recheck_pending_domains() -> int:
    """One pass. Returns how many domains changed."""
    changed = 0
    async with SessionLocal() as db:
        domains = [item for item in (await db.execute(select(Domain))).scalars().all() if _needs_watch(item)]
        for domain in domains:
            before = _statuses(domain.dns_records)
            records = await _finalize_dns_records(domain.dns_records)
            after = _statuses(records)
            if after != before:
                domain.dns_records = records
                await db.commit()
                changed += 1
                await _notify_domains(domain.user_id, "dns_rechecked", domain_id=str(domain.id), name=domain.name)

            all_published = bool(after) and all(status == "verified" for status in after)
            if domain.status != DomainStatus.VERIFIED and all_published:
                await _sync_with_tools(db, domain)
    return changed


async def _sync_with_tools(db, domain: Domain) -> None:
    now = time.monotonic()
    if now - _last_tool_sync.get(domain.id, 0.0) < _TOOL_SYNC_SECONDS:
        return
    _last_tool_sync[domain.id] = now
    owner = await db.get(User, domain.user_id)
    if owner is None:
        return
    try:
        await refresh_domain(db, owner, domain.id, get_ses_service())
    except DomainError as exc:
        logger.info("dns_watcher_tool_sync_skipped domain=%s detail=%s", domain.name, exc.detail)


async def run_dns_watcher(stop: asyncio.Event) -> None:
    interval = settings.dns_recheck_seconds
    logger.info("DNS watcher started (every %ss)", interval)
    while not stop.is_set():
        try:
            await asyncio.wait_for(stop.wait(), timeout=interval)
            break
        except asyncio.TimeoutError:
            pass
        try:
            await recheck_pending_domains()
        except Exception:  # noqa: BLE001 - one failed pass must not stop the watcher
            logger.exception("dns_watcher_pass_failed")

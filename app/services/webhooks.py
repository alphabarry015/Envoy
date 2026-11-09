from __future__ import annotations

import asyncio
import base64
import hashlib
import hmac
import json
import secrets
from datetime import datetime, timezone
from uuid import UUID

import httpx
from cryptography.fernet import Fernet, InvalidToken
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.models.user import User
from app.models.webhook import Webhook
from app.schemas.webhook import WebhookCreatedResponse, WebhookResponse, WebhookWrite
from app.services.url_guard import UnsafeUrlError, assert_public_destination

MAX_WEBHOOKS_PER_USER = 10


class WebhookError(Exception):
    def __init__(self, status_code: int, detail: str) -> None:
        self.status_code = status_code
        self.detail = detail
        super().__init__(detail)


def _new_secret() -> tuple[str, str, str]:
    raw = f"whsec_{secrets.token_urlsafe(32)}"
    digest = hashlib.sha256(raw.encode("utf-8")).hexdigest()
    return raw, digest, f"{raw[:14]}…"


def _fernet() -> Fernet:
    key = base64.urlsafe_b64encode(hashlib.sha256(get_settings().secret_key.encode("utf-8")).digest())
    return Fernet(key)


def seal_secret(raw: str) -> str:
    return _fernet().encrypt(raw.encode("utf-8")).decode("ascii")


def open_secret(token: str | None) -> str | None:
    if not token:
        return None
    try:
        return _fernet().decrypt(token.encode("ascii")).decode("utf-8")
    except (InvalidToken, ValueError):
        return None


async def list_webhooks(db: AsyncSession, user: User) -> list[Webhook]:
    result = await db.execute(
        select(Webhook).where(Webhook.user_id == user.id).order_by(Webhook.created_at.desc())
    )
    return list(result.scalars().all())


async def create_webhook(db: AsyncSession, user: User, payload: WebhookWrite) -> WebhookCreatedResponse:
    count = await db.scalar(select(func.count()).select_from(Webhook).where(Webhook.user_id == user.id))
    if (count or 0) >= MAX_WEBHOOKS_PER_USER:
        raise WebhookError(422, f"You can register up to {MAX_WEBHOOKS_PER_USER} endpoints.")
    await _ensure_unique_url(db, user, payload.url)
    raw, digest, prefix = _new_secret()
    record = Webhook(
        user_id=user.id,
        name=payload.name.strip(),
        url=payload.url,
        events=list(payload.events),
        providers=list(payload.providers) if payload.providers else None,
        secret_prefix=prefix,
        hashed_secret=digest,
        encrypted_secret=seal_secret(raw),
        is_active=True,
    )
    db.add(record)
    await db.commit()
    await db.refresh(record)
    body = WebhookResponse.model_validate(record).model_dump()
    return WebhookCreatedResponse(**body, secret=raw)


async def update_webhook(
    db: AsyncSession,
    user: User,
    webhook_id: UUID,
    payload: WebhookWrite,
) -> Webhook:
    record = await _owned(db, user, webhook_id)
    await _ensure_unique_url(db, user, payload.url, ignore_id=record.id)
    record.name = payload.name.strip()
    record.url = payload.url
    record.events = list(payload.events)
    record.providers = list(payload.providers) if payload.providers else None
    record.updated_at = datetime.now(timezone.utc)
    await db.commit()
    await db.refresh(record)
    return record


async def set_webhook_active(db: AsyncSession, user: User, webhook_id: UUID, active: bool) -> Webhook:
    record = await _owned(db, user, webhook_id)
    record.is_active = active
    record.updated_at = datetime.now(timezone.utc)
    await db.commit()
    await db.refresh(record)
    return record


async def rotate_webhook_secret(
    db: AsyncSession,
    user: User,
    webhook_id: UUID,
) -> WebhookCreatedResponse:
    record = await _owned(db, user, webhook_id)
    raw, digest, prefix = _new_secret()
    record.hashed_secret = digest
    record.secret_prefix = prefix
    record.encrypted_secret = seal_secret(raw)
    record.updated_at = datetime.now(timezone.utc)
    await db.commit()
    await db.refresh(record)
    body = WebhookResponse.model_validate(record).model_dump()
    return WebhookCreatedResponse(**body, secret=raw)


async def delete_webhook(db: AsyncSession, user: User, webhook_id: UUID) -> None:
    record = await _owned(db, user, webhook_id)
    await db.delete(record)
    await db.commit()


async def _owned(db: AsyncSession, user: User, webhook_id: UUID) -> Webhook:
    record = await db.get(Webhook, webhook_id)
    if record is None or record.user_id != user.id:
        raise WebhookError(404, "Webhook not found.")
    return record


async def _ensure_unique_url(
    db: AsyncSession,
    user: User,
    url: str,
    ignore_id: UUID | None = None,
) -> None:
    result = await db.execute(
        select(Webhook.id).where(Webhook.user_id == user.id, func.lower(Webhook.url) == url.lower())
    )
    found = result.scalar_one_or_none()
    if found is not None and found != ignore_id:
        raise WebhookError(409, "An endpoint with this URL already exists.")


async def deliver_user_event(
    db: AsyncSession,
    user_id: UUID,
    event: str,
    data: dict[str, str | None],
) -> None:
    """POST signé vers les endpoints actifs abonnés à cet événement."""
    result = await db.execute(
        select(Webhook).where(Webhook.user_id == user_id, Webhook.is_active.is_(True))
    )
    body = json.dumps({"type": event, "data": data}, separators=(",", ":"))
    event_provider = data.get("provider")
    targets: list[tuple[str, str]] = []
    for record in result.scalars().all():
        if event not in (record.events or []):
            continue
        allowed_providers = record.providers or []
        if allowed_providers and event_provider and event_provider not in allowed_providers:
            continue
        if allowed_providers and not event_provider:
            continue
        secret = open_secret(record.encrypted_secret)
        if secret is None:
            continue
        signature = hmac.new(secret.encode("utf-8"), body.encode("utf-8"), hashlib.sha256).hexdigest()
        targets.append((record.url, signature))
    if not targets:
        return

    async def post(client: httpx.AsyncClient, url: str, signature: str) -> None:
        try:
            await assert_public_destination(url)
            await client.post(
                url,
                content=body,
                headers={
                    "Content-Type": "application/json",
                    "X-Envoy-Event": event,
                    "X-Envoy-Signature": signature,
                },
            )
        except (httpx.HTTPError, UnsafeUrlError):
            return

    async with httpx.AsyncClient(
        timeout=httpx.Timeout(4.0, connect=2.0), follow_redirects=False
    ) as client:
        await asyncio.gather(*(post(client, url, signature) for url, signature in targets))

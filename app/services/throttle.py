"""Database-backed throttling for sign-in and invite activation (works across serverless instances)."""

from __future__ import annotations

import hashlib
from datetime import datetime, timedelta, timezone

from fastapi import Request
from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.login_attempt import LoginAttempt

WINDOW = timedelta(minutes=15)
MAX_PER_ACCOUNT = 5
MAX_PER_IP = 30


class ThrottledError(Exception):
    pass


def client_ip(request: Request) -> str:
    for header in ("x-real-ip", "x-vercel-forwarded-for", "x-forwarded-for"):
        value = request.headers.get(header)
        if value:
            return value.split(",")[0].strip()[:64]
    return request.client.host if request.client else "unknown"


def _key(kind: str, value: str) -> str:
    digest = hashlib.sha256(value.strip().lower().encode("utf-8")).hexdigest()
    return f"{kind}:{digest}"


def keys_for(scope: str, ip: str, account: str | None = None) -> list[tuple[str, int]]:
    keys = [(_key(f"{scope}-ip", ip), MAX_PER_IP)]
    if account:
        keys.append((_key(f"{scope}-acct", account), MAX_PER_ACCOUNT))
    return keys


async def ensure_allowed(db: AsyncSession, keys: list[tuple[str, int]]) -> None:
    since = datetime.now(timezone.utc) - WINDOW
    for key, limit in keys:
        count = await db.scalar(
            select(func.count()).select_from(LoginAttempt).where(
                LoginAttempt.key == key, LoginAttempt.created_at >= since
            )
        )
        if (count or 0) >= limit:
            raise ThrottledError()


async def record_failure(db: AsyncSession, keys: list[tuple[str, int]]) -> None:
    for key, _limit in keys:
        db.add(LoginAttempt(key=key))
    await db.execute(
        delete(LoginAttempt).where(LoginAttempt.created_at < datetime.now(timezone.utc) - timedelta(days=1))
    )
    await db.commit()


async def clear(db: AsyncSession, keys: list[tuple[str, int]]) -> None:
    account_keys = [key for key, _ in keys if "-acct:" in key]
    if account_keys:
        await db.execute(delete(LoginAttempt).where(LoginAttempt.key.in_(account_keys)))
        await db.commit()

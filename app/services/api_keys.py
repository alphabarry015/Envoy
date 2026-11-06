from __future__ import annotations

from datetime import datetime, timezone
from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import generate_api_key, hash_api_key
from app.models.user import ApiKey, User
from app.schemas.user import ApiKeyCreate, ApiKeyCreatedResponse, ApiKeyResponse


class ApiKeyError(Exception):
    def __init__(self, status_code: int, detail: str) -> None:
        self.status_code = status_code
        self.detail = detail
        super().__init__(detail)


async def list_api_keys(db: AsyncSession, user: User) -> list[ApiKey]:
    result = await db.execute(
        select(ApiKey).where(ApiKey.user_id == user.id).order_by(ApiKey.created_at.desc())
    )
    return list(result.scalars().all())


async def create_api_key(db: AsyncSession, user: User, payload: ApiKeyCreate) -> ApiKeyCreatedResponse:
    if not user.can_create_api_keys:
        raise ApiKeyError(403, "This account cannot create API keys.")

    existing = await db.execute(
        select(ApiKey.id).where(
            ApiKey.user_id == user.id,
            func.lower(ApiKey.name) == payload.name.strip().lower(),
        )
    )
    if existing.scalar_one_or_none() is not None:
        raise ApiKeyError(409, "A key with this name already exists.")

    raw_key, hashed_key, prefix = generate_api_key(payload.mode)
    if user.is_admin:
        daily_quota = _within_account_quota(payload.daily_quota, user.daily_send_quota)
        monthly_quota = _within_account_quota(payload.monthly_quota, user.monthly_send_quota)
    else:
        daily_quota = user.daily_send_quota
        monthly_quota = user.monthly_send_quota
    record = ApiKey(
        user_id=user.id,
        name=payload.name.strip(),
        key_prefix=prefix,
        hashed_key=hashed_key,
        mode=payload.mode,
        scopes=list(payload.scopes),
        daily_quota=daily_quota,
        monthly_quota=monthly_quota,
        is_active=True,
    )
    db.add(record)
    await db.commit()
    await db.refresh(record)
    body = ApiKeyResponse.model_validate(record).model_dump()
    return ApiKeyCreatedResponse(**body, key=raw_key)


def _within_account_quota(requested: int | None, ceiling: int | None) -> int | None:
    if ceiling is None:
        return requested
    if requested is None or requested > ceiling:
        return ceiling
    return requested


async def revoke_api_key(db: AsyncSession, user: User, key_id: UUID) -> ApiKey:
    record = await _owned_key(db, user, key_id)
    if record.is_active:
        record.is_active = False
        record.revoked_at = datetime.now(timezone.utc)
        await db.commit()
        await db.refresh(record)
    return record


async def delete_api_key(db: AsyncSession, user: User, key_id: UUID) -> None:
    record = await _owned_key(db, user, key_id)
    await db.delete(record)
    await db.commit()


async def authenticate_api_key(db: AsyncSession, raw_key: str) -> ApiKey | None:
    result = await db.execute(select(ApiKey).where(ApiKey.hashed_key == hash_api_key(raw_key)))
    record = result.scalar_one_or_none()
    if record is None or not record.is_active:
        return None
    record.last_used_at = datetime.now(timezone.utc)
    await db.commit()
    await db.refresh(record)
    return record


async def _owned_key(db: AsyncSession, user: User, key_id: UUID) -> ApiKey:
    record = await db.get(ApiKey, key_id)
    if record is None or record.user_id != user.id:
        raise ApiKeyError(404, "API key not found.")
    return record

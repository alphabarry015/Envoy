from __future__ import annotations

from uuid import UUID

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.suppression import Suppression, SuppressionReason
from app.models.user import User
from app.schemas.logs import SuppressionCreate


class SuppressionError(Exception):
    def __init__(self, status_code: int, detail: str) -> None:
        self.status_code = status_code
        self.detail = detail
        super().__init__(detail)


async def list_suppressions(db: AsyncSession, user: User) -> list[Suppression]:
    result = await db.execute(
        select(Suppression)
        .where(Suppression.user_id == user.id)
        .order_by(Suppression.created_at.desc())
    )
    return list(result.scalars().all())


async def create_suppression(db: AsyncSession, user: User, payload: SuppressionCreate) -> Suppression:
    email = str(payload.email).strip().lower()
    existing = await db.scalar(select(Suppression).where(Suppression.email == email))
    if existing is not None:
        raise SuppressionError(409, "This address is already suppressed.")
    record = Suppression(
        user_id=user.id,
        email=email,
        reason=SuppressionReason(payload.reason),
        source="manual",
    )
    db.add(record)
    try:
        await db.commit()
    except IntegrityError as exc:
        await db.rollback()
        raise SuppressionError(409, "This address is already suppressed.") from exc
    await db.refresh(record)
    return record


async def delete_suppression(db: AsyncSession, user: User, entry_id: UUID) -> None:
    record = await db.get(Suppression, entry_id)
    if record is None or record.user_id != user.id:
        raise SuppressionError(404, "Suppressed address not found.")
    await db.delete(record)
    await db.commit()

from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user
from app.core.database import get_db
from app.models.user import User
from app.schemas.logs import SuppressionCreate, SuppressionResponse
from app.services.suppressions import (
    SuppressionError,
    create_suppression,
    delete_suppression,
    list_suppressions,
)

router = APIRouter()


def _error(exc: SuppressionError) -> HTTPException:
    return HTTPException(status_code=exc.status_code, detail=exc.detail)


@router.get("", response_model=list[SuppressionResponse], summary="Lister les adresses bloquées")
async def list_blocked(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> list[SuppressionResponse]:
    records = await list_suppressions(db, user)
    return [SuppressionResponse.model_validate(record) for record in records]


@router.post(
    "",
    response_model=SuppressionResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Bloquer une adresse",
)
async def block_address(
    payload: SuppressionCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> SuppressionResponse:
    try:
        record = await create_suppression(db, user, payload)
    except SuppressionError as exc:
        raise _error(exc) from exc
    return SuppressionResponse.model_validate(record)


@router.delete("/{entry_id}", status_code=status.HTTP_204_NO_CONTENT, summary="Retirer une adresse")
async def unblock_address(
    entry_id: UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> None:
    try:
        await delete_suppression(db, user, entry_id)
    except SuppressionError as exc:
        raise _error(exc) from exc

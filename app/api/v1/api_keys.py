from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user
from app.core.database import get_db
from app.models.user import User
from app.schemas.user import ApiKeyCreate, ApiKeyCreatedResponse, ApiKeyResponse
from app.services.api_keys import (
    ApiKeyError,
    create_api_key,
    delete_api_key,
    list_api_keys,
    revoke_api_key,
)

router = APIRouter()


def _error(exc: ApiKeyError) -> HTTPException:
    return HTTPException(status_code=exc.status_code, detail=exc.detail)


@router.get("", response_model=list[ApiKeyResponse], summary="Lister les clés API")
async def list_keys(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> list[ApiKeyResponse]:
    return await list_api_keys(db, user)


@router.post(
    "",
    response_model=ApiKeyCreatedResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Créer une clé API",
)
async def create_key(
    payload: ApiKeyCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> ApiKeyCreatedResponse:
    try:
        return await create_api_key(db, user, payload)
    except ApiKeyError as exc:
        raise _error(exc) from exc


@router.post("/{key_id}/revoke", response_model=ApiKeyResponse, summary="Révoquer une clé API")
async def revoke_key(
    key_id: UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> ApiKeyResponse:
    try:
        return await revoke_api_key(db, user, key_id)
    except ApiKeyError as exc:
        raise _error(exc) from exc


@router.delete("/{key_id}", status_code=status.HTTP_204_NO_CONTENT, summary="Supprimer une clé API")
async def remove_key(
    key_id: UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> None:
    try:
        await delete_api_key(db, user, key_id)
    except ApiKeyError as exc:
        raise _error(exc) from exc

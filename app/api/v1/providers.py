from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_admin, get_current_user
from app.core.database import get_db
from app.models.user import User
from app.schemas.providers import (
    ProviderDetailResponse,
    ProviderDomainStats,
    ProviderUsage,
    ProviderWebhookLink,
    ProvidersResponse,
    ProvidersUpdateRequest,
)
from app.services.providers import (
    ProviderServiceError,
    ensure_provider_webhook,
    get_provider,
    list_providers,
    update_providers,
)

router = APIRouter()


@router.get("", response_model=ProvidersResponse, summary="État et consommation des transports")
async def get_providers(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> ProvidersResponse:
    listing = await list_providers(db)
    if user.is_admin:
        return listing
    # Platform-wide volumes and domain counts are admin-only.
    for item in listing.items:
        item.usage = ProviderUsage()
        item.domains = ProviderDomainStats()
    return listing


@router.get(
    "/{provider_id}",
    response_model=ProviderDetailResponse,
    summary="Détail et statistiques d'un transport",
)
async def read_provider(
    provider_id: str,
    db: AsyncSession = Depends(get_db),
    _admin: User = Depends(get_current_admin),
) -> ProviderDetailResponse:
    try:
        return await get_provider(db, provider_id)
    except ProviderServiceError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.detail) from exc


@router.post(
    "/{provider_id}/webhook",
    response_model=ProviderWebhookLink,
    summary="Créer / vérifier le webhook entrant chez l'outil",
)
async def sync_provider_webhook(
    provider_id: str,
    _admin: User = Depends(get_current_admin),
) -> ProviderWebhookLink:
    try:
        return await ensure_provider_webhook(provider_id)
    except ProviderServiceError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.detail) from exc


@router.patch("", response_model=ProvidersResponse, summary="Mettre à jour l'ordre et les limites")
async def patch_providers(
    payload: ProvidersUpdateRequest,
    db: AsyncSession = Depends(get_db),
    _admin: User = Depends(get_current_admin),
) -> ProvidersResponse:
    try:
        return await update_providers(db, payload)
    except ProviderServiceError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.detail) from exc

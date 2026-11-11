from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user
from app.core.database import get_db
from app.models.user import User
from app.schemas.domain import (
    DomainCreate,
    DomainListResponse,
    DomainProvidersUpdate,
    DomainResponse,
    DomainSenderUpdate,
    DomainVerifyResponse,
)
from app.services.aws_ses import SESService, get_ses_service
from app.services.dns_watcher import recheck_owned_domain
from app.services.domains import (
    DomainError,
    connect_domain,
    disconnect_domain,
    get_domain,
    list_domains,
    refresh_domain,
    update_domain_providers,
    update_domain_sender,
)

router = APIRouter()


def _error(exc: DomainError) -> HTTPException:
    return HTTPException(status_code=exc.status_code, detail=exc.detail)


@router.get("", response_model=DomainListResponse, summary="Lister les domaines")
async def list_user_domains(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
    ses: SESService = Depends(get_ses_service),
) -> DomainListResponse:
    items = await list_domains(db, user, ses)
    return DomainListResponse(items=items, total=len(items))


@router.post(
    "",
    response_model=DomainResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Connecter un domaine d'envoi",
)
async def create_domain(
    payload: DomainCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
    ses: SESService = Depends(get_ses_service),
) -> DomainResponse:
    """Relie un domaine aux outils choisis (SES / Brevo provisionnent l'identité)."""
    try:
        return await connect_domain(db, user, payload.name, ses, providers=payload.providers)
    except DomainError as exc:
        raise _error(exc) from exc


@router.patch(
    "/{domain_id}/providers",
    response_model=DomainResponse,
    summary="Mettre à jour les outils d'envoi d'un domaine",
)
async def patch_domain_providers(
    domain_id: UUID,
    payload: DomainProvidersUpdate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
    ses: SESService = Depends(get_ses_service),
) -> DomainResponse:
    try:
        return await update_domain_providers(db, user, domain_id, payload.providers, ses)
    except DomainError as exc:
        raise _error(exc) from exc


@router.put(
    "/{domain_id}/sender",
    response_model=DomainResponse,
    summary="Expéditeur par défaut et adresse de réponse du domaine",
)
async def put_domain_sender(
    domain_id: UUID,
    payload: DomainSenderUpdate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
    ses: SESService = Depends(get_ses_service),
) -> DomainResponse:
    try:
        return await update_domain_sender(db, user, domain_id, payload, ses)
    except DomainError as exc:
        raise _error(exc) from exc


@router.get("/{domain_id}", response_model=DomainResponse, summary="Détail d'un domaine")
async def read_domain(
    domain_id: UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
    ses: SESService = Depends(get_ses_service),
) -> DomainResponse:
    try:
        return await get_domain(db, user, domain_id, ses)
    except DomainError as exc:
        raise _error(exc) from exc


@router.get(
    "/{domain_id}/verify",
    response_model=DomainVerifyResponse,
    summary="Vérifier le statut DKIM / authentification auprès du transport",
)
async def verify_domain(
    domain_id: UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
    ses: SESService = Depends(get_ses_service),
) -> DomainVerifyResponse:
    try:
        domain = await refresh_domain(db, user, domain_id, ses)
    except DomainError as exc:
        raise _error(exc) from exc
    return DomainVerifyResponse(
        id=domain.id,
        name=domain.name,
        status=domain.status,
        dkim_status=domain.dkim_status,
        verified=domain.status.value == "verified",
        dns_records=domain.dns_records,
    )


@router.post(
    "/{domain_id}/dns-recheck",
    response_model=DomainResponse,
    summary="Revérifier le DNS en direct (sans appeler les outils)",
)
async def dns_recheck_domain(
    domain_id: UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
    ses: SESService = Depends(get_ses_service),
) -> DomainResponse:
    try:
        await recheck_owned_domain(db, user, domain_id)
        return await get_domain(db, user, domain_id, ses)
    except DomainError as exc:
        raise _error(exc) from exc


@router.delete(
    "/{domain_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Retirer un domaine d'Envoy",
)
async def delete_domain(
    domain_id: UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> None:
    try:
        await disconnect_domain(db, user, domain_id)
    except DomainError as exc:
        raise _error(exc) from exc

from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.schemas.domain import DomainCreate, DomainListResponse, DomainResponse, DomainVerifyResponse
from app.services.aws_ses import SESService, get_ses_service

router = APIRouter()


@router.post(
    "",
    response_model=DomainResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Déclarer un domaine d'envoi",
)
async def create_domain(
    payload: DomainCreate,
    db: AsyncSession = Depends(get_db),
    ses: SESService = Depends(get_ses_service),
) -> DomainResponse:
    """Crée l'identité SES, récupère les jetons DKIM et renvoie les records DNS.

    Sprint suivant : persistance du domaine, contrôle des quotas utilisateur,
    et appel `ses.create_domain_identity_async`.
    """
    raise HTTPException(
        status_code=status.HTTP_501_NOT_IMPLEMENTED,
        detail="Domain provisioning will be implemented in the next sprint",
    )


@router.get(
    "",
    response_model=DomainListResponse,
    summary="Lister les domaines",
)
async def list_domains(
    db: AsyncSession = Depends(get_db),
) -> DomainListResponse:
    raise HTTPException(
        status_code=status.HTTP_501_NOT_IMPLEMENTED,
        detail="Domain listing will be implemented in the next sprint",
    )


@router.get(
    "/{domain_id}",
    response_model=DomainResponse,
    summary="Détail d'un domaine",
)
async def get_domain(
    domain_id: UUID,
    db: AsyncSession = Depends(get_db),
) -> DomainResponse:
    raise HTTPException(
        status_code=status.HTTP_501_NOT_IMPLEMENTED,
        detail="Domain retrieval will be implemented in the next sprint",
    )


@router.get(
    "/{domain_id}/verify",
    response_model=DomainVerifyResponse,
    summary="Vérifier le statut DKIM auprès d'AWS SES",
)
async def verify_domain(
    domain_id: UUID,
    db: AsyncSession = Depends(get_db),
    ses: SESService = Depends(get_ses_service),
) -> DomainVerifyResponse:
    """Interroge `get_email_identity` et active le domaine si DKIM = SUCCESS."""
    raise HTTPException(
        status_code=status.HTTP_501_NOT_IMPLEMENTED,
        detail="Domain verification will be implemented in the next sprint",
    )


@router.delete(
    "/{domain_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Supprimer un domaine",
)
async def delete_domain(
    domain_id: UUID,
    db: AsyncSession = Depends(get_db),
    ses: SESService = Depends(get_ses_service),
) -> None:
    raise HTTPException(
        status_code=status.HTTP_501_NOT_IMPLEMENTED,
        detail="Domain deletion will be implemented in the next sprint",
    )

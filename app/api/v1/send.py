from __future__ import annotations

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.schemas.email import EmailSendRequest, EmailSendResponse
from app.services.aws_ses import SESService, get_ses_service

router = APIRouter()


@router.post(
    "",
    response_model=EmailSendResponse,
    status_code=status.HTTP_202_ACCEPTED,
    summary="Envoyer un e-mail transactionnel",
)
async def send_email(
    payload: EmailSendRequest,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
    ses: SESService = Depends(get_ses_service),
) -> EmailSendResponse:
    """Valide le payload, contrôle la suppression list / quotas, puis enqueue l'envoi SES.

    Le `messageId` est renvoyé immédiatement (< 80 ms) ; l'expédition AWS
    s'exécute via `BackgroundTasks`.
    """
    raise HTTPException(
        status_code=status.HTTP_501_NOT_IMPLEMENTED,
        detail="Transactional send will be implemented in the next sprint",
    )

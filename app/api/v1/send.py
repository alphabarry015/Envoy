from __future__ import annotations

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_send_api_key
from app.core.config import settings
from app.core.database import get_db
from app.models.email_log import EmailStatus
from app.models.user import ApiKey
from app.schemas.email import EmailSendRequest, EmailSendResponse
from app.services.send import SendError, accept_send, perform_provider_send

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
    api_key: ApiKey = Depends(get_send_api_key),
) -> EmailSendResponse:
    """Contrôle la clé, le domaine, la suppression et les quotas, puis envoie.

    Une clé sandbox est acceptée sans appel provider. Une clé live répond tout de suite
    avec le statut `queued` ; l'envoi suit dans la même requête, après la réponse.
    """
    try:
        log = await accept_send(db, api_key, payload)
    except SendError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.detail) from exc

    status_value = log.status
    if log.status == EmailStatus.QUEUED:
        if settings.inline_send:
            status_value = await perform_provider_send(log.id, payload) or log.status
        else:
            background_tasks.add_task(perform_provider_send, log.id, payload)
    return EmailSendResponse(message_id=log.message_id, status=status_value.value)

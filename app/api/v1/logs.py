from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user
from app.core.database import get_db
from app.models.user import User
from app.schemas.logs import EmailLogResponse
from app.services.logs import get_email_log, list_email_logs

router = APIRouter()


@router.get("", response_model=list[EmailLogResponse], summary="Lister les envois")
async def list_logs(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> list[EmailLogResponse]:
    return await list_email_logs(db, user)


@router.get("/{log_id}", response_model=EmailLogResponse, summary="Lire un envoi")
async def read_log(
    log_id: UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> EmailLogResponse:
    record = await get_email_log(db, user, log_id)
    if record is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Log not found.")
    return record

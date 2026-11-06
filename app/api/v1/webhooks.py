from __future__ import annotations

import json
from typing import Any
from urllib.parse import urlparse
from uuid import UUID

import httpx
from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user
from app.core.database import get_db
from app.models.user import User
from app.schemas.email import SNSNotification
from app.schemas.webhook import WebhookCreatedResponse, WebhookResponse, WebhookStatusUpdate, WebhookWrite
from app.services.ses_events import apply_ses_notification
from app.services.webhooks import (
    WebhookError,
    create_webhook,
    delete_webhook,
    list_webhooks,
    rotate_webhook_secret,
    set_webhook_active,
    update_webhook,
)

router = APIRouter()

ALLOWED_SNS_HOST_SUFFIX = ".amazonaws.com"


def _error(exc: WebhookError) -> HTTPException:
    return HTTPException(status_code=exc.status_code, detail=exc.detail)


def _is_trusted_sns_url(url: str | None) -> bool:
    if not url:
        return False
    parsed = urlparse(url)
    host = (parsed.hostname or "").lower()
    return parsed.scheme == "https" and host.endswith(ALLOWED_SNS_HOST_SUFFIX)


@router.get("", response_model=list[WebhookResponse], summary="Lister les webhooks")
async def list_user_webhooks(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> list[WebhookResponse]:
    return await list_webhooks(db, user)


@router.post(
    "",
    response_model=WebhookCreatedResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Créer un webhook",
)
async def create_user_webhook(
    payload: WebhookWrite,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> WebhookCreatedResponse:
    try:
        return await create_webhook(db, user, payload)
    except WebhookError as exc:
        raise _error(exc) from exc


@router.post(
    "/ses",
    status_code=status.HTTP_200_OK,
    summary="Webhook AWS SNS (bounces, complaints, confirmation)",
)
async def ses_webhook(
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> dict[str, str]:
    """Confirme l'abonnement SNS et enregistre bounces permanents et plaintes."""
    try:
        payload: dict[str, Any] = await request.json()
        notification = SNSNotification.model_validate(payload)
    except Exception as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid SNS payload") from exc

    if notification.Type == "SubscriptionConfirmation":
        if not _is_trusted_sns_url(notification.SubscribeURL):
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Untrusted SNS SubscribeURL")
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.get(notification.SubscribeURL)  # type: ignore[arg-type]
            response.raise_for_status()
        return {"status": "subscription_confirmed"}

    if notification.Type == "Notification":
        message = notification.Message
        if isinstance(message, str):
            try:
                message = json.loads(message)
            except json.JSONDecodeError:
                message = {"raw": message}
        if not isinstance(message, dict):
            message = {"raw": message}
        kind = await apply_ses_notification(db, message)
        return {"status": "accepted", "notification_type": kind}

    if notification.Type == "UnsubscribeConfirmation":
        return {"status": "unsubscribe_acknowledged"}

    raise HTTPException(
        status_code=status.HTTP_400_BAD_REQUEST,
        detail=f"Unsupported SNS message type: {notification.Type}",
    )


@router.patch("/{webhook_id}", response_model=WebhookResponse, summary="Modifier un webhook")
async def update_user_webhook(
    webhook_id: UUID,
    payload: WebhookWrite,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> WebhookResponse:
    try:
        return await update_webhook(db, user, webhook_id, payload)
    except WebhookError as exc:
        raise _error(exc) from exc


@router.post("/{webhook_id}/status", response_model=WebhookResponse, summary="Activer ou désactiver un webhook")
async def change_webhook_status(
    webhook_id: UUID,
    payload: WebhookStatusUpdate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> WebhookResponse:
    try:
        return await set_webhook_active(db, user, webhook_id, payload.active)
    except WebhookError as exc:
        raise _error(exc) from exc


@router.post(
    "/{webhook_id}/rotate",
    response_model=WebhookCreatedResponse,
    summary="Régénérer le secret d'un webhook",
)
async def rotate_user_webhook(
    webhook_id: UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> WebhookCreatedResponse:
    try:
        return await rotate_webhook_secret(db, user, webhook_id)
    except WebhookError as exc:
        raise _error(exc) from exc


@router.delete("/{webhook_id}", status_code=status.HTTP_204_NO_CONTENT, summary="Supprimer un webhook")
async def remove_user_webhook(
    webhook_id: UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> None:
    try:
        await delete_webhook(db, user, webhook_id)
    except WebhookError as exc:
        raise _error(exc) from exc

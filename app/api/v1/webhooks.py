from __future__ import annotations

import json
import logging
from typing import Any
from uuid import UUID

import httpx
from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user
from app.core.database import get_db
from app.models.user import User
from app.core.config import settings
from app.schemas.email import SNSNotification
from app.schemas.webhook import WebhookCreatedResponse, WebhookResponse, WebhookStatusUpdate, WebhookWrite
from app.services.provider_webhooks import (
    ProviderWebhookError,
    handle_brevo_event,
    handle_mailtrap_event,
    handle_resend_event,
    verify_mailtrap_signature,
    verify_resend_svix,
    verify_shared_secret,
)
from app.services.ses_events import apply_ses_notification
from app.services.sns_verify import SnsVerificationError, is_trusted_sns_url, verify_sns_message
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
logger = logging.getLogger("envoy.webhooks")


def _error(exc: WebhookError) -> HTTPException:
    return HTTPException(status_code=exc.status_code, detail=exc.detail)


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


def _provider_secret(request: Request) -> str | None:
    auth = request.headers.get("authorization") or ""
    bearer = None
    if auth.lower().startswith("bearer "):
        bearer = auth[7:].strip() or None
    return (
        request.headers.get("x-envoy-webhook-secret")
        or request.headers.get("x-webhook-secret")
        or bearer
    )


@router.post("/resend", status_code=status.HTTP_200_OK, summary="Webhook Resend")
async def resend_webhook(request: Request, db: AsyncSession = Depends(get_db)) -> dict[str, str]:
    try:
        raw = await request.body()
        headers = {key.lower(): value for key, value in request.headers.items()}
        verify_resend_svix(
            raw_body=raw,
            headers=headers,
            signing_secret=settings.webhook_secret_resend,
        )
        body = json.loads(raw.decode("utf-8") or "{}")
        kind = await handle_resend_event(db, body if isinstance(body, dict) else {})
    except ProviderWebhookError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.detail) from exc
    except json.JSONDecodeError as exc:
        raise HTTPException(status_code=400, detail="Invalid JSON payload") from exc
    return {"status": "accepted", "notification_type": kind}


@router.post("/brevo", status_code=status.HTTP_200_OK, summary="Webhook Brevo")
async def brevo_webhook(request: Request, db: AsyncSession = Depends(get_db)) -> dict[str, str]:
    try:
        verify_shared_secret(_provider_secret(request), settings.webhook_secret_brevo)
        body = await request.json()
        kind = await handle_brevo_event(db, body)
    except ProviderWebhookError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.detail) from exc
    return {"status": "accepted", "notification_type": kind}


@router.post("/mailtrap", status_code=status.HTTP_200_OK, summary="Webhook Mailtrap")
async def mailtrap_webhook(request: Request, db: AsyncSession = Depends(get_db)) -> dict[str, str]:
    try:
        raw = await request.body()
        verify_mailtrap_signature(
            raw_body=raw,
            signature=request.headers.get("mailtrap-signature"),
            signing_secret=settings.webhook_secret_mailtrap,
        )
        body = json.loads(raw.decode("utf-8") or "{}")
        kind = await handle_mailtrap_event(db, body if isinstance(body, (dict, list)) else {})
    except ProviderWebhookError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.detail) from exc
    except json.JSONDecodeError as exc:
        raise HTTPException(status_code=400, detail="Invalid JSON payload") from exc
    return {"status": "accepted", "notification_type": kind}


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
    try:
        await verify_sns_message(payload)
    except SnsVerificationError as exc:
        logger.warning("ses_webhook_rejected reason=%s", exc)
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Invalid SNS signature") from exc

    if notification.Type == "SubscriptionConfirmation":
        if not is_trusted_sns_url(notification.SubscribeURL, subscribe=True):
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Untrusted SNS SubscribeURL")
        async with httpx.AsyncClient(timeout=10.0, follow_redirects=False) as client:
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

from __future__ import annotations

import json
from typing import Any
from urllib.parse import urlparse

import httpx
from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.schemas.email import SNSNotification

router = APIRouter()

ALLOWED_SNS_HOST_SUFFIX = ".amazonaws.com"


def _is_trusted_sns_url(url: str | None) -> bool:
    if not url:
        return False
    parsed = urlparse(url)
    host = (parsed.hostname or "").lower()
    return parsed.scheme == "https" and host.endswith(ALLOWED_SNS_HOST_SUFFIX)


@router.post(
    "/ses",
    status_code=status.HTTP_200_OK,
    summary="Webhook AWS SNS (bounces, complaints, confirmation)",
)
async def ses_webhook(
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> dict[str, str]:
    """Traite les notifications SNS rattachées à Amazon SES.

    Gère dès maintenant la confirmation d'abonnement SNS. Le parsing des
    bounces / complaints et l'écriture dans `suppression_list` sont prévus
    au sprint webhooks.
    """
    try:
        payload: dict[str, Any] = await request.json()
        notification = SNSNotification.model_validate(payload)
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid SNS payload",
        ) from exc

    if notification.Type == "SubscriptionConfirmation":
        if not _is_trusted_sns_url(notification.SubscribeURL):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Untrusted SNS SubscribeURL",
            )
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
        # TODO: parser Bounce / Complaint / Delivery et alimenter suppression_list
        notification_type = (
            message.get("notificationType") if isinstance(message, dict) else "unknown"
        )
        return {"status": "accepted", "notification_type": str(notification_type)}

    if notification.Type == "UnsubscribeConfirmation":
        return {"status": "unsubscribe_acknowledged"}

    raise HTTPException(
        status_code=status.HTTP_400_BAD_REQUEST,
        detail=f"Unsupported SNS message type: {notification.Type}",
    )

from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone
from typing import Literal
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator
from sqlalchemy import case, func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_admin
from app.core.config import settings
from app.core.database import get_db
from app.models.access_request import AccessRequest
from app.models.user import User, UserRole
from app.schemas.user import InviteCreatedResponse, InviteUserRequest
from app.services import throttle
from app.services.access_request_email import render_admin_notification, render_decline
from app.services.auth import AuthError, invite_user
from app.services.platform_mail import deliver
from app.services.realtime import publish as realtime_publish

router = APIRouter()
logger = logging.getLogger("envoy.access_requests")

EVENT = "access_requests.changed"
DECLINE_COOLDOWN = timedelta(days=30)


class AccessRequestIn(BaseModel):
    full_name: str = Field(..., min_length=1, max_length=120)
    email: EmailStr
    organization: str = Field(..., min_length=1, max_length=160)
    volume: Literal["<10k", "10k-100k", "100k-1M", "1M+"]
    use_case: str = Field(..., min_length=1, max_length=2000)
    # Hidden field: humans leave it empty, bots fill it.
    website: str = Field(default="", max_length=200)

    @field_validator("full_name", "organization")
    @classmethod
    def single_line(cls, value: str) -> str:
        cleaned = " ".join(value.split())
        if not cleaned:
            raise ValueError("This field is required.")
        return cleaned


class AccessRequestOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    full_name: str
    email: str
    organization: str
    volume: str
    use_case: str
    status: str
    created_at: datetime
    decided_at: datetime | None = None


class AcceptAccessRequest(BaseModel):
    max_domains: int | None = Field(default=None, ge=0)
    daily_send_quota: int | None = Field(default=None, ge=0)
    monthly_send_quota: int | None = Field(default=None, ge=0)
    can_create_api_keys: bool = True
    invite_expires_hours: int | None = Field(default=None, ge=1, le=365 * 24)
    provider: str = Field(..., min_length=1, max_length=32)


class DeclineAccessRequest(BaseModel):
    notify: bool = True


async def _notify_admins(db: AsyncSession, data: dict[str, str]) -> None:
    admin_ids = (await db.scalars(select(User.id).where(User.role == UserRole.ADMIN))).all()
    for admin_id in admin_ids:
        await realtime_publish(admin_id, EVENT, data)


def is_duplicate(
    *, has_account: bool, latest: AccessRequest | None, now: datetime | None = None
) -> bool:
    """A request adds nothing when the person already has an account, is already waiting
    for review, or was declined recently."""
    if has_account:
        return True
    if latest is None:
        return False
    if latest.status == "pending":
        return True
    if latest.status == "declined" and latest.decided_at is not None:
        return latest.decided_at > (now or datetime.now(timezone.utc)) - DECLINE_COOLDOWN
    return False


async def _pending(db: AsyncSession, request_id: UUID) -> AccessRequest:
    item = await db.get(AccessRequest, request_id)
    if item is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Request not found.")
    if item.status != "pending":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"This request was already {item.status}.",
        )
    return item


@router.post("", status_code=status.HTTP_202_ACCEPTED, summary="Demande d'accès (formulaire public)")
async def submit_access_request(
    payload: AccessRequestIn,
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> dict[str, str]:
    if payload.website.strip():
        return {"status": "received"}
    ip = throttle.client_ip(request)
    keys = throttle.keys_for("access", ip, str(payload.email), ip_limit=5, account_limit=3)
    try:
        await throttle.ensure_allowed(db, keys)
    except throttle.ThrottledError:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Too many requests. Try again in a few minutes.",
        ) from None
    await throttle.record_failure(db, keys)

    # Same answer either way, so the form never reveals who already has an account.
    email = str(payload.email).lower()
    has_account = await db.scalar(select(User.id).where(func.lower(User.email) == email))
    latest = await db.scalar(
        select(AccessRequest)
        .where(func.lower(AccessRequest.email) == email)
        .order_by(AccessRequest.created_at.desc())
        .limit(1)
    )
    if is_duplicate(has_account=has_account is not None, latest=latest):
        return {"status": "received"}

    item = AccessRequest(
        full_name=payload.full_name,
        email=email,
        organization=payload.organization,
        volume=payload.volume,
        use_case=payload.use_case.strip(),
        ip=ip[:64] if ip else None,
    )
    db.add(item)
    try:
        await db.commit()
    except IntegrityError:
        await db.rollback()
        return {"status": "received"}
    await db.refresh(item)

    site_url = settings.public_app_url.rstrip("/")
    subject, text_body, html_body = render_admin_notification(
        full_name=item.full_name,
        email=item.email,
        organization=item.organization,
        volume=item.volume,
        use_case=item.use_case,
        review_url=f"{site_url}/console/users?request={item.id}",
        recipient=settings.access_request_email,
        site_url=site_url,
    )
    delivery = await deliver(
        to=settings.access_request_email,
        subject=subject,
        html=html_body,
        text=text_body,
        reply_to=item.email,
    )
    if not delivery.sent:
        # The request is stored and shows up in the console, so the requester still gets a 202.
        logger.error("access_request_email_failed id=%s error=%s", item.id, delivery.error)
    await _notify_admins(db, {"id": str(item.id), "reason": "created"})
    return {"status": "received"}


@router.get("", response_model=list[AccessRequestOut], summary="Demandes d'accès (admin)")
async def list_access_requests(
    db: AsyncSession = Depends(get_db),
    _admin: User = Depends(get_current_admin),
) -> list[AccessRequest]:
    pending_first = case((AccessRequest.status == "pending", 0), else_=1)
    result = await db.scalars(
        select(AccessRequest).order_by(pending_first, AccessRequest.created_at.desc()).limit(200)
    )
    return list(result.all())


@router.post(
    "/{request_id}/accept",
    response_model=InviteCreatedResponse,
    summary="Accepter une demande et envoyer l'invitation",
)
async def accept_access_request(
    request_id: UUID,
    payload: AcceptAccessRequest,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(get_current_admin),
) -> InviteCreatedResponse:
    item = await _pending(db, request_id)
    invite = InviteUserRequest(
        email=item.email,
        display_name=item.full_name,
        **payload.model_dump(),
    )
    try:
        created = await invite_user(db, admin, invite)
    except AuthError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.detail) from exc
    item = await db.get(AccessRequest, request_id)
    if item is not None:
        item.status = "accepted"
        item.decided_by = admin.id
        item.decided_at = datetime.now(timezone.utc)
        await db.commit()
    await _notify_admins(db, {"id": str(request_id), "reason": "accepted"})
    return created


@router.post(
    "/{request_id}/decline",
    response_model=AccessRequestOut,
    summary="Refuser une demande",
)
async def decline_access_request(
    request_id: UUID,
    payload: DeclineAccessRequest,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(get_current_admin),
) -> AccessRequest:
    item = await _pending(db, request_id)
    item.status = "declined"
    item.decided_by = admin.id
    item.decided_at = datetime.now(timezone.utc)
    await db.commit()
    await db.refresh(item)
    if payload.notify:
        site_url = settings.public_app_url.rstrip("/")
        subject, text_body, html_body = render_decline(
            full_name=item.full_name, recipient=item.email, site_url=site_url
        )
        delivery = await deliver(
            to=item.email,
            subject=subject,
            html=html_body,
            text=text_body,
            reply_to=admin.invite_reply_to,
        )
        if not delivery.sent:
            logger.warning("access_decline_email_failed id=%s error=%s", item.id, delivery.error)
    await _notify_admins(db, {"id": str(request_id), "reason": "declined"})
    return item

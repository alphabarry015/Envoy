from __future__ import annotations

import html
import logging
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel, EmailStr, Field, field_validator
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.database import get_db
from app.providers import EmailProviderError
from app.providers.factory import get_email_router_async
from app.services import throttle

router = APIRouter()
logger = logging.getLogger("envoy.access_requests")


class AccessRequest(BaseModel):
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


def _bodies(payload: AccessRequest, ip: str) -> tuple[str, str]:
    rows = [
        ("Name", payload.full_name),
        ("Email", str(payload.email)),
        ("Organization", payload.organization),
        ("Monthly volume", payload.volume),
        ("IP", ip),
    ]
    text = "New Envoy access request\n\n"
    text += "\n".join(f"{label}: {value}" for label, value in rows)
    text += f"\n\nUse case:\n{payload.use_case}\n\nReply to this email to answer the requester.\n"
    cells = "".join(
        f"<tr><td style=\"padding:4px 12px 4px 0;color:#555\">{html.escape(label)}</td>"
        f"<td style=\"padding:4px 0\"><strong>{html.escape(value)}</strong></td></tr>"
        for label, value in rows
    )
    body = (
        "<h2 style=\"margin:0 0 12px\">New Envoy access request</h2>"
        f"<table style=\"border-collapse:collapse;font-size:14px\">{cells}</table>"
        "<p style=\"margin:16px 0 4px;color:#555\">Use case</p>"
        f"<p style=\"white-space:pre-wrap;margin:0\">{html.escape(payload.use_case)}</p>"
        "<p style=\"margin-top:20px;color:#888;font-size:12px\">Reply to this email to answer the requester.</p>"
    )
    return text, body


@router.post("", status_code=status.HTTP_202_ACCEPTED, summary="Demande d'accès (formulaire public)")
async def submit_access_request(
    payload: AccessRequest,
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

    text_body, html_body = _bodies(payload, ip)
    router_ = await get_email_router_async(db)
    try:
        await router_.send(
            from_address=f"Envoy <{settings.platform_mail_from}>",
            to_addresses=[settings.access_request_email],
            subject=f"Access request: {payload.organization}"[:200],
            html=html_body,
            text=text_body,
            reply_to=[str(payload.email)],
        )
    except EmailProviderError:
        logger.exception("Access request email could not be sent")
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="The request could not be sent. Try again later.",
        ) from None
    return {"status": "received"}

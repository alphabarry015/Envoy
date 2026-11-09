"""Forgot-password flow: a 6-digit code sent by the platform mailer, checked, then exchanged for a new password."""

from __future__ import annotations

import hashlib
import hmac
import logging
import re
import secrets
from datetime import datetime, timedelta, timezone

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.models.user import User, UserStatus
from app.services.auth import AuthError, _as_utc, _hash, _mirror_auth_user, _revoke_sessions, _user_by_email
from app.services.password_reset_email import render_password_reset
from app.services.platform_mail import deliver

logger = logging.getLogger("envoy.password_reset")

CODE_TTL = timedelta(minutes=15)
MAX_ATTEMPTS = 5
INVALID = "This code is invalid or expired. Ask for a new one."


def normalize_code(code: str) -> str:
    return re.sub(r"\D", "", code or "")


def _digest(code: str) -> str:
    key = settings.secret_key.encode("utf-8")
    return hmac.new(key, f"password-reset:{code}".encode("utf-8"), hashlib.sha256).hexdigest()


def _can_reset(user: User | None) -> bool:
    # The bootstrap admin's password comes from BOOTSTRAP_ADMIN_PASSWORD and is restored on every start.
    if user is None or user.status != UserStatus.ACTIVE or not user.hashed_password:
        return False
    bootstrap = (settings.bootstrap_admin_email or "").strip().lower()
    return not (bootstrap and user.email.lower() == bootstrap)


async def request_reset(db: AsyncSession, email: str) -> None:
    """Sends a code when the account can be reset. Says nothing either way."""
    user = await _user_by_email(db, email)
    if not _can_reset(user):
        return
    assert user is not None
    code = f"{secrets.randbelow(1_000_000):06d}"
    user.password_reset_code = _digest(code)
    user.password_reset_expires_at = datetime.now(timezone.utc) + CODE_TTL
    user.password_reset_attempts = 0
    await db.commit()

    subject, text_body, html_body = render_password_reset(
        code=code,
        minutes=int(CODE_TTL.total_seconds() // 60),
        recipient=user.email,
        name=user.display_name,
        site_url=settings.public_app_url.rstrip("/"),
    )
    delivery = await deliver(to=user.email, subject=subject, html=html_body, text=text_body)
    if not delivery.sent:
        logger.error("password_reset_email_failed user=%s error=%s", user.id, delivery.error)


async def _matching_user(db: AsyncSession, email: str, code: str) -> User:
    user = await _user_by_email(db, email)
    digits = normalize_code(code)
    if (
        not _can_reset(user)
        or user is None
        or not user.password_reset_code
        or user.password_reset_expires_at is None
        or _as_utc(user.password_reset_expires_at) <= datetime.now(timezone.utc)
        or len(digits) != 6
    ):
        raise AuthError(400, INVALID)
    if not hmac.compare_digest(user.password_reset_code, _digest(digits)):
        user.password_reset_attempts = (user.password_reset_attempts or 0) + 1
        if user.password_reset_attempts >= MAX_ATTEMPTS:
            user.password_reset_code = None
            user.password_reset_expires_at = None
        await db.commit()
        raise AuthError(400, INVALID)
    return user


async def verify_code(db: AsyncSession, email: str, code: str) -> None:
    await _matching_user(db, email, code)


async def reset_password(db: AsyncSession, email: str, code: str, new_password: str) -> None:
    user = await _matching_user(db, email, code)
    user.hashed_password = await _hash(new_password)
    user.password_reset_code = None
    user.password_reset_expires_at = None
    user.password_reset_attempts = 0
    _revoke_sessions(user)
    await _mirror_auth_user(db, user)
    await db.commit()

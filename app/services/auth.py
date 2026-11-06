from __future__ import annotations

import hashlib
import hmac
from datetime import datetime, timedelta, timezone
from urllib.parse import quote
from uuid import UUID

from sqlalchemy import func, select, text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.security import (
    create_access_token,
    generate_invite_token,
    hash_password,
    verify_password,
)
from app.models.suppression import Suppression
from app.models.user import User, UserRole, UserStatus
from app.sql_files import read_sql
from app.services.aws_ses import SESClientError, get_ses_service
from app.schemas.user import (
    AcceptInviteRequest,
    InviteCreatedResponse,
    InviteUserRequest,
    PasswordChangeRequest,
    UserUpdateRequest,
)


class AuthError(Exception):
    def __init__(self, status_code: int, detail: str) -> None:
        self.status_code = status_code
        self.detail = detail
        super().__init__(detail)


def _hash_invite(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def _as_utc(value: datetime) -> datetime:
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value


def _require_admin(actor: User) -> None:
    if not actor.is_admin:
        raise AuthError(403, "Admin access required.")


async def _user_by_email(db: AsyncSession, email: str) -> User | None:
    result = await db.execute(select(User).where(func.lower(User.email) == email.lower()))
    return result.scalar_one_or_none()


async def _mirror_auth_user(db: AsyncSession, user: User) -> None:
    """Recopie le compte dans auth.users pour la page Authentification Supabase."""
    await db.flush()
    await db.execute(
        text(read_sql("auth_upsert_call.sql")),
        {
            "id": str(user.id),
            "email": user.email,
            "password": user.hashed_password,
            "role": user.role.value,
            "status": user.status.value,
        },
    )


_dummy_password_hash: str | None = None


def _dummy_hash() -> str:
    global _dummy_password_hash
    if _dummy_password_hash is None:
        _dummy_password_hash = hash_password("not-a-real-password")
    return _dummy_password_hash


async def authenticate(db: AsyncSession, email: str, password: str) -> User:
    user = await _user_by_email(db, email)
    hashed = user.hashed_password if user else None
    password_ok = verify_password(password, hashed or _dummy_hash())
    if user is None or not hashed or not password_ok or not user.is_active:
        raise AuthError(401, "Invalid email or password.")
    return user


def _activation_link(token: str) -> str:
    base = settings.public_app_url.rstrip("/")
    return f"{base}/auth/accept-invite?token={quote(token, safe='')}"


def _invite_bodies(link: str, expires: datetime) -> tuple[str, str]:
    when = expires.strftime("%d %b %Y %H:%M UTC")
    text = (
        "You have been invited to Envoy.\n\n"
        f"Activate your account:\n{link}\n\n"
        f"This link expires on {when} and can be used once.\n"
    )
    html = (
        "<p>You have been invited to Envoy.</p>"
        f'<p><a href="{link}">Activate your account</a></p>'
        f"<p>This link expires on {when} and can be used once.</p>"
    )
    return text, html


async def invite_user(db: AsyncSession, actor: User, payload: InviteUserRequest) -> InviteCreatedResponse:
    _require_admin(actor)
    email = payload.email.lower()
    suppressed = await db.scalar(select(Suppression.email).where(func.lower(Suppression.email) == email))
    if suppressed:
        raise AuthError(422, "This address is suppressed and cannot receive an invitation.")
    existing = await _user_by_email(db, email)
    if existing and existing.status != UserStatus.PENDING:
        raise AuthError(409, "An account with this email already exists.")

    raw_token = generate_invite_token()
    expires = datetime.now(timezone.utc) + timedelta(
        hours=payload.invite_expires_hours or settings.invite_token_expire_hours
    )
    if existing:
        user = existing
    else:
        user = User(
            email=email,
            display_name=payload.display_name,
            status=UserStatus.PENDING,
            role=payload.role,
        )
        db.add(user)

    user.role = payload.role
    user.status = UserStatus.PENDING
    user.display_name = payload.display_name
    user.hashed_password = None
    user.invite_token = _hash_invite(raw_token)
    user.invite_token_expires_at = expires
    user.max_domains = payload.max_domains
    user.daily_send_quota = payload.daily_send_quota
    user.monthly_send_quota = payload.monthly_send_quota
    user.can_create_api_keys = payload.can_create_api_keys
    await _mirror_auth_user(db, user)
    await db.commit()
    await db.refresh(user)
    link = _activation_link(raw_token)
    text_body, html_body = _invite_bodies(link, expires)
    try:
        await get_ses_service().send_email_async(
            from_address=f"Envoy <{settings.platform_mail_from}>",
            to_addresses=[user.email],
            subject="Activate your Envoy account",
            html=html_body,
            text=text_body,
        )
    except SESClientError as exc:
        raise AuthError(502, "The invitation was saved, but the activation email could not be sent.") from exc
    return InviteCreatedResponse(email=user.email, invite_token=raw_token, expires_at=expires)


async def accept_invite(db: AsyncSession, payload: AcceptInviteRequest) -> User:
    token_hash = _hash_invite(payload.token)
    result = await db.execute(select(User).where(User.invite_token == token_hash))
    user = result.scalar_one_or_none()
    expires = user.invite_token_expires_at if user else None
    valid = bool(
        user
        and user.status == UserStatus.PENDING
        and user.invite_token
        and hmac.compare_digest(user.invite_token, token_hash)
        and expires is not None
        and _as_utc(expires) > datetime.now(timezone.utc)
    )
    if not valid or user is None:
        raise AuthError(400, "Invite token is invalid or expired.")

    user.hashed_password = hash_password(payload.password)
    user.invite_token = None
    user.invite_token_expires_at = None
    user.status = UserStatus.ACTIVE
    await _mirror_auth_user(db, user)
    await db.commit()
    await db.refresh(user)
    return user


async def list_users(db: AsyncSession, actor: User) -> list[User]:
    _require_admin(actor)
    result = await db.execute(select(User).order_by(User.created_at.desc()))
    return list(result.scalars().all())


async def update_user(db: AsyncSession, actor: User, user_id: UUID, payload: UserUpdateRequest) -> User:
    """Met à jour le rôle, les quotas et le statut. Un invité pending ne devient pas actif ici."""
    _require_admin(actor)
    user = await db.get(User, user_id)
    if user is None:
        raise AuthError(404, "User not found.")
    if payload.status != user.status:
        if user.id == actor.id:
            raise AuthError(403, "You cannot change your own status.")
        allowed = {
            (UserStatus.ACTIVE, UserStatus.SUSPENDED),
            (UserStatus.SUSPENDED, UserStatus.ACTIVE),
        }
        if (user.status, payload.status) not in allowed:
            raise AuthError(422, "This status change is not allowed.")
        user.status = payload.status
    if user.id == actor.id and payload.role != user.role:
        raise AuthError(403, "You cannot change your own role.")
    user.role = payload.role
    if payload.display_name is not None:
        cleaned = " ".join(payload.display_name.split())
        user.display_name = cleaned or None
    user.max_domains = payload.max_domains
    user.daily_send_quota = payload.daily_send_quota
    user.monthly_send_quota = payload.monthly_send_quota
    user.can_create_api_keys = payload.can_create_api_keys
    await _mirror_auth_user(db, user)
    await db.commit()
    await db.refresh(user)
    return user


async def revoke_invite(db: AsyncSession, actor: User, user_id: UUID) -> None:
    """Retire une invitation encore en attente, y compris le miroir Supabase Auth."""
    _require_admin(actor)
    user = await db.get(User, user_id)
    if user is None:
        raise AuthError(404, "User not found.")
    if user.id == actor.id:
        raise AuthError(403, "You cannot remove your own account.")
    if user.status != UserStatus.PENDING:
        raise AuthError(422, "Only a pending invite can be revoked.")
    try:
        await db.execute(text(read_sql("auth_delete_identity.sql")), {"id": user.id})
        await db.execute(text(read_sql("auth_delete_user.sql")), {"id": user.id})
        db.expunge(user)
        await db.commit()
    except IntegrityError as exc:
        await db.rollback()
        raise AuthError(409, "This invite cannot be revoked.") from exc


async def change_password(db: AsyncSession, user: User, payload: PasswordChangeRequest) -> None:
    """Remplace le mot de passe après vérification de l'actuel."""
    hashed = user.hashed_password
    if not hashed or not verify_password(payload.current_password, hashed):
        raise AuthError(400, "Current password is incorrect.")
    user.hashed_password = hash_password(payload.new_password)
    await _mirror_auth_user(db, user)
    await db.commit()


def issue_token(user: User) -> str:
    return create_access_token(
        user.id,
        extra_claims={"role": user.role.value, "email": user.email},
    )


async def ensure_bootstrap_admin(db: AsyncSession) -> None:
    email = settings.bootstrap_admin_email
    password = settings.bootstrap_admin_password
    if not email or not password:
        return
    existing = await _user_by_email(db, email)
    if existing:
        await _mirror_auth_user(db, existing)
        await db.commit()
        return
    admin = User(
        email=email.lower(),
        hashed_password=hash_password(password),
        role=UserRole.ADMIN,
        status=UserStatus.ACTIVE,
        can_create_api_keys=True,
    )
    db.add(admin)
    await _mirror_auth_user(db, admin)
    await db.commit()

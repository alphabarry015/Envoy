from __future__ import annotations

import base64
import hashlib
import hmac
import re
import secrets
from datetime import datetime, timedelta, timezone
from typing import Any
from uuid import UUID

import bcrypt
import jwt
from cryptography.fernet import Fernet, InvalidToken, MultiFernet

from app.core.config import settings


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("ascii")


def verify_password(plain_password: str, hashed_password: str) -> bool:
    try:
        return bcrypt.checkpw(plain_password.encode("utf-8"), hashed_password.encode("ascii"))
    except ValueError:
        return False


def generate_api_key(mode: str = "live") -> tuple[str, str, str]:
    """Génère une clé API `envoy_live_...` ou `envoy_test_...`.

    Returns:
        (clé en clair, empreinte SHA-256, préfixe affichable)
    """
    prefix = "envoy_test_" if mode == "sandbox" else settings.api_key_prefix
    secret = secrets.token_urlsafe(32)
    raw_key = f"{prefix}{secret}"
    visible = f"{raw_key[:18]}…"
    return raw_key, hash_api_key(raw_key), visible


def hash_api_key(raw_key: str) -> str:
    return hashlib.sha256(raw_key.encode("utf-8")).hexdigest()


def verify_api_key(raw_key: str, hashed_key: str) -> bool:
    digest = hash_api_key(raw_key)
    return hmac.compare_digest(digest, hashed_key)


INVITE_ALPHABET = "ABCDEFGHJKMNPQRSTVWXYZ23456789"
_INVITE_CODE = re.compile(r"[A-Z0-9]{16}")


def generate_invite_token() -> str:
    """16 characters (~78 bits) shown as XXXX-XXXX-XXXX-XXXX so people can type it."""
    raw = "".join(secrets.choice(INVITE_ALPHABET) for _ in range(16))
    return "-".join(raw[i : i + 4] for i in range(0, 16, 4))


def normalize_invite_token(token: str) -> str:
    """Accepts a code typed with spaces, lowercase or no dashes; older long tokens pass through."""
    compact = re.sub(r"[\s-]", "", token).upper()
    if _INVITE_CODE.fullmatch(compact):
        return "-".join(compact[i : i + 4] for i in range(0, 16, 4))
    return token.strip()


def create_access_token(
    subject: str | UUID,
    extra_claims: dict[str, Any] | None = None,
    expires_delta: timedelta | None = None,
) -> str:
    now = datetime.now(timezone.utc)
    expire = now + (
        expires_delta
        if expires_delta is not None
        else timedelta(minutes=settings.access_token_expire_minutes)
    )
    payload: dict[str, Any] = {"sub": str(subject), "exp": expire, "iat": now}
    if extra_claims:
        payload.update(extra_claims)
    return jwt.encode(payload, settings.secret_key, algorithm=settings.jwt_algorithm)


def decode_access_token(token: str) -> dict[str, Any]:
    try:
        return jwt.decode(
            token,
            settings.secret_key,
            algorithms=[settings.jwt_algorithm],
            options={"require": ["sub", "exp", "iat"]},
        )
    except jwt.PyJWTError as exc:
        raise ValueError("Invalid or expired token") from exc


def _fernet_from(material: str) -> Fernet:
    return Fernet(base64.urlsafe_b64encode(hashlib.sha256(material.encode("utf-8")).digest()))


def _legacy_fernet() -> Fernet:
    return _fernet_from(settings.secret_key)


def _vault() -> MultiFernet:
    """Encrypts with ENCRYPTION_KEY; still opens values sealed with the old SECRET_KEY."""
    keys = [_legacy_fernet()]
    if settings.encryption_key:
        keys.insert(0, _fernet_from(settings.encryption_key))
    return MultiFernet(keys)


def seal_secret(raw: str) -> str:
    return _vault().encrypt(raw.encode("utf-8")).decode("ascii")


def open_secret(token: str | None) -> str | None:
    if not token:
        return None
    try:
        return _vault().decrypt(token.encode("ascii")).decode("utf-8")
    except (InvalidToken, ValueError):
        return None


def reseal_if_legacy(token: str | None) -> str | None:
    """Returns the token re-encrypted with ENCRYPTION_KEY, or None if no change is needed."""
    if not token or not settings.encryption_key:
        return None
    primary = _fernet_from(settings.encryption_key)
    try:
        primary.decrypt(token.encode("ascii"))
        return None
    except (InvalidToken, ValueError):
        pass
    try:
        return _vault().rotate(token.encode("ascii")).decode("ascii")
    except (InvalidToken, ValueError):
        return None

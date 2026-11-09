from __future__ import annotations

import pytest
from pydantic import ValidationError

from app.core.config import settings
from app.models.user import User, UserRole, UserStatus
from app.schemas.user import InviteUserRequest, PasswordResetRequest
from app.services.auth import ONLY_ONE_ADMIN, AuthError, invite_user
from app.services.password_reset import _can_reset, _digest, normalize_code
from app.services.password_reset_email import format_reset_code, render_password_reset


def test_code_is_normalized_and_never_stored_in_clear() -> None:
    assert normalize_code(" 123-456 ") == "123456"
    assert format_reset_code("123456") == "123-456"
    digest = _digest("123456")
    assert "123456" not in digest and len(digest) == 64
    assert digest != _digest("123457")


def test_only_active_accounts_with_a_password_can_reset(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "bootstrap_admin_email", "boss@example.com")
    member = User(email="ada@example.com", status=UserStatus.ACTIVE, hashed_password="x")
    assert _can_reset(member) is True
    assert _can_reset(User(email="p@example.com", status=UserStatus.PENDING, hashed_password=None)) is False
    assert _can_reset(User(email="s@example.com", status=UserStatus.SUSPENDED, hashed_password="x")) is False
    assert _can_reset(User(email="Boss@Example.com", status=UserStatus.ACTIVE, hashed_password="x")) is False
    assert _can_reset(None) is False


def test_reset_email_shows_the_dashed_code_and_escapes_the_name() -> None:
    subject, text, html = render_password_reset(
        code="123456",
        minutes=15,
        recipient="ada@example.com",
        name="<b>Ada</b> Lovelace",
        site_url="https://envoy.example.com",
    )
    assert subject == "Your Envoy password reset code"
    assert "123-456" in text and "123-456" in html
    assert "<b>Ada" not in html
    assert "15 minutes" in html and "/console/login" in html


def test_reset_passwords_must_match() -> None:
    with pytest.raises(ValidationError):
        PasswordResetRequest(
            email="ada@example.com",
            code="123-456",
            new_password="a-long-password",
            new_password_confirm="another-password",
        )


@pytest.mark.asyncio
async def test_admins_cannot_be_invited() -> None:
    admin = User(email="boss@example.com", role=UserRole.ADMIN, status=UserStatus.ACTIVE)
    payload = InviteUserRequest(
        email="new@example.com", display_name="New Admin", role=UserRole.ADMIN, provider="brevo"
    )
    with pytest.raises(AuthError) as caught:
        await invite_user(None, admin, payload)  # type: ignore[arg-type]
    assert caught.value.detail == ONLY_ONE_ADMIN

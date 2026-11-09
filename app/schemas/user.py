from __future__ import annotations

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator, model_validator

from app.models.user import UserRole, UserStatus


_INVITE_PROVIDERS = frozenset({"ses", "resend", "brevo", "mailtrap"})


def _check_bcrypt_length(password: str) -> None:
    # bcrypt silently ignores everything past 72 bytes.
    if len(password.encode("utf-8")) > 72:
        raise ValueError("Password is too long (72 bytes maximum).")


class InviteUserRequest(BaseModel):
    email: EmailStr
    display_name: str = Field(..., min_length=1, max_length=120)
    role: UserRole = UserRole.USER
    max_domains: int | None = Field(default=None, ge=0, description="None = illimité")
    daily_send_quota: int | None = Field(default=None, ge=0)
    monthly_send_quota: int | None = Field(default=None, ge=0)
    can_create_api_keys: bool = True
    invite_expires_hours: int | None = Field(default=None, ge=1, le=365 * 24)
    # Tool used to deliver the invite email (required — no silent SES-only path).
    provider: str = Field(..., min_length=1, max_length=32)

    @field_validator("display_name")
    @classmethod
    def clean_display_name(cls, value: str) -> str:
        cleaned = " ".join(value.split())
        if not cleaned:
            raise ValueError("Name is required.")
        return cleaned

    @field_validator("provider")
    @classmethod
    def clean_provider(cls, value: str) -> str:
        cleaned = value.strip().lower()
        if cleaned not in _INVITE_PROVIDERS:
            raise ValueError("Unknown sending tool. Choose SES, Resend, Brevo, or Mailtrap.")
        return cleaned


class AcceptInviteRequest(BaseModel):
    token: str = Field(..., min_length=16)
    password: str = Field(..., min_length=10, max_length=128)
    password_confirm: str = Field(..., min_length=10, max_length=128)

    @model_validator(mode="after")
    def passwords_match(self) -> AcceptInviteRequest:
        if self.password != self.password_confirm:
            raise ValueError("Passwords do not match")
        _check_bcrypt_length(self.password)
        return self


class LoginRequest(BaseModel):
    email: EmailStr
    password: str = Field(..., min_length=1, max_length=128)


class PasswordChangeRequest(BaseModel):
    current_password: str = Field(..., min_length=1, max_length=128)
    new_password: str = Field(..., min_length=10, max_length=128)
    new_password_confirm: str = Field(..., min_length=10, max_length=128)

    @model_validator(mode="after")
    def passwords_match(self) -> PasswordChangeRequest:
        if self.new_password != self.new_password_confirm:
            raise ValueError("Passwords do not match")
        if self.new_password == self.current_password:
            raise ValueError("Choose a different password")
        _check_bcrypt_length(self.new_password)
        return self


class UserResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    email: EmailStr
    display_name: str | None = None
    role: UserRole
    status: UserStatus
    max_domains: int | None = None
    daily_send_quota: int | None = None
    monthly_send_quota: int | None = None
    can_create_api_keys: bool
    invite_token_expires_at: datetime | None = None
    invite_reply_to: str | None = None
    created_at: datetime
    updated_at: datetime


class ProfileUpdate(BaseModel):
    """Name shown to others, for example in invitation emails."""

    display_name: str = Field(..., min_length=1, max_length=120)

    @field_validator("display_name")
    @classmethod
    def single_line(cls, value: str) -> str:
        cleaned = " ".join(value.split())
        if not cleaned:
            raise ValueError("Name is required.")
        if "@" in cleaned or any(char in cleaned for char in "<>\""):
            raise ValueError("Use a name, not an email address.")
        return cleaned


class InviteSettingsUpdate(BaseModel):
    """Reply-To of the invitation emails sent by this admin. None = no Reply-To."""

    invite_reply_to: EmailStr | None = None


class UserUpdateRequest(BaseModel):
    role: UserRole
    status: UserStatus
    display_name: str | None = Field(default=None, max_length=120)
    max_domains: int | None = Field(default=None, ge=0)
    daily_send_quota: int | None = Field(default=None, ge=0)
    monthly_send_quota: int | None = Field(default=None, ge=0)
    can_create_api_keys: bool


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserResponse


class InviteCreatedResponse(BaseModel):
    email: EmailStr
    invite_token: str
    invite_link: str
    expires_at: datetime
    email_sent: bool
    sent_with: str | None = None
    email_error: str | None = None


class ApiKeyCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=120)
    mode: str = Field(default="live", pattern="^(live|sandbox)$")
    scopes: list[str] = Field(default_factory=lambda: ["send"], min_length=1)
    daily_quota: int | None = Field(default=None, ge=1)
    monthly_quota: int | None = Field(default=None, ge=1)
    preferred_provider: str | None = None

    @model_validator(mode="after")
    def known_scopes(self) -> ApiKeyCreate:
        allowed = {"send", "domains", "logs"}
        unknown = [scope for scope in self.scopes if scope not in allowed]
        if unknown or len(set(self.scopes)) != len(self.scopes):
            raise ValueError("Unknown API key scope.")
        if self.preferred_provider is not None:
            value = self.preferred_provider.strip().lower()
            if value in {"", "auto"}:
                self.preferred_provider = None
            elif value not in {"ses", "resend", "brevo", "mailtrap"}:
                raise ValueError("Unknown preferred provider.")
            else:
                self.preferred_provider = value
        return self


class ApiKeyResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    name: str
    key_prefix: str
    mode: str
    scopes: list[str]
    daily_quota: int | None = None
    monthly_quota: int | None = None
    preferred_provider: str | None = None
    is_active: bool
    last_used_at: datetime | None = None
    revoked_at: datetime | None = None
    created_at: datetime


class ApiKeyCreatedResponse(ApiKeyResponse):
    """Réponse unique contenant la clé en clair — non réaffichée ensuite."""

    key: str

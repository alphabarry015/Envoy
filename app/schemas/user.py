from __future__ import annotations

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator, model_validator

from app.models.user import UserRole, UserStatus


class InviteUserRequest(BaseModel):
    email: EmailStr
    display_name: str = Field(..., min_length=1, max_length=120)
    role: UserRole = UserRole.USER
    max_domains: int | None = Field(default=None, ge=0, description="None = illimité")
    daily_send_quota: int | None = Field(default=None, ge=0)
    monthly_send_quota: int | None = Field(default=None, ge=0)
    can_create_api_keys: bool = True
    invite_expires_hours: int | None = Field(default=None, ge=1, le=365 * 24)

    @field_validator("display_name")
    @classmethod
    def clean_display_name(cls, value: str) -> str:
        cleaned = " ".join(value.split())
        if not cleaned:
            raise ValueError("Name is required.")
        return cleaned


class AcceptInviteRequest(BaseModel):
    token: str = Field(..., min_length=16)
    password: str = Field(..., min_length=10, max_length=128)
    password_confirm: str = Field(..., min_length=10, max_length=128)

    @model_validator(mode="after")
    def passwords_match(self) -> AcceptInviteRequest:
        if self.password != self.password_confirm:
            raise ValueError("Passwords do not match")
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
    created_at: datetime
    updated_at: datetime


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
    expires_at: datetime


class ApiKeyCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=120)
    mode: str = Field(default="live", pattern="^(live|sandbox)$")
    scopes: list[str] = Field(default_factory=lambda: ["send"], min_length=1)
    daily_quota: int | None = Field(default=None, ge=1)
    monthly_quota: int | None = Field(default=None, ge=1)

    @model_validator(mode="after")
    def known_scopes(self) -> ApiKeyCreate:
        allowed = {"send", "domains", "logs"}
        unknown = [scope for scope in self.scopes if scope not in allowed]
        if unknown or len(set(self.scopes)) != len(self.scopes):
            raise ValueError("Unknown API key scope.")
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
    is_active: bool
    last_used_at: datetime | None = None
    revoked_at: datetime | None = None
    created_at: datetime


class ApiKeyCreatedResponse(ApiKeyResponse):
    """Réponse unique contenant la clé en clair — non réaffichée ensuite."""

    key: str

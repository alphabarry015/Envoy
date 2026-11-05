from __future__ import annotations

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, EmailStr, Field, model_validator

from app.models.user import UserRole, UserStatus


class InviteUserRequest(BaseModel):
    email: EmailStr
    role: UserRole = UserRole.USER
    max_domains: int | None = Field(default=None, ge=0, description="None = illimité")
    daily_send_quota: int | None = Field(default=None, ge=0)
    monthly_send_quota: int | None = Field(default=None, ge=0)
    can_create_api_keys: bool = True
    invite_expires_hours: int | None = Field(default=None, ge=1, le=168)


class AcceptInviteRequest(BaseModel):
    token: str = Field(..., min_length=16)
    password: str = Field(..., min_length=10, max_length=128)
    password_confirm: str = Field(..., min_length=10, max_length=128)

    @model_validator(mode="after")
    def passwords_match(self) -> AcceptInviteRequest:
        if self.password != self.password_confirm:
            raise ValueError("Passwords do not match")
        return self


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"


class UserResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    email: EmailStr
    role: UserRole
    status: UserStatus
    max_domains: int | None = None
    daily_send_quota: int | None = None
    monthly_send_quota: int | None = None
    can_create_api_keys: bool
    created_at: datetime
    updated_at: datetime


class ApiKeyCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=120)


class ApiKeyResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    name: str
    key_prefix: str
    is_active: bool
    last_used_at: datetime | None = None
    created_at: datetime


class ApiKeyCreatedResponse(ApiKeyResponse):
    """Réponse unique contenant la clé en clair — non réaffichée ensuite."""

    key: str

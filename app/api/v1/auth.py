from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_admin, get_current_user
from app.core.database import get_db
from app.models.user import User
from app.schemas.user import (
    AcceptInviteRequest,
    InviteCreatedResponse,
    InviteUserRequest,
    LoginRequest,
    PasswordChangeRequest,
    TokenResponse,
    UserResponse,
    UserUpdateRequest,
)
from app.services.auth import (
    AuthError,
    accept_invite,
    authenticate,
    change_password,
    invite_user,
    issue_token,
    list_users,
    revoke_invite,
    update_user,
)

router = APIRouter()


def _auth_error(exc: AuthError) -> HTTPException:
    return HTTPException(status_code=exc.status_code, detail=exc.detail)


@router.post("/login", response_model=TokenResponse, summary="Connexion console")
async def login(payload: LoginRequest, db: AsyncSession = Depends(get_db)) -> TokenResponse:
    try:
        user = await authenticate(db, str(payload.email), payload.password)
    except AuthError as exc:
        raise _auth_error(exc) from exc
    return TokenResponse(access_token=issue_token(user), user=UserResponse.model_validate(user))


@router.get("/me", response_model=UserResponse, summary="Session courante")
async def me(user: User = Depends(get_current_user)) -> User:
    return user


@router.get("/users", response_model=list[UserResponse], summary="Lister les comptes")
async def users(
    db: AsyncSession = Depends(get_db),
    _admin: User = Depends(get_current_admin),
) -> list[User]:
        return await list_users(db, _admin)


@router.patch("/users/{user_id}", response_model=UserResponse, summary="Mettre à jour un compte")
async def update_account(
    user_id: UUID,
    payload: UserUpdateRequest,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(get_current_admin),
) -> User:
    try:
        return await update_user(db, admin, user_id, payload)
    except AuthError as exc:
        raise _auth_error(exc) from exc


@router.delete("/users/{user_id}", status_code=status.HTTP_204_NO_CONTENT, summary="Révoquer une invitation")
async def remove_invite(
    user_id: UUID,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(get_current_admin),
) -> None:
    try:
        await revoke_invite(db, admin, user_id)
    except AuthError as exc:
        raise _auth_error(exc) from exc


@router.post("/password", status_code=status.HTTP_204_NO_CONTENT, summary="Changer le mot de passe")
async def update_password(
    payload: PasswordChangeRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> None:
    try:
        await change_password(db, user, payload)
    except AuthError as exc:
        raise _auth_error(exc) from exc


@router.post(
    "/invite",
    response_model=InviteCreatedResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Inviter un utilisateur",
)
async def invite(
    payload: InviteUserRequest,
    db: AsyncSession = Depends(get_db),
    _admin: User = Depends(get_current_admin),
) -> InviteCreatedResponse:
    try:
        return await invite_user(db, _admin, payload)
    except AuthError as exc:
        raise _auth_error(exc) from exc


@router.post("/accept-invite", response_model=TokenResponse, summary="Activer un compte invité")
async def accept(payload: AcceptInviteRequest, db: AsyncSession = Depends(get_db)) -> TokenResponse:
    try:
        user = await accept_invite(db, payload)
    except AuthError as exc:
        raise _auth_error(exc) from exc
    return TokenResponse(access_token=issue_token(user), user=UserResponse.model_validate(user))

from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user
from app.core.database import get_db
from app.models.template import Template
from app.models.user import User
from app.schemas.template import TemplateResponse, TemplateWrite
from app.services.templates import (
    TemplateError,
    create_template,
    delete_template,
    get_template,
    list_templates,
    update_template,
)

router = APIRouter()


def _error(exc: TemplateError) -> HTTPException:
    return HTTPException(status_code=exc.status_code, detail=exc.detail)


@router.get("", response_model=list[TemplateResponse], summary="Lister les modèles")
async def list_items(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> list[Template]:
    return await list_templates(db, user)


@router.post("", response_model=TemplateResponse, status_code=status.HTTP_201_CREATED, summary="Créer un modèle")
async def create_item(
    payload: TemplateWrite,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> Template:
    try:
        return await create_template(db, user, payload)
    except TemplateError as exc:
        raise _error(exc) from exc


@router.get("/{template_id}", response_model=TemplateResponse, summary="Lire un modèle")
async def read_item(
    template_id: UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> Template:
    try:
        return await get_template(db, user, template_id)
    except TemplateError as exc:
        raise _error(exc) from exc


@router.put("/{template_id}", response_model=TemplateResponse, summary="Enregistrer un modèle")
async def save_item(
    template_id: UUID,
    payload: TemplateWrite,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> Template:
    try:
        return await update_template(db, user, template_id, payload)
    except TemplateError as exc:
        raise _error(exc) from exc


@router.delete("/{template_id}", status_code=status.HTTP_204_NO_CONTENT, summary="Supprimer un modèle")
async def remove_item(
    template_id: UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> None:
    try:
        await delete_template(db, user, template_id)
    except TemplateError as exc:
        raise _error(exc) from exc

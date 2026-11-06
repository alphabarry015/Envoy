from __future__ import annotations

from datetime import datetime, timezone
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.template import Template
from app.models.user import User
from app.schemas.template import TemplateWrite


class TemplateError(Exception):
    def __init__(self, status_code: int, detail: str) -> None:
        self.status_code = status_code
        self.detail = detail
        super().__init__(detail)


def _apply(row: Template, payload: TemplateWrite) -> None:
    row.name = payload.name.strip()
    row.alias = payload.alias
    row.subject = payload.subject
    row.html = payload.html
    row.text = payload.text
    row.from_name = payload.from_name
    row.from_email = payload.from_email
    row.reply_to = payload.reply_to
    row.preview_text = payload.preview_text
    row.status = payload.status
    row.variables = [item.model_dump() for item in payload.variables]
    row.document = payload.document


async def list_templates(db: AsyncSession, user: User) -> list[Template]:
    result = await db.execute(
        select(Template).where(Template.user_id == user.id).order_by(Template.updated_at.desc())
    )
    return list(result.scalars().all())


async def get_template(db: AsyncSession, user: User, template_id: UUID) -> Template:
    row = await db.get(Template, template_id)
    if row is None or row.user_id != user.id:
        raise TemplateError(404, "Template not found.")
    return row


async def create_template(db: AsyncSession, user: User, payload: TemplateWrite) -> Template:
    row = Template(user_id=user.id)
    _apply(row, payload)
    db.add(row)
    try:
        await db.commit()
    except IntegrityError as exc:
        await db.rollback()
        raise TemplateError(409, "This alias is already used.") from exc
    await db.refresh(row)
    return row


async def update_template(
    db: AsyncSession,
    user: User,
    template_id: UUID,
    payload: TemplateWrite,
) -> Template:
    row = await get_template(db, user, template_id)
    _apply(row, payload)
    row.updated_at = datetime.now(timezone.utc)
    try:
        await db.commit()
    except IntegrityError as exc:
        await db.rollback()
        raise TemplateError(409, "This alias is already used.") from exc
    await db.refresh(row)
    return row


async def delete_template(db: AsyncSession, user: User, template_id: UUID) -> None:
    row = await get_template(db, user, template_id)
    await db.delete(row)
    await db.commit()

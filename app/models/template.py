from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any

from sqlalchemy import DateTime, ForeignKey, String, Text, UniqueConstraint, func, text
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class Template(Base):
    """Modèle d'e-mail réutilisable, propre à un compte."""

    __tablename__ = "templates"
    __table_args__ = (UniqueConstraint("user_id", "alias", name="uq_templates_user_alias"),)

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
        server_default=text("gen_random_uuid()"),
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    name: Mapped[str] = mapped_column(String(160), nullable=False)
    alias: Mapped[str] = mapped_column(String(80), nullable=False)
    subject: Mapped[str] = mapped_column(String(998), nullable=False, default="", server_default="")
    html: Mapped[str] = mapped_column(Text, nullable=False, default="", server_default="")
    text: Mapped[str] = mapped_column("body_text", Text, nullable=False, default="", server_default="")
    from_name: Mapped[str] = mapped_column(String(120), nullable=False, default="", server_default="")
    from_email: Mapped[str] = mapped_column(String(320), nullable=False, default="", server_default="")
    reply_to: Mapped[str] = mapped_column(String(320), nullable=False, default="", server_default="")
    preview_text: Mapped[str] = mapped_column(String(998), nullable=False, default="", server_default="")
    status: Mapped[str] = mapped_column(String(16), nullable=False, default="draft", server_default="draft")
    variables: Mapped[list[dict[str, Any]]] = mapped_column(JSONB, nullable=False, default=list)
    document: Mapped[dict[str, Any] | None] = mapped_column(JSONB, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
        onupdate=func.now(),
    )

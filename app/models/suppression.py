from __future__ import annotations

import enum
import uuid
from datetime import datetime
from typing import Any

from sqlalchemy import DateTime, Enum, String, func, text
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class SuppressionReason(str, enum.Enum):
    HARD_BOUNCE = "hard_bounce"
    COMPLAINT = "complaint"
    UNSUBSCRIBE = "unsubscribe"
    MANUAL = "manual"


class Suppression(Base):
    """Liste globale de suppression (hard bounces, plaintes spam, désabonnements)."""

    __tablename__ = "suppression_list"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
        server_default=text("gen_random_uuid()"),
    )
    email: Mapped[str] = mapped_column(String(320), unique=True, nullable=False, index=True)
    reason: Mapped[SuppressionReason] = mapped_column(
        Enum(
            SuppressionReason,
            name="suppression_reason",
            values_callable=lambda items: [item.value for item in items],
        ),
        nullable=False,
    )
    source: Mapped[str] = mapped_column(String(64), nullable=False, default="sns")
    extra_metadata: Mapped[dict[str, Any]] = mapped_column(
        "metadata",
        JSONB,
        nullable=False,
        default=dict,
        server_default=text("'{}'::jsonb"),
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
    )

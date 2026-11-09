from __future__ import annotations

import enum
import uuid
from datetime import datetime
from typing import TYPE_CHECKING, Any

from sqlalchemy import DateTime, Enum, ForeignKey, String, Text, func, text
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base

if TYPE_CHECKING:
    from app.models.email_log import EmailLog
    from app.models.user import User


class DomainStatus(str, enum.Enum):
    PENDING = "pending"
    VERIFIED = "verified"
    FAILED = "failed"


class DkimStatus(str, enum.Enum):
    NOT_STARTED = "NOT_STARTED"
    PENDING = "PENDING"
    SUCCESS = "SUCCESS"
    FAILED = "FAILED"
    TEMPORARY_FAILURE = "TEMPORARY_FAILURE"


class Domain(Base):
    """Identité d'envoi déclarée auprès d'AWS SES v2."""

    __tablename__ = "domains"

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
    name: Mapped[str] = mapped_column(String(255), unique=True, nullable=False, index=True)
    # Outils d'envoi où ce domaine est déclaré (SES, Resend, Brevo, Mailtrap…).
    providers: Mapped[list[str]] = mapped_column(
        JSONB,
        nullable=False,
        default=lambda: ["ses"],
        server_default=text("'[\"ses\"]'::jsonb"),
    )
    status: Mapped[DomainStatus] = mapped_column(
        Enum(
            DomainStatus,
            name="domain_status",
            values_callable=lambda items: [item.value for item in items],
        ),
        nullable=False,
        default=DomainStatus.PENDING,
        server_default=DomainStatus.PENDING.value,
    )
    dkim_status: Mapped[DkimStatus] = mapped_column(
        Enum(
            DkimStatus,
            name="dkim_status",
            values_callable=lambda items: [item.value for item in items],
        ),
        nullable=False,
        default=DkimStatus.NOT_STARTED,
        server_default=DkimStatus.NOT_STARTED.value,
    )
    ses_identity_arn: Mapped[str | None] = mapped_column(String(512), nullable=True)
    dkim_selector: Mapped[str | None] = mapped_column(String(63), nullable=True)
    encrypted_dkim_key: Mapped[str | None] = mapped_column(Text, nullable=True)
    dns_records: Mapped[list[dict[str, Any]]] = mapped_column(
        JSONB,
        nullable=False,
        default=list,
        server_default=text("'[]'::jsonb"),
    )
    # Default sender used when an API call omits "from" (local@domain).
    from_local_part: Mapped[str] = mapped_column(
        String(64), nullable=False, default="noreply", server_default="noreply"
    )
    from_name: Mapped[str | None] = mapped_column(String(120), nullable=True)
    # Reply-To added when an API call has none. NULL = replies are not expected.
    reply_to: Mapped[str | None] = mapped_column(String(320), nullable=True)
    sender_configured_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    verified_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
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

    user: Mapped["User"] = relationship(back_populates="domains")
    email_logs: Mapped[list["EmailLog"]] = relationship(back_populates="domain")

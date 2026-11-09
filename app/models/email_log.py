from __future__ import annotations

import enum
import uuid
from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import DateTime, Enum, ForeignKey, String, Text, func, text
from sqlalchemy.dialects.postgresql import ARRAY, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base

if TYPE_CHECKING:
    from app.models.domain import Domain
    from app.models.user import ApiKey, User


class EmailStatus(str, enum.Enum):
    QUEUED = "queued"
    SENT = "sent"
    DELIVERED = "delivered"
    BOUNCED = "bounced"
    COMPLAINED = "complained"
    FAILED = "failed"
    SUPPRESSED = "suppressed"


class EmailLog(Base):
    """Trace d'un envoi transactionnel."""

    __tablename__ = "email_logs"

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
    domain_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("domains.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    api_key_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("api_keys.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    message_id: Mapped[str] = mapped_column(String(64), unique=True, nullable=False, index=True)
    # Identifiant renvoyé par le transport (SES, Resend, Brevo, …).
    ses_message_id: Mapped[str | None] = mapped_column(String(128), nullable=True, index=True)
    provider: Mapped[str | None] = mapped_column(String(32), nullable=True, index=True)
    from_address: Mapped[str] = mapped_column(String(320), nullable=False)
    to_addresses: Mapped[list[str]] = mapped_column(ARRAY(String(320)), nullable=False)
    cc_addresses: Mapped[list[str] | None] = mapped_column(ARRAY(String(320)), nullable=True)
    bcc_addresses: Mapped[list[str] | None] = mapped_column(ARRAY(String(320)), nullable=True)
    subject: Mapped[str] = mapped_column(String(998), nullable=False)
    html: Mapped[str | None] = mapped_column("body_html", Text, nullable=True)
    text_body: Mapped[str | None] = mapped_column("body_text", Text, nullable=True)
    status: Mapped[EmailStatus] = mapped_column(
        Enum(
            EmailStatus,
            name="email_status",
            values_callable=lambda items: [item.value for item in items],
        ),
        nullable=False,
        default=EmailStatus.QUEUED,
        server_default=EmailStatus.QUEUED.value,
        index=True,
    )
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    # "api" for sends made with an API key, "invite" for invitation emails sent by an admin.
    kind: Mapped[str] = mapped_column(String(16), nullable=False, default="api", server_default="api")
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
        index=True,
    )
    sent_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    user: Mapped["User"] = relationship(back_populates="email_logs")
    domain: Mapped["Domain | None"] = relationship(back_populates="email_logs")
    api_key: Mapped["ApiKey | None"] = relationship(back_populates="email_logs")

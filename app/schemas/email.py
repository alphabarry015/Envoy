from __future__ import annotations

import base64
import re
from datetime import datetime
from typing import Any
from uuid import UUID

from email_validator import EmailNotValidError, validate_email
from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator, model_validator

MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024
MAX_TOTAL_ATTACHMENTS_BYTES = 10 * 1024 * 1024
_FROM_WITH_NAME = re.compile(r"^(?P<name>.*)<(?P<email>[^<>]+)>$")


class Attachment(BaseModel):
    filename: str = Field(..., min_length=1, max_length=255)
    content: str = Field(..., description="Contenu encodé en Base64")
    content_type: str | None = Field(default="application/octet-stream")

    @field_validator("content")
    @classmethod
    def validate_base64_and_size(cls, value: str) -> str:
        try:
            raw = base64.b64decode(value, validate=True)
        except Exception as exc:
            raise ValueError("Attachment content must be valid Base64") from exc
        if len(raw) > MAX_ATTACHMENT_BYTES:
            raise ValueError("Each attachment must be smaller than 10 MB")
        return value


class EmailSendRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    to: list[EmailStr]
    from_address: str | None = Field(default=None, alias="from", max_length=320)
    subject: str = Field(..., min_length=1, max_length=998)
    html: str | None = None
    text: str | None = None
    cc: list[EmailStr] | None = None
    bcc: list[EmailStr] | None = None
    attachments: list[Attachment] | None = None
    reply_to: list[EmailStr] | None = None
    tags: dict[str, str] | None = None

    @field_validator("from_address")
    @classmethod
    def valid_from(cls, value: str | None) -> str | None:
        if value is None or not str(value).strip():
            return None
        raw = value.strip()
        match = _FROM_WITH_NAME.fullmatch(raw)
        name = ""
        email = raw
        if match:
            name = match.group("name").strip().strip('"')
            email = match.group("email").strip()
        try:
            parsed = validate_email(email, check_deliverability=False)
        except EmailNotValidError as exc:
            raise ValueError("Invalid from address.") from exc
        normalized = parsed.normalized.lower()
        if not name:
            return normalized
        if re.search(r'[",<>]', name):
            name = '"' + name.replace("\\", "\\\\").replace('"', '\\"') + '"'
        header = f"{name} <{normalized}>"
        if len(header) > 320:
            raise ValueError("From address is too long.")
        return header

    @field_validator("to", "cc", "bcc", "reply_to", mode="before")
    @classmethod
    def coerce_email_list(cls, value: str | list[str] | None) -> list[str] | None:
        if value is None:
            return None
        if isinstance(value, str):
            return [value]
        return value

    @model_validator(mode="after")
    def validate_body_and_attachments(self) -> EmailSendRequest:
        if not self.html and not self.text:
            raise ValueError("Either html or text must be provided")
        if self.attachments:
            total = 0
            for attachment in self.attachments:
                total += len(base64.b64decode(attachment.content))
            if total > MAX_TOTAL_ATTACHMENTS_BYTES:
                raise ValueError("Total attachments size must be smaller than 10 MB")
        return self


class EmailSendResponse(BaseModel):
    message_id: str
    status: str = "queued"


class SNSNotification(BaseModel):
    """Enveloppe AWS SNS reçue sur /api/v1/webhooks/ses."""

    Type: str
    MessageId: str
    TopicArn: str | None = None
    Subject: str | None = None
    Message: str | dict[str, Any] = ""
    Timestamp: str | None = None
    SignatureVersion: str | None = None
    Signature: str | None = None
    SigningCertURL: str | None = None
    UnsubscribeURL: str | None = None
    SubscribeURL: str | None = None
    Token: str | None = None


class EmailLogResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    message_id: str
    ses_message_id: str | None = None
    from_address: str
    to_addresses: list[str]
    subject: str
    status: str
    created_at: datetime

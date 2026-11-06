from __future__ import annotations

import re
from datetime import datetime
from typing import Any, Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator

_ALIAS = re.compile(r"^[a-z0-9]+(?:-[a-z0-9]+)*$")


class TemplateVariable(BaseModel):
    name: str = Field(min_length=1, max_length=64)
    type: Literal["string", "number", "date"] = "string"
    fallback: str = ""

    @field_validator("name")
    @classmethod
    def variable_name(cls, value: str) -> str:
        if not re.fullmatch(r"[a-zA-Z_][a-zA-Z0-9_]*", value):
            raise ValueError("Invalid variable name.")
        return value


class TemplateWrite(BaseModel):
    name: str = Field(min_length=1, max_length=160)
    alias: str = Field(min_length=1, max_length=80)
    subject: str = Field(default="", max_length=998)
    html: str = ""
    text: str = ""
    from_name: str = Field(default="", max_length=120)
    from_email: str = Field(default="", max_length=320)
    reply_to: str = Field(default="", max_length=320)
    preview_text: str = Field(default="", max_length=998)
    status: Literal["draft", "published"] = "draft"
    variables: list[TemplateVariable] = Field(default_factory=list)
    document: dict[str, Any] | None = None

    @field_validator("alias")
    @classmethod
    def normalize_alias(cls, value: str) -> str:
        alias = value.strip().lower()
        if not _ALIAS.fullmatch(alias):
            raise ValueError("Alias must use lowercase letters, numbers and dashes.")
        return alias


class TemplateResponse(TemplateWrite):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    user_id: UUID
    created_at: datetime
    updated_at: datetime

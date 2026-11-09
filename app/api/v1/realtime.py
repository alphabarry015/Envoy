"""Connection details for the console realtime WebSocket (Supabase Realtime)."""

from __future__ import annotations

from fastapi import APIRouter, Depends
from pydantic import BaseModel

from app.api.deps import get_current_user
from app.core.config import settings
from app.models.user import User
from app.services.realtime import realtime_enabled, topic_for

router = APIRouter()


class RealtimeConfig(BaseModel):
    enabled: bool
    url: str | None = None
    key: str | None = None
    topic: str | None = None


@router.get("/realtime/config", response_model=RealtimeConfig, summary="Realtime channel")
async def realtime_config(user: User = Depends(get_current_user)) -> RealtimeConfig:
    if not realtime_enabled():
        return RealtimeConfig(enabled=False)
    return RealtimeConfig(
        enabled=True,
        url=settings.supabase_public_url,
        key=settings.supabase_anon_key,
        topic=topic_for(user.id),
    )

"""Console realtime over Supabase Realtime (WebSocket broadcast).

Serverless functions cannot hold sockets, so the API publishes through the
Supabase Realtime REST broadcast endpoint and browsers subscribe over its
WebSocket. Each user gets an unguessable topic derived from SECRET_KEY;
payloads only carry ids and reasons, never content.
"""

from __future__ import annotations

import hashlib
import hmac
import logging
from datetime import datetime, timezone
from typing import Any
from uuid import UUID

import httpx

from app.core.config import settings

logger = logging.getLogger("envoy.realtime")

_client: httpx.AsyncClient | None = None


def realtime_enabled() -> bool:
    return bool(settings.supabase_public_url and settings.supabase_anon_key)


def topic_for(user_id: UUID | str) -> str:
    digest = hmac.new(
        settings.secret_key.encode("utf-8"),
        f"realtime:{user_id}".encode("utf-8"),
        hashlib.sha256,
    ).hexdigest()
    return f"envoy-{digest[:40]}"


def _http() -> httpx.AsyncClient:
    global _client
    if _client is None or _client.is_closed:
        _client = httpx.AsyncClient(timeout=httpx.Timeout(3.0, connect=2.0))
    return _client


async def publish(user_id: UUID | None, event: str, data: dict[str, Any] | None = None) -> None:
    if user_id is None or not realtime_enabled():
        return
    key = settings.supabase_anon_key or ""
    payload = {**(data or {}), "at": datetime.now(timezone.utc).isoformat()}
    try:
        response = await _http().post(
            f"{settings.supabase_public_url}/realtime/v1/api/broadcast",
            headers={"apikey": key, "Authorization": f"Bearer {key}"},
            json={
                "messages": [
                    {
                        "topic": topic_for(user_id),
                        "event": event,
                        "payload": payload,
                        "private": False,
                    }
                ]
            },
        )
        if response.status_code >= 300:
            logger.warning("realtime_publish_rejected event=%s status=%s", event, response.status_code)
    except Exception:
        logger.warning("realtime_publish_failed event=%s", event, exc_info=True)

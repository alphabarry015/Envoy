"""Ensure / inspect inbound delivery webhooks on Resend, Brevo, and Mailtrap."""

from __future__ import annotations

from typing import Any
from urllib.parse import urlparse

import httpx

from app.core.config import settings

_RESEND_EVENTS = [
    "email.delivered",
    "email.bounced",
    "email.complained",
    "email.failed",
    "domain.created",
    "domain.updated",
    "domain.deleted",
]
_BREVO_EVENTS = [
    "delivered",
    "hardBounce",
    "softBounce",
    "spam",
    "blocked",
    "invalid",
    "error",
    "deferred",
]
_MAILTRAP_EVENTS = [
    "delivery",
    "soft_bounce",
    "bounce",
    "spam_complaint",
    "reject",
    "suspension",
]


class InboundWebhookError(Exception):
    def __init__(self, status_code: int, detail: str) -> None:
        self.status_code = status_code
        self.detail = detail
        super().__init__(detail)


def public_api_base() -> str:
    raw = (settings.public_api_url or "").strip().rstrip("/")
    if raw:
        return raw
    # Fallback used by already-registered production hooks.
    return "https://envoy.flowenagency.com"


def inbound_webhook_url(tool: str) -> str:
    return f"{public_api_base()}{settings.api_v1_prefix}/webhooks/{tool}"


def _same_endpoint(left: str, right: str) -> bool:
    a = urlparse(left.strip())
    b = urlparse(right.strip())
    return (
        a.scheme.lower() == b.scheme.lower()
        and (a.hostname or "").lower() == (b.hostname or "").lower()
        and (a.path or "/").rstrip("/") == (b.path or "/").rstrip("/")
    )


async def probe_api(tool: str) -> dict[str, Any]:
    """Live API probe — no mocks. Returns {ok, detail} without secrets."""
    try:
        if tool == "resend":
            if not (settings.resend_api_key or "").strip():
                return {"ok": False, "detail": "API key missing"}
            async with httpx.AsyncClient(timeout=15.0) as client:
                response = await client.get(
                    "https://api.resend.com/domains",
                    headers={"Authorization": f"Bearer {settings.resend_api_key}"},
                )
            if response.status_code < 400:
                return {"ok": True, "detail": "API reachable"}
            return {"ok": False, "detail": f"HTTP {response.status_code}"}
        if tool == "brevo":
            if not (settings.brevo_api_key or "").strip():
                return {"ok": False, "detail": "API key missing"}
            async with httpx.AsyncClient(timeout=15.0) as client:
                response = await client.get(
                    "https://api.brevo.com/v3/account",
                    headers={"api-key": settings.brevo_api_key, "accept": "application/json"},
                )
            if response.status_code < 400:
                return {"ok": True, "detail": "API reachable"}
            return {"ok": False, "detail": f"HTTP {response.status_code}"}
        if tool == "mailtrap":
            if not (settings.mailtrap_api_token or "").strip():
                return {"ok": False, "detail": "API token missing"}
            async with httpx.AsyncClient(timeout=15.0) as client:
                response = await client.get(
                    "https://mailtrap.io/api/accounts",
                    headers={"Authorization": f"Bearer {settings.mailtrap_api_token}"},
                )
            if response.status_code < 400:
                return {"ok": True, "detail": "API reachable"}
            return {"ok": False, "detail": f"HTTP {response.status_code}"}
        if tool == "ses":
            if not (settings.aws_access_key_id and settings.aws_secret_access_key):
                return {"ok": False, "detail": "AWS credentials missing"}
            return {"ok": True, "detail": "AWS credentials present"}
    except httpx.HTTPError as exc:
        return {"ok": False, "detail": f"network error: {exc}"}
    return {"ok": False, "detail": "unknown tool"}


async def webhook_status(tool: str) -> dict[str, Any]:
    """Inspect whether the remote tool points at Envoy's inbound URL."""
    expected = inbound_webhook_url(tool)
    base = {
        "tool": tool,
        "expected_url": expected,
        "linked": False,
        "remote_id": None,
        "remote_url": None,
        "active": None,
        "detail": None,
        "secret_configured": False,
    }
    if tool == "ses":
        return {
            **base,
            "linked": True,
            "detail": "Configure SNS → HTTPS subscription to this URL in AWS.",
            "expected_url": inbound_webhook_url("ses"),
            "secret_configured": False,
        }
    if tool == "resend":
        base["secret_configured"] = bool(settings.webhook_secret_resend)
        return await _resend_status(base, expected)
    if tool == "brevo":
        base["secret_configured"] = bool(settings.webhook_secret_brevo)
        return await _brevo_status(base, expected)
    if tool == "mailtrap":
        base["secret_configured"] = bool(settings.webhook_secret_mailtrap)
        return await _mailtrap_status(base, expected)
    return {**base, "detail": "unknown tool"}


async def ensure_webhook(tool: str) -> dict[str, Any]:
    """Create the inbound webhook on the remote tool if missing (real API)."""
    if tool == "ses":
        status = await webhook_status("ses")
        status["ensured"] = False
        status["detail"] = "SES uses SNS subscription — create it in AWS, not via Envoy API."
        return status
    if tool == "resend":
        return await _ensure_resend()
    if tool == "brevo":
        return await _ensure_brevo()
    if tool == "mailtrap":
        return await _ensure_mailtrap()
    raise InboundWebhookError(404, "Unknown sending tool.")


async def _resend_status(base: dict[str, Any], expected: str) -> dict[str, Any]:
    if not (settings.resend_api_key or "").strip():
        return {**base, "detail": "Resend API key missing"}
    try:
        async with httpx.AsyncClient(timeout=20.0) as client:
            response = await client.get(
                "https://api.resend.com/webhooks",
                headers={"Authorization": f"Bearer {settings.resend_api_key}"},
            )
    except httpx.HTTPError as exc:
        return {**base, "detail": f"network error: {exc}"}
    if response.status_code >= 400:
        return {**base, "detail": f"HTTP {response.status_code}"}
    items = (response.json() or {}).get("data") or []
    for item in items:
        if not isinstance(item, dict):
            continue
        endpoint = str(item.get("endpoint") or "")
        if _same_endpoint(endpoint, expected):
            return {
                **base,
                "linked": True,
                "remote_id": item.get("id"),
                "remote_url": endpoint,
                "active": str(item.get("status") or "").lower() in {"enabled", "active", "ok"},
                "detail": "Webhook registered on Resend",
                "remote_events": item.get("events"),
            }
    return {**base, "detail": "No Resend webhook points to Envoy yet"}


async def _brevo_status(base: dict[str, Any], expected: str) -> dict[str, Any]:
    if not (settings.brevo_api_key or "").strip():
        return {**base, "detail": "Brevo API key missing"}
    try:
        async with httpx.AsyncClient(timeout=20.0) as client:
            response = await client.get(
                "https://api.brevo.com/v3/webhooks",
                headers={"api-key": settings.brevo_api_key, "accept": "application/json"},
            )
    except httpx.HTTPError as exc:
        return {**base, "detail": f"network error: {exc}"}
    if response.status_code >= 400:
        return {**base, "detail": f"HTTP {response.status_code}"}
    items = (response.json() or {}).get("webhooks") or []
    for item in items:
        if not isinstance(item, dict):
            continue
        url = str(item.get("url") or "")
        if _same_endpoint(url, expected):
            return {
                **base,
                "linked": True,
                "remote_id": item.get("id"),
                "remote_url": url,
                "active": True,
                "detail": "Webhook registered on Brevo",
            }
    return {**base, "detail": "No Brevo webhook points to Envoy yet"}


async def _mailtrap_account_id(client: httpx.AsyncClient) -> int:
    response = await client.get(
        "https://mailtrap.io/api/accounts",
        headers={"Authorization": f"Bearer {settings.mailtrap_api_token}"},
    )
    if response.status_code >= 400:
        raise InboundWebhookError(502, f"Mailtrap accounts HTTP {response.status_code}")
    payload = response.json()
    items = payload if isinstance(payload, list) else (payload or {}).get("data")
    if not isinstance(items, list) or not items:
        raise InboundWebhookError(502, "Mailtrap returned no accounts")
    return int(items[0]["id"])


async def _mailtrap_status(base: dict[str, Any], expected: str) -> dict[str, Any]:
    if not (settings.mailtrap_api_token or "").strip():
        return {**base, "detail": "Mailtrap API token missing"}
    try:
        async with httpx.AsyncClient(timeout=20.0) as client:
            account_id = await _mailtrap_account_id(client)
            response = await client.get(
                f"https://mailtrap.io/api/accounts/{account_id}/webhooks",
                headers={"Authorization": f"Bearer {settings.mailtrap_api_token}"},
            )
    except InboundWebhookError as exc:
        return {**base, "detail": exc.detail}
    except httpx.HTTPError as exc:
        return {**base, "detail": f"network error: {exc}"}
    if response.status_code >= 400:
        return {**base, "detail": f"HTTP {response.status_code}"}
    items = (response.json() or {}).get("data") or []
    matches = [
        item
        for item in items
        if isinstance(item, dict) and _same_endpoint(str(item.get("url") or ""), expected)
    ]
    if not matches:
        return {**base, "detail": "No Mailtrap webhook points to Envoy yet"}
    transactional = next(
        (item for item in matches if str(item.get("sending_stream") or "") == "transactional"),
        None,
    )
    chosen = transactional or matches[0]
    streams = sorted(
        {
            str(item.get("sending_stream") or "?")
            for item in matches
        }
    )
    return {
        **base,
        "linked": True,
        "remote_id": chosen.get("id"),
        "remote_url": str(chosen.get("url") or ""),
        "active": bool(chosen.get("active")),
        "detail": (
            f"Webhook registered on Mailtrap ({', '.join(streams)})"
            + ("" if transactional else " — transactional stream missing")
        ),
    }


async def _ensure_resend() -> dict[str, Any]:
    status = await webhook_status("resend")
    if status.get("linked"):
        remote_events = status.get("remote_events")
        missing = (
            [event for event in _RESEND_EVENTS if event not in remote_events]
            if isinstance(remote_events, list)
            else []
        )
        if missing and status.get("remote_id"):
            async with httpx.AsyncClient(timeout=20.0) as client:
                response = await client.patch(
                    f"https://api.resend.com/webhooks/{status['remote_id']}",
                    headers={
                        "Authorization": f"Bearer {settings.resend_api_key}",
                        "Content-Type": "application/json",
                    },
                    json={"events": sorted({*remote_events, *_RESEND_EVENTS})},
                )
            if response.status_code >= 400:
                raise InboundWebhookError(
                    502, f"Resend webhook update failed: HTTP {response.status_code}"
                )
            return {**status, "ensured": True, "created": False, "detail": "Webhook events updated on Resend"}
        return {**status, "ensured": False, "created": False}
    if not (settings.resend_api_key or "").strip():
        raise InboundWebhookError(400, "Resend API key is not configured.")
    expected = inbound_webhook_url("resend")
    async with httpx.AsyncClient(timeout=20.0) as client:
        response = await client.post(
            "https://api.resend.com/webhooks",
            headers={
                "Authorization": f"Bearer {settings.resend_api_key}",
                "Content-Type": "application/json",
            },
            json={"endpoint": expected, "events": _RESEND_EVENTS},
        )
    if response.status_code >= 400:
        raise InboundWebhookError(502, f"Resend webhook create failed: HTTP {response.status_code}")
    body = response.json() if response.content else {}
    signing = str(body.get("signing_secret") or "")
    return {
        **status,
        "linked": True,
        "ensured": True,
        "created": True,
        "remote_id": body.get("id"),
        "remote_url": expected,
        "active": True,
        "detail": "Webhook created on Resend",
        "signing_secret_once": signing or None,
        "secret_configured": bool(settings.webhook_secret_resend),
    }


async def _ensure_brevo() -> dict[str, Any]:
    status = await webhook_status("brevo")
    if status.get("linked"):
        return {**status, "ensured": False, "created": False}
    if not (settings.brevo_api_key or "").strip():
        raise InboundWebhookError(400, "Brevo API key is not configured.")
    expected = inbound_webhook_url("brevo")
    secret = (settings.webhook_secret_brevo or "").strip()
    payload: dict[str, Any] = {
        "url": expected,
        "events": _BREVO_EVENTS,
        "type": "transactional",
        "description": "Envoy delivery events",
    }
    if secret:
        payload["auth"] = {"type": "bearer", "token": secret}
    async with httpx.AsyncClient(timeout=20.0) as client:
        response = await client.post(
            "https://api.brevo.com/v3/webhooks",
            headers={
                "api-key": settings.brevo_api_key,
                "accept": "application/json",
                "content-type": "application/json",
            },
            json=payload,
        )
    if response.status_code >= 400:
        raise InboundWebhookError(502, f"Brevo webhook create failed: HTTP {response.status_code}")
    body = response.json() if response.content else {}
    return {
        **status,
        "linked": True,
        "ensured": True,
        "created": True,
        "remote_id": body.get("id"),
        "remote_url": expected,
        "active": True,
        "detail": "Webhook created on Brevo",
        "secret_configured": bool(secret),
    }


async def _ensure_mailtrap() -> dict[str, Any]:
    """Ensure a transactional webhook exists (Envoy uses send.api.mailtrap.io)."""
    if not (settings.mailtrap_api_token or "").strip():
        raise InboundWebhookError(400, "Mailtrap API token is not configured.")
    expected = inbound_webhook_url("mailtrap")
    async with httpx.AsyncClient(timeout=20.0) as client:
        account_id = await _mailtrap_account_id(client)
        listed = await client.get(
            f"https://mailtrap.io/api/accounts/{account_id}/webhooks",
            headers={"Authorization": f"Bearer {settings.mailtrap_api_token}"},
        )
        if listed.status_code >= 400:
            raise InboundWebhookError(502, f"Mailtrap webhooks HTTP {listed.status_code}")
        items = (listed.json() or {}).get("data") or []
        matches = [
            item
            for item in items
            if isinstance(item, dict) and _same_endpoint(str(item.get("url") or ""), expected)
        ]
        has_transactional = any(
            str(item.get("sending_stream") or "") == "transactional" for item in matches
        )
        if has_transactional:
            status = await webhook_status("mailtrap")
            return {**status, "ensured": False, "created": False}

        response = await client.post(
            f"https://mailtrap.io/api/accounts/{account_id}/webhooks",
            headers={
                "Authorization": f"Bearer {settings.mailtrap_api_token}",
                "Content-Type": "application/json",
                "accept": "application/json",
            },
            json={
                "webhook": {
                    "url": expected,
                    "webhook_type": "email_sending",
                    "active": True,
                    "payload_format": "json",
                    "sending_stream": "transactional",
                    "event_types": _MAILTRAP_EVENTS,
                }
            },
        )
    if response.status_code >= 400:
        raise InboundWebhookError(502, f"Mailtrap webhook create failed: HTTP {response.status_code}")
    body = response.json() if response.content else {}
    data = body.get("data") if isinstance(body, dict) else {}
    if not isinstance(data, dict):
        data = {}
    signing = str(data.get("signing_secret") or "")
    return {
        "tool": "mailtrap",
        "expected_url": expected,
        "linked": True,
        "ensured": True,
        "created": True,
        "remote_id": data.get("id"),
        "remote_url": expected,
        "active": True,
        "detail": "Webhook created on Mailtrap (transactional)",
        "signing_secret_once": signing or None,
        "secret_configured": bool(settings.webhook_secret_mailtrap),
    }

"""Signature verification for inbound provider webhooks (no network)."""

from __future__ import annotations

import base64
import hashlib
import hmac
import time

import pytest

from app.services.provider_webhooks import (
    ProviderWebhookError,
    handle_mailtrap_event,
    verify_mailtrap_signature,
    verify_resend_svix,
    verify_shared_secret,
)


def test_brevo_shared_secret_ok() -> None:
    verify_shared_secret("token-a", "token-a")


def test_brevo_shared_secret_rejects() -> None:
    with pytest.raises(ProviderWebhookError):
        verify_shared_secret("wrong", "token-a")


def test_resend_svix_ok() -> None:
    # Arbitrary test key — not a production secret.
    raw_key = b"0123456789abcdef0123456789abcdef"
    secret = "whsec_" + base64.b64encode(raw_key).decode()
    body = b'{"type":"email.delivered"}'
    msg_id = "msg_1"
    ts = str(int(time.time()))
    digest = base64.b64encode(
        hmac.new(raw_key, f"{msg_id}.{ts}.".encode() + body, hashlib.sha256).digest()
    ).decode()
    verify_resend_svix(
        raw_body=body,
        headers={
            "svix-id": msg_id,
            "svix-timestamp": ts,
            "svix-signature": f"v1,{digest}",
        },
        signing_secret=secret,
    )


def test_resend_svix_rejects_bad_signature() -> None:
    raw_key = b"0123456789abcdef0123456789abcdef"
    secret = "whsec_" + base64.b64encode(raw_key).decode()
    with pytest.raises(ProviderWebhookError):
        verify_resend_svix(
            raw_body=b"{}",
            headers={
                "svix-id": "msg_1",
                "svix-timestamp": str(int(time.time())),
                "svix-signature": "v1,AAAA",
            },
            signing_secret=secret,
        )


def test_mailtrap_hmac_ok() -> None:
    secret = "mailtrap-test-secret"
    body = b'{"events":[{"event":"delivery"}]}'
    signature = hmac.new(secret.encode(), body, hashlib.sha256).hexdigest()
    verify_mailtrap_signature(raw_body=body, signature=signature, signing_secret=secret)


@pytest.mark.asyncio
async def test_mailtrap_events_array_parsing(monkeypatch: pytest.MonkeyPatch) -> None:
    calls: list[dict] = []

    async def fake_apply(db, **kwargs):  # type: ignore[no-untyped-def]
        calls.append(kwargs)
        return kwargs["kind"]

    monkeypatch.setattr(
        "app.services.provider_webhooks.apply_delivery_event",
        fake_apply,
    )
    result = await handle_mailtrap_event(
        None,  # type: ignore[arg-type]
        {
            "events": [
                {"event": "delivery", "email": "a@b.com", "message_id": "1"},
                {"event": "spam_complaint", "email": "c@d.com", "message_id": "2"},
            ]
        },
    )
    assert result == "complained"
    assert [item["kind"] for item in calls] == ["delivered", "complained"]

"""Security guards: SSRF, fail-closed webhooks, SNS checks, send payload limits."""

from __future__ import annotations

import base64
from datetime import datetime, timedelta, timezone

import pytest
from pydantic import ValidationError

from app.core.config import settings
from app.schemas.email import MAX_RECIPIENTS, EmailSendRequest
from app.schemas.user import AcceptInviteRequest
from app.schemas.webhook import WebhookWrite
from app.services import sns_verify
from app.services.provider_webhooks import (
    ProviderWebhookError,
    verify_mailtrap_signature,
    verify_resend_svix,
    verify_shared_secret,
)
from app.services.url_guard import UnsafeUrlError, assert_public_destination, check_url_syntax


@pytest.fixture
def production(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "app_env", "production")


@pytest.mark.parametrize(
    "url",
    [
        "http://example.com/hook",
        "https://127.0.0.1/hook",
        "https://10.0.0.5/hook",
        "https://169.254.169.254/latest/meta-data",
        "https://[::1]/hook",
        "https://localhost/hook",
        "https://db.internal/hook",
        "https://user:pass@example.com/hook",
        "https://intranet/hook",
    ],
)
def test_webhook_urls_rejected_in_production(production: None, url: str) -> None:
    with pytest.raises(UnsafeUrlError):
        check_url_syntax(url)
    with pytest.raises(ValidationError):
        WebhookWrite(name="x", url=url, events=["email.sent"])


def test_public_webhook_url_accepted(production: None) -> None:
    assert check_url_syntax("https://hooks.example.com/envoy") == "https://hooks.example.com/envoy"


async def test_destination_resolving_to_private_ip_is_blocked(
    production: None, monkeypatch: pytest.MonkeyPatch
) -> None:
    async def fake_getaddrinfo(*_args, **_kwargs):  # type: ignore[no-untyped-def]
        return [(None, None, None, "", ("10.1.2.3", 443))]

    import asyncio

    monkeypatch.setattr(asyncio.get_running_loop(), "getaddrinfo", fake_getaddrinfo)
    with pytest.raises(UnsafeUrlError):
        await assert_public_destination("https://rebind.example.com/hook")


def test_provider_webhooks_fail_closed_without_secret(production: None) -> None:
    with pytest.raises(ProviderWebhookError) as brevo:
        verify_shared_secret("anything", None)
    assert brevo.value.status_code == 503
    with pytest.raises(ProviderWebhookError):
        verify_resend_svix(raw_body=b"{}", headers={}, signing_secret=None)
    with pytest.raises(ProviderWebhookError):
        verify_mailtrap_signature(raw_body=b"{}", signature="x", signing_secret=None)


def test_sns_cert_and_subscribe_urls() -> None:
    assert sns_verify.is_trusted_sns_url(
        "https://sns.eu-west-3.amazonaws.com/SimpleNotificationService-abc.pem"
    )
    assert not sns_verify.is_trusted_sns_url("https://evil.s3.amazonaws.com/cert.pem")
    assert not sns_verify.is_trusted_sns_url("http://sns.eu-west-3.amazonaws.com/x.pem")
    assert sns_verify.is_trusted_sns_url(
        "https://sns.eu-west-3.amazonaws.com/?Action=ConfirmSubscription&TopicArn=x&Token=y",
        subscribe=True,
    )
    assert not sns_verify.is_trusted_sns_url(
        "https://sns.eu-west-3.amazonaws.com/?Action=Publish", subscribe=True
    )


def _sns_payload(**overrides: object) -> dict[str, object]:
    payload: dict[str, object] = {
        "Type": "Notification",
        "MessageId": "m-1",
        "TopicArn": "arn:aws:sns:eu-west-3:111122223333:ses-events",
        "Message": "{}",
        "Timestamp": datetime.now(timezone.utc).isoformat(),
        "SignatureVersion": "1",
        "Signature": base64.b64encode(b"sig").decode(),
        "SigningCertURL": "https://sns.eu-west-3.amazonaws.com/SimpleNotificationService-abc.pem",
    }
    payload.update(overrides)
    return payload


async def test_sns_rejects_foreign_topic(monkeypatch: pytest.MonkeyPatch) -> None:
    async def own_account() -> str:
        return "999999999999"

    monkeypatch.setattr(sns_verify, "_own_account_id", own_account)
    monkeypatch.setattr(settings, "ses_sns_topic_arns", None)
    with pytest.raises(sns_verify.SnsVerificationError, match="Topic"):
        await sns_verify.verify_sns_message(_sns_payload())


async def test_sns_rejects_stale_and_unsigned(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "ses_sns_topic_arns", "arn:aws:sns:eu-west-3:111122223333:ses-events")
    old = (datetime.now(timezone.utc) - timedelta(hours=3)).isoformat()
    with pytest.raises(sns_verify.SnsVerificationError, match="Stale"):
        await sns_verify.verify_sns_message(_sns_payload(Timestamp=old))
    with pytest.raises(sns_verify.SnsVerificationError, match="SignatureVersion"):
        await sns_verify.verify_sns_message(_sns_payload(SignatureVersion=None))


def _send(**overrides: object) -> EmailSendRequest:
    body: dict[str, object] = {"to": ["a@example.com"], "subject": "Hi", "text": "Hello"}
    body.update(overrides)
    return EmailSendRequest.model_validate(body)


def test_send_rejects_header_injection() -> None:
    with pytest.raises(ValidationError):
        _send(subject="Hi\r\nBcc: victim@example.com")
    with pytest.raises(ValidationError):
        _send(
            attachments=[
                {
                    "filename": "a.txt\r\nX: y",
                    "content": base64.b64encode(b"x").decode(),
                }
            ]
        )


def test_send_caps_recipients() -> None:
    many = [f"user{i}@example.com" for i in range(MAX_RECIPIENTS)]
    _send(to=many)
    with pytest.raises(ValidationError):
        _send(to=many, cc=["extra@example.com"])


def test_password_over_bcrypt_limit_rejected() -> None:
    long = "é" * 40  # 80 bytes
    with pytest.raises(ValidationError):
        AcceptInviteRequest(token="t" * 20, password=long, password_confirm=long)

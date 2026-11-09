"""Verify AWS SNS message signatures before trusting /webhooks/ses payloads."""

from __future__ import annotations

import asyncio
import base64
import re
from datetime import datetime, timedelta, timezone
from typing import Any
from urllib.parse import parse_qs, urlparse

import boto3
import httpx
from cryptography import x509
from cryptography.exceptions import InvalidSignature
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.asymmetric import padding

from app.core.config import settings

_SNS_HOST = re.compile(r"^sns\.[a-z0-9-]+\.amazonaws\.com(\.cn)?$")
_MAX_AGE = timedelta(hours=1)
_cert_cache: dict[str, Any] = {}
_account_id: str | None = None

_NOTIFICATION_KEYS = ("Message", "MessageId", "Subject", "Timestamp", "TopicArn", "Type")
_SUBSCRIPTION_KEYS = ("Message", "MessageId", "SubscribeURL", "Timestamp", "Token", "TopicArn", "Type")


class SnsVerificationError(Exception):
    pass


def is_trusted_sns_url(url: str | None, *, subscribe: bool = False) -> bool:
    if not url:
        return False
    parsed = urlparse(url)
    if parsed.scheme != "https" or not _SNS_HOST.match((parsed.hostname or "").lower()):
        return False
    if parsed.port not in (None, 443):
        return False
    if subscribe:
        query = parse_qs(parsed.query)
        return parsed.path in ("", "/") and query.get("Action") == ["ConfirmSubscription"]
    return parsed.path.endswith(".pem")


def _string_to_sign(payload: dict[str, Any]) -> bytes:
    keys = _NOTIFICATION_KEYS if payload.get("Type") == "Notification" else _SUBSCRIPTION_KEYS
    parts: list[str] = []
    for key in keys:
        value = payload.get(key)
        if value is None:
            continue
        parts.append(f"{key}\n{value}\n")
    return "".join(parts).encode("utf-8")


async def _certificate(url: str) -> Any:
    cached = _cert_cache.get(url)
    if cached is not None:
        return cached
    async with httpx.AsyncClient(timeout=httpx.Timeout(5.0, connect=3.0), follow_redirects=False) as client:
        response = await client.get(url)
        response.raise_for_status()
    cert = x509.load_pem_x509_certificate(response.content)
    _cert_cache[url] = cert
    return cert


async def _own_account_id() -> str | None:
    global _account_id
    if _account_id is not None:
        return _account_id
    if not (settings.aws_access_key_id and settings.aws_secret_access_key):
        return None

    def lookup() -> str:
        client = boto3.client(
            "sts",
            aws_access_key_id=settings.aws_access_key_id,
            aws_secret_access_key=settings.aws_secret_access_key,
            region_name=settings.aws_region,
        )
        return str(client.get_caller_identity()["Account"])

    _account_id = await asyncio.to_thread(lookup)
    return _account_id


async def _topic_allowed(topic_arn: str | None) -> bool:
    if not topic_arn:
        return False
    allow = settings.sns_topic_allowlist
    if allow:
        return topic_arn in allow
    parts = topic_arn.split(":")
    if len(parts) < 6 or parts[0] != "arn" or parts[2] != "sns":
        return False
    try:
        account = await _own_account_id()
    except Exception:
        return False
    return bool(account) and parts[4] == account


async def verify_sns_message(payload: dict[str, Any]) -> None:
    """Raise SnsVerificationError unless the payload is a fresh, AWS-signed message for our topic."""
    if not isinstance(payload.get("Message"), str):
        raise SnsVerificationError("Message must be a string")
    version = str(payload.get("SignatureVersion") or "")
    if version not in {"1", "2"}:
        raise SnsVerificationError("Unsupported SignatureVersion")
    cert_url = payload.get("SigningCertURL") or payload.get("SigningCertUrl")
    if not is_trusted_sns_url(cert_url):
        raise SnsVerificationError("Untrusted SigningCertURL")
    if not await _topic_allowed(payload.get("TopicArn")):
        raise SnsVerificationError("Topic not allowed")

    timestamp = str(payload.get("Timestamp") or "")
    try:
        sent_at = datetime.fromisoformat(timestamp.replace("Z", "+00:00"))
    except ValueError as exc:
        raise SnsVerificationError("Invalid Timestamp") from exc
    if sent_at.tzinfo is None:
        sent_at = sent_at.replace(tzinfo=timezone.utc)
    if abs(datetime.now(timezone.utc) - sent_at) > _MAX_AGE:
        raise SnsVerificationError("Stale message")

    try:
        signature = base64.b64decode(str(payload.get("Signature") or ""), validate=True)
    except ValueError as exc:
        raise SnsVerificationError("Invalid Signature encoding") from exc
    try:
        cert = await _certificate(str(cert_url))
    except Exception as exc:
        raise SnsVerificationError("Could not load signing certificate") from exc
    algorithm = hashes.SHA1() if version == "1" else hashes.SHA256()
    try:
        cert.public_key().verify(signature, _string_to_sign(payload), padding.PKCS1v15(), algorithm)
    except InvalidSignature as exc:
        raise SnsVerificationError("Invalid signature") from exc

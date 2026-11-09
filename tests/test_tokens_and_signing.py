"""JWT, bcrypt, stored-secret encryption and outbound webhook signatures."""
from __future__ import annotations

import time
import uuid
from types import SimpleNamespace

import pytest
from fastapi import HTTPException
from fastapi.security import HTTPAuthorizationCredentials

from app.api import deps
from app.core import security
from app.core.config import settings
from app.services.webhooks import sign_payload, verify_signature


def test_bcrypt_roundtrip() -> None:
    hashed = security.hash_password("correct horse battery")
    assert hashed.startswith("$2b$")
    assert security.verify_password("correct horse battery", hashed)
    assert not security.verify_password("wrong", hashed)
    assert not security.verify_password("x", "not-a-bcrypt-hash")


def test_jwt_roundtrip_and_tamper() -> None:
    token = security.create_access_token("abc", extra_claims={"tv": 3})
    payload = security.decode_access_token(token)
    assert payload["sub"] == "abc" and payload["tv"] == 3
    with pytest.raises(ValueError):
        security.decode_access_token(token[:-2] + "xx")


def test_jwt_expired() -> None:
    from datetime import timedelta

    token = security.create_access_token("abc", expires_delta=timedelta(seconds=-1))
    with pytest.raises(ValueError):
        security.decode_access_token(token)


def test_encryption_key_reads_legacy_and_reseals(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "encryption_key", None)
    legacy = security.seal_secret("whsec_legacy")
    monkeypatch.setattr(settings, "encryption_key", "k" * 40)
    assert security.open_secret(legacy) == "whsec_legacy"
    resealed = security.reseal_if_legacy(legacy)
    assert resealed and resealed != legacy
    assert security.open_secret(resealed) == "whsec_legacy"
    assert security.reseal_if_legacy(resealed) is None
    fresh = security.seal_secret("new")
    monkeypatch.setattr(settings, "encryption_key", None)
    assert security.open_secret(fresh) is None


def test_webhook_signature_timestamp_and_replay() -> None:
    body = '{"id":"1","type":"email.sent"}'
    now = int(time.time())
    header = sign_payload("whsec_x", str(now), body)
    assert header.startswith(f"t={now},v1=")
    assert verify_signature("whsec_x", header, body)
    assert not verify_signature("whsec_y", header, body)
    assert not verify_signature("whsec_x", header, body + " ")
    assert not verify_signature("whsec_x", header, body, now=now + 301)
    assert not verify_signature("whsec_x", "v1=abc", body)


class _FakeDb:
    def __init__(self, user: object) -> None:
        self.user = user

    async def get(self, _model: object, _id: object) -> object:
        return self.user


async def test_revoked_token_version_is_rejected() -> None:
    user_id = uuid.uuid4()
    user = SimpleNamespace(id=user_id, is_active=True, token_version=2)
    good = security.create_access_token(user_id, extra_claims={"tv": 2})
    old = security.create_access_token(user_id, extra_claims={"tv": 1})

    creds = HTTPAuthorizationCredentials(scheme="Bearer", credentials=good)
    assert await deps.get_current_user(creds, _FakeDb(user)) is user

    creds = HTTPAuthorizationCredentials(scheme="Bearer", credentials=old)
    with pytest.raises(HTTPException) as exc:
        await deps.get_current_user(creds, _FakeDb(user))
    assert exc.value.status_code == 401

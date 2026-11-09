from __future__ import annotations

from datetime import datetime, timezone
from types import SimpleNamespace

import pytest
from pydantic import ValidationError

from app.schemas.domain import DomainSenderUpdate
from app.services.invite_email import render_invite
from app.services.send import domain_sender


def test_sender_defaults_to_noreply_without_reply_to() -> None:
    body = DomainSenderUpdate()
    assert body.from_local_part == "noreply" and body.reply_to is None


def test_sender_validation() -> None:
    assert DomainSenderUpdate(from_local_part=" Hello.Team ").from_local_part == "hello.team"
    with pytest.raises(ValidationError):
        DomainSenderUpdate(from_local_part="bad local")
    with pytest.raises(ValidationError):
        DomainSenderUpdate(from_name="Acme <x@evil.test>")
    with pytest.raises(ValidationError):
        DomainSenderUpdate(reply_mode="address")
    reset = DomainSenderUpdate(reply_mode="none", reply_to="a@b.co")
    assert reset.reply_to is None


def test_domain_sender_header() -> None:
    domain = SimpleNamespace(name="mail.acme.io", from_local_part="hello", from_name=None)
    assert domain_sender(domain) == "hello@mail.acme.io"
    domain.from_name = "Acme"
    assert domain_sender(domain) == "Acme <hello@mail.acme.io>"
    domain.from_name = "Acme, Inc."
    assert domain_sender(domain) == '"Acme, Inc." <hello@mail.acme.io>'


def test_invite_email_layout_and_escaping() -> None:
    subject, text, html = render_invite(
        link="https://envoy.example.com/auth/accept-invite?token=a&b",
        expires=datetime(2026, 11, 10, 12, 0, tzinfo=timezone.utc),
        recipient="new@acme.io",
        inviter="<script>Ops</script>",
        site_url="https://envoy.example.com",
    )
    assert subject == "You're invited to Envoy"
    assert "<table" not in html
    assert "<svg" in html and "ENVOY" in html
    assert "&lt;script&gt;" in html and "<script>" not in html
    assert "token=a&amp;b" in html
    assert "accept-invite?token=a&b" in text

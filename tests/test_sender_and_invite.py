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
        code="ABCD-EFGH-JKMN-PQRS",
        expires=datetime(2026, 11, 10, 12, 0, tzinfo=timezone.utc),
        recipient="new@acme.io",
        inviter="<script>Ops</script>\r\nBcc: attacker",
        site_url="https://envoy.example.com",
    )
    assert "\n" not in subject and subject.endswith("invited you to Envoy")
    assert "<table" not in html
    assert "<svg" in html and "ENVOY" in html
    assert "&lt;script&gt;" in html and "<script>" not in html
    assert "token=a&amp;b" in html
    assert "accept-invite?token=a&b" in text
    assert "ABCD-EFGH-JKMN-PQRS" in html and "ABCD-EFGH-JKMN-PQRS" in text
    assert "https://envoy.example.com/console/login" in html


def test_invite_shows_names_never_the_inviter_email() -> None:
    common = {
        "link": "https://e.x/a?token=t",
        "code": "ABCD-EFGH-JKMN-PQRS",
        "expires": datetime(2026, 11, 10, 12, 0, tzinfo=timezone.utc),
        "recipient": "ada@acme.io",
        "site_url": "https://e.x",
    }
    subject, text, html = render_invite(inviter="Alpha Barry", invitee="Ada Lovelace", **common)
    assert subject == "Alpha Barry invited you to Envoy"
    assert "Hi Ada," in html and "Hi Ada," in text
    subject, text, html = render_invite(inviter="admin@acme.io", invitee=None, **common)
    assert "admin@acme.io" not in subject + text + html
    assert subject == "The Envoy team invited you to Envoy"


def test_logged_invites_hide_the_code() -> None:
    from app.services.auth import _mask_code

    assert _mask_code("ABCD-EFGH-JKMN-PQRS") == "ABCD-••••-••••-••••"
    assert "EFGH" not in _mask_code("ABCD-EFGH-JKMN-PQRS")
    assert _mask_code("legacy-long-token") == "••••"


def test_invite_codes_are_typeable() -> None:
    from app.core.security import generate_invite_token, normalize_invite_token

    code = generate_invite_token()
    assert len(code) == 19 and code.count("-") == 3
    assert normalize_invite_token(code.lower().replace("-", " ")) == code
    legacy = "abc-DEF_ghi" * 6
    assert normalize_invite_token(f" {legacy} ") == legacy

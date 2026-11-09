from __future__ import annotations

from datetime import datetime, timedelta, timezone

import pytest
from pydantic import ValidationError

from app.api.v1.access_requests import AccessRequestIn, is_duplicate
from app.models.access_request import AccessRequest
from app.services.access_request_email import render_admin_notification, render_decline


def _payload(**overrides: str) -> AccessRequestIn:
    data = {
        "full_name": "Ada\r\nBcc: x@evil.test",
        "email": "ada@example.com",
        "organization": "<script>alert(1)</script>",
        "volume": "<10k",
        "use_case": "Invoices & <b>alerts</b>",
    }
    data.update(overrides)
    return AccessRequestIn(**data)


def test_fields_are_single_line_and_html_escaped() -> None:
    payload = _payload()
    assert "\n" not in payload.full_name and "\r" not in payload.full_name
    subject, text, html = render_admin_notification(
        full_name=payload.full_name,
        email=str(payload.email),
        organization=payload.organization,
        volume=payload.volume,
        use_case=payload.use_case,
        review_url="https://envoy.example.com/console/users?request=1",
        recipient="admin@example.com",
        site_url="https://envoy.example.com",
    )
    assert "\n" not in subject
    assert "<script>" not in html and "&lt;script&gt;" in html
    assert "&lt;b&gt;alerts&lt;/b&gt;" in html
    assert "<table" not in html and "<svg" in html
    assert "/console/users?request=1" in html
    assert "ada@example.com" in text and "Under 10,000" in text


def test_decline_email_is_polite_and_escaped() -> None:
    subject, text, html = render_decline(
        full_name="<i>Ada</i> Lovelace", recipient="ada@example.com", site_url="https://envoy.example.com"
    )
    assert subject == "About your Envoy access request"
    assert "<i>" not in html and "&lt;i&gt;Ada&lt;/i&gt;" in html
    assert "https://envoy.example.com/request-access" in html


def test_rejects_unknown_volume_and_bad_email() -> None:
    with pytest.raises(ValidationError):
        _payload(volume="lots")
    with pytest.raises(ValidationError):
        _payload(email="nope")


def _request(status: str, decided_days_ago: int | None = None) -> AccessRequest:
    decided = None
    if decided_days_ago is not None:
        decided = datetime.now(timezone.utc) - timedelta(days=decided_days_ago)
    return AccessRequest(email="ada@example.com", status=status, decided_at=decided)


def test_duplicate_requests_are_ignored() -> None:
    assert is_duplicate(has_account=False, latest=None) is False
    assert is_duplicate(has_account=True, latest=None) is True
    assert is_duplicate(has_account=False, latest=_request("pending")) is True
    assert is_duplicate(has_account=False, latest=_request("declined", 3)) is True
    assert is_duplicate(has_account=False, latest=_request("declined", 45)) is False
    assert is_duplicate(has_account=False, latest=_request("accepted", 1)) is False

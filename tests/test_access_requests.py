from __future__ import annotations

import pytest
from pydantic import ValidationError

from app.api.v1.access_requests import AccessRequest, _bodies


def _payload(**overrides: str) -> AccessRequest:
    data = {
        "full_name": "Ada\r\nBcc: x@evil.test",
        "email": "ada@example.com",
        "organization": "<script>alert(1)</script>",
        "volume": "<10k",
        "use_case": "Invoices & <b>alerts</b>",
    }
    data.update(overrides)
    return AccessRequest(**data)


def test_fields_are_single_line_and_html_escaped() -> None:
    payload = _payload()
    assert "\n" not in payload.full_name and "\r" not in payload.full_name
    text, html = _bodies(payload, "203.0.113.9")
    assert "<script>" not in html and "&lt;script&gt;" in html
    assert "&lt;b&gt;alerts&lt;/b&gt;" in html
    assert "ada@example.com" in text


def test_rejects_unknown_volume_and_bad_email() -> None:
    with pytest.raises(ValidationError):
        _payload(volume="lots")
    with pytest.raises(ValidationError):
        _payload(email="nope")

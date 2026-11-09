"""Création / lecture / vérification des domaines d'envoi Resend."""

from __future__ import annotations

from typing import Any

import httpx

from app.core.config import get_settings

_API = "https://api.resend.com/domains"


class ResendDomainError(Exception):
    def __init__(self, status_code: int, detail: str) -> None:
        self.status_code = status_code
        self.detail = detail
        super().__init__(detail)


def is_configured() -> bool:
    return bool(get_settings().resend_api_key)


async def can_manage_domains() -> bool:
    """True seulement si la clé peut lister / créer des domaines (pas send-only)."""
    if not is_configured():
        return False
    try:
        await _request("GET", _API)
        return True
    except ResendDomainError:
        return False


def _api_key() -> str:
    key = (get_settings().resend_api_key or "").strip()
    if not key:
        raise ResendDomainError(400, "Resend API key is not configured.")
    return key


async def ensure_domain(name: str) -> dict[str, Any]:
    """Crée le domaine chez Resend s'il manque, sinon lit sa config DNS."""
    existing = await find_domain(name)
    if existing is not None:
        return existing

    try:
        payload = await _request("POST", _API, json_body={"name": name})
    except ResendDomainError as exc:
        # Race / eventual consistency: create says exists — re-list under this key.
        lowered = exc.detail.lower()
        if "registered already" in lowered or "already exists" in lowered:
            again = await find_domain(name)
            if again is not None:
                return again
        raise ResendDomainError(exc.status_code, _friendly_create_error(name, exc.detail)) from exc

    domain_id = str(payload.get("id") or "").strip()
    if not domain_id:
        raise ResendDomainError(502, "Resend created the domain but returned no id.")
    # Create already includes records; re-fetch for a stable shape.
    refreshed = await get_domain(domain_id)
    if refreshed is None:
        if not (payload.get("records") or []):
            raise ResendDomainError(502, "Resend created the domain but returned no DNS records.")
        return payload
    return refreshed


async def find_domain(name: str) -> dict[str, Any] | None:
    payload = await _request("GET", _API)
    items = payload.get("data") if isinstance(payload, dict) else None
    if not isinstance(items, list):
        return None
    needle = name.strip().lower()
    match = next(
        (
            item
            for item in items
            if isinstance(item, dict) and str(item.get("name") or "").lower() == needle
        ),
        None,
    )
    if match is None:
        return None
    domain_id = str(match.get("id") or "").strip()
    if not domain_id:
        raise ResendDomainError(502, "Resend listed the domain without an id.")
    # List items never include DNS records — always fetch the detail payload.
    detail = await get_domain(domain_id)
    if detail is None:
        raise ResendDomainError(502, "Resend listed the domain but detail lookup failed.")
    return detail


async def get_domain(domain_id: str) -> dict[str, Any] | None:
    try:
        return await _request("GET", f"{_API}/{domain_id}")
    except ResendDomainError as exc:
        if exc.status_code == 404:
            return None
        raise


async def verify_domain(domain_id: str) -> dict[str, Any]:
    await _request("POST", f"{_API}/{domain_id}/verify")
    config = await get_domain(domain_id)
    if config is None:
        raise ResendDomainError(502, "Resend verification started but configuration is unavailable.")
    return config


async def list_domain_names() -> list[str]:
    payload = await _request("GET", _API)
    items = payload.get("data") if isinstance(payload, dict) else None
    if not isinstance(items, list):
        return []
    names: list[str] = []
    for item in items:
        if not isinstance(item, dict):
            continue
        name = str(item.get("name") or "").strip().lower()
        if name:
            names.append(name)
    return names


async def delete_domain(name: str) -> None:
    """Supprime le domaine chez Resend s'il existe sous la clé actuelle."""
    existing = await find_domain(name)
    if existing is None:
        return
    domain_id = str(existing.get("id") or "").strip()
    if not domain_id:
        raise ResendDomainError(502, "Resend domain id missing — cannot delete.")
    await _request("DELETE", f"{_API}/{domain_id}")


def _friendly_create_error(name: str, detail: str) -> str:
    lowered = detail.lower()
    if "registered already" in lowered or "already exists" in lowered:
        return (
            f"{name} is already registered on another Resend account/team. "
            "This API key cannot see or manage it. Use the Resend API key from the "
            "account that owns the domain, or remove it there first."
        )
    return detail


def to_envoy_identity(name: str, config: dict[str, Any]) -> dict[str, Any]:
    """Mappe la config Resend vers le format identité utilisé par domains._apply_identity."""
    status = str(config.get("status") or "").lower()
    verified = status in {"verified", "partially_verified"}
    dkim_status = "SUCCESS" if verified else "PENDING"
    records: list[dict[str, Any]] = []

    for raw in config.get("records") or []:
        if not isinstance(raw, dict) or not raw.get("value"):
            continue
        purpose = _purpose(str(raw.get("record") or ""))
        if purpose is None:
            continue
        record_status = str(raw.get("status") or "").lower()
        item: dict[str, Any] = {
            "type": str(raw.get("type") or "TXT").upper(),
            "name": _host_name(name, str(raw.get("name") or "")),
            "value": str(raw["value"]),
            "ttl": 300,
            "purpose": purpose,
            "status": "verified" if record_status == "verified" else "pending",
            "source": "resend",
        }
        if raw.get("priority") is not None:
            item["priority"] = raw.get("priority")
        records.append(item)

    if not records:
        raise ResendDomainError(
            502,
            "Resend returned the domain without DNS records to publish. "
            "Unlink and link again, or check the Resend dashboard.",
        )

    return {
        "dkim_status": dkim_status,
        "dns_records": records,
        "identity_arn": None,
    }


def _purpose(record: str) -> str | None:
    key = record.strip().upper()
    if key == "DKIM":
        return "DKIM"
    if key == "SPF":
        return "SPF"
    if key in {"TRACKING", "TRACKINGCAA", "RECEIVING"}:
        return None
    return key or None


def _host_name(domain: str, host: str) -> str:
    cleaned = host.strip().rstrip(".")
    if not cleaned or cleaned in {"@", domain}:
        return domain
    if cleaned.endswith(f".{domain}"):
        return cleaned
    return f"{cleaned}.{domain}"


async def _request(
    method: str,
    url: str,
    *,
    json_body: dict[str, Any] | None = None,
) -> dict[str, Any]:
    headers = {
        "Authorization": f"Bearer {_api_key()}",
        "accept": "application/json",
        "content-type": "application/json",
    }
    try:
        async with httpx.AsyncClient(timeout=httpx.Timeout(15.0, connect=5.0)) as client:
            response = await client.request(method, url, headers=headers, json=json_body)
    except httpx.HTTPError as exc:
        raise ResendDomainError(502, f"Resend network error: {exc}") from exc

    if response.status_code == 404:
        raise ResendDomainError(404, "Domain does not exist in Resend.")
    if response.status_code >= 400:
        raise ResendDomainError(_map_status(response.status_code), _error_text(response))

    if not response.content:
        return {}
    payload = response.json()
    return payload if isinstance(payload, dict) else {}


def _map_status(code: int) -> int:
    # Auth / permission → 400 pour que la console affiche le détail Resend.
    if code in {401, 403}:
        return 400
    if code in {400, 404, 409, 422}:
        return code
    return 502


def _error_text(response: httpx.Response) -> str:
    try:
        data = response.json()
        if isinstance(data, dict):
            message = str(data.get("message") or data.get("error") or data).strip()
            if message:
                lowered = message.lower()
                if "restricted" in lowered or "only send" in lowered:
                    return (
                        "Resend API key can only send emails. "
                        "Use a full-access key to create and verify domains."
                    )
                return message[:500]
    except ValueError:
        pass
    return f"HTTP {response.status_code}: {response.text[:300]}"

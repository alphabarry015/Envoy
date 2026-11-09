"""Création / lecture / authentification des domaines d'envoi Brevo."""

from __future__ import annotations

from typing import Any

import httpx

from app.core.config import settings

_API = "https://api.brevo.com/v3/senders/domains"


class BrevoDomainError(Exception):
    def __init__(self, status_code: int, detail: str) -> None:
        self.status_code = status_code
        self.detail = detail
        super().__init__(detail)


def is_configured() -> bool:
    return bool(settings.brevo_api_key)


async def ensure_domain(name: str) -> dict[str, Any]:
    """Crée le domaine chez Brevo s'il manque, sinon lit sa config DNS."""
    if not settings.brevo_api_key:
        raise BrevoDomainError(400, "Brevo API key is not configured.")

    existing = await get_domain_config(name)
    if existing is not None:
        return existing

    payload = await _request("POST", _API, json_body={"name": name})
    # La création renvoie déjà dns_records ; on normalise via le GET si besoin.
    if payload.get("dns_records"):
        return {
            "domain": payload.get("domain_name") or name,
            "verified": False,
            "authenticated": False,
            "dns_records": payload.get("dns_records") or {},
        }
    refreshed = await get_domain_config(name)
    if refreshed is None:
        raise BrevoDomainError(502, "Brevo created the domain but configuration is unavailable.")
    return refreshed


async def get_domain_config(name: str) -> dict[str, Any] | None:
    if not settings.brevo_api_key:
        raise BrevoDomainError(400, "Brevo API key is not configured.")
    try:
        return await _request("GET", f"{_API}/{name}")
    except BrevoDomainError as exc:
        if exc.status_code == 404:
            return None
        # Certaines réponses Brevo renvoient 400 quand le domaine n'existe pas.
        if exc.status_code == 400 and "does not exist" in exc.detail.lower():
            return None
        raise


async def authenticate_domain(name: str) -> dict[str, Any]:
    if not settings.brevo_api_key:
        raise BrevoDomainError(400, "Brevo API key is not configured.")
    await _request("PUT", f"{_API}/{name}/authenticate")
    config = await get_domain_config(name)
    if config is None:
        raise BrevoDomainError(502, "Brevo authentication succeeded but configuration is unavailable.")
    return config


async def delete_domain(name: str) -> None:
    """Supprime le domaine chez Brevo s'il existe."""
    if not settings.brevo_api_key:
        return
    existing = await get_domain_config(name)
    if existing is None:
        return
    try:
        await _request("DELETE", f"{_API}/{name}")
    except BrevoDomainError as exc:
        if exc.status_code == 404:
            return
        raise


async def list_domain_names() -> list[str]:
    if not settings.brevo_api_key:
        return []
    payload = await _request("GET", _API)
    items = payload.get("domains") if isinstance(payload, dict) else None
    if not isinstance(items, list):
        return []
    names: list[str] = []
    for item in items:
        if not isinstance(item, dict):
            continue
        name = str(item.get("domain_name") or item.get("domain") or "").strip().lower()
        if name:
            names.append(name)
    return names


def to_envoy_identity(name: str, config: dict[str, Any]) -> dict[str, Any]:
    """Mappe la config Brevo vers le format identité utilisé par domains._apply_identity."""
    authenticated = bool(config.get("authenticated"))
    verified = bool(config.get("verified"))
    dkim_status = "SUCCESS" if authenticated or verified else "PENDING"
    # GET returns dns_records; list payloads sometimes use "records".
    raw_dns = config.get("dns_records") or config.get("records") or {}
    records: list[dict[str, Any]] = []

    if isinstance(raw_dns, dict):
        records.extend(_map_brevo_dict_records(name, raw_dns))
    elif isinstance(raw_dns, list):
        for raw in raw_dns:
            if isinstance(raw, dict) and raw.get("value"):
                records.append(_map_one_brevo_record(name, raw, purpose="DKIM"))

    if not records:
        raise BrevoDomainError(
            502,
            "Brevo returned the domain without DNS records to publish. "
            "Unlink and link again, or check the Brevo dashboard.",
        )

    return {
        "dkim_status": dkim_status,
        "dns_records": records,
        "identity_arn": None,
    }


def _map_brevo_dict_records(name: str, raw_dns: dict[str, Any]) -> list[dict[str, Any]]:
    mapped: list[dict[str, Any]] = []
    # Ownership / verification code.
    brevo_code = raw_dns.get("brevo_code")
    if isinstance(brevo_code, dict) and brevo_code.get("value"):
        mapped.append(_map_one_brevo_record(name, brevo_code, purpose="BREVO"))

    # Legacy single DKIM + current dual CNAME DKIM (dkim1Record / dkim2Record).
    for key, purpose in (
        ("dkim_record", "DKIM"),
        ("dkim1Record", "DKIM"),
        ("dkim2Record", "DKIM"),
        ("dkim1_record", "DKIM"),
        ("dkim2_record", "DKIM"),
        ("dmarc_record", "DMARC"),
    ):
        raw = raw_dns.get(key)
        if isinstance(raw, dict) and raw.get("value"):
            mapped.append(_map_one_brevo_record(name, raw, purpose=purpose))
    return mapped


def _map_one_brevo_record(name: str, raw: dict[str, Any], *, purpose: str) -> dict[str, Any]:
    return {
        "type": str(raw.get("type") or "TXT").upper(),
        "name": _host_name(name, str(raw.get("host_name") or raw.get("name") or "")),
        "value": str(raw["value"]),
        "ttl": 300,
        "purpose": purpose,
        "status": "verified" if raw.get("status") else "pending",
        "source": "brevo",
    }


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
        "api-key": settings.brevo_api_key or "",
        "accept": "application/json",
        "content-type": "application/json",
    }
    try:
        async with httpx.AsyncClient(timeout=httpx.Timeout(15.0, connect=5.0)) as client:
            response = await client.request(method, url, headers=headers, json=json_body)
    except httpx.HTTPError as exc:
        raise BrevoDomainError(502, f"Brevo network error: {exc}") from exc

    if response.status_code == 404:
        raise BrevoDomainError(404, "Domain does not exist in Brevo.")
    if response.status_code >= 400:
        raise BrevoDomainError(_map_status(response.status_code), _error_text(response))

    if not response.content:
        return {}
    payload = response.json()
    return payload if isinstance(payload, dict) else {}


def _map_status(code: int) -> int:
    if code in {400, 401, 403, 404, 409, 422}:
        return code if code != 401 else 502
    return 502


def _error_text(response: httpx.Response) -> str:
    try:
        data = response.json()
        if isinstance(data, dict):
            return str(data.get("message") or data)[:500]
    except ValueError:
        pass
    return f"HTTP {response.status_code}: {response.text[:300]}"

"""Création / lecture des domaines d'envoi Mailtrap (DNS à publier)."""

from __future__ import annotations

from typing import Any

import httpx

from app.core.config import get_settings

_API_ROOT = "https://mailtrap.io/api"


class MailtrapDomainError(Exception):
    def __init__(self, status_code: int, detail: str) -> None:
        self.status_code = status_code
        self.detail = detail
        super().__init__(detail)


def is_configured() -> bool:
    return bool((get_settings().mailtrap_api_token or "").strip())


async def can_manage_domains() -> bool:
    """True si le token peut lister les domaines d'envoi."""
    if not is_configured():
        return False
    try:
        await list_domains()
        return True
    except MailtrapDomainError:
        return False


def _token() -> str:
    key = (get_settings().mailtrap_api_token or "").strip()
    if not key:
        raise MailtrapDomainError(400, "Mailtrap API token is not configured.")
    return key


async def ensure_domain(name: str) -> dict[str, Any]:
    """Crée le domaine chez Mailtrap s'il manque, sinon lit sa config DNS."""
    existing = await find_domain(name)
    if existing is not None:
        return existing

    account_id = await _account_id()
    try:
        payload = await _request(
            "POST",
            f"{_API_ROOT}/accounts/{account_id}/sending_domains",
            json_body={"sending_domain": {"domain_name": name}},
        )
    except MailtrapDomainError as exc:
        raise MailtrapDomainError(exc.status_code, _friendly_create_error(name, exc.detail)) from exc

    domain_id = payload.get("id")
    if domain_id is None:
        # Some responses wrap the domain object.
        nested = payload.get("sending_domain") if isinstance(payload.get("sending_domain"), dict) else None
        domain_id = nested.get("id") if nested else None
        if nested and nested.get("dns_records"):
            payload = nested
    if domain_id is None:
        raise MailtrapDomainError(502, "Mailtrap created the domain but returned no id.")
    refreshed = await get_domain(int(domain_id))
    if refreshed is None:
        if not (payload.get("dns_records") or []):
            raise MailtrapDomainError(502, "Mailtrap created the domain but returned no DNS records.")
        return payload
    return refreshed


async def find_domain(name: str) -> dict[str, Any] | None:
    needle = name.strip().lower()
    for item in await list_domains():
        if str(item.get("domain_name") or "").lower() != needle:
            continue
        domain_id = item.get("id")
        if domain_id is None:
            raise MailtrapDomainError(502, "Mailtrap listed the domain without an id.")
        # Prefer detail payload (stable DNS shape).
        detail = await get_domain(int(domain_id))
        return detail or item
    return None


async def get_domain(domain_id: int) -> dict[str, Any] | None:
    account_id = await _account_id()
    try:
        return await _request("GET", f"{_API_ROOT}/accounts/{account_id}/sending_domains/{domain_id}")
    except MailtrapDomainError as exc:
        if exc.status_code == 404:
            return None
        raise


async def list_domains() -> list[dict[str, Any]]:
    account_id = await _account_id()
    payload = await _request("GET", f"{_API_ROOT}/accounts/{account_id}/sending_domains")
    items = payload.get("data") if isinstance(payload, dict) else None
    if not isinstance(items, list):
        return []
    return [item for item in items if isinstance(item, dict)]


async def delete_domain(name: str) -> None:
    """Supprime le domaine chez Mailtrap s'il existe."""
    existing = await find_domain(name)
    if existing is None:
        return
    domain_id = existing.get("id")
    if domain_id is None:
        raise MailtrapDomainError(502, "Mailtrap domain id missing — cannot delete.")
    account_id = await _account_id()
    try:
        await _request(
            "DELETE",
            f"{_API_ROOT}/accounts/{account_id}/sending_domains/{int(domain_id)}",
        )
    except MailtrapDomainError as exc:
        if exc.status_code == 404:
            return
        raise


async def list_domain_names(*, include_demo: bool = False) -> list[str]:
    names: list[str] = []
    for item in await list_domains():
        if not include_demo and item.get("demo") is True:
            continue
        name = str(item.get("domain_name") or "").strip().lower()
        if name:
            names.append(name)
    return names


def to_envoy_identity(name: str, config: dict[str, Any]) -> dict[str, Any]:
    """Mappe la config Mailtrap vers le format identité Envoy."""
    verified = bool(config.get("dns_verified"))
    dkim_status = "SUCCESS" if verified else "PENDING"
    records: list[dict[str, Any]] = []

    for raw in config.get("dns_records") or []:
        if not isinstance(raw, dict) or not raw.get("value"):
            continue
        purpose = _purpose(str(raw.get("key") or ""))
        if purpose is None:
            continue
        status = str(raw.get("status") or "").lower()
        item: dict[str, Any] = {
            "type": str(raw.get("type") or "TXT").upper(),
            "name": _host_name(name, str(raw.get("name") or raw.get("domain") or "")),
            "value": str(raw["value"]),
            "ttl": 300,
            "purpose": purpose,
            "status": "verified" if status == "pass" else "pending",
            "source": "mailtrap",
        }
        if raw.get("priority") is not None:
            item["priority"] = raw.get("priority")
        records.append(item)

    if not records:
        raise MailtrapDomainError(
            502,
            "Mailtrap returned the domain without DNS records to publish. "
            "Unlink and link again, or check the Mailtrap dashboard.",
        )

    return {
        "dkim_status": dkim_status,
        "dns_records": records,
        "identity_arn": None,
    }


def _purpose(key: str) -> str | None:
    normalized = key.strip().lower()
    if normalized.startswith("dkim"):
        return "DKIM"
    if normalized == "dmarc":
        return "DMARC"
    if normalized in {"spf"}:
        return "SPF"
    if normalized in {"verification", "link_verification"}:
        return "MAILTRAP"
    if normalized in {"inbound_mx"}:
        return "MX"
    return key.upper() or None


def _host_name(domain: str, host: str) -> str:
    cleaned = host.strip().rstrip(".")
    if not cleaned or cleaned in {"@", domain}:
        return domain
    if cleaned.endswith(f".{domain}"):
        return cleaned
    # Mailtrap sometimes returns the FQDN in "domain" and a short label in "name".
    if "." in cleaned and cleaned.endswith(domain):
        return cleaned
    return f"{cleaned}.{domain}"


def _friendly_create_error(name: str, detail: str) -> str:
    lowered = detail.lower()
    if "maximum number of domains" in lowered or "upgrade" in lowered:
        return (
            f"Mailtrap plan limit reached — cannot add {name}. "
            "Upgrade the Mailtrap Email API plan, or unlink an unused domain there first."
        )
    if "already" in lowered and "domain" in lowered:
        return (
            f"{name} is already registered on another Mailtrap account. "
            "Use the API token from the account that owns the domain."
        )
    return detail


_cached_account_id: int | None = None


async def _account_id() -> int:
    global _cached_account_id
    if _cached_account_id is not None:
        return _cached_account_id
    _cached_account_id = await _fetch_account_id()
    return _cached_account_id


async def _fetch_account_id() -> int:
    payload = await _request("GET", f"{_API_ROOT}/accounts")
    items = payload if isinstance(payload, list) else payload.get("data") if isinstance(payload, dict) else None
    if isinstance(payload, list):
        items = payload
    if not isinstance(items, list) or not items:
        raise MailtrapDomainError(502, "Mailtrap returned no accounts for this API token.")
    first = items[0]
    if not isinstance(first, dict) or first.get("id") is None:
        raise MailtrapDomainError(502, "Mailtrap account id is unavailable.")
    return int(first["id"])


async def _request(
    method: str,
    url: str,
    *,
    json_body: dict[str, Any] | None = None,
) -> dict[str, Any] | list[Any]:
    headers = {
        "Authorization": f"Bearer {_token()}",
        "accept": "application/json",
        "content-type": "application/json",
    }
    try:
        async with httpx.AsyncClient(timeout=httpx.Timeout(15.0, connect=5.0)) as client:
            response = await client.request(method, url, headers=headers, json=json_body)
    except httpx.HTTPError as exc:
        raise MailtrapDomainError(502, f"Mailtrap network error: {exc}") from exc

    if response.status_code == 404:
        raise MailtrapDomainError(404, "Domain does not exist in Mailtrap.")
    if response.status_code >= 400:
        raise MailtrapDomainError(_map_status(response.status_code), _error_text(response))

    if not response.content:
        return {}
    payload = response.json()
    if isinstance(payload, (dict, list)):
        return payload
    return {}


def _map_status(code: int) -> int:
    if code in {401, 403}:
        return 400
    if code in {400, 404, 409, 422}:
        return code
    return 502


def _error_text(response: httpx.Response) -> str:
    try:
        data = response.json()
        if isinstance(data, dict):
            errors = data.get("errors")
            if isinstance(errors, dict):
                parts = []
                for value in errors.values():
                    if isinstance(value, list):
                        parts.extend(str(item) for item in value)
                    else:
                        parts.append(str(value))
                if parts:
                    return "; ".join(parts)[:500]
            message = str(data.get("message") or data.get("error") or data).strip()
            if message:
                return message[:500]
        if isinstance(data, list):
            return str(data)[:500]
    except ValueError:
        pass
    return f"HTTP {response.status_code}: {response.text[:300]}"

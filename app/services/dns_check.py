"""Vérifie en live si les records DNS du domaine sont publiés."""

from __future__ import annotations

import logging
import threading
import time
from concurrent.futures import ThreadPoolExecutor
from typing import Any

logger = logging.getLogger("envoy.dns")


def annotate_live_dns(records: list[dict[str, Any]] | None) -> list[dict[str, Any]]:
    """Pour chaque record, marque verified/pending selon une résolution DNS réelle."""
    if not records:
        return []
    items = [dict(raw) for raw in records if isinstance(raw, dict)]

    def check(item: dict[str, Any]) -> dict[str, Any]:
        name = str(item.get("name") or "").strip()
        rtype = str(item.get("type") or "TXT").upper()
        expected = str(item.get("value") or "").strip()
        if not name or not expected:
            item["status"] = item.get("status") or "pending"
            return item
        item["status"] = "verified" if _is_published(name, rtype, expected) else "pending"
        return item

    with ThreadPoolExecutor(max_workers=min(8, max(1, len(items)))) as pool:
        return list(pool.map(check, items))


_PUBLIC_NAMESERVERS = ["1.1.1.1", "8.8.8.8", "9.9.9.9"]
_AUTH_CACHE_SECONDS = 600
_auth_cache: dict[str, tuple[float, list[str]]] = {}
_auth_lock = threading.Lock()


def _public_resolver():
    import dns.resolver  # type: ignore

    resolver = dns.resolver.Resolver(configure=False)
    resolver.nameservers = list(_PUBLIC_NAMESERVERS)
    return resolver


def _authoritative_ips(name: str) -> list[str]:
    """IPs of the zone's own nameservers: they answer without any resolver cache."""
    import dns.resolver  # type: ignore

    public = _public_resolver()
    zone = str(dns.resolver.zone_for_name(name, resolver=public)).lower()
    now = time.monotonic()
    with _auth_lock:
        cached = _auth_cache.get(zone)
        if cached and now - cached[0] < _AUTH_CACHE_SECONDS:
            return cached[1]
    ips: list[str] = []
    for ns in public.resolve(zone, "NS", lifetime=3.0):
        try:
            ips.extend(str(item) for item in public.resolve(str(ns.target), "A", lifetime=3.0))
        except Exception:  # noqa: BLE001 - one unreachable NS must not hide the others
            continue
    with _auth_lock:
        _auth_cache[zone] = (now, ips)
    return ips


def _lookup(name: str, rtype: str):
    """Authoritative answer first; public resolvers only if the zone's NS can't be reached.

    The local resolver is avoided: home routers cache NXDOMAIN from before the records
    existed and alternate upstreams, which made statuses flip between checks.
    """
    import dns.resolver  # type: ignore

    try:
        ips = _authoritative_ips(name)
    except Exception:  # noqa: BLE001
        ips = []
    if ips:
        resolver = dns.resolver.Resolver(configure=False)
        resolver.nameservers = ips
        try:
            return resolver.resolve(name, rtype, lifetime=4.0)
        except (dns.resolver.NXDOMAIN, dns.resolver.NoAnswer):
            return None
        except Exception:  # noqa: BLE001 - timeout / refused: fall back to public resolvers
            pass
    try:
        return _public_resolver().resolve(name, rtype, lifetime=4.0)
    except Exception:  # noqa: BLE001
        return None


def _is_published(name: str, rtype: str, expected: str) -> bool:
    try:
        import dns.resolver  # type: ignore  # noqa: F401
    except ImportError:
        logger.warning("dnspython missing — skip live DNS check")
        return False

    answers = _lookup(name, rtype)
    if answers is None:
        return False

    # Un seul TXT _dmarc est autorisé par domaine : chaque provider propose sa variante
    # (rua différent), donc toute politique DMARC publiée satisfait tous les providers.
    if rtype == "TXT" and name.lower().startswith("_dmarc."):
        return any(_compact(str(answer)).lower().startswith("v=dmarc1") for answer in answers)

    # Un seul SPF par domaine : les providers sont fusionnés en un record unique,
    # on vérifie donc seulement que les mécanismes attendus y figurent.
    if rtype == "TXT" and expected.lower().startswith("v=spf1"):
        required = _spf_mechanisms(expected)
        return any(
            required <= _spf_mechanisms(text)
            for text in (str(answer).replace('"', "") for answer in answers)
            if text.strip().lower().startswith("v=spf1")
        )

    # Les providers (Mailtrap) exigent que leur MX soit prioritaire, pas seulement présent.
    if rtype == "MX":
        target = expected.strip().rstrip(".").lower()
        best = min((answer.preference for answer in answers), default=None)
        return any(
            answer.preference == best and str(answer.exchange).rstrip(".").lower() == target
            for answer in answers
        )

    needle = _compact(expected)
    joined = _compact("".join(str(answer) for answer in answers))
    if needle and needle in joined:
        return True
    for answer in answers:
        text = _compact(str(answer))
        if needle and needle in text:
            return True
        if rtype == "CNAME" and needle.rstrip(".") in text.rstrip("."):
            return True
    return False


def _spf_mechanisms(value: str) -> set[str]:
    return {
        token
        for token in value.lower().split()[1:]
        if not token.lstrip("+-~?").startswith("all")
    }


def _compact(value: str) -> str:
    return "".join(value.replace('"', "").split())

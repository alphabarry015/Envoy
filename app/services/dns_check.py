"""Vérifie en live si les records DNS du domaine sont publiés."""

from __future__ import annotations

import logging
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


def _is_published(name: str, rtype: str, expected: str) -> bool:
    try:
        import dns.resolver  # type: ignore
    except ImportError:
        logger.warning("dnspython missing — skip live DNS check")
        return False

    try:
        answers = dns.resolver.resolve(name, rtype, lifetime=3.0)
    except Exception:
        return False

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


def _compact(value: str) -> str:
    return "".join(value.replace('"', "").split())

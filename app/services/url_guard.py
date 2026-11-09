"""Reject outbound URLs that point at private, loopback or metadata networks (SSRF)."""

from __future__ import annotations

import asyncio
import ipaddress
import socket
from urllib.parse import urlparse

from app.core.config import settings

_BLOCKED_SUFFIXES = (".local", ".internal", ".localhost", ".lan", ".home", ".corp")
_LOCAL_HOSTS = {"localhost", "127.0.0.1", "::1"}


class UnsafeUrlError(ValueError):
    pass


def _ip_is_public(ip: ipaddress.IPv4Address | ipaddress.IPv6Address) -> bool:
    if isinstance(ip, ipaddress.IPv6Address) and ip.ipv4_mapped is not None:
        ip = ip.ipv4_mapped
    return not (
        ip.is_private
        or ip.is_loopback
        or ip.is_link_local
        or ip.is_reserved
        or ip.is_multicast
        or ip.is_unspecified
        or (isinstance(ip, ipaddress.IPv4Address) and ip in ipaddress.ip_network("100.64.0.0/10"))
    )


def _dev_local(host: str, scheme: str) -> bool:
    return settings.is_development and host in _LOCAL_HOSTS and scheme in {"http", "https"}


def check_url_syntax(url: str) -> str:
    """Static checks used when a webhook is saved."""
    parsed = urlparse(url.strip())
    host = (parsed.hostname or "").lower().rstrip(".")
    if not host:
        raise UnsafeUrlError("The URL needs a host.")
    if parsed.username or parsed.password:
        raise UnsafeUrlError("Credentials in the URL are not allowed.")
    if _dev_local(host, parsed.scheme):
        return parsed.geturl()
    if parsed.scheme != "https":
        raise UnsafeUrlError("Use an https URL.")
    if host in _LOCAL_HOSTS or host.endswith(_BLOCKED_SUFFIXES) or "." not in host:
        raise UnsafeUrlError("Private or local hosts are not allowed.")
    try:
        literal = ipaddress.ip_address(host.strip("[]"))
    except ValueError:
        literal = None
    if literal is not None and not _ip_is_public(literal):
        raise UnsafeUrlError("Private or local addresses are not allowed.")
    return parsed.geturl()


async def assert_public_destination(url: str) -> None:
    """Resolve the host right before sending and refuse non-public addresses."""
    check_url_syntax(url)
    parsed = urlparse(url)
    host = (parsed.hostname or "").lower()
    if _dev_local(host, parsed.scheme):
        return
    port = parsed.port or 443
    try:
        infos = await asyncio.get_running_loop().getaddrinfo(host, port, type=socket.SOCK_STREAM)
    except OSError as exc:
        raise UnsafeUrlError("Host does not resolve.") from exc
    for info in infos:
        address = info[4][0]
        if not _ip_is_public(ipaddress.ip_address(address.split("%")[0])):
            raise UnsafeUrlError("Host resolves to a private address.")

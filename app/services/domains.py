from __future__ import annotations

import asyncio
import time
from datetime import datetime, timezone
from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.models.domain import DkimStatus, Domain, DomainStatus
from app.models.user import User
from app.schemas.domain import DomainResponse
from app.services.aws_ses import DKIM_SELECTOR, SESClientError, SESService
from app.providers.factory import build_provider_map
from app.services import brevo_domains, mailtrap_domains, resend_domains
from app.services.dns_check import annotate_live_dns
from app.services.realtime import publish as realtime_publish
from app.services.webhooks import seal_secret

_PURPOSES = {
    "dkim": "DKIM",
    "spf": "SPF",
    "dmarc": "DMARC",
    "brevo": "BREVO",
    "mailtrap": "MAILTRAP",
    "mx": "MX",
}
_VERIFIABLE_TOOLS = frozenset({"ses", "brevo", "resend", "mailtrap"})
# Tools with a remote Domains API we keep in sync both ways with Envoy.
_REMOTE_SYNC_TOOLS = frozenset({"resend", "brevo", "mailtrap"})
_TOOL_LABELS = {
    "ses": "Amazon SES",
    "resend": "Resend",
    "brevo": "Brevo",
    "mailtrap": "Mailtrap",
}


class DomainError(Exception):
    def __init__(self, status_code: int, detail: str) -> None:
        self.status_code = status_code
        self.detail = detail
        super().__init__(detail)


async def _notify_domains(user_id: UUID, reason: str, **extra: object) -> None:
    await realtime_publish(
        user_id,
        "domains.changed",
        {"reason": reason, **extra},
    )


async def list_domains(db: AsyncSession, user: User, ses: SESService) -> list[DomainResponse]:
    # Bidirectional sync for Resend / Brevo / Mailtrap on every list.
    remote_sets = await _remote_name_sets()
    await _import_remote_domains(db, user, ses, remote_sets=remote_sets)
    result = await db.execute(
        select(Domain).where(Domain.user_id == user.id).order_by(Domain.created_at.desc())
    )
    rows = list(result.scalars().all())
    kept: list[Domain] = []
    for domain in rows:
        removed = await _reconcile_upstream_deletes(db, domain, remote_sets=remote_sets)
        if not removed:
            kept.append(domain)
    return list(await asyncio.gather(*(_present(domain, ses) for domain in kept)))


async def get_domain(db: AsyncSession, user: User, domain_id: UUID, ses: SESService) -> DomainResponse:
    domain = await _owned(db, user, domain_id)
    remote_sets = await _remote_name_sets()
    removed = await _reconcile_upstream_deletes(db, domain, remote_sets=remote_sets)
    if removed:
        raise DomainError(404, "Domain not found.")
    return await _present(domain, ses)


_REMOTE_CACHE_SECONDS = 10.0
_remote_cache: tuple[float, dict[str, set[str] | None]] | None = None


def _invalidate_remote_cache() -> None:
    global _remote_cache
    _remote_cache = None


async def _remote_name_sets(*, fresh: bool = False) -> dict[str, set[str] | None]:
    """
    Snapshot of domains currently hosted on each remote tool.
    None = unavailable / not manageable (do not treat as empty — avoid wiping Envoy).
    Empty set = tool reachable and truly has zero domains.
    """
    global _remote_cache
    now = time.monotonic()
    if not fresh and _remote_cache is not None and now - _remote_cache[0] < _REMOTE_CACHE_SECONDS:
        return dict(_remote_cache[1])

    async def one(tool: str) -> set[str] | None:
        try:
            if tool == "brevo" and not brevo_domains.is_configured():
                return None
            names = await _list_remote_domain_names(tool)
        except Exception:
            return None
        if names is None:
            return None
        return {item.strip().lower() for item in names if item.strip()}

    tools = sorted(_REMOTE_SYNC_TOOLS)
    results = await asyncio.gather(*(one(tool) for tool in tools))
    out = dict(zip(tools, results))
    _remote_cache = (now, out)
    return dict(out)


async def _import_remote_domains(
    db: AsyncSession,
    user: User,
    ses: SESService,
    *,
    remote_sets: dict[str, set[str] | None] | None = None,
) -> None:
    """Pull domains that exist on the platform's Resend / Brevo / Mailtrap accounts into Envoy.

    Those tool accounts are shared by the platform, so only admins import, and a
    name already owned by another account is never claimed.
    """
    if not user.is_admin:
        return
    result = await db.execute(select(Domain).where(Domain.user_id == user.id))
    by_name = {str(domain.name).lower(): domain for domain in result.scalars().all()}
    others = set(
        (
            await db.execute(
                select(func.lower(Domain.name)).where(Domain.user_id != user.id)
            )
        ).scalars().all()
    )
    changed = False
    snapshots = remote_sets if remote_sets is not None else await _remote_name_sets()

    for tool in sorted(_REMOTE_SYNC_TOOLS):
        remote_names = snapshots.get(tool)
        if remote_names is None:
            continue
        for name in sorted(remote_names):
            if name in others:
                continue
            domain = by_name.get(name)
            if domain is None:
                if user.max_domains is not None and len(by_name) >= user.max_domains:
                    continue
                domain = Domain(user_id=user.id, name=name, providers=[tool])
                db.add(domain)
                await db.flush()
                try:
                    await _sync_tool(
                        domain, tool, ses, provision=False, replace_records=True
                    )
                    _assert_tool_dns(domain, tool)
                except DomainError:
                    await db.delete(domain)
                    await db.flush()
                    continue
                domain.dns_records = await _finalize_dns_records(domain.dns_records)
                by_name[name] = domain
                changed = True
                continue

            tools = list(domain.providers or [])
            if tool in tools:
                continue
            try:
                await _sync_tool(domain, tool, ses, provision=False, replace_records=True)
                _assert_tool_dns(domain, tool)
            except DomainError:
                continue
            domain.providers = _normalize_tools([*tools, tool])
            domain.dns_records = await _finalize_dns_records(domain.dns_records)
            changed = True

    if changed:
        await db.commit()


async def remote_name_sets() -> dict[str, set[str] | None]:
    """Cached snapshot of domain names per remote tool (None = unknown)."""
    return await _remote_name_sets()


async def reconcile_remote_domain(db: AsyncSession, name: str) -> None:
    """A tool reported a change for `name` (e.g. Resend domain.deleted): mirror it now."""
    domain = await db.scalar(select(Domain).where(Domain.name == name.strip().lower()))
    if domain is None:
        return
    owner_id, domain_id = domain.user_id, domain.id
    removed = await _reconcile_upstream_deletes(
        db, domain, remote_sets=await _remote_name_sets(fresh=True)
    )
    if not removed:
        await _notify_domains(owner_id, "remote_event", domain_id=str(domain_id), name=name)


async def _list_remote_domain_names(tool: str) -> list[str] | None:
    """None when the tool is not manageable (unknown state, never treated as empty)."""
    try:
        if tool == "resend":
            if not resend_domains.is_configured():
                return None
            return await resend_domains.list_domain_names()
        if tool == "brevo":
            if not brevo_domains.is_configured():
                return None
            return await brevo_domains.list_domain_names()
        if tool == "mailtrap":
            if not mailtrap_domains.is_configured():
                return None
            return await mailtrap_domains.list_domain_names(include_demo=False)
    except (
        resend_domains.ResendDomainError,
        brevo_domains.BrevoDomainError,
        mailtrap_domains.MailtrapDomainError,
    ):
        return None
    return None


async def _reconcile_upstream_deletes(
    db: AsyncSession,
    domain: Domain,
    *,
    remote_sets: dict[str, set[str] | None] | None = None,
) -> bool:
    """
    If a tool was deleted in Resend / Brevo / Mailtrap, unlink it here.
    Returns True when the whole Envoy domain row was deleted.
    """
    tools = list(domain.providers or [])
    if not tools:
        return False
    snapshots = remote_sets if remote_sets is not None else await _remote_name_sets()
    needle = str(domain.name).strip().lower()
    kept: list[str] = []
    changed = False
    for tool in tools:
        if tool not in _REMOTE_SYNC_TOOLS:
            kept.append(tool)
            continue
        remote = snapshots.get(tool)
        if remote is None:
            # Unknown / fetch failed — keep; don't wipe on transient errors.
            kept.append(tool)
            continue
        if needle in remote:
            kept.append(tool)
            continue
        changed = True
        domain.dns_records = [
            item
            for item in (domain.dns_records or [])
            if not (
                isinstance(item, dict) and str(item.get("source") or "").lower() == tool
            )
        ]
    if not changed:
        return False
    owner_id = domain.user_id
    domain_id = domain.id
    domain_name = domain.name
    if not kept:
        await db.delete(domain)
        await db.commit()
        await _notify_domains(
            owner_id,
            "upstream_deleted",
            domain_id=str(domain_id),
            name=domain_name,
        )
        return True
    domain.providers = _normalize_tools(kept)
    await db.commit()
    await db.refresh(domain)
    await _notify_domains(
        owner_id,
        "upstream_unlinked",
        domain_id=str(domain_id),
        name=domain_name,
        providers=list(domain.providers or []),
    )
    return False


async def connect_domain(
    db: AsyncSession,
    user: User,
    name: str,
    ses: SESService,
    providers: list[str] | None = None,
) -> DomainResponse:
    tools = _normalize_tools(providers)
    await _ensure_tools_connected(set(tools))
    existing = await db.execute(select(Domain).where(func.lower(Domain.name) == name))
    found = existing.scalar_one_or_none()
    if found is not None:
        if found.user_id != user.id:
            raise DomainError(409, "This domain is already connected to another account.")
        # Même domaine + autre outil : on fusionne (chaque tool garde ses DNS).
        previous = list(found.providers or [])
        merged = _normalize_tools([*previous, *tools])
        return await update_domain_providers(db, user, found.id, merged, ses)

    if user.max_domains is not None:
        count = await db.scalar(select(func.count()).select_from(Domain).where(Domain.user_id == user.id))
        if count is not None and count >= user.max_domains:
            raise DomainError(403, "Domain quota reached.")

    domain = Domain(
        user_id=user.id,
        name=name,
        providers=tools,
    )
    db.add(domain)
    await db.flush()

    # SES / Resend / Brevo / Mailtrap : même chemin (provision + DNS).
    for tool in tools:
        if tool not in _VERIFIABLE_TOOLS:
            continue
        await _sync_tool(domain, tool, ses, provision=True, replace_records=True)
        _assert_tool_dns(domain, tool)

    await _assert_remote_registration(domain.name, tools)

    domain.dns_records = await _finalize_dns_records(domain.dns_records)
    for tool in tools:
        if tool in _VERIFIABLE_TOOLS:
            _assert_tool_dns(domain, tool)
    await db.commit()
    await db.refresh(domain)
    await _notify_domains(
        user.id,
        "connected",
        domain_id=str(domain.id),
        name=domain.name,
        providers=list(domain.providers or []),
    )
    return await _present(domain, ses)


async def update_domain_providers(
    db: AsyncSession,
    user: User,
    domain_id: UUID,
    providers: list[str],
    ses: SESService,
) -> DomainResponse:
    domain = await _owned(db, user, domain_id)
    previous = set(domain.providers or [])
    if not any(item and str(item).strip() for item in providers):
        raise DomainError(422, "Keep at least one sending tool, or disconnect the domain.")
    tools = _normalize_tools(providers)
    added = set(tools) - previous
    removed = previous - set(tools)
    await _ensure_tools_connected(added)

    # SES / Resend / Brevo / Mailtrap : provision + DNS.
    # Les providers ne sont persistés qu'après sync réussie (fail-closed).
    # Unlink Envoy → delete remote (Resend/Brevo/Mailtrap).

    remaining_verifiable = sorted(set(tools) & _VERIFIABLE_TOOLS)
    added_verifiable = sorted(added & _VERIFIABLE_TOOLS)

    if removed:
        # Detach remotes for tools the user unlinked (Resend / Brevo / Mailtrap).
        await _detach_remote_tools(domain.name, removed)
        # Rebuild DNS from remaining verifiable tools so detached records disappear.
        if remaining_verifiable:
            first = True
            for tool in remaining_verifiable:
                await _sync_tool(
                    domain,
                    tool,
                    ses,
                    provision=tool in added,
                    replace_records=first,
                )
                _assert_tool_dns(domain, tool)
                first = False
        elif removed & _VERIFIABLE_TOOLS:
            domain.dns_records = []
            domain.status = DomainStatus.PENDING
            domain.dkim_status = DkimStatus.NOT_STARTED
            domain.verified_at = None
    else:
        for tool in added_verifiable:
            await _sync_tool(domain, tool, ses, provision=True, replace_records=True)
            _assert_tool_dns(domain, tool)
        for tool in remaining_verifiable:
            if tool not in added:
                # Re-provision when local DNS for this tool is missing (heal soft-links).
                needs_dns = not any(
                    isinstance(item, dict)
                    and str(item.get("source") or "").lower() == tool
                    for item in (domain.dns_records or [])
                )
                await _sync_tool(
                    domain,
                    tool,
                    ses,
                    provision=needs_dns,
                    replace_records=True,
                )
                _assert_tool_dns(domain, tool)

    await _assert_remote_registration(domain.name, tools)

    domain.providers = tools
    domain.dns_records = await _finalize_dns_records(domain.dns_records)
    # Drop DNS of tools that are no longer linked.
    domain.dns_records = [
        item
        for item in domain.dns_records
        if str(item.get("source") or "") in set(tools) or not item.get("source")
    ]
    # Fail-closed after finalize: every verifiable tool must still have DNS.
    for tool in sorted(set(tools) & _VERIFIABLE_TOOLS):
        _assert_tool_dns(domain, tool)
    await db.commit()
    await db.refresh(domain)
    await _notify_domains(
        user.id,
        "providers_updated",
        domain_id=str(domain.id),
        name=domain.name,
        providers=list(domain.providers or []),
    )
    return await _present(domain, ses)


async def refresh_domain(db: AsyncSession, user: User, domain_id: UUID, ses: SESService) -> DomainResponse:
    domain = await _owned(db, user, domain_id)
    current_tools = list(domain.providers or [])
    verifiable = [item for item in current_tools if item in _VERIFIABLE_TOOLS]
    passthrough = [item for item in current_tools if item not in _VERIFIABLE_TOOLS]
    if not verifiable and not passthrough:
        raise DomainError(400, "This domain has no verifiable sending tool (SES, Brevo, or Resend).")

    _tag_untagged_ses_records(domain)
    remote_sets = await _remote_name_sets(fresh=True)
    needle = str(domain.name).strip().lower()

    kept: list[str] = []
    warnings: list[str] = []
    for tool in verifiable:
        label = _TOOL_LABELS.get(tool, tool)
        try:
            # Refresh never creates remotes. If deleted upstream (e.g. in Resend),
            # drop the tool here so Envoy mirrors the provider.
            if tool in _REMOTE_SYNC_TOOLS:
                remote = remote_sets.get(tool)
                missing = remote is not None and needle not in remote
                if missing:
                    warnings.append(
                        f"{label}: deleted upstream — unlinked from this domain.",
                    )
                    domain.dns_records = [
                        item
                        for item in (domain.dns_records or [])
                        if not (
                            isinstance(item, dict)
                            and str(item.get("source") or "").lower() == tool
                        )
                    ]
                    continue
            await _sync_tool(
                domain,
                tool,
                ses,
                provision=False,
                replace_records=True,
            )
            _assert_tool_dns(domain, tool)
            kept.append(tool)
        except DomainError as exc:
            # Missing upstream → unlink rather than soft-keep.
            if exc.status_code == 404:
                warnings.append(
                    f"{label}: deleted upstream — unlinked from this domain.",
                )
                domain.dns_records = [
                    item
                    for item in (domain.dns_records or [])
                    if not (
                        isinstance(item, dict)
                        and str(item.get("source") or "").lower() == tool
                    )
                ]
                continue
            warnings.append(f"{label}: {exc.detail}")

    if not kept and not passthrough:
        # Entire domain removed upstream — delete the Envoy row.
        owner_id = domain.user_id
        domain_name = domain.name
        domain_key = str(domain.id)
        await db.delete(domain)
        await db.commit()
        await _notify_domains(
            owner_id,
            "upstream_deleted",
            domain_id=domain_key,
            name=domain_name,
        )
        raise DomainError(
            404,
            "This domain no longer exists on any linked sending tool and was removed from Envoy.",
        )

    domain.providers = _normalize_tools([*passthrough, *kept])
    allowed = set(domain.providers or [])
    domain.dns_records = await _finalize_dns_records(domain.dns_records)
    domain.dns_records = [
        item
        for item in domain.dns_records
        if str(item.get("source") or "") in allowed
        or (not item.get("source") and "ses" in allowed)
    ]
    _tag_untagged_ses_records(domain)
    await db.commit()
    await db.refresh(domain)
    await _notify_domains(
        user.id,
        "refreshed",
        domain_id=str(domain.id),
        name=domain.name,
        providers=list(domain.providers or []),
    )
    return await _present(domain, ses, tool_warnings=warnings)


def _tool_has_dns(domain: Domain, tool: str) -> bool:
    return any(
        isinstance(item, dict) and str(item.get("source") or "").lower() == tool
        for item in (domain.dns_records or [])
    )


def _tag_untagged_ses_records(domain: Domain) -> None:
    """Legacy rows without source belong to SES when SES is linked."""
    if "ses" not in (domain.providers or []):
        return
    tagged = False
    for item in domain.dns_records or []:
        if isinstance(item, dict) and not str(item.get("source") or "").strip():
            item["source"] = "ses"
            tagged = True
    if tagged:
        # Touch JSONB column for SQLAlchemy change tracking.
        domain.dns_records = [dict(item) for item in (domain.dns_records or []) if isinstance(item, dict)]


async def _finalize_dns_records(records: list | None) -> list[dict]:
    """Live DNS check + drop legacy untagged duplicates when sourced twins exist."""
    live = await asyncio.to_thread(
        annotate_live_dns, [dict(item) for item in (records or []) if isinstance(item, dict)]
    )
    tagged_keys = {
        (str(item.get("purpose")), str(item.get("name")))
        for item in live
        if str(item.get("source") or "").strip()
    }
    cleaned: list[dict] = []
    for item in live:
        key = (str(item.get("purpose")), str(item.get("name")))
        if not str(item.get("source") or "").strip() and key in tagged_keys:
            continue
        cleaned.append(item)
    return cleaned


def _assert_tool_dns(domain: Domain, tool: str) -> None:
    """Refuse a soft-link: a verifiable tool must return at least one DNS record."""
    if tool not in _VERIFIABLE_TOOLS:
        return
    records = [
        item
        for item in (domain.dns_records or [])
        if isinstance(item, dict) and str(item.get("source") or "").lower() == tool
    ]
    if records:
        return
    label = _TOOL_LABELS.get(tool, tool)
    raise DomainError(
        502,
        f"{label} did not return DNS records to publish. "
        "The tool is not properly connected for this domain.",
    )


async def _sync_tool(
    domain: Domain,
    tool: str,
    ses: SESService,
    *,
    provision: bool,
    replace_records: bool = False,
) -> None:
    """Provisionne si besoin, puis lit le vrai statut DNS chez l'outil."""
    if provision:
        _invalidate_remote_cache()
    if tool == "ses":
        await _sync_ses(domain, ses, provision=provision, replace_records=replace_records)
        return
    if tool == "brevo":
        await _sync_brevo(domain, provision=provision, replace_records=replace_records)
        return
    if tool == "resend":
        await _sync_resend(domain, provision=provision, replace_records=replace_records)
        return
    if tool == "mailtrap":
        await _sync_mailtrap(domain, provision=provision, replace_records=replace_records)
        return
    raise DomainError(422, f"Unknown verifiable tool: {tool}")


async def _sync_ses(
    domain: Domain,
    ses: SESService,
    *,
    provision: bool,
    replace_records: bool,
) -> None:
    try:
        identity = await ses.find_domain_identity_async(domain.name)
        if identity is None:
            if not provision:
                raise DomainError(404, "Domain is not registered with Amazon SES.")
            private_b64, public_txt = ses.generate_dkim_material()
            identity, created = await ses.create_byodkim_identity_async(
                domain.name, private_b64, public_txt
            )
            if created:
                domain.dkim_selector = DKIM_SELECTOR
                domain.encrypted_dkim_key = seal_secret(private_b64)
        # Relecture fraîche du statut DKIM / DNS chez AWS.
        identity = await ses.get_domain_identity_async(domain.name)
    except SESClientError as exc:
        raise DomainError(502, str(exc)) from exc
    _annotate_ses_records(identity)
    for record in identity.get("dns_records") or []:
        if isinstance(record, dict):
            record["source"] = "ses"
    _merge_identity(domain, identity, replace_records=replace_records)


async def _sync_brevo(
    domain: Domain,
    *,
    provision: bool,
    replace_records: bool,
) -> None:
    try:
        if provision:
            config = await brevo_domains.ensure_domain(domain.name)
        else:
            config = await brevo_domains.get_domain_config(domain.name)
            if config is None:
                raise DomainError(404, "Domain is not registered with Brevo.")
        # Demande à Brevo de revalider les DNS publiés.
        try:
            config = await brevo_domains.authenticate_domain(domain.name)
        except brevo_domains.BrevoDomainError as exc:
            if exc.status_code not in {400, 404}:
                raise
            # DNS incomplets : on garde la config avec status=false par record.
            refreshed = await brevo_domains.get_domain_config(domain.name)
            if refreshed is not None:
                config = refreshed
    except brevo_domains.BrevoDomainError as exc:
        raise DomainError(exc.status_code, exc.detail) from exc
    _merge_identity(
        domain,
        brevo_domains.to_envoy_identity(domain.name, config),
        replace_records=replace_records,
    )


async def _sync_resend(
    domain: Domain,
    *,
    provision: bool,
    replace_records: bool,
) -> None:
    try:
        if provision:
            config = await resend_domains.ensure_domain(domain.name)
        else:
            config = await resend_domains.find_domain(domain.name)
            if config is None:
                raise DomainError(404, "Domain is not registered with Resend.")
        domain_id = str(config.get("id") or "").strip()
        if not domain_id:
            raise DomainError(502, "Resend returned a domain without id.")
        try:
            config = await resend_domains.verify_domain(domain_id)
        except resend_domains.ResendDomainError as exc:
            if exc.status_code not in {400, 404, 422}:
                raise
            refreshed = await resend_domains.get_domain(domain_id)
            if refreshed is not None:
                config = refreshed
        if not str(config.get("id") or "").strip():
            raise DomainError(502, "Resend domain sync failed: missing remote id.")
    except resend_domains.ResendDomainError as exc:
        raise DomainError(exc.status_code, exc.detail) from exc
    _merge_identity(
        domain,
        resend_domains.to_envoy_identity(domain.name, config),
        replace_records=replace_records,
    )


async def _sync_mailtrap(
    domain: Domain,
    *,
    provision: bool,
    replace_records: bool,
) -> None:
    try:
        if provision:
            config = await mailtrap_domains.ensure_domain(domain.name)
        else:
            config = await mailtrap_domains.find_domain(domain.name)
            if config is None:
                raise DomainError(404, "Domain is not registered with Mailtrap.")
        if config.get("id") is None:
            raise DomainError(502, "Mailtrap returned a domain without id.")
    except mailtrap_domains.MailtrapDomainError as exc:
        raise DomainError(exc.status_code, exc.detail) from exc
    _merge_identity(
        domain,
        mailtrap_domains.to_envoy_identity(domain.name, config),
        replace_records=replace_records,
    )


async def _assert_remote_registration(name: str, tools: list[str]) -> None:
    """Fail-closed: linked tools must exist under the current API credentials."""
    if "resend" in tools:
        remote = await resend_domains.find_domain(name)
        if remote is None or not str(remote.get("id") or "").strip():
            raise DomainError(
                502,
                "Resend did not register this domain under the current API key. Link aborted.",
            )
        if not (remote.get("records") or []):
            raise DomainError(
                502,
                "Resend domain exists but returned no DNS records. Link aborted.",
            )
    if "brevo" in tools:
        remote = await brevo_domains.get_domain_config(name)
        if remote is None:
            raise DomainError(
                502,
                "Brevo did not register this domain under the current API key. Link aborted.",
            )
        dns = remote.get("dns_records") or remote.get("records") or {}
        if not dns:
            raise DomainError(
                502,
                "Brevo domain exists but returned no DNS records. Link aborted.",
            )
    if "mailtrap" in tools:
        remote = await mailtrap_domains.find_domain(name)
        if remote is None or remote.get("id") is None:
            raise DomainError(
                502,
                "Mailtrap did not register this domain under the current API token. Link aborted.",
            )
        if not (remote.get("dns_records") or []):
            raise DomainError(
                502,
                "Mailtrap domain exists but returned no DNS records. Link aborted.",
            )


async def _ensure_tools_connected(tools: set[str]) -> None:
    if not tools:
        return
    providers = build_provider_map()
    missing = [
        name
        for name in sorted(tools)
        if name not in providers or not providers[name].is_configured()
    ]
    if missing:
        labels = ", ".join(_TOOL_LABELS.get(name, name) for name in missing)
        raise DomainError(
            400,
            f"{labels} is not connected. Configure the API key in environment before linking.",
        )
    if "resend" in tools and not await resend_domains.can_manage_domains():
        raise DomainError(
            400,
            "Resend API key cannot manage domains (send-only or insufficient permissions). "
            "Use a full-access key before linking.",
        )
    if "mailtrap" in tools and not await mailtrap_domains.can_manage_domains():
        raise DomainError(
            400,
            "Mailtrap API token cannot manage domains. "
            "Use a token with account/domain access before linking.",
        )
    if "brevo" in tools and not brevo_domains.is_configured():
        raise DomainError(400, "Brevo API key is not configured.")


def _annotate_ses_records(identity: dict) -> None:
    """DKIM only: AWS SUCCESS ⇒ DKIM verified. SPF/DMARC stay pending until live DNS check."""
    verified = str(identity.get("dkim_status") or "") == "SUCCESS"
    records = []
    for record in identity.get("dns_records") or []:
        item = dict(record)
        purpose = str(item.get("purpose") or "").lower()
        if verified and purpose == "dkim":
            item["status"] = "verified"
        else:
            item["status"] = item.get("status") or "pending"
        records.append(item)
    identity["dns_records"] = records


async def disconnect_domain(db: AsyncSession, user: User, domain_id: UUID) -> None:
    """Retire le domaine d'Envoy et chez Resend / Brevo / Mailtrap. SES AWS est conservé."""
    domain = await _owned(db, user, domain_id)
    domain_name = domain.name
    await _detach_remote_tools(domain.name, set(domain.providers or []))
    await db.delete(domain)
    await db.commit()
    await _notify_domains(
        user.id,
        "disconnected",
        domain_id=str(domain_id),
        name=domain_name,
    )


async def _remote_tool_exists(name: str, tool: str) -> bool:
    """True when the domain is still listed on the remote tool (list API)."""
    needle = name.strip().lower()
    if tool == "ses":
        return True
    if tool not in _REMOTE_SYNC_TOOLS:
        return False
    names = await _list_remote_domain_names(tool)
    if names is None:
        return True
    return needle in {item.strip().lower() for item in names}


async def _detach_remote_tools(name: str, tools: set[str]) -> None:
    """Delete on Resend / Brevo / Mailtrap when unlinking or disconnecting in Envoy."""
    _invalidate_remote_cache()
    for tool in sorted(tools & _REMOTE_SYNC_TOOLS):
        try:
            if tool == "resend":
                await resend_domains.delete_domain(name)
            elif tool == "brevo":
                await brevo_domains.delete_domain(name)
            elif tool == "mailtrap":
                await mailtrap_domains.delete_domain(name)
        except (
            resend_domains.ResendDomainError,
            brevo_domains.BrevoDomainError,
            mailtrap_domains.MailtrapDomainError,
        ):
            # Best-effort: Envoy unlink still proceeds if remote delete fails.
            continue


async def _owned(db: AsyncSession, user: User, domain_id: UUID) -> Domain:
    domain = await db.get(Domain, domain_id)
    if domain is None or domain.user_id != user.id:
        raise DomainError(404, "Domain not found.")
    return domain


def _apply_identity(domain: Domain, identity: dict) -> None:
    _merge_identity(domain, identity, replace_records=True)


def _merge_identity(domain: Domain, identity: dict, *, replace_records: bool = False) -> None:
    raw_status = str(identity.get("dkim_status") or "NOT_STARTED")
    try:
        dkim_status = DkimStatus(raw_status)
    except ValueError:
        dkim_status = DkimStatus.NOT_STARTED

    if dkim_status == DkimStatus.SUCCESS:
        status = DomainStatus.VERIFIED
    elif dkim_status == DkimStatus.FAILED and domain.status != DomainStatus.VERIFIED:
        status = DomainStatus.FAILED
    elif domain.status == DomainStatus.VERIFIED:
        status = DomainStatus.VERIFIED
        dkim_status = DkimStatus.SUCCESS
    else:
        status = DomainStatus.PENDING

    record_status = "verified" if status == DomainStatus.VERIFIED else "pending"
    previous_dkim = _stored_dkim_value(domain.dns_records)
    incoming: list[dict] = []
    for record in identity.get("dns_records") or []:
        purpose = _PURPOSES.get(str(record.get("purpose") or "").lower(), record.get("purpose"))
        source = str(record.get("source") or "").strip().lower() or None
        item = {
            **record,
            "purpose": purpose,
            "status": record.get("status") or record_status,
            "source": source,
        }
        if str(purpose).upper() == "DKIM" and not item.get("value") and previous_dkim:
            item["value"] = previous_dkim
        incoming.append(item)

    existing = [dict(item) for item in (domain.dns_records or []) if isinstance(item, dict)]
    if replace_records:
        # Remplace uniquement les records de la même source (ses/brevo/resend/mailtrap).
        # Ne jamais vider les DNS des autres outils.
        sources = {
            str(item.get("source") or "").lower()
            for item in incoming
            if str(item.get("source") or "").strip()
        }
        if sources:
            records = []
            for item in existing:
                src = str(item.get("source") or "").lower()
                # Drop matching source; also drop legacy untagged rows when SES refreshes.
                if src in sources:
                    continue
                if not src and "ses" in sources:
                    continue
                records.append(item)
        else:
            records = existing
    else:
        records = existing
    # Include type so Resend SPF MX + TXT on the same host are both kept.
    index = {
        (
            str(item.get("source") or ""),
            str(item.get("type") or "").upper(),
            str(item.get("purpose")),
            str(item.get("name")),
        ): i
        for i, item in enumerate(records)
    }
    for item in incoming:
        key = (
            str(item.get("source") or ""),
            str(item.get("type") or "").upper(),
            str(item.get("purpose")),
            str(item.get("name")),
        )
        if key in index:
            records[index[key]] = item
        else:
            index[key] = len(records)
            records.append(item)

    domain.status = status
    domain.dkim_status = dkim_status
    if identity.get("identity_arn"):
        domain.ses_identity_arn = identity.get("identity_arn")
    domain.dns_records = records
    if status == DomainStatus.VERIFIED:
        domain.verified_at = domain.verified_at or datetime.now(timezone.utc)
    elif status != DomainStatus.VERIFIED:
        domain.verified_at = None


def _stored_dkim_value(records: list | None) -> str:
    for record in records or []:
        if not isinstance(record, dict):
            continue
        if str(record.get("purpose") or "").lower() == "dkim" and record.get("value"):
            return str(record["value"])
    return ""


def _normalize_tools(providers: list[str] | None) -> list[str]:
    allowed = ("ses", "resend", "brevo", "mailtrap")
    cleaned = [item.strip().lower() for item in (providers or []) if item and item.strip()]
    if not cleaned:
        cleaned = ["ses"]
    unknown = [item for item in cleaned if item not in allowed]
    if unknown or len(set(cleaned)) != len(cleaned):
        raise DomainError(422, "Unknown sending provider.")
    return [item for item in allowed if item in cleaned]


_NS_CACHE_SECONDS = 600.0
_ns_cache: dict[str, tuple[float, list[str]]] = {}


async def _nameservers(ses: SESService, name: str) -> list[str]:
    key = name.lower()
    cached = _ns_cache.get(key)
    now = time.monotonic()
    if cached is not None and now - cached[0] < _NS_CACHE_SECONDS:
        return cached[1]
    found = await asyncio.to_thread(ses.lookup_nameservers, name)
    if found:
        _ns_cache[key] = (now, found)
    return found


async def _present(
    domain: Domain,
    ses: SESService,
    *,
    tool_warnings: list[str] | None = None,
) -> DomainResponse:
    body = DomainResponse.model_validate(domain)
    tools = list(domain.providers or ["ses"])
    return body.model_copy(
        update={
            "providers": tools,
            "region": settings.aws_region,
            "nameservers": await _nameservers(ses, domain.name),
            "mail_from": f"{settings.mail_from_local_part}@{domain.name}",
            "tool_warnings": list(tool_warnings or []),
        }
    )

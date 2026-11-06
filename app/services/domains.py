from __future__ import annotations

from datetime import datetime, timezone
from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.models.domain import DkimStatus, Domain, DomainStatus
from app.models.user import User
from app.schemas.domain import DomainResponse
from app.services.aws_ses import DKIM_SELECTOR, SESClientError, SESService
from app.services.webhooks import seal_secret

_PURPOSES = {"dkim": "DKIM", "spf": "SPF", "dmarc": "DMARC"}


class DomainError(Exception):
    def __init__(self, status_code: int, detail: str) -> None:
        self.status_code = status_code
        self.detail = detail
        super().__init__(detail)


async def list_domains(db: AsyncSession, user: User, ses: SESService) -> list[DomainResponse]:
    result = await db.execute(
        select(Domain).where(Domain.user_id == user.id).order_by(Domain.created_at.desc())
    )
    return [_present(domain, ses) for domain in result.scalars().all()]


async def get_domain(db: AsyncSession, user: User, domain_id: UUID, ses: SESService) -> DomainResponse:
    return _present(await _owned(db, user, domain_id), ses)


async def connect_domain(db: AsyncSession, user: User, name: str, ses: SESService) -> DomainResponse:
    existing = await db.execute(select(Domain).where(func.lower(Domain.name) == name))
    found = existing.scalar_one_or_none()
    if found is not None:
        if found.user_id != user.id:
            raise DomainError(409, "This domain is already connected to another account.")
        return await refresh_domain(db, user, found.id, ses)

    if user.max_domains is not None:
        count = await db.scalar(select(func.count()).select_from(Domain).where(Domain.user_id == user.id))
        if count is not None and count >= user.max_domains:
            raise DomainError(403, "Domain quota reached.")

    sealed_key: str | None = None
    try:
        identity = await ses.find_domain_identity_async(name)
        if identity is None:
            private_b64, public_txt = ses.generate_dkim_material()
            identity, created = await ses.create_byodkim_identity_async(name, private_b64, public_txt)
            if created:
                sealed_key = seal_secret(private_b64)
    except SESClientError as exc:
        raise DomainError(502, str(exc)) from exc

    domain = Domain(
        user_id=user.id,
        name=name,
        dkim_selector=DKIM_SELECTOR if sealed_key else None,
        encrypted_dkim_key=sealed_key,
    )
    _apply_identity(domain, identity)
    db.add(domain)
    await db.commit()
    await db.refresh(domain)
    return _present(domain, ses)


async def refresh_domain(db: AsyncSession, user: User, domain_id: UUID, ses: SESService) -> DomainResponse:
    domain = await _owned(db, user, domain_id)
    try:
        identity = await ses.get_domain_identity_async(domain.name)
    except SESClientError as exc:
        raise DomainError(502, str(exc)) from exc
    _apply_identity(domain, identity)
    await db.commit()
    await db.refresh(domain)
    return _present(domain, ses)


async def disconnect_domain(db: AsyncSession, user: User, domain_id: UUID) -> None:
    """Retire le domaine d'Envoy. L'identité SES déjà créée dans AWS est conservée."""
    domain = await _owned(db, user, domain_id)
    await db.delete(domain)
    await db.commit()


async def _owned(db: AsyncSession, user: User, domain_id: UUID) -> Domain:
    domain = await db.get(Domain, domain_id)
    if domain is None or domain.user_id != user.id:
        raise DomainError(404, "Domain not found.")
    return domain


def _apply_identity(domain: Domain, identity: dict) -> None:
    raw_status = str(identity.get("dkim_status") or "NOT_STARTED")
    try:
        dkim_status = DkimStatus(raw_status)
    except ValueError:
        dkim_status = DkimStatus.NOT_STARTED

    if dkim_status == DkimStatus.SUCCESS:
        status = DomainStatus.VERIFIED
    elif dkim_status == DkimStatus.FAILED:
        status = DomainStatus.FAILED
    else:
        status = DomainStatus.PENDING

    record_status = "verified" if status == DomainStatus.VERIFIED else "pending"
    previous_dkim = _stored_dkim_value(domain.dns_records)
    records = []
    for record in identity.get("dns_records") or []:
        purpose = _PURPOSES.get(str(record.get("purpose") or "").lower(), record.get("purpose"))
        item = {**record, "purpose": purpose, "status": record_status}
        if str(purpose).upper() == "DKIM" and not item.get("value") and previous_dkim:
            item["value"] = previous_dkim
        records.append(item)

    domain.status = status
    domain.dkim_status = dkim_status
    domain.ses_identity_arn = identity.get("identity_arn")
    domain.dns_records = records
    if status == DomainStatus.VERIFIED:
        domain.verified_at = domain.verified_at or datetime.now(timezone.utc)
    else:
        domain.verified_at = None


def _stored_dkim_value(records: list | None) -> str:
    for record in records or []:
        if not isinstance(record, dict):
            continue
        if str(record.get("purpose") or "").lower() == "dkim" and record.get("value"):
            return str(record["value"])
    return ""


def _present(domain: Domain, ses: SESService) -> DomainResponse:
    body = DomainResponse.model_validate(domain)
    return body.model_copy(
        update={
            "region": settings.aws_region,
            "nameservers": ses.lookup_nameservers(domain.name),
            "mail_from": f"{settings.mail_from_local_part}@{domain.name}",
        }
    )

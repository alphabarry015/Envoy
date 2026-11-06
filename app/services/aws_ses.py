from __future__ import annotations

import asyncio
import base64
from email.mime.application import MIMEApplication
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from functools import lru_cache
from typing import Any

import boto3
import httpx
from botocore.exceptions import BotoCoreError, ClientError
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import rsa

from app.core.config import Settings, get_settings
from app.schemas.email import Attachment

SPF_VALUE = "v=spf1 include:amazonses.com ~all"
DMARC_VALUE = "v=DMARC1; p=none;"
DEFAULT_TTL = 300
DKIM_SELECTOR = "envoy"


class SESClientError(RuntimeError):
    """Erreur encapsulée lors d'un appel AWS SES v2."""


class SESService:
    """Wrappers boto3 autour de l'API Amazon SES v2 (identités DNS + envoi)."""

    def __init__(self, settings: Settings) -> None:
        client_kwargs: dict[str, Any] = {"region_name": settings.aws_region}
        if settings.aws_access_key_id and settings.aws_secret_access_key:
            client_kwargs["aws_access_key_id"] = settings.aws_access_key_id
            client_kwargs["aws_secret_access_key"] = settings.aws_secret_access_key
        self._client = boto3.client("sesv2", **client_kwargs)
        self._region = settings.aws_region
        self._configuration_set = settings.aws_ses_configuration_set or None

    def generate_dkim_material(self) -> tuple[str, str]:
        """RSA 2048 pour BYODKIM. Retourne la clé privée base64 et le TXT public."""
        key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
        pem = key.private_bytes(
            serialization.Encoding.PEM,
            serialization.PrivateFormat.TraditionalOpenSSL,
            serialization.NoEncryption(),
        ).decode()
        private_b64 = "".join(line for line in pem.splitlines() if "-----" not in line)
        public_b64 = base64.b64encode(
            key.public_key().public_bytes(
                serialization.Encoding.DER,
                serialization.PublicFormat.SubjectPublicKeyInfo,
            )
        ).decode()
        return private_b64, f"v=DKIM1; k=rsa; p={public_b64}"

    def create_byodkim_identity(self, domain: str, private_b64: str, public_txt: str) -> tuple[dict[str, Any], bool]:
        """Crée l'identité SES avec le sélecteur envoy. False si elle existait déjà."""
        created = True
        try:
            self._client.create_email_identity(
                EmailIdentity=domain,
                DkimSigningAttributes={
                    "DomainSigningSelector": DKIM_SELECTOR,
                    "DomainSigningPrivateKey": private_b64,
                },
            )
        except ClientError as exc:
            error_code = exc.response.get("Error", {}).get("Code", "")
            if error_code != "AlreadyExistsException":
                raise SESClientError(self._format_error(exc)) from exc
            created = False
        identity = self.get_domain_identity(domain)
        if created:
            self._stamp_dkim_txt(identity, domain, public_txt)
        return identity, created

    @staticmethod
    def _stamp_dkim_txt(identity: dict[str, Any], domain: str, public_txt: str) -> None:
        host = f"{DKIM_SELECTOR}._domainkey.{domain}"
        records = identity.setdefault("dns_records", [])
        stamped = False
        for record in records:
            if record.get("purpose") == "dkim":
                record["type"] = "TXT"
                record["name"] = host
                record["value"] = public_txt
                stamped = True
        if not stamped:
            records.insert(
                0,
                {
                    "type": "TXT",
                    "name": host,
                    "value": public_txt,
                    "ttl": DEFAULT_TTL,
                    "purpose": "dkim",
                    "status": "pending",
                },
            )

    async def create_byodkim_identity_async(
        self,
        domain: str,
        private_b64: str,
        public_txt: str,
    ) -> tuple[dict[str, Any], bool]:
        return await asyncio.to_thread(self.create_byodkim_identity, domain, private_b64, public_txt)

    def find_domain_identity(self, domain: str) -> dict[str, Any] | None:
        """Retourne l'identité existante, ou None si SES ne la connaît pas."""
        try:
            return self.get_domain_identity(domain)
        except SESClientError as exc:
            if "NotFound" in str(exc):
                return None
            raise

    def get_domain_identity(self, domain: str) -> dict[str, Any]:
        """Retourne le statut DKIM et les enregistrements DNS à publier."""
        try:
            response = self._client.get_email_identity(EmailIdentity=domain)
        except (ClientError, BotoCoreError) as exc:
            raise SESClientError(self._format_error(exc)) from exc

        dkim = response.get("DkimAttributes") or {}
        tokens: list[str] = dkim.get("Tokens") or []
        dkim_status = dkim.get("Status", "NOT_STARTED")
        origin = dkim.get("SigningAttributesOrigin") or "AWS_SES"
        records = (
            self.build_byodkim_records(domain, tokens)
            if origin == "EXTERNAL"
            else self.build_dns_records(domain, tokens)
        )
        return {
            "dkim_status": dkim_status,
            "verified": dkim_status == "SUCCESS",
            "signing_enabled": dkim.get("SigningEnabled", False),
            "identity_arn": response.get("IdentityArn"),
            "dns_records": records,
        }

    def delete_domain_identity(self, domain: str) -> None:
        try:
            self._client.delete_email_identity(EmailIdentity=domain)
        except ClientError as exc:
            raise SESClientError(self._format_error(exc)) from exc

    @staticmethod
    def build_dns_records(domain: str, dkim_tokens: list[str]) -> list[dict[str, Any]]:
        records: list[dict[str, Any]] = [
            {
                "type": "CNAME",
                "name": f"{token}._domainkey.{domain}",
                "value": f"{token}.dkim.amazonses.com",
                "ttl": DEFAULT_TTL,
                "purpose": "dkim",
                "status": "pending",
            }
            for token in dkim_tokens
        ]
        records.extend(SESService._authentication_records(domain))
        return records

    def build_byodkim_records(self, domain: str, selectors: list[str]) -> list[dict[str, Any]]:
        """Un TXT lisible par sélecteur (`envoy._domainkey`), plus SPF et DMARC."""
        names = selectors or ["envoy"]
        records: list[dict[str, Any]] = []
        for selector in names:
            host = f"{selector}._domainkey.{domain}"
            records.append(
                {
                    "type": "TXT",
                    "name": host,
                    "value": self.lookup_txt(host),
                    "ttl": DEFAULT_TTL,
                    "purpose": "dkim",
                    "status": "pending",
                }
            )
        records.extend(self._authentication_records(domain))
        return records

    @staticmethod
    def _authentication_records(domain: str) -> list[dict[str, Any]]:
        return [
            {
                "type": "TXT",
                "name": domain,
                "value": SPF_VALUE,
                "ttl": DEFAULT_TTL,
                "purpose": "spf",
                "status": "pending",
            },
            {
                "type": "TXT",
                "name": f"_dmarc.{domain}",
                "value": DMARC_VALUE,
                "ttl": DEFAULT_TTL,
                "purpose": "dmarc",
                "status": "pending",
            },
        ]

    def lookup_txt(self, host: str) -> str:
        """Lit le TXT publié. Plusieurs chaînes DNS sont recollées."""
        try:
            response = httpx.get(
                "https://cloudflare-dns.com/dns-query",
                params={"name": host, "type": "TXT"},
                headers={"accept": "application/dns-json"},
                timeout=4,
            )
            response.raise_for_status()
            answers = response.json().get("Answer") or []
        except (httpx.HTTPError, ValueError):
            return ""
        for answer in answers:
            raw = str(answer.get("data") or "")
            parts = [chunk for chunk in raw.split('"') if chunk and chunk != " "]
            value = "".join(parts).strip()
            if value.upper().startswith("V=DKIM1"):
                return value
        return ""

    def send_email(
        self,
        *,
        from_address: str,
        to_addresses: list[str],
        subject: str,
        html: str | None = None,
        text: str | None = None,
        cc_addresses: list[str] | None = None,
        bcc_addresses: list[str] | None = None,
        reply_to: list[str] | None = None,
        attachments: list[Attachment] | None = None,
    ) -> str:
        """Envoie un e-mail via SES v2. Retourne le MessageId AWS."""
        destination: dict[str, list[str]] = {"ToAddresses": to_addresses}
        if cc_addresses:
            destination["CcAddresses"] = cc_addresses
        if bcc_addresses:
            destination["BccAddresses"] = bcc_addresses

        kwargs: dict[str, Any] = {
            "FromEmailAddress": from_address,
            "Destination": destination,
        }
        if reply_to:
            kwargs["ReplyToAddresses"] = reply_to
        if self._configuration_set:
            kwargs["ConfigurationSetName"] = self._configuration_set

        if attachments:
            kwargs["Content"] = {
                "Raw": {
                    "Data": self._build_raw_message(
                        from_address=from_address,
                        to_addresses=to_addresses,
                        cc_addresses=cc_addresses,
                        subject=subject,
                        html=html,
                        text=text,
                        attachments=attachments,
                    )
                }
            }
        else:
            body: dict[str, Any] = {}
            if html:
                body["Html"] = {"Data": html, "Charset": "UTF-8"}
            if text:
                body["Text"] = {"Data": text, "Charset": "UTF-8"}
            kwargs["Content"] = {
                "Simple": {
                    "Subject": {"Data": subject, "Charset": "UTF-8"},
                    "Body": body,
                }
            }

        try:
            response = self._client.send_email(**kwargs)
        except (ClientError, BotoCoreError) as exc:
            raise SESClientError(self._format_error(exc)) from exc
        return response["MessageId"]

    async def send_email_async(self, **kwargs: Any) -> str:
        """Exécute l'appel synchrone boto3 hors de la boucle événementielle."""
        return await asyncio.to_thread(self.send_email, **kwargs)

    def lookup_nameservers(self, domain: str) -> list[str]:
        """NS publics via DNS-over-HTTPS. Une panne de lookup ne bloque pas le domaine."""
        try:
            response = httpx.get(
                "https://cloudflare-dns.com/dns-query",
                params={"name": domain, "type": "NS"},
                headers={"accept": "application/dns-json"},
                timeout=4,
            )
            response.raise_for_status()
            answers = response.json().get("Answer") or []
        except (httpx.HTTPError, ValueError):
            return []
        names: list[str] = []
        for answer in answers:
            host = str(answer.get("data") or "").strip().rstrip(".")
            if host:
                names.append(host.lower())
        return names

    async def find_domain_identity_async(self, domain: str) -> dict[str, Any] | None:
        return await asyncio.to_thread(self.find_domain_identity, domain)

    async def get_domain_identity_async(self, domain: str) -> dict[str, Any]:
        return await asyncio.to_thread(self.get_domain_identity, domain)

    @staticmethod
    def _build_raw_message(
        *,
        from_address: str,
        to_addresses: list[str],
        cc_addresses: list[str] | None,
        subject: str,
        html: str | None,
        text: str | None,
        attachments: list[Attachment],
    ) -> bytes:
        message = MIMEMultipart("mixed")
        message["Subject"] = subject
        message["From"] = from_address
        message["To"] = ", ".join(to_addresses)
        if cc_addresses:
            message["Cc"] = ", ".join(cc_addresses)

        alternative = MIMEMultipart("alternative")
        if text:
            alternative.attach(MIMEText(text, "plain", "utf-8"))
        if html:
            alternative.attach(MIMEText(html, "html", "utf-8"))
        message.attach(alternative)

        for attachment in attachments:
            payload = base64.b64decode(attachment.content)
            subtype = "octet-stream"
            if attachment.content_type and "/" in attachment.content_type:
                subtype = attachment.content_type.split("/", 1)[1]
            part = MIMEApplication(payload, _subtype=subtype)
            part.add_header("Content-Disposition", "attachment", filename=attachment.filename)
            if attachment.content_type:
                part.set_type(attachment.content_type)
            message.attach(part)

        return message.as_bytes()

    @staticmethod
    def _format_error(exc: Exception) -> str:
        if isinstance(exc, ClientError):
            error = exc.response.get("Error", {})
            code = error.get("Code", "ClientError")
            message = error.get("Message", str(exc))
            return f"AWS SES {code}: {message}"
        return str(exc)


@lru_cache
def get_ses_service() -> SESService:
    return SESService(get_settings())

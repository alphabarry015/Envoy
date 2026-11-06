from __future__ import annotations

from functools import lru_cache
from urllib.parse import quote, urlsplit, urlunsplit

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


def _asyncpg_url(url: str) -> str:
    """Force the asyncpg driver and drop libpq SSL params asyncpg rejects."""
    if url.startswith("postgres://"):
        url = "postgresql://" + url[len("postgres://") :]
    if url.startswith("postgresql://"):
        url = "postgresql+asyncpg://" + url[len("postgresql://") :]
    parts = urlsplit(url)
    if not parts.query:
        return url
    kept = [
        item
        for item in parts.query.split("&")
        if item and not item.startswith(("sslmode=", "ssl="))
    ]
    return urlunsplit((parts.scheme, parts.netloc, parts.path, "&".join(kept), parts.fragment))


def _host_of(url: str) -> str:
    return urlsplit(url).hostname or ""


def _port_of(url: str) -> int | None:
    return urlsplit(url).port


class Settings(BaseSettings):
    """Variables d'environnement typées pour Envoy."""

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    app_name: str = "Envoy"
    app_env: str = "development"
    debug: bool = False
    api_v1_prefix: str = "/api/v1"
    cors_origins: str = "http://localhost:5173,http://localhost:8000"
    # Ex. ^https://envoy-.*\.vercel\.app$ pour les previews Vercel.
    cors_origin_regex: str | None = None
    # Vercel définit VERCEL=1 dans ses fonctions.
    vercel: str | None = None
    # None = auto (activé sur Vercel). Une fonction serverless peut s'arrêter
    # avant une tâche lancée après la réponse.
    send_inline: bool | None = None
    # None = auto (SSL seulement pour les hôtes supabase.co / supabase.com).
    database_ssl: bool | None = None

    supabase_url: str | None = None
    supabase_anon_key: str | None = None
    supabase_service_role_key: str | None = None
    supabase_db_password: str | None = None

    postgres_user: str = "postgres"
    postgres_password: str = ""
    postgres_db: str = "postgres"
    postgres_host: str = "localhost"
    postgres_port: int = 5432
    database_url: str | None = None
    direct_database_url: str | None = None

    aws_access_key_id: str | None = None
    aws_secret_access_key: str | None = None
    aws_region: str = "eu-west-3"
    aws_ses_configuration_set: str | None = None
    mail_from_local_part: str = "noreply"
    platform_from_domain: str = "flowenagency.com"
    public_app_url: str = "http://localhost:5173"

    secret_key: str = Field(..., min_length=32)
    api_key_prefix: str = "envoy_live_"
    jwt_algorithm: str = "HS256"
    access_token_expire_minutes: int = 60
    invite_token_expire_hours: int = 48
    bootstrap_admin_email: str | None = None
    bootstrap_admin_password: str | None = None

    @field_validator(
        "aws_access_key_id",
        "aws_secret_access_key",
        "aws_ses_configuration_set",
        "database_url",
        "direct_database_url",
        "supabase_url",
        "supabase_anon_key",
        "supabase_service_role_key",
        "supabase_db_password",
        "bootstrap_admin_email",
        "bootstrap_admin_password",
        "cors_origin_regex",
        "vercel",
        "send_inline",
        "database_ssl",
        mode="before",
    )
    @classmethod
    def empty_str_to_none(cls, value: str | None) -> str | None:
        if value is None:
            return None
        if isinstance(value, str) and value.strip() == "":
            return None
        return value

    @field_validator("postgres_password", mode="before")
    @classmethod
    def blank_postgres_password(cls, value: object) -> str:
        if value is None:
            return ""
        return str(value)

    @field_validator("api_key_prefix")
    @classmethod
    def validate_api_key_prefix(cls, value: str) -> str:
        if not value.endswith("_"):
            return f"{value}_"
        return value

    @property
    def serverless(self) -> bool:
        return bool(self.vercel)

    @property
    def inline_send(self) -> bool:
        return self.serverless if self.send_inline is None else self.send_inline

    @property
    def platform_mail_from(self) -> str:
        return f"{self.mail_from_local_part}@{self.platform_from_domain}"

    @property
    def cors_origins_list(self) -> list[str]:
        return [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]

    def _supabase_database_url(self) -> str | None:
        project = (self.supabase_url or "").removeprefix("https://").removeprefix("http://").split(".")[0]
        if not self.supabase_db_password or not project:
            return None
        password = quote(self.supabase_db_password, safe="")
        return (
            f"postgresql://postgres:{password}@db.{project}.supabase.co:5432/postgres"
        )

    @property
    def sqlalchemy_database_uri(self) -> str:
        raw = self.database_url or self._supabase_database_url()
        if not raw:
            password = quote(self.postgres_password, safe="")
            raw = (
                f"postgresql+asyncpg://{self.postgres_user}:{password}"
                f"@{self.postgres_host}:{self.postgres_port}/{self.postgres_db}"
            )
        return _asyncpg_url(raw)

    @property
    def database_requires_ssl(self) -> bool:
        if self.database_ssl is not None:
            return self.database_ssl
        host = _host_of(self.sqlalchemy_database_uri)
        return "supabase.co" in host or "supabase.com" in host

    @property
    def database_disable_statement_cache(self) -> bool:
        """Le pooler transactionnel Supabase (6543) n'accepte pas les prepared statements."""
        return _port_of(self.sqlalchemy_database_uri) == 6543

    @property
    def sync_database_url(self) -> str:
        """URL psycopg2 pour Alembic. Préfère la connexion directe si elle est fournie."""
        raw = self.direct_database_url or self.database_url or self._supabase_database_url()
        if not raw:
            raw = self.sqlalchemy_database_uri
        if raw.startswith("postgresql+asyncpg://"):
            raw = "postgresql+psycopg2://" + raw[len("postgresql+asyncpg://") :]
        elif raw.startswith("postgresql://"):
            raw = "postgresql+psycopg2://" + raw[len("postgresql://") :]
        elif raw.startswith("postgres://"):
            raw = "postgresql+psycopg2://" + raw[len("postgres://") :]
        if self.database_requires_ssl and "sslmode=" not in raw:
            raw = f"{raw}{'&' if '?' in raw else '?'}sslmode=require"
        return raw


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()

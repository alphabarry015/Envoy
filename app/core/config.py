from __future__ import annotations

from functools import lru_cache

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


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
    cors_origins: str = "http://localhost:3000,http://localhost:8000"

    postgres_user: str = "envoy"
    postgres_password: str = "change_me_strong_password"
    postgres_db: str = "envoy"
    postgres_host: str = "db"
    postgres_port: int = 5432
    database_url: str | None = None

    aws_access_key_id: str | None = None
    aws_secret_access_key: str | None = None
    aws_region: str = "eu-west-3"
    aws_ses_configuration_set: str | None = None

    secret_key: str = Field(..., min_length=32)
    api_key_prefix: str = "envoy_live_"
    jwt_algorithm: str = "HS256"
    access_token_expire_minutes: int = 60
    invite_token_expire_hours: int = 48

    @field_validator(
        "aws_access_key_id",
        "aws_secret_access_key",
        "aws_ses_configuration_set",
        "database_url",
        mode="before",
    )
    @classmethod
    def empty_str_to_none(cls, value: str | None) -> str | None:
        if value == "":
            return None
        return value

    @field_validator("api_key_prefix")
    @classmethod
    def validate_api_key_prefix(cls, value: str) -> str:
        if not value.endswith("_"):
            return f"{value}_"
        return value

    @property
    def cors_origins_list(self) -> list[str]:
        return [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]

    @property
    def sqlalchemy_database_uri(self) -> str:
        if self.database_url:
            return self.database_url
        return (
            f"postgresql+asyncpg://{self.postgres_user}:{self.postgres_password}"
            f"@{self.postgres_host}:{self.postgres_port}/{self.postgres_db}"
        )

    @property
    def sync_database_url(self) -> str:
        """URL synchrone (psycopg2) utilisée par Alembic."""
        return self.sqlalchemy_database_uri.replace(
            "postgresql+asyncpg://",
            "postgresql+psycopg2://",
            1,
        )


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()

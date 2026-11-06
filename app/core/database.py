from __future__ import annotations

from collections.abc import AsyncGenerator

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase
from sqlalchemy.pool import NullPool

from app.core.config import settings

_connect_args: dict[str, object] = {}
if settings.database_requires_ssl:
    _connect_args["ssl"] = True
if settings.database_disable_statement_cache:
    _connect_args["statement_cache_size"] = 0

_pool_args: dict[str, object] = (
    # Une instance serverless peut geler entre deux requêtes : pas de pool local.
    {"poolclass": NullPool}
    if settings.serverless
    else {"pool_pre_ping": True, "pool_size": 10, "max_overflow": 20}
)

engine = create_async_engine(
    settings.sqlalchemy_database_uri,
    echo=settings.debug,
    connect_args=_connect_args,
    **_pool_args,
)

SessionLocal = async_sessionmaker(
    bind=engine,
    class_=AsyncSession,
    autoflush=False,
    expire_on_commit=False,
)


class Base(DeclarativeBase):
    """Classe de base SQLAlchemy 2.0 pour tous les modèles Envoy."""


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    """Fournit une session async par requête FastAPI."""
    async with SessionLocal() as session:
        try:
            yield session
        except Exception:
            await session.rollback()
            raise

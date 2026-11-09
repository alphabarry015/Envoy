from __future__ import annotations

import logging
from contextlib import asynccontextmanager

from fastapi import Depends, FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app import __version__
from app import models as _models  # noqa: F401
from app.api.v1.router import api_router
from app.core.config import settings
from app.core.database import SessionLocal, engine, get_db
from app.services.auth import ensure_bootstrap_admin
from app.sql_files import read_sql

logger = logging.getLogger("envoy")
logging.basicConfig(
    level=logging.DEBUG if settings.debug and settings.is_development else logging.INFO,
    format="%(asctime)s %(levelname)s [%(name)s] %(message)s",
)


@asynccontextmanager
async def lifespan(_app: FastAPI):
    logger.info("Starting %s (%s)", settings.app_name, settings.app_env)
    if settings.bootstrap_admin_email and settings.bootstrap_admin_password:
        async with SessionLocal() as session:
            await ensure_bootstrap_admin(session)
    yield
    await engine.dispose()
    logger.info("Shutdown complete")


app = FastAPI(
    title=settings.app_name,
    version=__version__,
    description=(
        "Alternative auto-hébergée à Resend pour l'envoi d'e-mails "
        "transactionnels via Amazon SES v2."
    ),
    lifespan=lifespan,
    docs_url="/docs" if settings.is_development else None,
    redoc_url="/redoc" if settings.is_development else None,
    openapi_url="/openapi.json" if settings.is_development else None,
)

_cors_kwargs: dict[str, object] = {
    "allow_origins": settings.cors_origins_list,
    # Auth uses the Authorization header, never cookies.
    "allow_credentials": False,
    "allow_methods": ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    "allow_headers": ["Authorization", "Content-Type"],
    "max_age": 600,
}
if settings.is_development:
    _cors_kwargs["allow_origin_regex"] = (
        r"https?://(localhost|127\.0\.0\.1|\[::1\]|192\.168\.\d{1,3}\.\d{1,3})(:\d+)?$"
    )
elif settings.cors_origin_regex:
    _cors_kwargs["allow_origin_regex"] = settings.cors_origin_regex

app.add_middleware(CORSMiddleware, **_cors_kwargs)

_SECURITY_HEADERS = {
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "no-referrer",
    "Cross-Origin-Resource-Policy": "same-site",
}


@app.middleware("http")
async def security_headers(request: Request, call_next):
    response = await call_next(request)
    for name, value in _SECURITY_HEADERS.items():
        response.headers.setdefault(name, value)
    if not settings.is_development:
        response.headers.setdefault("Strict-Transport-Security", "max-age=63072000; includeSubDomains")
    if request.url.path.startswith(f"{settings.api_v1_prefix}/"):
        response.headers.setdefault("Cache-Control", "no-store")
    return response

app.include_router(api_router, prefix=settings.api_v1_prefix)


@app.get("/", include_in_schema=False)
async def root() -> dict[str, str]:
    return {
        "service": settings.app_name,
        "version": __version__,
        "health": "/health",
    }


@app.get("/health", tags=["system"])
async def healthcheck() -> dict[str, str]:
    return {"status": "ok", "service": settings.app_name}


@app.get("/ready", tags=["system"])
async def readiness(db: AsyncSession = Depends(get_db)) -> dict[str, str]:
    await db.execute(text(read_sql("ready_check.sql")))
    return {"status": "ready", "database": "ok"}

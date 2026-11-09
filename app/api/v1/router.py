from fastapi import APIRouter

from app.api.v1 import (
    access_requests,
    api_keys,
    auth,
    domains,
    logs,
    overview,
    providers,
    realtime,
    send,
    suppressions,
    templates,
    webhooks,
)

api_router = APIRouter()
api_router.include_router(auth.router, prefix="/auth", tags=["auth"])
api_router.include_router(api_keys.router, prefix="/api-keys", tags=["api-keys"])
api_router.include_router(domains.router, prefix="/domains", tags=["domains"])
api_router.include_router(send.router, prefix="/send", tags=["send"])
api_router.include_router(webhooks.router, prefix="/webhooks", tags=["webhooks"])
api_router.include_router(logs.router, prefix="/logs", tags=["logs"])
api_router.include_router(overview.router, prefix="/overview", tags=["overview"])
api_router.include_router(providers.router, prefix="/providers", tags=["providers"])
api_router.include_router(suppressions.router, prefix="/suppressions", tags=["suppressions"])
api_router.include_router(templates.router, prefix="/templates", tags=["templates"])
api_router.include_router(realtime.router, tags=["realtime"])
api_router.include_router(access_requests.router, prefix="/access-requests", tags=["access"])

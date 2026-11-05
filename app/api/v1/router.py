from fastapi import APIRouter

from app.api.v1 import domains, send, webhooks

api_router = APIRouter()
api_router.include_router(domains.router, prefix="/domains", tags=["domains"])
api_router.include_router(send.router, prefix="/send", tags=["send"])
api_router.include_router(webhooks.router, prefix="/webhooks", tags=["webhooks"])

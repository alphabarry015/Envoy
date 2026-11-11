from __future__ import annotations

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user
from app.core.database import get_db
from app.models.user import User
from app.schemas.overview import OverviewResponse
from app.services.overview import account_overview

router = APIRouter()


@router.get("", response_model=OverviewResponse, summary="Résumé du compte")
async def read_overview(
    recent_page: int = Query(1, ge=1, le=1_000),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> OverviewResponse:
    return await account_overview(db, user, recent_page=recent_page)

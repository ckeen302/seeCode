"""Stats (Sections 6.8 and 16.2, signed in)."""

from datetime import UTC, datetime

from fastapi import APIRouter

from app.auth import CurrentUser
from app.db import DbSession
from app.routers.content import Content
from app.schemas.stats import StatsView
from app.services.stats import stats_view

router = APIRouter(tags=["stats"])


@router.get("/stats")
async def get_stats(user: CurrentUser, session: DbSession, content: Content) -> StatsView:
    return await stats_view(session, content, user.id, datetime.now(UTC))

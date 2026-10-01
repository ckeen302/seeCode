"""Today (Sections 6.2, 11.8 and 16.2, signed in)."""

from datetime import UTC, datetime

from fastapi import APIRouter

from app.auth import CurrentUser
from app.db import DbSession
from app.routers.content import Content
from app.schemas.today import TodayView
from app.services.today import today_view

router = APIRouter(tags=["today"])


@router.get("/today")
async def get_today(user: CurrentUser, session: DbSession, content: Content) -> TodayView:
    return await today_view(session, content, user.id, datetime.now(UTC))

"""Drills (Sections 6.6, 11.7 and 16.2, signed in): deal a session, answer its cards,
finish it. Another user's session is 404."""

import uuid
from datetime import UTC, datetime
from typing import Annotated

from fastapi import APIRouter, Body

from app.auth import CurrentUser
from app.db import DbSession
from app.routers.content import Content
from app.routers.rng import Rng
from app.schemas.drills import (
    DrillAnswerRequest,
    DrillFeedback,
    DrillFinishRequest,
    DrillSessionCreate,
    DrillSessionView,
    DrillSummary,
)
from app.services.drills import answer_card, create_session, finish_session

router = APIRouter(prefix="/drills", tags=["drills"])


@router.post("/sessions")
async def start_drill_session(
    body: DrillSessionCreate,
    user: CurrentUser,
    session: DbSession,
    content: Content,
    rng: Rng,
) -> DrillSessionView:
    view = await create_session(session, content, user.id, body, datetime.now(UTC), rng)
    await session.commit()
    return view


@router.post("/sessions/{session_id}/answers")
async def answer_drill_card(
    session_id: uuid.UUID,
    body: DrillAnswerRequest,
    user: CurrentUser,
    session: DbSession,
    content: Content,
    rng: Rng,
) -> DrillFeedback:
    feedback = await answer_card(
        session, content, user.id, session_id, body, datetime.now(UTC), rng
    )
    await session.commit()
    return feedback


@router.post("/sessions/{session_id}/finish")
async def finish_drill_session(
    session_id: uuid.UUID,
    user: CurrentUser,
    session: DbSession,
    content: Content,
    body: Annotated[DrillFinishRequest | None, Body()] = None,
) -> DrillSummary:
    """Finishing again is allowed: it returns the summary, and applies the end screen's
    "Add missed to review" toggle when the body sets it."""
    add_missed = body.add_missed_to_review if body is not None else None
    summary = await finish_session(
        session, content, user.id, session_id, add_missed, datetime.now(UTC)
    )
    await session.commit()
    return summary

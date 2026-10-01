"""Review (Sections 6.7, 11.4, 11.5 and 16.2, signed in): the queue of due items,
answers, and self-ratings after a borderline answer. Another user's item is 404."""

import uuid
from datetime import UTC, datetime
from typing import Annotated

from fastapi import APIRouter, Query

from app.auth import CurrentUser
from app.db import DbSession
from app.learning.review import QUEUE_MAX
from app.routers.content import Content
from app.routers.rng import Rng
from app.schemas.review import (
    ReviewAnswerRequest,
    ReviewAnswerResult,
    ReviewCard,
    ReviewRateRequest,
    ReviewRateResult,
)
from app.services.review import answer_review, rate_review, review_queue

router = APIRouter(prefix="/review", tags=["review"])


@router.get("/queue")
async def get_review_queue(
    user: CurrentUser,
    session: DbSession,
    content: Content,
    limit: Annotated[int, Query(ge=1, le=QUEUE_MAX)] = QUEUE_MAX,
) -> list[ReviewCard]:
    """Items due by the end of today (the user's time zone), oldest due first, at most
    `limit` (20), interleaved so the same pattern does not come twice in a row."""
    return await review_queue(session, content, user.id, datetime.now(UTC), limit)


@router.post("/{item_id}/answer")
async def answer_review_item(
    item_id: uuid.UUID,
    body: ReviewAnswerRequest,
    user: CurrentUser,
    session: DbSession,
    content: Content,
    rng: Rng,
) -> ReviewAnswerResult:
    result = await answer_review(
        session, content, user.id, item_id, body.answer, body.seconds, datetime.now(UTC), rng
    )
    await session.commit()
    return result


@router.post("/{item_id}/rate")
async def rate_review_item(
    item_id: uuid.UUID,
    body: ReviewRateRequest,
    user: CurrentUser,
    session: DbSession,
    rng: Rng,
) -> ReviewRateResult:
    result = await rate_review(session, user.id, item_id, body.rating, datetime.now(UTC), rng)
    await session.commit()
    return result

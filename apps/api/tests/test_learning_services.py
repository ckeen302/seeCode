"""Drill and review services under concurrency, called directly with two database
sessions: a double-submitted answer is recorded once."""

import asyncio
import random
import uuid
from datetime import UTC, datetime, timedelta

import pytest
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncEngine, async_sessionmaker

from app.content.store import ContentStore, load_content
from app.errors import ApiError
from app.models import DrillAnswer, ReviewLog
from app.schemas.drills import DrillAnswerRequest, DrillSessionCreate
from app.services.drills import answer_card, create_session
from app.services.review import answer_review
from tests.conftest import REAL_CONTENT, create_auth_user
from tests.learning_helpers import WRONG_PLAN, add_item


@pytest.fixture(scope="module")
def content() -> ContentStore:
    return load_content(REAL_CONTENT)


async def test_a_double_submitted_drill_answer_is_recorded_once(
    engine: AsyncEngine, content: ContentStore
) -> None:
    user = uuid.uuid4()
    await create_auth_user(engine, user)
    sessions = async_sessionmaker(engine, expire_on_commit=False)
    now = datetime.now(UTC)
    async with sessions() as session:
        view = await create_session(
            session,
            content,
            user,
            DrillSessionCreate(mode="recognition", size=2),
            now,
            random.Random(0),
        )
        await session.commit()
    body = DrillAnswerRequest(card_id="c1", answer=WRONG_PLAN, seconds=5.0)
    async with sessions() as first, sessions() as second:
        feedback = await answer_card(first, content, user, view.session_id, body, now)
        waiting = asyncio.create_task(
            answer_card(second, content, user, view.session_id, body, now)
        )
        await asyncio.sleep(0.3)
        assert not waiting.done()  # blocked on the session row
        await first.commit()
        repeated = await asyncio.wait_for(waiting, timeout=5)
        await second.commit()
    assert repeated == feedback
    async with sessions() as session:
        assert await session.scalar(select(func.count()).select_from(DrillAnswer)) == 1


async def test_a_double_submitted_review_answer_is_graded_once(
    engine: AsyncEngine, content: ContentStore
) -> None:
    user = uuid.uuid4()
    await create_auth_user(engine, user)
    now = datetime.now(UTC)
    item_id = await add_item(engine, "problem_plan", "two-sum", now - timedelta(hours=1), user=user)
    sessions = async_sessionmaker(engine, expire_on_commit=False)
    async with sessions() as first, sessions() as second:
        result = await answer_review(first, content, user, item_id, WRONG_PLAN, 9.0, now)
        assert result.grade == "again"
        waiting = asyncio.create_task(
            answer_review(second, content, user, item_id, WRONG_PLAN, 9.0, now)
        )
        await asyncio.sleep(0.3)
        assert not waiting.done()  # blocked on the item row
        await first.commit()
        with pytest.raises(ApiError) as refused:
            await asyncio.wait_for(waiting, timeout=5)
        await second.rollback()
    assert (refused.value.status_code, refused.value.message) == (409, "This item is not due yet.")
    async with sessions() as session:
        assert await session.scalar(select(func.count()).select_from(ReviewLog)) == 1

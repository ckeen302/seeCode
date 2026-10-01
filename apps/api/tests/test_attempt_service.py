"""Attempt services under concurrency, called directly with two database sessions."""

import asyncio
import uuid
from datetime import UTC, datetime

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncEngine, async_sessionmaker

from app.content.store import load_content
from app.models import Attempt, ReviewItem
from app.services.attempts import start_attempt
from app.services.progress import review_after_attempt_end
from tests.conftest import REAL_CONTENT, create_auth_user


async def test_a_second_request_waits_and_resumes_the_same_attempt(engine: AsyncEngine) -> None:
    """Both requests see no active attempt; the second one's insert waits on the unique
    index until the first commits, then resumes the first one's attempt."""
    content = load_content(REAL_CONTENT)
    problem = content.problems_by_slug["group-anagrams"]
    user = uuid.uuid4()
    await create_auth_user(engine, user)
    sessions = async_sessionmaker(engine, expire_on_commit=False)
    async with sessions() as first, sessions() as second:
        created = await start_attempt(first, content, user, problem, datetime.now(UTC))
        waiting = asyncio.create_task(
            start_attempt(second, content, user, problem, datetime.now(UTC))
        )
        await asyncio.sleep(0.3)
        assert not waiting.done()  # blocked by the first, uncommitted insert
        await first.commit()
        resumed = await asyncio.wait_for(waiting, timeout=5)
        await second.commit()
    assert resumed.id == created.id
    async with sessions() as session:
        count = await session.scalar(select(func.count()).select_from(Attempt))
    assert count == 1


async def test_abandoned_attempts_leave_the_review_item_alone(engine: AsyncEngine) -> None:
    user = uuid.uuid4()
    await create_auth_user(engine, user)
    sessions = async_sessionmaker(engine, expire_on_commit=False)
    async with sessions() as session:
        now = datetime.now(UTC)
        item = await review_after_attempt_end(
            session, user, "two-sum", "abandoned", now, attempt_id=uuid.uuid4()
        )
        assert item is None
        created = await review_after_attempt_end(
            session, user, "two-sum", "gave_up", now, attempt_id=uuid.uuid4()
        )
        assert created is not None
        same = await review_after_attempt_end(
            session, user, "two-sum", "abandoned", now, attempt_id=uuid.uuid4()
        )
        assert same is created
        await session.commit()
        assert await session.scalar(select(func.count()).select_from(ReviewItem)) == 1

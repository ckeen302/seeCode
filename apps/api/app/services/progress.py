"""`problem_progress`, `review_items` (attempt rows of Section 11.4) and `activity_days`."""

import random
import uuid
from datetime import datetime
from typing import Any

from sqlalchemy import case, func, select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.content.store import UserProblem
from app.learning.activity import local_day
from app.learning.outcomes import Outcome, review_after_attempt
from app.learning.scheduling import ReviewState
from app.models import ActivityDay, ProblemProgress, Profile, ReviewItem, ReviewLog

PROBLEM_PLAN = "problem_plan"


async def load_progress(session: AsyncSession, user_id: uuid.UUID) -> dict[str, UserProblem]:
    """The user's problem_progress rows by slug."""
    rows = await session.execute(
        select(
            ProblemProgress.problem_slug,
            ProblemProgress.status,
            ProblemProgress.best_rung,
            ProblemProgress.last_attempt_at,
        ).where(ProblemProgress.user_id == user_id)
    )
    return {
        slug: UserProblem(status=status, best_rung=best_rung, last_attempt_at=last_attempt_at)
        for slug, status, best_rung, last_attempt_at in rows
    }


async def problem_status(session: AsyncSession, user_id: uuid.UUID, slug: str) -> str | None:
    status: str | None = await session.scalar(
        select(ProblemProgress.status).where(
            ProblemProgress.user_id == user_id, ProblemProgress.problem_slug == slug
        )
    )
    return status


async def mark_attempted(
    session: AsyncSession, user_id: uuid.UUID, slug: str, at: datetime
) -> None:
    """new -> attempted (Section 11.3); later statuses stay. Refreshes last_attempt_at."""
    table = ProblemProgress.__table__.c
    stmt = pg_insert(ProblemProgress).values(
        user_id=user_id, problem_slug=slug, status="attempted", last_attempt_at=at
    )
    stmt = stmt.on_conflict_do_update(
        index_elements=[table.user_id, table.problem_slug],
        set_={
            "status": case((table.status == "new", "attempted"), else_=table.status),
            "last_attempt_at": func.greatest(table.last_attempt_at, stmt.excluded.last_attempt_at),
        },
    )
    await session.execute(stmt)


async def mark_solved(
    session: AsyncSession, user_id: uuid.UUID, slug: str, max_rung: int, at: datetime
) -> None:
    """-> solved, unless already mastered; best_rung is the lowest max rung of any solve."""
    table = ProblemProgress.__table__.c
    stmt = pg_insert(ProblemProgress).values(
        user_id=user_id,
        problem_slug=slug,
        status="solved",
        best_rung=max_rung,
        first_solved_at=at,
        last_attempt_at=at,
    )
    stmt = stmt.on_conflict_do_update(
        index_elements=[table.user_id, table.problem_slug],
        set_={
            "status": case((table.status == "mastered", "mastered"), else_="solved"),
            # Postgres' least/greatest skip nulls.
            "best_rung": func.least(table.best_rung, stmt.excluded.best_rung),
            "first_solved_at": func.least(table.first_solved_at, stmt.excluded.first_solved_at),
            "last_attempt_at": func.greatest(table.last_attempt_at, stmt.excluded.last_attempt_at),
        },
    )
    await session.execute(stmt)


async def record_activity(session: AsyncSession, user_id: uuid.UUID, at: datetime) -> None:
    """Mark the user's local calendar day of `at` as active (streaks)."""
    zone = await session.scalar(select(Profile.timezone).where(Profile.id == user_id))
    day = local_day(at, zone)
    await session.execute(
        pg_insert(ActivityDay).values(user_id=user_id, day=day).on_conflict_do_nothing()
    )


def _review_state(item: ReviewItem) -> ReviewState:
    return ReviewState(
        due_at=item.due_at,
        interval_days=item.interval_days,
        ease=item.ease,
        reps=item.reps,
        lapses=item.lapses,
        resolve=item.resolve,
        last_grade=item.last_grade,
        last_reviewed_at=item.last_reviewed_at,
    )


def _state_values(state: ReviewState) -> dict[str, Any]:
    return {
        "due_at": state.due_at,
        "interval_days": state.interval_days,
        "ease": state.ease,
        "reps": state.reps,
        "lapses": state.lapses,
        "resolve": state.resolve,
        "last_grade": state.last_grade,
        "last_reviewed_at": state.last_reviewed_at,
    }


async def review_after_attempt_end(
    session: AsyncSession,
    user_id: uuid.UUID,
    slug: str,
    outcome: Outcome,
    at: datetime,
    *,
    attempt_id: uuid.UUID,
    seconds: float | None = None,
    rng: random.Random | None = None,
) -> ReviewItem | None:
    """Create or update the problem's `problem_plan` review item after an attempt ends.

    When the attempt counts as the review of an item waiting for a re-solve, a
    `review_logs` row records it. Returns the item (None for `abandoned`).
    """
    item = await session.scalar(
        select(ReviewItem)
        .where(
            ReviewItem.user_id == user_id,
            ReviewItem.kind == PROBLEM_PLAN,
            ReviewItem.ref == slug,
        )
        .with_for_update()
    )
    change = review_after_attempt(_review_state(item) if item else None, outcome, at, rng)
    if change is None:
        return item
    if item is None:
        item = ReviewItem(
            user_id=user_id, kind=PROBLEM_PLAN, ref=slug, **_state_values(change.state)
        )
        session.add(item)
    elif change.changed:
        for key, value in _state_values(change.state).items():
            setattr(item, key, value)
    if change.review_grade is not None and change.interval_before is not None:
        session.add(
            ReviewLog(
                item_id=item.id,
                user_id=user_id,
                grade=change.review_grade,
                interval_before=change.interval_before,
                interval_after=change.state.interval_days,
                answer={"attemptId": str(attempt_id), "outcome": outcome},
                seconds=seconds,
            )
        )
    await session.flush()
    return item

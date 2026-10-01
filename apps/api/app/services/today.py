"""Today (Sections 6.2, 11.8 and 16.3): reviews due, the roadmap card, the 5-minute
drill, this week's numbers and the streak.

- `reviewsDue` counts the items the review queue would hold without its 20-item cap.
- `continue` is the most recent active attempt (not idle for 14 days, which Start would
  abandon anyway), else the first problem by roadmap order in an unlocked pattern that
  the user has not solved; null when there is none.
- `drill` follows `app/learning/today.py`.
- `week` covers the last 7 calendar days (the user's time zone, today included).
- `start` is set for a brand-new user (no attempts and no drill answers): the web then
  shows only "Start with your first pattern" (6.2).
"""

import uuid
from datetime import datetime, timedelta

from sqlalchemy import exists, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.content.store import ContentStore, UserProblem
from app.errors import ApiError
from app.learning.activity import current_streak, day_start, local_day
from app.learning.drills import RECOGNITION
from app.learning.mastery import PatternProgress, is_solved, next_problem
from app.learning.stats import median_or_none
from app.learning.today import AttemptFact, greeting_name, weak_pattern
from app.models import Attempt, DrillAnswer, Profile, ReviewLog
from app.schemas.today import (
    ContinueCard,
    DrillSuggestion,
    StartCard,
    TodayView,
    WeekStats,
)
from app.services.attempts import ABANDONED, ACTIVE, STALE_AFTER
from app.services.drills import recent_results
from app.services.progress import pattern_states, unlocked_patterns
from app.services.review import due_items, item_pattern
from app.services.stats import activity_days, count_rows, plan_time_samples, solved_since

WEEK_DAYS = 7


async def _continue_card(
    session: AsyncSession,
    content: ContentStore,
    user_id: uuid.UUID,
    progress: dict[str, UserProblem],
    states: dict[str, PatternProgress],
    now: datetime,
) -> ContinueCard | None:
    statuses = {slug: row.status for slug, row in progress.items()}
    active = await session.execute(
        select(Attempt.problem_slug, Attempt.updated_at)
        .where(
            Attempt.user_id == user_id,
            Attempt.status == ACTIVE,
            Attempt.updated_at > now - STALE_AFTER,
        )
        .order_by(Attempt.updated_at.desc(), Attempt.id)
    )
    for slug, updated_at in active:
        problem = content.workspace_problem(slug)
        if problem is None:
            continue
        return ContinueCard(
            slug=problem.slug,
            title=problem.title,
            difficulty=problem.difficulty,
            # Only a problem already solved may show its pattern.
            pattern_id=problem.pattern_id if is_solved(statuses.get(slug)) else None,
            in_progress=True,
            last_active_at=updated_at,
        )
    next_slug = next_problem([(p.slug, p.pattern_id) for p in content.problems], states, statuses)
    problem = content.workspace_problem(next_slug) if next_slug is not None else None
    if problem is None:
        return None
    return ContinueCard(
        slug=problem.slug,
        title=problem.title,
        difficulty=problem.difficulty,
        pattern_id=problem.pattern_id,  # the roadmap's next step names its pattern anyway
        in_progress=False,
        last_active_at=None,
    )


async def _attempt_facts(
    session: AsyncSession, content: ContentStore, user_id: uuid.UUID
) -> list[AttemptFact]:
    rows = await session.execute(
        select(Attempt.problem_slug, Attempt.max_rung, Attempt.started_at)
        .where(Attempt.user_id == user_id, Attempt.status != ABANDONED)
        .order_by(Attempt.started_at.desc(), Attempt.id)
    )
    facts = []
    for slug, max_rung, started_at in rows:
        problem = content.problems_by_slug.get(slug)
        if problem is not None:
            facts.append(AttemptFact(slug, problem.pattern_id, max_rung, started_at))
    return facts


async def _drill_counts(session: AsyncSession, user_id: uuid.UUID) -> dict[str, int]:
    rows = await session.execute(
        select(DrillAnswer.pattern_id, func.count())
        .where(
            DrillAnswer.user_id == user_id,
            DrillAnswer.mode == RECOGNITION,
            DrillAnswer.pattern_id.is_not(None),
        )
        .group_by(DrillAnswer.pattern_id)
    )
    return {pattern_id: int(count) for pattern_id, count in rows if pattern_id is not None}


async def _is_new_user(session: AsyncSession, user_id: uuid.UUID) -> bool:
    worked = await session.scalar(
        select(
            exists().where(Attempt.user_id == user_id)
            | exists().where(DrillAnswer.user_id == user_id)
        )
    )
    return not worked


async def today_view(
    session: AsyncSession, content: ContentStore, user_id: uuid.UUID, now: datetime
) -> TodayView:
    profile = await session.get(Profile, user_id)
    if profile is None:
        raise ApiError(404, "not_found", "Profile not found.")
    zone = profile.timezone
    today = local_day(now, zone)
    progress, states = await pattern_states(session, content, user_id)
    unlocked = unlocked_patterns(states)

    due = await due_items(session, content, user_id, now, zone)
    review_patterns = list(
        dict.fromkeys(p for item in due if (p := item_pattern(content, item)) is not None)
    )

    pick = weak_pattern(
        unlocked,
        await recent_results(session, user_id, RECOGNITION, DrillAnswer.pattern_id),
        await _drill_counts(session, user_id),
        await _attempt_facts(session, content, user_id),
    )
    drill = None
    if pick is not None:
        drill = DrillSuggestion(
            pattern_id=pick.pattern_id,
            pattern_name=content.patterns_by_id[pick.pattern_id].name,
            reason=pick.reason,
        )

    since = day_start(today - timedelta(days=WEEK_DAYS - 1), zone)
    week = WeekStats(
        solved=len({slug for _, slug in await solved_since(session, user_id, since)}),
        drills=await count_rows(
            session, DrillAnswer.id, DrillAnswer.user_id == user_id, DrillAnswer.created_at >= since
        ),
        reviews=await count_rows(
            session, ReviewLog.id, ReviewLog.user_id == user_id, ReviewLog.created_at >= since
        ),
        median_plan_seconds=median_or_none(
            seconds for _, seconds in await plan_time_samples(session, user_id, since)
        ),
    )

    start = None
    if await _is_new_user(session, user_id):
        first = next(
            (node for node in content.roadmap.patterns if not node.prereqs),
            content.roadmap.patterns[0],
        )
        start = StartCard(pattern_id=first.id, pattern_name=content.patterns_by_id[first.id].name)

    return TodayView(
        greeting_name=greeting_name(profile.display_name),
        streak=current_streak(await activity_days(session, user_id), today),
        reviews_due=len(due),
        review_patterns=review_patterns,
        continue_=await _continue_card(session, content, user_id, progress, states, now),
        drill=drill,
        week=week,
        start=start,
    )

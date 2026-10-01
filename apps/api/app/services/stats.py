"""Stats (Section 6.8) and the facts Today shares with it: first attempts and plan time.

Weeks run Monday to Sunday in the user's time zone; the charts cover the last 8 weeks,
this one included. See `app/schemas/stats.py` for the shape.
"""

import uuid
from collections import Counter, defaultdict
from collections.abc import Sequence
from dataclasses import dataclass
from datetime import date, datetime
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.content.models import Problem
from app.content.store import ContentStore
from app.learning.activity import (
    current_streak,
    day_start,
    local_day,
    longest_streak,
    week_start,
)
from app.learning.drills import RECOGNITION
from app.learning.mastery import is_solved
from app.learning.outcomes import SOLVED_OUTCOMES
from app.learning.plan_grading import grade_plan
from app.learning.review import REMEMBERED
from app.learning.stats import (
    MissKind,
    accuracy,
    median_or_none,
    plan_misses,
    rung_histogram,
    top_misses,
    week_starts,
)
from app.models import ActivityDay, Attempt, DrillAnswer, Profile, ReviewItem, ReviewLog
from app.schemas.plan import PlanCard
from app.schemas.stats import (
    CommonMiss,
    PatternStats,
    ReviewRetention,
    StatsTotals,
    StatsView,
    WeekStatsRow,
)
from app.services.drills import recent_results
from app.services.progress import pattern_states

STATS_DRILL_ANSWERS = 30  # per-pattern drill accuracy over the last 30 answers (6.8)
RETENTION_REVIEWS = 30
FINISHED = "finished"
ABANDONED = "abandoned"


@dataclass(frozen=True, slots=True)
class FirstAttempt:
    """The user's first attempt of a problem: the earliest one not abandoned (Start over
    keeps an attempt "first", as fading does)."""

    slug: str
    status: str
    max_rung: int
    started_at: datetime
    finished_at: datetime | None
    plan_correct_seconds: int | None


async def first_attempts(session: AsyncSession, user_id: uuid.UUID) -> list[FirstAttempt]:
    rank = (
        func.row_number()
        .over(
            partition_by=Attempt.problem_slug,
            order_by=(Attempt.started_at, Attempt.id),
        )
        .label("rank")
    )
    ranked = (
        select(
            Attempt.problem_slug,
            Attempt.status,
            Attempt.max_rung,
            Attempt.started_at,
            Attempt.finished_at,
            Attempt.plan_correct_seconds,
            rank,
        )
        .where(Attempt.user_id == user_id, Attempt.status != ABANDONED)
        .subquery()
    )
    rows = await session.execute(select(ranked).where(ranked.c.rank == 1))
    return [
        FirstAttempt(
            slug=row.problem_slug,
            status=row.status,
            max_rung=row.max_rung,
            started_at=row.started_at,
            finished_at=row.finished_at,
            plan_correct_seconds=row.plan_correct_seconds,
        )
        for row in rows
    ]


async def plan_time_samples(
    session: AsyncSession,
    user_id: uuid.UUID,
    since: datetime,
    firsts: Sequence[FirstAttempt] | None = None,
) -> list[tuple[datetime, float]]:
    """(when, seconds) of every plan-time sample since `since` (Section 1.6): correct
    recognition drill answers, and the first correct plan check of first attempts
    (dated by the attempt's start)."""
    drills = await session.execute(
        select(DrillAnswer.created_at, DrillAnswer.seconds).where(
            DrillAnswer.user_id == user_id,
            DrillAnswer.mode == RECOGNITION,
            DrillAnswer.correct.is_(True),
            DrillAnswer.created_at >= since,
        )
    )
    samples = [(at, float(seconds)) for at, seconds in drills]
    if firsts is None:
        firsts = await first_attempts(session, user_id)
    samples += [
        (first.started_at, float(first.plan_correct_seconds))
        for first in firsts
        if first.plan_correct_seconds is not None and first.started_at >= since
    ]
    return samples


async def solved_since(
    session: AsyncSession, user_id: uuid.UUID, since: datetime
) -> list[tuple[datetime, str]]:
    """(finished_at, slug) of the user's solved attempts finished since `since`."""
    rows = await session.execute(
        select(Attempt.finished_at, Attempt.problem_slug).where(
            Attempt.user_id == user_id,
            Attempt.status == FINISHED,
            Attempt.outcome.in_(sorted(SOLVED_OUTCOMES)),
            Attempt.finished_at >= since,
        )
    )
    return [(at, slug) for at, slug in rows if at is not None]


async def activity_days(session: AsyncSession, user_id: uuid.UUID) -> list[date]:
    rows = await session.scalars(select(ActivityDay.day).where(ActivityDay.user_id == user_id))
    return list(rows)


async def count_rows(session: AsyncSession, column: Any, *conditions: Any) -> int:
    total = await session.scalar(select(func.count(column)).where(*conditions))
    return int(total or 0)


# ---------------------------------------------------------------- common misses


def _approach_targets(problem: Problem, approach_id: object) -> tuple[str | None, str | None]:
    approach = next((a for a in problem.approaches if a.id == approach_id), None)
    if approach is None:
        return None, None
    return approach.time, approach.space


async def _plan_misses(
    session: AsyncSession, content: ContentStore, user_id: uuid.UUID, since: datetime
) -> Counter[tuple[MissKind, str]]:
    """Misses in plans graded since `since`: drill answers, plan reviews, and the last
    plan checked in Workspace attempts."""
    graded: list[tuple[str, dict[str, Any]]] = []
    drills = await session.execute(
        select(DrillAnswer.problem_slug, DrillAnswer.grade).where(
            DrillAnswer.user_id == user_id,
            DrillAnswer.mode == RECOGNITION,
            DrillAnswer.created_at >= since,
        )
    )
    graded += [(slug, grade) for slug, grade in drills if slug is not None]
    reviews = await session.execute(
        select(ReviewItem.ref, ReviewLog.plan_grade)
        .join(ReviewItem, ReviewItem.id == ReviewLog.item_id)
        .where(
            ReviewLog.user_id == user_id,
            ReviewLog.created_at >= since,
            ReviewLog.plan_grade.is_not(None),
        )
    )
    graded += [(ref, grade) for ref, grade in reviews if grade is not None]

    attempts = await session.execute(
        select(Attempt.problem_slug, Attempt.plan, Attempt.plan_grade).where(
            Attempt.user_id == user_id,
            Attempt.plan_grade.is_not(None),
            Attempt.updated_at >= since,
        )
    )
    for slug, plan, grade in attempts:
        problem = content.problems_by_slug.get(slug)
        if problem is None or grade is None:
            continue
        missing = ((grade.get("fields") or {}).get("structures") or {}).get("missing")
        if missing is None and plan is not None:
            # Not revealed yet when it was checked: grade the same plan again, revealed.
            grade = grade_plan(
                PlanCard.model_validate(plan),
                problem,
                families=content.pattern_families,
                structure_labels=content.structure_labels,
                always_reveal=True,
            ).model_dump(mode="json", by_alias=True)
        graded.append((slug, grade))

    counts: Counter[tuple[MissKind, str]] = Counter()
    for slug, grade in graded:
        problem = content.problems_by_slug.get(slug)
        if problem is None:
            continue
        time, space = _approach_targets(problem, grade.get("approachId"))
        counts.update(plan_misses(grade, time, space))
    return counts


def _miss_label(content: ContentStore, kind: MissKind, value: str) -> str:
    if kind == "structure":
        return content.structure_labels.get(value, value)
    return f"{value} {kind}"


# ---------------------------------------------------------------- the view


async def stats_view(
    session: AsyncSession, content: ContentStore, user_id: uuid.UUID, now: datetime
) -> StatsView:
    zone: str | None = await session.scalar(select(Profile.timezone).where(Profile.id == user_id))
    today = local_day(now, zone)
    mondays = week_starts(week_start(today))
    since = day_start(mondays[0], zone)

    def week_of(at: datetime) -> int | None:
        monday = week_start(local_day(at, zone))
        return mondays.index(monday) if monday in mondays else None

    progress, states = await pattern_states(session, content, user_id)
    firsts = await first_attempts(session, user_id)
    pattern_of = {problem.slug: problem.pattern_id for problem in content.problems}

    recent = await recent_results(
        session, user_id, RECOGNITION, DrillAnswer.pattern_id, STATS_DRILL_ANSWERS
    )
    patterns = []
    for pattern in content.patterns:
        state = states[pattern.id]
        results = recent.get(pattern.id, [])
        patterns.append(
            PatternStats(
                pattern_id=pattern.id,
                pattern_name=pattern.name,
                state=state.state,
                solved=state.solved,
                mastered=state.mastered,
                total=state.total,
                median_first_rung=median_or_none(
                    first.max_rung
                    for first in firsts
                    if first.status == FINISHED and pattern_of.get(first.slug) == pattern.id
                ),
                drill_accuracy=accuracy(results),
                drill_answers=len(results),
            )
        )

    days = await activity_days(session, user_id)
    active: list[set[date]] = [set() for _ in mondays]
    for day in days:
        if week_start(day) in mondays:
            active[mondays.index(week_start(day))].add(day)
    solved: list[set[str]] = [set() for _ in mondays]
    for at, slug in await solved_since(session, user_id, since):
        if (index := week_of(at)) is not None:
            solved[index].add(slug)
    drills = [0] * len(mondays)
    for at in await session.scalars(
        select(DrillAnswer.created_at).where(
            DrillAnswer.user_id == user_id, DrillAnswer.created_at >= since
        )
    ):
        if (index := week_of(at)) is not None:
            drills[index] += 1
    reviews = [0] * len(mondays)
    remembered = [0] * len(mondays)
    for at, grade in await session.execute(
        select(ReviewLog.created_at, ReviewLog.grade).where(
            ReviewLog.user_id == user_id, ReviewLog.created_at >= since
        )
    ):
        if (index := week_of(at)) is not None:
            reviews[index] += 1
            remembered[index] += grade in REMEMBERED
    plan_seconds: list[list[float]] = [[] for _ in mondays]
    for at, seconds in await plan_time_samples(session, user_id, since, firsts):
        if (index := week_of(at)) is not None:
            plan_seconds[index].append(seconds)
    rungs: dict[int, list[int]] = defaultdict(list)
    for first in firsts:
        finished = first.finished_at if first.status == FINISHED else None
        if finished is not None and (index := week_of(finished)) is not None:
            rungs[index].append(first.max_rung)
    weeks = [
        WeekStatsRow(
            week_start=monday,
            active_days=len(active[index]),
            solved=len(solved[index]),
            drills=drills[index],
            reviews=reviews[index],
            remembered=remembered[index],
            median_plan_seconds=median_or_none(plan_seconds[index]),
            first_attempt_rungs=rung_histogram(rungs[index]),
        )
        for index, monday in enumerate(mondays)
    ]

    misses = [
        CommonMiss(kind=kind, id=value, label=_miss_label(content, kind, value), count=count)
        for kind, value, count in top_misses(await _plan_misses(session, content, user_id, since))
    ]

    last_grades = list(
        await session.scalars(
            select(ReviewLog.grade)
            .where(ReviewLog.user_id == user_id)
            .order_by(ReviewLog.created_at.desc(), ReviewLog.id.desc())
            .limit(RETENTION_REVIEWS)
        )
    )
    kept = sum(grade in REMEMBERED for grade in last_grades)

    statuses = [progress[p.slug].status if p.slug in progress else None for p in content.problems]
    return StatsView(
        streak=current_streak(days, today),
        longest_streak=longest_streak(days),
        totals=StatsTotals(
            solved=sum(is_solved(status) for status in statuses),
            mastered=sum(status == "mastered" for status in statuses),
            problems=len(content.problems),
            drills=await count_rows(session, DrillAnswer.id, DrillAnswer.user_id == user_id),
            reviews=await count_rows(session, ReviewLog.id, ReviewLog.user_id == user_id),
            active_days=len(set(days)),
        ),
        patterns=patterns,
        weeks=weeks,
        common_misses=misses,
        review_retention=ReviewRetention(
            reviews=len(last_grades),
            remembered=kept,
            rate=accuracy([grade in REMEMBERED for grade in last_grades]),
        ),
    )

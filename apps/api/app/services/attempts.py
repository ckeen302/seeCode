"""Attempts: ownership, resume or create (with fading), views, finishing, wrap-up."""

import uuid
from datetime import datetime, timedelta
from typing import Any, cast

from sqlalchemy import exists, select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.content.hints import hint_content
from app.content.models import BRUTE_FORCE, Problem
from app.content.store import ContentStore
from app.errors import ApiError
from app.learning.fading import fading_for, given_pattern
from app.learning.mastery import next_problem, problem_status
from app.learning.outcomes import Outcome, is_solved_outcome
from app.learning.plan_grading import MAX_PLAN_CHECKS, NOT_SURE_PATTERN, optimal_approach
from app.models import Attempt, ReviewItem
from app.schemas.attempts import AttemptStatus, AttemptView, FadingView, RelatedProblem, WrapUp
from app.schemas.plan import PlanCard, PlanGrade
from app.services.progress import (
    load_progress,
    mark_attempted,
    mark_solved,
    record_activity,
    review_after_attempt_end,
)

ACTIVE = "active"
FINISHED = "finished"
ABANDONED = "abandoned"
STALE_AFTER = timedelta(days=14)  # Section 11.2: no activity for 14 days -> abandoned


def not_found() -> ApiError:
    return ApiError(404, "not_found", "Attempt not found.")


def attempt_ended() -> ApiError:
    return ApiError(409, "conflict", "This attempt has ended. Start a new one to keep going.")


def workspace_problem(content: ContentStore, slug: str) -> Problem:
    problem = content.workspace_problem(slug)
    if problem is None:  # unknown or drill-only
        raise ApiError(404, "not_found", "Problem not found.")
    return problem


async def owned_attempt(
    session: AsyncSession, user_id: uuid.UUID, attempt_id: uuid.UUID, *, lock: bool = False
) -> Attempt:
    """The user's attempt; another user's attempt is reported as not found (Section 20)."""
    query = select(Attempt).where(Attempt.id == attempt_id, Attempt.user_id == user_id)
    attempt = await session.scalar(query.with_for_update() if lock else query)
    if attempt is None:
        raise not_found()
    return attempt


def require_active(attempt: Attempt) -> None:
    if attempt.status != ACTIVE:
        raise attempt_ended()


def opened_rungs(attempt: Attempt) -> list[int]:
    return sorted({int(entry["rung"]) for entry in attempt.rungs_opened})


def rung_entries(rungs: list[int], at: datetime) -> list[dict[str, Any]]:
    return [{"rung": rung, "at": at.isoformat()} for rung in rungs]


def check_plan_ids(content: ContentStore, plan: PlanCard) -> None:
    """Plan answers must name known patterns and structures; Check plan needs a pattern
    and at least one complexity (Section 7.3)."""
    if plan.pattern is None or (plan.time is None and plan.space is None):
        raise ApiError(
            422, "validation_error", "A plan needs a pattern and at least one complexity."
        )
    if plan.pattern not in content.patterns_by_id and plan.pattern not in (
        BRUTE_FORCE,
        NOT_SURE_PATTERN,
    ):
        raise ApiError(422, "validation_error", f"plan.pattern: unknown pattern {plan.pattern!r}.")
    unknown = [s for s in plan.structures if s not in content.structures_by_id]
    if unknown:
        raise ApiError(
            422, "validation_error", f"plan.structures: unknown structure {unknown[0]!r}."
        )


async def _active_attempt(session: AsyncSession, user_id: uuid.UUID, slug: str) -> Attempt | None:
    attempt: Attempt | None = await session.scalar(
        select(Attempt)
        .where(
            Attempt.user_id == user_id,
            Attempt.problem_slug == slug,
            Attempt.status == ACTIVE,
        )
        .with_for_update()
    )
    return attempt


async def has_finished_attempt(session: AsyncSession, user_id: uuid.UUID, slug: str) -> bool:
    found: bool | None = await session.scalar(
        select(
            exists().where(
                Attempt.user_id == user_id,
                Attempt.problem_slug == slug,
                Attempt.status == FINISHED,
            )
        )
    )
    return bool(found)


def abandon(attempt: Attempt, now: datetime) -> None:
    attempt.status = ABANDONED
    attempt.outcome = "abandoned"
    attempt.updated_at = now


async def start_attempt(
    session: AsyncSession,
    content: ContentStore,
    user_id: uuid.UUID,
    problem: Problem,
    now: datetime,
) -> Attempt:
    """Resume the user's active attempt of `problem`, or create one (Section 7.9).

    An active attempt idle for 14 days is abandoned and replaced (Section 11.2). A new
    attempt gets fading (11.6) while the user has not finished an attempt of the problem.
    """
    slug = problem.slug
    current = await _active_attempt(session, user_id, slug)
    if current is not None and now - current.updated_at < STALE_AFTER:
        await mark_attempted(session, user_id, slug, now)
        return current
    if current is not None:
        abandon(current, now)
        await session.flush()

    first = not await has_finished_attempt(session, user_id, slug)
    pattern_slugs = [p.slug for p in content.problems_by_pattern.get(problem.pattern_id, [])]
    fading = fading_for(slug, problem.pattern_id, pattern_slugs, first)
    stmt = (
        pg_insert(Attempt)
        .values(
            user_id=user_id,
            problem_slug=slug,
            content_version=content.version,
            status=ACTIVE,
            code=problem.starter_code or "",
            free_rungs=list(fading.free_rungs),
            rungs_opened=rung_entries(list(fading.open_rungs), now),
            started_at=now,
            updated_at=now,
        )
        .on_conflict_do_nothing(
            index_elements=[Attempt.user_id, Attempt.problem_slug],
            index_where=Attempt.status == ACTIVE,
        )
        .returning(Attempt)
    )
    attempt = (await session.scalars(stmt)).one_or_none()
    if attempt is None:  # a concurrent request created it first
        attempt = await _active_attempt(session, user_id, slug)
        if attempt is None:
            raise ApiError(409, "conflict", "Could not start the attempt. Try again.")
    await mark_attempted(session, user_id, slug, now)
    return attempt


def attempt_view(content: ContentStore, attempt: Attempt) -> AttemptView:
    problem = workspace_problem(content, attempt.problem_slug)
    return AttemptView(
        id=attempt.id,
        slug=attempt.problem_slug,
        status=cast(AttemptStatus, attempt.status),
        code=attempt.code,
        plan=PlanCard.model_validate(attempt.plan) if attempt.plan is not None else None,
        plan_grade=(
            PlanGrade.model_validate(attempt.plan_grade) if attempt.plan_grade is not None else None
        ),
        checks_left=max(0, MAX_PLAN_CHECKS - attempt.plan_checks),
        max_rung=attempt.max_rung,
        opened_rungs=[hint_content(content, problem, rung) for rung in opened_rungs(attempt)],
        fading=FadingView(
            given_pattern=given_pattern(problem.pattern_id, attempt.free_rungs),
            free_rungs=sorted(attempt.free_rungs),
        ),
        last_results=attempt.last_results,
        active_seconds=attempt.active_seconds,
        outcome=cast(Outcome | None, attempt.outcome),
        runs=attempt.runs,
        planned_first=attempt.planned_first,
        plan_skipped=attempt.plan_skipped,
        started_at=attempt.started_at,
        updated_at=attempt.updated_at,
    )


async def record_end(
    session: AsyncSession, attempt: Attempt, outcome: Outcome, at: datetime
) -> ReviewItem | None:
    """What a finished attempt leaves: progress, the review item and the activity day."""
    user_id, slug = attempt.user_id, attempt.problem_slug
    if is_solved_outcome(outcome):
        await mark_solved(session, user_id, slug, attempt.max_rung, at)
    else:
        await mark_attempted(session, user_id, slug, at)
    review = await review_after_attempt_end(
        session,
        user_id,
        slug,
        outcome,
        at,
        attempt_id=attempt.id,
        seconds=float(attempt.active_seconds),
    )
    await record_activity(session, user_id, at)
    return review


async def finish_attempt(
    session: AsyncSession, attempt: Attempt, outcome: Outcome, now: datetime
) -> ReviewItem | None:
    attempt.status = FINISHED
    attempt.outcome = outcome
    attempt.finished_at = now
    attempt.updated_at = now
    await session.flush()
    return await record_end(session, attempt, outcome, now)


async def wrap_up(
    session: AsyncSession,
    content: ContentStore,
    attempt: Attempt,
    problem: Problem,
    review: ReviewItem,
) -> WrapUp:
    """The wrap-up panel after a passing Submit (Sections 7.8 and 16.3)."""
    progress = await load_progress(session, attempt.user_id)
    statuses = {slug: row.status for slug, row in progress.items()}
    pattern = content.patterns_by_id[problem.pattern_id]
    related = []
    for link in problem.related:
        target = content.workspace_problem(link.slug)
        if target is None:  # not written yet, or drill-only
            continue
        related.append(
            RelatedProblem(
                slug=target.slug,
                title=target.title,
                relation=link.relation,
                status=problem_status(statuses.get(target.slug)),
            )
        )
    return WrapUp(
        pattern_id=pattern.id,
        pattern_name=pattern.name,
        twist=optimal_approach(problem).twist,
        max_rung=attempt.max_rung,
        plan_right_first_time=bool(attempt.plan_first_correct),
        time_seconds=attempt.active_seconds,
        related=related,
        next_review_at=review.due_at,
        next_problem_slug=next_problem(
            [(p.slug, p.pattern_id) for p in content.problems],
            content.pattern_progress(progress),
            statuses,
            exclude=problem.slug,
        ),
    )

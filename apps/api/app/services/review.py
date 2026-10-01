"""Review items: the queue, answers, self-ratings (Sections 6.7, 11.4 and 11.5), and the
items drill misses leave (11.4).

- The queue holds the items due by the end of the user's day, oldest due first, at most
  20, interleaved by pattern. Items whose problem or toolkit card no longer exists in the
  content are skipped (and are not found when answered).
- A problem-plan answer is graded like a drill (twist optional, the plan revealed, no
  nudges); a borderline grade waits in `review_items.pending` for the user's Hard / Good
  rating. Items waiting for a re-solve (`resolve`) are answered by finishing an attempt
  in the Workspace, not here.
- Every graded answer reschedules the item (Section 11.4), writes a `review_logs` row,
  may master the problem (11.3) and marks the day active (streaks).
"""

import random
import uuid
from collections.abc import Sequence
from datetime import datetime, timedelta
from typing import Any

from pydantic import ValidationError
from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.content.models import BRUTE_FORCE, Problem, ToolkitCard
from app.content.store import ContentStore
from app.errors import ApiError
from app.learning.activity import end_of_day
from app.learning.drills import tool_matches, toolkit_options
from app.learning.plan_grading import NOT_SURE_PATTERN, REVEAL_RUNG, grade_plan
from app.learning.review import (
    QUEUE_MAX,
    SelfRating,
    interleave,
    plan_review_grade,
    toolkit_review_grade,
)
from app.learning.scheduling import Grade, schedule
from app.models import Profile, ReviewItem, ReviewLog
from app.schemas.drills import ExampleCard, ProblemCard, TargetsCard, ToolkitAnswer, ToolkitPrompt
from app.schemas.hints import SignalView
from app.schemas.plan import PlanCard, PlanGrade
from app.schemas.review import ReviewAnswerResult, ReviewCard, ReviewRateResult
from app.services.progress import PROBLEM_PLAN, TOOLKIT, master_if_earned, record_activity

FIRST_INTERVAL_DAYS = 1.0  # drill misses: due tomorrow (Section 11.4)


def not_found() -> ApiError:
    return ApiError(404, "not_found", "Review item not found.")


# ---------------------------------------------------------------- answers and cards


def validation_error(field: str, exc: ValidationError) -> ApiError:
    first = exc.errors()[0]
    location = ".".join(str(part) for part in (field, *first.get("loc", ())))
    return ApiError(422, "validation_error", f"{location}: {first.get('msg', 'invalid value')}")


def parse_plan(content: ContentStore, raw: dict[str, Any], field: str = "answer") -> PlanCard:
    """A plan answer in a drill or review. Unlike Check plan, an empty plan is allowed
    (it grades as a miss), but every id must be known."""
    try:
        plan = PlanCard.model_validate(raw)
    except ValidationError as exc:
        raise validation_error(field, exc) from exc
    known = plan.pattern is None or plan.pattern in content.patterns_by_id
    if not known and plan.pattern not in (BRUTE_FORCE, NOT_SURE_PATTERN):
        raise ApiError(
            422, "validation_error", f"{field}.pattern: unknown pattern {plan.pattern!r}."
        )
    unknown = [s for s in plan.structures if s not in content.structures_by_id]
    if unknown:
        raise ApiError(
            422, "validation_error", f"{field}.structures: unknown structure {unknown[0]!r}."
        )
    return plan


def parse_tool(raw: dict[str, Any], field: str = "answer") -> ToolkitAnswer:
    try:
        return ToolkitAnswer.model_validate(raw)
    except ValidationError as exc:
        raise validation_error(field, exc) from exc


def grade_drill_plan(content: ContentStore, plan: PlanCard, problem: Problem) -> PlanGrade:
    """Drills and reviews (Section 11.1): the twist is optional, the plan is always
    revealed, and there are no nudges (the reveal already gives the answer, as rung 3
    would)."""
    return grade_plan(
        plan,
        problem,
        families=content.pattern_families,
        structure_labels=content.structure_labels,
        opened_rung=REVEAL_RUNG,
        always_reveal=True,
        twist_optional=True,
    )


def signal_views(problem: Problem) -> list[SignalView]:
    return [
        SignalView(phrase=s.phrase, meaning=s.meaning, points_to=s.points_to)
        for s in problem.signals
    ]


def problem_card(problem: Problem) -> ProblemCard:
    """The statement a drill or review shows: no title, pattern or answers."""
    return ProblemCard(
        slug=problem.slug,
        summary=problem.summary,
        examples=[
            ExampleCard(input=e.input, output=e.output, explanation=e.explanation)
            for e in problem.examples
        ],
        constraints=list(problem.constraints),
        targets=TargetsCard(time=problem.targets.time, space=problem.targets.space),
    )


def toolkit_prompt(content: ContentStore, card: ToolkitCard, rng: random.Random) -> ToolkitPrompt:
    return ToolkitPrompt(
        toolkit_id=card.id,
        phrase=rng.choice(card.phrases),
        options=toolkit_options(card.tool, [c.tool for c in content.toolkit], rng),
    )


# ---------------------------------------------------------------- items left by drill misses


async def add_problem_review(
    session: AsyncSession, user_id: uuid.UUID, slug: str, now: datetime
) -> bool:
    """A missed recognition drill: a `problem_plan` item due tomorrow, unless the problem
    already has one (Section 11.4). Returns whether an item was created."""
    stmt = (
        pg_insert(ReviewItem)
        .values(
            user_id=user_id,
            kind=PROBLEM_PLAN,
            ref=slug,
            due_at=now + timedelta(days=FIRST_INTERVAL_DAYS),
            interval_days=FIRST_INTERVAL_DAYS,
        )
        .on_conflict_do_nothing(index_elements=["user_id", "kind", "ref"])
        .returning(ReviewItem.id)
    )
    return (await session.execute(stmt)).scalar_one_or_none() is not None


async def add_toolkit_review(
    session: AsyncSession,
    user_id: uuid.UUID,
    toolkit_id: str,
    now: datetime,
    rng: random.Random | None = None,
    *,
    reset: bool = True,
) -> bool:
    """A missed toolkit card: a `toolkit` item due tomorrow. An existing item is a new
    failure, reset with grade `again` (Section 11.4), unless `reset` is false. Returns
    whether an item was created."""
    stmt = (
        pg_insert(ReviewItem)
        .values(
            user_id=user_id,
            kind=TOOLKIT,
            ref=toolkit_id,
            due_at=now + timedelta(days=FIRST_INTERVAL_DAYS),
            interval_days=FIRST_INTERVAL_DAYS,
        )
        .on_conflict_do_nothing(index_elements=["user_id", "kind", "ref"])
        .returning(ReviewItem.id)
    )
    if (await session.execute(stmt)).scalar_one_or_none() is not None:
        return True
    if reset:
        item = await session.scalar(
            select(ReviewItem)
            .where(
                ReviewItem.user_id == user_id,
                ReviewItem.kind == TOOLKIT,
                ReviewItem.ref == toolkit_id,
            )
            .with_for_update()
        )
        if item is not None:
            schedule(item, "again", now, rng)
            item.pending = None
    return False


async def remove_unreviewed(
    session: AsyncSession, user_id: uuid.UUID, kind: str, refs: Sequence[str]
) -> list[str]:
    """Delete the user's items of `kind` for `refs` that were never reviewed (the end
    screen's "Add missed to review" turned off). Returns the refs removed."""
    if not refs:
        return []
    items = (
        await session.scalars(
            select(ReviewItem)
            .where(
                ReviewItem.user_id == user_id,
                ReviewItem.kind == kind,
                ReviewItem.ref.in_(list(refs)),
                ReviewItem.last_reviewed_at.is_(None),
                ReviewItem.pending.is_(None),
            )
            .with_for_update()
        )
    ).all()
    for item in items:
        await session.delete(item)
    await session.flush()
    return [item.ref for item in items]


async def existing_refs(
    session: AsyncSession, user_id: uuid.UUID, kind: str, refs: Sequence[str]
) -> set[str]:
    if not refs:
        return set()
    rows = await session.scalars(
        select(ReviewItem.ref).where(
            ReviewItem.user_id == user_id,
            ReviewItem.kind == kind,
            ReviewItem.ref.in_(list(refs)),
        )
    )
    return set(rows)


# ---------------------------------------------------------------- the queue


def item_known(content: ContentStore, item: ReviewItem) -> bool:
    if item.kind == PROBLEM_PLAN:
        return item.ref in content.problems_by_slug
    if item.kind == TOOLKIT:
        return item.ref in content.toolkit_by_id
    return False


def item_pattern(content: ContentStore, item: ReviewItem) -> str | None:
    """The pattern that interleaving keeps apart; toolkit items have none."""
    if item.kind == PROBLEM_PLAN:
        problem = content.problems_by_slug.get(item.ref)
        return problem.pattern_id if problem is not None else None
    return None


async def user_time_zone(session: AsyncSession, user_id: uuid.UUID) -> str | None:
    zone: str | None = await session.scalar(select(Profile.timezone).where(Profile.id == user_id))
    return zone


async def due_items(
    session: AsyncSession,
    content: ContentStore,
    user_id: uuid.UUID,
    now: datetime,
    zone: str | None,
) -> list[ReviewItem]:
    """The user's items due by the end of their day, oldest due first (known refs only)."""
    items = await session.scalars(
        select(ReviewItem)
        .where(ReviewItem.user_id == user_id, ReviewItem.due_at < end_of_day(now, zone))
        .order_by(ReviewItem.due_at, ReviewItem.created_at, ReviewItem.id)
    )
    return [item for item in items if item_known(content, item)]


def card_rng(item: ReviewItem) -> random.Random:
    """Same phrase and options until the item is rescheduled, so refetching the queue
    does not reshuffle a card under the user."""
    return random.Random(f"{item.id}:{item.due_at.isoformat()}")


def review_card(content: ContentStore, item: ReviewItem) -> ReviewCard:
    if item.kind == PROBLEM_PLAN:
        return ReviewCard(
            item_id=item.id,
            kind=PROBLEM_PLAN,
            resolve=item.resolve,
            problem=problem_card(content.problems_by_slug[item.ref]),
            has_workspace=content.workspace_problem(item.ref) is not None,
        )
    card = content.toolkit_by_id[item.ref]
    return ReviewCard(
        item_id=item.id,
        kind=TOOLKIT,
        resolve=item.resolve,
        toolkit=toolkit_prompt(content, card, card_rng(item)),
    )


async def review_queue(
    session: AsyncSession,
    content: ContentStore,
    user_id: uuid.UUID,
    now: datetime,
    limit: int = QUEUE_MAX,
) -> list[ReviewCard]:
    zone = await user_time_zone(session, user_id)
    items = (await due_items(session, content, user_id, now, zone))[: min(limit, QUEUE_MAX)]
    ordered = interleave(items, lambda item: item_pattern(content, item))
    return [review_card(content, item) for item in ordered]


# ---------------------------------------------------------------- answering and rating


async def owned_item(
    session: AsyncSession, user_id: uuid.UUID, item_id: uuid.UUID, *, lock: bool = False
) -> ReviewItem:
    """The user's item; another user's item is reported as not found (Section 20)."""
    query = select(ReviewItem).where(ReviewItem.id == item_id, ReviewItem.user_id == user_id)
    item = await session.scalar(query.with_for_update() if lock else query)
    if item is None:
        raise not_found()
    return item


async def apply_grade(
    session: AsyncSession,
    item: ReviewItem,
    grade: Grade,
    now: datetime,
    rng: random.Random | None,
    *,
    answer: dict[str, Any] | None,
    plan_grade: dict[str, Any] | None,
    seconds: float | None,
) -> None:
    """Reschedule the item (Section 11.4), log the review, master the problem when the
    review earns it (11.3) and mark the day active."""
    interval_before = item.interval_days
    schedule(item, grade, now, rng)
    item.pending = None
    session.add(
        ReviewLog(
            item_id=item.id,
            user_id=item.user_id,
            grade=grade,
            interval_before=interval_before,
            interval_after=item.interval_days,
            answer=answer,
            plan_grade=plan_grade,
            seconds=seconds,
            created_at=now,
        )
    )
    if item.kind == PROBLEM_PLAN:
        await master_if_earned(session, item.user_id, item.ref, grade, interval_before, now)
    await record_activity(session, item.user_id, now)
    await session.flush()


async def answer_review(
    session: AsyncSession,
    content: ContentStore,
    user_id: uuid.UUID,
    item_id: uuid.UUID,
    raw_answer: dict[str, Any],
    seconds: float,
    now: datetime,
    rng: random.Random | None = None,
) -> ReviewAnswerResult:
    item = await owned_item(session, user_id, item_id, lock=True)
    if not item_known(content, item):
        raise not_found()
    if item.due_at >= end_of_day(now, await user_time_zone(session, user_id)):
        raise ApiError(409, "conflict", "This item is not due yet.")

    if item.kind == TOOLKIT:
        card = content.toolkit_by_id[item.ref]
        tool = parse_tool(raw_answer)
        correct = tool_matches(tool.tool, card.tool, card.id)
        grade = toolkit_review_grade(correct)
        await apply_grade(
            session,
            item,
            grade,
            now,
            rng,
            answer=tool.model_dump(mode="json", by_alias=True),
            plan_grade=None,
            seconds=seconds,
        )
        return ReviewAnswerResult(
            correct=correct,
            needs_self_rating=False,
            grade=grade,
            next_due_at=item.due_at,
            tool=card.tool,
            example=card.example,
        )

    if item.resolve:
        raise ApiError(409, "conflict", "Solve this problem again in the Workspace to review it.")
    problem = content.problems_by_slug[item.ref]
    plan = parse_plan(content, raw_answer)
    plan_grade = grade_drill_plan(content, plan, problem)
    answer_json = plan.model_dump(mode="json", by_alias=True)
    grade_json = plan_grade.model_dump(mode="json", by_alias=True)
    automatic = plan_review_grade(plan_grade.correct, plan_grade.score, seconds)
    feedback: dict[str, Any] = {
        "plan_grade": plan_grade,
        "correct": plan_grade.correct,
        "signals": signal_views(problem),
        "title": problem.title,
    }
    if automatic is None:  # borderline: wait for the user's rating
        item.pending = {
            "answer": answer_json,
            "planGrade": grade_json,
            "seconds": seconds,
            "answeredAt": now.isoformat(),
        }
        await record_activity(session, user_id, now)
        await session.flush()
        return ReviewAnswerResult(needs_self_rating=True, **feedback)
    await apply_grade(
        session,
        item,
        automatic,
        now,
        rng,
        answer=answer_json,
        plan_grade=grade_json,
        seconds=seconds,
    )
    return ReviewAnswerResult(
        needs_self_rating=False, grade=automatic, next_due_at=item.due_at, **feedback
    )


async def rate_review(
    session: AsyncSession,
    user_id: uuid.UUID,
    item_id: uuid.UUID,
    rating: SelfRating,
    now: datetime,
    rng: random.Random | None = None,
) -> ReviewRateResult:
    """The user's Hard / Good after a borderline answer (Section 11.4)."""
    item = await owned_item(session, user_id, item_id, lock=True)
    pending = item.pending
    if pending is None:
        raise ApiError(409, "conflict", "There is no answer waiting for a rating.")
    seconds = pending.get("seconds")
    await apply_grade(
        session,
        item,
        rating,
        now,
        rng,
        answer=pending.get("answer"),
        plan_grade=pending.get("planGrade"),
        seconds=float(seconds) if isinstance(seconds, int | float) else None,
    )
    return ReviewRateResult(grade=rating, next_due_at=item.due_at)

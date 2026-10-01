"""Drill sessions (Sections 6.6, 11.7 and 16.2): dealing cards, answering, finishing.

- A session deals its cards up front and stores them (`drill_sessions.cards`), so every
  answer is checked against a card of the session. Each card takes one answer; asking
  again returns the first answer's feedback (a retry after a network error must not
  fail). A finished session takes no more answers.
- Recognition answers are graded like Section 11.1 with the twist optional and the plan
  always revealed. Toolkit answers name the tool (typed or picked).
- A miss leaves a review item due tomorrow (11.4): a `problem_plan` item when the problem
  has none, or a `toolkit` item (an existing one is reset with grade `again`). The card
  remembers the items it created, so the end screen's "Add missed to review" can take
  them back.
- Toolkit cards due for review are dealt first (11.7), and answering one is its review:
  the item is rescheduled (right: good, wrong: again) and logged as a review answer is.
- Every answer marks the day active (streaks).
"""

import random
import uuid
from collections import defaultdict
from collections.abc import Sequence
from datetime import datetime, timedelta
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import InstrumentedAttribute

from app.content.models import ToolkitCard
from app.content.store import ContentStore
from app.errors import ApiError
from app.learning.activity import end_of_day
from app.learning.drills import (
    RECENT_ANSWERS,
    RECENT_HOURS,
    RECOGNITION,
    TOOLKIT,
    Candidate,
    miss_rate,
    problem_weight,
    select_recognition,
    select_toolkit,
    tool_matches,
    toolkit_options,
    toolkit_weight,
    weakness,
)
from app.learning.review import toolkit_review_grade
from app.learning.stats import median_or_none
from app.models import DrillAnswer, DrillSession, ReviewItem
from app.schemas.drills import (
    DrillAnswerRequest,
    DrillCard,
    DrillFeedback,
    DrillMiss,
    DrillMode,
    DrillSessionCreate,
    DrillSessionView,
    DrillSummary,
    FieldTallies,
    FieldTally,
    PatternTally,
    RecognitionCard,
    ToolkitDrillCard,
)
from app.schemas.plan import PlanGrade
from app.services.progress import (
    PROBLEM_PLAN,
    pattern_states,
    record_activity,
    unlocked_patterns,
)
from app.services.review import (
    add_problem_review,
    add_toolkit_review,
    apply_grade,
    existing_refs,
    grade_drill_plan,
    parse_plan,
    parse_tool,
    problem_card,
    remove_unreviewed,
    signal_views,
    user_time_zone,
)

REVIEW_CREATED = "reviewCreated"  # card key: a miss on this card created its review item
PLAN_FIELDS = ("pattern", "structures", "time", "space", "twist")


def session_not_found() -> ApiError:
    return ApiError(404, "not_found", "Drill session not found.")


def card_ref(mode: str, card: dict[str, Any]) -> str:
    """The problem slug or toolkit id a stored card asks about."""
    return str(card["slug"] if mode == RECOGNITION else card["toolkitId"])


def review_kind(mode: str) -> str:
    return PROBLEM_PLAN if mode == RECOGNITION else TOOLKIT


async def owned_session(
    session: AsyncSession, user_id: uuid.UUID, session_id: uuid.UUID, *, lock: bool = False
) -> DrillSession:
    """The user's drill session; another user's session is reported as not found."""
    query = select(DrillSession).where(
        DrillSession.id == session_id, DrillSession.user_id == user_id
    )
    drill = await session.scalar(query.with_for_update() if lock else query)
    if drill is None:
        raise session_not_found()
    return drill


# ---------------------------------------------------------------- the user's drill history


async def recent_results(
    session: AsyncSession,
    user_id: uuid.UUID,
    mode: str,
    key: InstrumentedAttribute[str | None],
    limit: int = RECENT_ANSWERS,
) -> dict[str, list[bool]]:
    """The newest `limit` results per pattern (recognition, `key` =
    `DrillAnswer.pattern_id`) or per card (toolkit, `DrillAnswer.toolkit_id`), newest
    first."""
    rank = (
        func.row_number()
        .over(
            partition_by=key,
            order_by=(DrillAnswer.created_at.desc(), DrillAnswer.id.desc()),
        )
        .label("rank")
    )
    ranked = (
        select(key.label("key"), DrillAnswer.correct.label("correct"), rank)
        .where(DrillAnswer.user_id == user_id, DrillAnswer.mode == mode, key.is_not(None))
        .subquery()
    )
    rows = await session.execute(
        select(ranked.c.key, ranked.c.correct)
        .where(ranked.c.rank <= limit)
        .order_by(ranked.c.key, ranked.c.rank)
    )
    results: dict[str, list[bool]] = defaultdict(list)
    for name, correct in rows:
        results[name].append(bool(correct))
    return dict(results)


async def last_drilled(session: AsyncSession, user_id: uuid.UUID) -> dict[str, datetime]:
    """When the user last answered a recognition card of each problem."""
    rows = await session.execute(
        select(DrillAnswer.problem_slug, func.max(DrillAnswer.created_at))
        .where(
            DrillAnswer.user_id == user_id,
            DrillAnswer.mode == RECOGNITION,
            DrillAnswer.problem_slug.is_not(None),
        )
        .group_by(DrillAnswer.problem_slug)
    )
    return {slug: at for slug, at in rows if slug is not None}


# ---------------------------------------------------------------- dealing


async def recognition_pool(
    session: AsyncSession,
    content: ContentStore,
    user_id: uuid.UUID,
    patterns: Sequence[str],
    now: datetime,
) -> list[Candidate]:
    """Every problem, Workspace or drill-only, of `patterns`, weighted (Section 11.7)."""
    recent = await recent_results(session, user_id, RECOGNITION, DrillAnswer.pattern_id)
    last = await last_drilled(session, user_id)
    pool: list[Candidate] = []
    for pattern_id in patterns:
        pattern_weakness = weakness(recent.get(pattern_id, []))
        for problem in content.all_problems_by_pattern.get(pattern_id, []):
            at = last.get(problem.slug)
            recently = at is not None and now - at < timedelta(hours=RECENT_HOURS)
            weight = problem_weight(pattern_weakness, at is None, recently)
            pool.append(Candidate(key=problem.slug, group=pattern_id, weight=weight))
    return pool


def toolkit_eligible(card: ToolkitCard, unlocked: set[str], pattern_filter: str | None) -> bool:
    """Cards tagged with an unlocked pattern; untagged cards always (Section 26 wants all
    25 in drills). With a filter: only cards tagged with that pattern."""
    if pattern_filter is not None:
        return pattern_filter in card.patterns
    return not card.patterns or any(p in unlocked for p in card.patterns)


async def due_toolkit_ids(
    session: AsyncSession, user_id: uuid.UUID, now: datetime, zone: str | None
) -> list[str]:
    rows = await session.scalars(
        select(ReviewItem.ref)
        .where(
            ReviewItem.user_id == user_id,
            ReviewItem.kind == TOOLKIT,
            ReviewItem.due_at < end_of_day(now, zone),
        )
        .order_by(ReviewItem.due_at, ReviewItem.id)
    )
    return list(rows)


async def deal_toolkit(
    session: AsyncSession,
    content: ContentStore,
    user_id: uuid.UUID,
    unlocked: Sequence[str],
    pattern_filter: str | None,
    size: int,
    now: datetime,
    rng: random.Random,
) -> list[dict[str, Any]]:
    zone = await user_time_zone(session, user_id)
    allowed = set(unlocked)
    due = [
        ref
        for ref in await due_toolkit_ids(session, user_id, now, zone)
        if ref in content.toolkit_by_id
        and (pattern_filter is None or pattern_filter in content.toolkit_by_id[ref].patterns)
    ]
    recent = await recent_results(session, user_id, TOOLKIT, DrillAnswer.toolkit_id)
    candidates = [
        Candidate(card.id, card.id, toolkit_weight(miss_rate(recent.get(card.id, []))))
        for card in content.toolkit
        if toolkit_eligible(card, allowed, pattern_filter)
    ]
    tools = [card.tool for card in content.toolkit]
    cards = []
    for number, toolkit_id in enumerate(select_toolkit(due, candidates, size, rng), start=1):
        card = content.toolkit_by_id[toolkit_id]
        cards.append(
            {
                "id": f"c{number}",
                "toolkitId": card.id,
                "phrase": rng.choice(card.phrases),
                "options": toolkit_options(card.tool, tools, rng),
            }
        )
    return cards


def card_view(content: ContentStore, mode: str, card: dict[str, Any]) -> DrillCard:
    if mode == RECOGNITION:
        statement = problem_card(content.problems_by_slug[card["slug"]])
        return RecognitionCard(id=card["id"], **dict(statement))
    return ToolkitDrillCard(
        id=card["id"],
        toolkit_id=card["toolkitId"],
        phrase=card["phrase"],
        options=list(card["options"]),
    )


async def create_session(
    session: AsyncSession,
    content: ContentStore,
    user_id: uuid.UUID,
    body: DrillSessionCreate,
    now: datetime,
    rng: random.Random,
) -> DrillSessionView:
    """Deal a session (Section 11.7). The pool is limited to unlocked patterns, and a
    pattern filter must name one of them."""
    _, states = await pattern_states(session, content, user_id)
    unlocked = unlocked_patterns(states)
    pattern_filter = body.pattern_filter
    if pattern_filter is not None:
        if pattern_filter not in content.patterns_by_id:
            raise ApiError(
                422, "validation_error", f"patternFilter: unknown pattern {pattern_filter!r}."
            )
        if pattern_filter not in unlocked:
            raise ApiError(
                422,
                "validation_error",
                "patternFilter: this pattern is still locked. Unlock it on the roadmap first.",
            )

    if body.mode == RECOGNITION:
        pool = await recognition_pool(session, content, user_id, unlocked, now)
        chosen = select_recognition(pool, body.size, rng, pattern_filter)
        cards = [{"id": f"c{n}", "slug": c.key} for n, c in enumerate(chosen, start=1)]
    else:
        cards = await deal_toolkit(
            session, content, user_id, unlocked, pattern_filter, body.size, now, rng
        )
    if not cards:
        raise ApiError(409, "conflict", "No cards are available for this drill yet.")

    drill = DrillSession(
        user_id=user_id,
        mode=body.mode,
        pattern_filter=pattern_filter,
        size=len(cards),
        started_at=now,
        cards=cards,
        add_missed=True,
    )
    session.add(drill)
    await session.flush()
    return DrillSessionView(
        session_id=drill.id, cards=[card_view(content, body.mode, card) for card in cards]
    )


# ---------------------------------------------------------------- answering


def _gone() -> ApiError:
    return ApiError(409, "conflict", "This card is no longer available.")


def _recognition_feedback(content: ContentStore, slug: str, grade: PlanGrade) -> DrillFeedback:
    problem = content.problems_by_slug[slug]
    return DrillFeedback(
        correct=grade.correct,
        plan_grade=grade,
        signals=signal_views(problem),
        title=problem.title,
    )


def _toolkit_feedback(card: ToolkitCard, correct: bool) -> DrillFeedback:
    return DrillFeedback(correct=correct, tool=card.tool, example=card.example)


def feedback_from_answer(
    content: ContentStore, mode: str, card: dict[str, Any], row: DrillAnswer
) -> DrillFeedback:
    """The feedback of an answer already given (a repeated request)."""
    ref = card_ref(mode, card)
    if mode == RECOGNITION:
        if ref not in content.problems_by_slug:
            raise _gone()
        return _recognition_feedback(content, ref, PlanGrade.model_validate(row.grade))
    toolkit = content.toolkit_by_id.get(ref)
    if toolkit is None:
        raise _gone()
    return _toolkit_feedback(toolkit, row.correct)


async def _session_answers(session: AsyncSession, drill: DrillSession) -> list[DrillAnswer]:
    rows = await session.scalars(
        select(DrillAnswer)
        .where(DrillAnswer.session_id == drill.id)
        .order_by(DrillAnswer.created_at, DrillAnswer.id)
    )
    return list(rows)


def _answer_ref(mode: str, row: DrillAnswer) -> str | None:
    return row.problem_slug if mode == RECOGNITION else row.toolkit_id


async def _due_toolkit_item(
    session: AsyncSession, user_id: uuid.UUID, toolkit_id: str, now: datetime
) -> ReviewItem | None:
    """The card's review item when it is due by the end of the user's day (locked)."""
    item = await session.scalar(
        select(ReviewItem)
        .where(
            ReviewItem.user_id == user_id,
            ReviewItem.kind == TOOLKIT,
            ReviewItem.ref == toolkit_id,
        )
        .with_for_update()
    )
    if item is None or item.due_at >= end_of_day(now, await user_time_zone(session, user_id)):
        return None
    return item


async def answer_card(
    session: AsyncSession,
    content: ContentStore,
    user_id: uuid.UUID,
    session_id: uuid.UUID,
    body: DrillAnswerRequest,
    now: datetime,
    rng: random.Random | None = None,
) -> DrillFeedback:
    drill = await owned_session(session, user_id, session_id, lock=True)
    cards = list(drill.cards)
    index = next((i for i, card in enumerate(cards) if card.get("id") == body.card_id), None)
    if index is None:
        raise ApiError(404, "not_found", "Drill card not found.")
    card = cards[index]
    ref = card_ref(drill.mode, card)
    for row in await _session_answers(session, drill):
        if _answer_ref(drill.mode, row) == ref:
            return feedback_from_answer(content, drill.mode, card, row)
    if drill.finished_at is not None:
        raise ApiError(409, "conflict", "This drill session has ended.")

    created = False
    if drill.mode == RECOGNITION:
        problem = content.problems_by_slug.get(ref)
        if problem is None:
            raise _gone()
        plan = parse_plan(content, body.answer)
        grade = grade_drill_plan(content, plan, problem)
        optimal = problem.optimal
        session.add(
            DrillAnswer(
                session_id=drill.id,
                user_id=user_id,
                mode=RECOGNITION,
                problem_slug=problem.slug,
                pattern_id=optimal.pattern_id if optimal is not None else problem.pattern_id,
                answer=plan.model_dump(mode="json", by_alias=True),
                grade=grade.model_dump(mode="json", by_alias=True),
                correct=grade.correct,
                seconds=body.seconds,
                overtime=body.overtime,
                created_at=now,
            )
        )
        if not grade.correct:
            created = await add_problem_review(session, user_id, problem.slug, now)
        feedback = _recognition_feedback(content, problem.slug, grade)
    else:
        toolkit = content.toolkit_by_id.get(ref)
        if toolkit is None:
            raise _gone()
        tool = parse_tool(body.answer)
        correct = tool_matches(tool.tool, toolkit.tool, toolkit.id)
        session.add(
            DrillAnswer(
                session_id=drill.id,
                user_id=user_id,
                mode=TOOLKIT,
                toolkit_id=toolkit.id,
                answer=tool.model_dump(mode="json", by_alias=True),
                grade={"correct": correct},
                correct=correct,
                seconds=body.seconds,
                overtime=body.overtime,
                created_at=now,
            )
        )
        due = await _due_toolkit_item(session, user_id, toolkit.id, now)
        if due is not None:  # dealt first because it was due: this answer is its review
            await apply_grade(
                session,
                due,
                toolkit_review_grade(correct),
                now,
                rng,
                answer=tool.model_dump(mode="json", by_alias=True),
                plan_grade=None,
                seconds=body.seconds,
            )
        elif not correct:
            created = await add_toolkit_review(session, user_id, toolkit.id, now, rng)
        feedback = _toolkit_feedback(toolkit, correct)

    if created:
        cards[index] = {**card, REVIEW_CREATED: True}
        drill.cards = cards
    await record_activity(session, user_id, now)
    await session.flush()
    return feedback


# ---------------------------------------------------------------- finishing


async def _set_add_missed(
    session: AsyncSession,
    drill: DrillSession,
    answers: dict[str, DrillAnswer],
    add: bool,
    now: datetime,
) -> None:
    """The end screen's toggle: off removes the review items this session's misses
    created (while never reviewed); on adds an item for each missed card that has none."""
    mode, kind = drill.mode, review_kind(drill.mode)
    cards = list(drill.cards)
    if add:
        for index, card in enumerate(cards):
            row = answers.get(card_ref(mode, card))
            if row is None or row.correct:
                continue
            if mode == RECOGNITION:
                slug = row.problem_slug or ""
                created = await add_problem_review(session, drill.user_id, slug, now)
            else:
                created = await add_toolkit_review(
                    session, drill.user_id, row.toolkit_id or "", now, reset=False
                )
            if created:
                cards[index] = {**card, REVIEW_CREATED: True}
    else:
        refs = [card_ref(mode, card) for card in cards if card.get(REVIEW_CREATED)]
        removed = set(await remove_unreviewed(session, drill.user_id, kind, refs))
        cards = [
            {k: v for k, v in card.items() if k != REVIEW_CREATED}
            if card_ref(mode, card) in removed
            else card
            for card in cards
        ]
    drill.cards = cards
    drill.add_missed = add


def _tally(answers: Sequence[DrillAnswer], field: str) -> FieldTally:
    graded = answers
    if field == "twist":  # optional in drills: only answers that had a twist count
        graded = [row for row in answers if str(row.answer.get("twist") or "").strip()]
    correct = sum(
        ((row.grade.get("fields") or {}).get(field) or {}).get("result") == "correct"
        for row in graded
    )
    return FieldTally(correct=correct, total=len(graded))


async def finish_session(
    session: AsyncSession,
    content: ContentStore,
    user_id: uuid.UUID,
    session_id: uuid.UUID,
    add_missed: bool | None,
    now: datetime,
) -> DrillSummary:
    """Finish the session (repeatable) and build its end screen."""
    drill = await owned_session(session, user_id, session_id, lock=True)
    if drill.finished_at is None:
        drill.finished_at = now
    mode: DrillMode = RECOGNITION if drill.mode == RECOGNITION else TOOLKIT
    rows = await _session_answers(session, drill)
    answers = {ref: row for row in rows if (ref := _answer_ref(mode, row)) is not None}
    if add_missed is not None:
        await _set_add_missed(session, drill, answers, add_missed, now)
    await session.flush()

    answered = [answers[ref] for card in drill.cards if (ref := card_ref(mode, card)) in answers]
    correct = sum(row.correct for row in answered)
    fields = None
    patterns: list[PatternTally] = []
    if mode == RECOGNITION:
        fields = FieldTallies(**{name: _tally(answered, name) for name in PLAN_FIELDS})
        by_pattern: dict[str, list[bool]] = defaultdict(list)
        for row in answered:
            problem = content.problems_by_slug.get(row.problem_slug or "")
            pattern_id = problem.pattern_id if problem is not None else row.pattern_id
            if pattern_id is not None:
                by_pattern[pattern_id].append(row.correct)
        for pattern in content.patterns:  # roadmap order
            results = by_pattern.get(pattern.id)
            if results:
                patterns.append(
                    PatternTally(
                        pattern_id=pattern.id,
                        pattern_name=pattern.name,
                        answered=len(results),
                        correct=sum(results),
                    )
                )

    missed_cards = [
        card
        for card in drill.cards
        if (answer := answers.get(card_ref(mode, card))) is not None and not answer.correct
    ]
    in_review = await existing_refs(
        session, user_id, review_kind(mode), [card_ref(mode, card) for card in missed_cards]
    )
    missed = []
    for card in missed_cards:
        ref = card_ref(mode, card)
        if mode == RECOGNITION:
            problem = content.problems_by_slug.get(ref)
            missed.append(
                DrillMiss(
                    card_id=card["id"],
                    slug=ref,
                    title=problem.title if problem is not None else None,
                    pattern_id=problem.pattern_id if problem is not None else None,
                    in_review=ref in in_review,
                )
            )
        else:
            toolkit = content.toolkit_by_id.get(ref)
            missed.append(
                DrillMiss(
                    card_id=card["id"],
                    toolkit_id=ref,
                    phrase=card.get("phrase"),
                    tool=toolkit.tool if toolkit is not None else None,
                    in_review=ref in in_review,
                )
            )

    return DrillSummary(
        session_id=drill.id,
        mode=mode,
        size=len(drill.cards),
        answered=len(answered),
        correct=correct,
        accuracy=round(correct / len(answered), 4) if answered else None,
        median_seconds=median_or_none(row.seconds for row in answered),
        overtime=sum(row.overtime for row in answered),
        fields=fields,
        patterns=patterns,
        missed=missed,
        add_missed_to_review=drill.add_missed,
        started_at=drill.started_at,
        finished_at=drill.finished_at,
    )

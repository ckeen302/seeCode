"""Attempts (Section 16.2, signed in): resume or create, sync, plan, hints, submit, end,
restart and predictions.

Only the owner sees an attempt (another user's id is 404). An attempt that is no longer
active refuses changes with 409 `conflict`; hint rungs open strictly in order (409
`rung_order`), and a rung's content is sent only once it is open.
"""

import uuid
from datetime import UTC, datetime

from fastapi import APIRouter

from app.auth import CurrentUser
from app.content.hints import hint_content
from app.db import DbSession
from app.errors import ApiError
from app.learning.outcomes import check_submission, counted_max_rung, next_rung, solved_outcome
from app.learning.plan_grading import MAX_PLAN_CHECKS, grade_plan
from app.routers.content import Content
from app.schemas.attempts import (
    AttemptCreate,
    AttemptPatch,
    AttemptView,
    EndRequest,
    EndResult,
    HintRequest,
    OkResult,
    PatchResult,
    PlanCheck,
    PlanCheckResult,
    PredictionsRequest,
    SubmitRequest,
    SubmitResult,
    results_json,
)
from app.schemas.hints import HintContent
from app.services.attempts import (
    ABANDONED,
    ACTIVE,
    abandon,
    attempt_ended,
    attempt_view,
    check_plan_ids,
    finish_attempt,
    opened_rungs,
    owned_attempt,
    require_active,
    start_attempt,
    workspace_problem,
    wrap_up,
)

router = APIRouter(prefix="/attempts", tags=["attempts"])

MAX_STORED_PREDICTIONS = 50


def _now() -> datetime:
    return datetime.now(UTC)


@router.post("")
async def create_or_resume_attempt(
    body: AttemptCreate, user: CurrentUser, session: DbSession, content: Content
) -> AttemptView:
    problem = workspace_problem(content, body.slug)
    attempt = await start_attempt(session, content, user.id, problem, _now())
    view = attempt_view(content, attempt)
    await session.commit()
    return view


@router.get("/{attempt_id}")
async def get_attempt(
    attempt_id: uuid.UUID, user: CurrentUser, session: DbSession, content: Content
) -> AttemptView:
    return attempt_view(content, await owned_attempt(session, user.id, attempt_id))


@router.patch("/{attempt_id}")
async def sync_attempt(
    attempt_id: uuid.UUID, body: AttemptPatch, user: CurrentUser, session: DbSession
) -> PatchResult:
    attempt = await owned_attempt(session, user.id, attempt_id, lock=True)
    require_active(attempt)
    if body.code is not None:
        attempt.code = body.code
    if body.active_seconds_delta:
        attempt.active_seconds += body.active_seconds_delta
    if body.runs_delta:
        attempt.runs += body.runs_delta
    if body.last_results is not None:
        attempt.last_results = results_json(body.last_results)
    if body.plan_skipped:
        attempt.plan_skipped = True
    now = _now()
    attempt.updated_at = now
    await session.commit()
    return PatchResult(updated_at=now)


@router.post("/{attempt_id}/plan")
async def check_plan(
    attempt_id: uuid.UUID,
    body: PlanCheck,
    user: CurrentUser,
    session: DbSession,
    content: Content,
) -> PlanCheckResult:
    attempt = await owned_attempt(session, user.id, attempt_id, lock=True)
    require_active(attempt)
    if attempt.plan_checks >= MAX_PLAN_CHECKS:
        raise ApiError(409, "plan_checks_exhausted", "All 3 plan checks of this attempt are used.")
    problem = workspace_problem(content, attempt.problem_slug)
    check_plan_ids(content, body.plan)
    check_number = attempt.plan_checks + 1
    grade = grade_plan(
        body.plan,
        problem,
        families=content.pattern_families,
        structure_labels=content.structure_labels,
        check_number=check_number,
        opened_rung=max(opened_rungs(attempt), default=0),
    )
    attempt.plan = body.plan.model_dump(mode="json", by_alias=True)
    attempt.plan_grade = grade.model_dump(mode="json", by_alias=True)
    attempt.plan_checks = check_number
    if attempt.runs == 0 and attempt.submits == 0:
        attempt.planned_first = True  # checked before the first Run (Section 7.3)
    if check_number == 1:
        attempt.plan_first_correct = grade.correct
    if grade.correct and attempt.plan_correct_seconds is None:
        attempt.plan_correct_seconds = attempt.active_seconds
    attempt.updated_at = _now()
    await session.commit()
    return PlanCheckResult(grade=grade, checks_left=MAX_PLAN_CHECKS - check_number)


@router.post("/{attempt_id}/hints")
async def open_hint(
    attempt_id: uuid.UUID,
    body: HintRequest,
    user: CurrentUser,
    session: DbSession,
    content: Content,
) -> HintContent:
    attempt = await owned_attempt(session, user.id, attempt_id, lock=True)
    problem = workspace_problem(content, attempt.problem_slug)
    opened = opened_rungs(attempt)
    if body.rung in opened:  # already open (a retry, or a free rung): nothing changes
        return hint_content(content, problem, body.rung)
    require_active(attempt)
    expected = next_rung(opened)
    if body.rung != expected:
        raise ApiError(409, "rung_order", f"Rungs open in order: open rung {expected} first.")
    now = _now()
    attempt.rungs_opened = [*attempt.rungs_opened, {"rung": body.rung, "at": now.isoformat()}]
    attempt.max_rung = counted_max_rung([*opened, body.rung], attempt.free_rungs)
    attempt.updated_at = now
    hint = hint_content(content, problem, body.rung)
    await session.commit()
    return hint


@router.post("/{attempt_id}/submit")
async def submit_attempt(
    attempt_id: uuid.UUID,
    body: SubmitRequest,
    user: CurrentUser,
    session: DbSession,
    content: Content,
) -> SubmitResult:
    attempt = await owned_attempt(session, user.id, attempt_id, lock=True)
    require_active(attempt)
    problem = workspace_problem(content, attempt.problem_slug)
    missing, passed = check_submission(
        [test.id for test in problem.tests or []],
        [(result.id, result.status) for result in body.results],
    )
    if missing:
        raise ApiError(
            422, "validation_error", f"results: no result for test {', '.join(missing)}."
        )
    now = _now()
    attempt.code = body.code
    attempt.last_results = results_json(body.results)
    attempt.submits += 1
    attempt.updated_at = now
    if not passed:
        await session.commit()
        return SubmitResult(passed=False)

    outcome = solved_outcome(attempt.max_rung)
    review = await finish_attempt(session, attempt, outcome, now)
    if review is None:  # every solved outcome schedules a review
        raise RuntimeError("a solved attempt must leave a review item")
    wrap = await wrap_up(session, content, attempt, problem, review)
    await session.commit()
    return SubmitResult(passed=True, outcome=outcome, wrap_up=wrap)


@router.post("/{attempt_id}/end")
async def end_attempt(
    attempt_id: uuid.UUID, body: EndRequest, user: CurrentUser, session: DbSession
) -> EndResult:
    attempt = await owned_attempt(session, user.id, attempt_id, lock=True)
    require_active(attempt)
    await finish_attempt(session, attempt, body.reason, _now())
    await session.commit()
    return EndResult(outcome=body.reason)


@router.post("/{attempt_id}/restart")
async def restart_attempt(
    attempt_id: uuid.UUID, user: CurrentUser, session: DbSession, content: Content
) -> AttemptView:
    """Start over (Section 7.9): an active attempt is abandoned and a new one starts; a
    finished attempt stays finished."""
    attempt = await owned_attempt(session, user.id, attempt_id, lock=True)
    problem = workspace_problem(content, attempt.problem_slug)
    now = _now()
    if attempt.status == ACTIVE:
        abandon(attempt, now)
        await session.flush()
    new_attempt = await start_attempt(session, content, user.id, problem, now)
    view = attempt_view(content, new_attempt)
    await session.commit()
    return view


@router.post("/{attempt_id}/predictions")
async def record_predictions(
    attempt_id: uuid.UUID, body: PredictionsRequest, user: CurrentUser, session: DbSession
) -> OkResult:
    """Predict-mode answers (Section 8.6). The first answer to each predict point counts;
    walkthroughs after a solve report to the finished attempt."""
    attempt = await owned_attempt(session, user.id, attempt_id, lock=True)
    if attempt.status == ABANDONED:
        raise attempt_ended()
    stored = list(attempt.predictions)
    known = {entry["id"] for entry in stored}
    for prediction in body.predictions:
        if prediction.id not in known and len(stored) < MAX_STORED_PREDICTIONS:
            stored.append({"id": prediction.id, "correct": prediction.correct})
            known.add(prediction.id)
    attempt.predictions = stored
    attempt.updated_at = _now()
    await session.commit()
    return OkResult()

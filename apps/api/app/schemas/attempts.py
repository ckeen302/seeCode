"""Attempt bodies (Sections 7, 16.2 and 16.3).

Beyond 16.3, `AttemptView` also carries `runs`, `plannedFirst`, `planSkipped`,
`startedAt` and `updatedAt`, which the Workspace needs to resume an attempt.
"""

import uuid
from datetime import datetime
from typing import Annotated, Any, Literal

from pydantic import AfterValidator, Field

from app.learning.mastery import ProblemStatus
from app.learning.outcomes import Outcome
from app.learning.plan_grading import MAX_PLAN_CHECKS
from app.schemas import CamelModel
from app.schemas.hints import HintContent
from app.schemas.plan import PlanCard, PlanGrade

MAX_CODE_BYTES = 50 * 1024  # Section 20
MAX_ACTIVE_SECONDS_DELTA = 24 * 60 * 60
MAX_RUNS_DELTA = 1000
MAX_RESULTS = 200
MAX_PREDICTIONS = 50
MAX_ID_CHARS = 100

AttemptStatus = Literal["active", "finished", "abandoned"]
TestStatus = Literal["pass", "fail", "error", "timeout"]


def _is_none(value: object) -> bool:
    return value is None


def _code_size(code: str) -> str:
    if len(code.encode()) > MAX_CODE_BYTES:
        raise ValueError("code must be at most 50 KB")
    return code


Code = Annotated[str, AfterValidator(_code_size)]


class TestResult(CamelModel):
    """A harness result (Section 9.2), stored exactly as the browser sent it."""

    __test__ = False  # not a pytest test class

    id: str = Field(min_length=1, max_length=MAX_ID_CHARS)
    status: TestStatus
    got: Any = None
    stdout: str | None = None
    error: str | None = None
    ms: float | None = None


def results_json(results: list[TestResult]) -> list[dict[str, Any]]:
    """Results as sent: keys the browser left out stay out, an explicit null stays."""
    return [result.model_dump(mode="json", by_alias=True, exclude_unset=True) for result in results]


class FadingView(CamelModel):
    given_pattern: str | None
    free_rungs: list[int]


class AttemptView(CamelModel):
    id: uuid.UUID
    slug: str
    status: AttemptStatus
    code: str
    plan: PlanCard | None
    plan_grade: PlanGrade | None
    checks_left: int
    max_rung: int
    opened_rungs: list[HintContent]  # content of the rungs already open, in rung order
    fading: FadingView
    last_results: list[dict[str, Any]] | None
    active_seconds: int
    outcome: Outcome | None
    runs: int
    planned_first: bool
    plan_skipped: bool
    started_at: datetime
    updated_at: datetime


class AttemptCreate(CamelModel):
    slug: str = Field(min_length=1, max_length=MAX_ID_CHARS)


class AttemptPatch(CamelModel):
    code: Code | None = None
    active_seconds_delta: int | None = Field(default=None, ge=0, le=MAX_ACTIVE_SECONDS_DELTA)
    runs_delta: int | None = Field(default=None, ge=0, le=MAX_RUNS_DELTA)
    last_results: list[TestResult] | None = Field(default=None, max_length=MAX_RESULTS)
    # The user dismissed the "Planning first helps it stick" tip with Skip (7.3).
    plan_skipped: bool | None = None


class PatchResult(CamelModel):
    ok: Literal[True] = True
    updated_at: datetime


class PlanCheck(CamelModel):
    plan: PlanCard


class PlanCheckResult(CamelModel):
    grade: PlanGrade
    checks_left: int = Field(ge=0, le=MAX_PLAN_CHECKS)


class HintRequest(CamelModel):
    rung: int = Field(ge=1, le=6)


class SubmitRequest(CamelModel):
    code: Code
    results: list[TestResult] = Field(max_length=MAX_RESULTS)


class RelatedProblem(CamelModel):
    slug: str
    title: str
    relation: str
    status: ProblemStatus


class WrapUp(CamelModel):
    pattern_id: str
    pattern_name: str
    twist: str
    max_rung: int
    plan_right_first_time: bool
    time_seconds: int
    related: list[RelatedProblem]
    next_review_at: datetime
    next_problem_slug: str | None


class SubmitResult(CamelModel):
    passed: bool
    outcome: Outcome | None = Field(default=None, exclude_if=_is_none)
    wrap_up: WrapUp | None = Field(default=None, exclude_if=_is_none)


class EndRequest(CamelModel):
    reason: Literal["gave_up"]


class EndResult(CamelModel):
    outcome: Outcome


class PredictionResult(CamelModel):
    id: str = Field(min_length=1, max_length=MAX_ID_CHARS)
    correct: bool


class PredictionsRequest(CamelModel):
    predictions: list[PredictionResult] = Field(max_length=MAX_PREDICTIONS)


class OkResult(CamelModel):
    ok: Literal[True] = True

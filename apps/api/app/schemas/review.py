"""Review bodies (Sections 6.7, 11.4, 11.5 and 16.2).

`ReviewCard` follows Section 16.3. The answer result adds what a drill's feedback shows
(the problem's `title` and `signals`, or a toolkit card's `tool` and `example`), since a
review gives feedback "exactly like a drill" (6.7).
"""

import uuid
from datetime import datetime
from typing import Any, Literal

from pydantic import Field

from app.learning.review import SelfRating
from app.learning.scheduling import Grade
from app.schemas import CamelModel
from app.schemas.drills import MAX_ANSWER_SECONDS, ProblemCard, ToolkitPrompt
from app.schemas.hints import SignalView
from app.schemas.plan import PlanGrade

ReviewKind = Literal["problem_plan", "toolkit"]


def _is_none(value: object) -> bool:
    return value is None


class ReviewCard(CamelModel):
    """A due item. `problem` (title hidden) for problem-plan items, `toolkit` for toolkit
    items. `resolve` items are reviewed by solving the problem again in the Workspace.
    Beyond 16.3, problem items carry `hasWorkspace`: false for a drill-only problem
    (missed in a drill), which has no Workspace page to re-solve it in."""

    item_id: uuid.UUID
    kind: ReviewKind
    resolve: bool
    problem: ProblemCard | None = Field(default=None, exclude_if=_is_none)
    has_workspace: bool | None = Field(default=None, exclude_if=_is_none)
    toolkit: ToolkitPrompt | None = Field(default=None, exclude_if=_is_none)


class ReviewAnswerRequest(CamelModel):
    # Problem plan: a PlanCard (twist optional). Toolkit: {"tool": "..."}.
    answer: dict[str, Any]
    seconds: float = Field(ge=0, le=MAX_ANSWER_SECONDS, allow_inf_nan=False)


class ReviewAnswerResult(CamelModel):
    """`grade` and `nextDueAt` are left out while `needsSelfRating` is true: the item is
    rescheduled by `POST /review/{itemId}/rate`."""

    plan_grade: PlanGrade | None = Field(default=None, exclude_if=_is_none)
    correct: bool
    needs_self_rating: bool
    grade: Grade | None = Field(default=None, exclude_if=_is_none)
    next_due_at: datetime | None = Field(default=None, exclude_if=_is_none)
    signals: list[SignalView] | None = Field(default=None, exclude_if=_is_none)
    title: str | None = Field(default=None, exclude_if=_is_none)
    tool: str | None = Field(default=None, exclude_if=_is_none)
    example: str | None = Field(default=None, exclude_if=_is_none)


class ReviewRateRequest(CamelModel):
    rating: SelfRating


class ReviewRateResult(CamelModel):
    grade: SelfRating
    next_due_at: datetime

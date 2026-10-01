"""Drill bodies (Sections 6.6, 11.7, 16.2 and 16.3).

`DrillCard` and `DrillFeedback` follow Section 16.3. A recognition card never carries
the problem's title, pattern or answers; the title, the signals and the graded plan
(with the reveal) come back only in the feedback. `DrillSummary` (the end screen) is not
defined in 16.3; its shape is described on the class.
"""

import uuid
from datetime import datetime
from typing import Annotated, Any, Literal

from pydantic import Field

from app.content.models import Complexity
from app.schemas import CamelModel
from app.schemas.hints import SignalView
from app.schemas.plan import PlanGrade

DrillMode = Literal["recognition", "toolkit"]
MAX_DRILL_CARDS = 30  # Section 6.6 offers 10, 20 or 30 cards
MAX_ANSWER_SECONDS = 24 * 60 * 60
MAX_CARD_ID_CHARS = 20
MAX_TOOL_CHARS = 100
MAX_PATTERN_ID_CHARS = 100


def _is_none(value: object) -> bool:
    return value is None


class ExampleCard(CamelModel):
    input: str
    output: str
    explanation: str | None = Field(default=None, exclude_if=_is_none)


class TargetsCard(CamelModel):
    time: Complexity
    space: Complexity


class ProblemCard(CamelModel):
    """A problem statement without its title: what recognition drills and plan reviews
    show (`ReviewCard.problem` in Section 16.3)."""

    slug: str
    summary: str
    examples: list[ExampleCard]
    constraints: list[str]
    targets: TargetsCard


class RecognitionCard(CamelModel):
    id: str
    mode: Literal["recognition"] = "recognition"
    slug: str
    summary: str
    examples: list[ExampleCard]
    constraints: list[str]
    targets: TargetsCard


class ToolkitPrompt(CamelModel):
    """A toolkit card as asked: one of its phrases and four tools to pick from."""

    toolkit_id: str
    phrase: str
    options: list[str]


class ToolkitDrillCard(CamelModel):
    id: str
    mode: Literal["toolkit"] = "toolkit"
    toolkit_id: str
    phrase: str
    options: list[str]


DrillCard = Annotated[RecognitionCard | ToolkitDrillCard, Field(discriminator="mode")]


class DrillSessionCreate(CamelModel):
    mode: DrillMode
    # A pattern id; it must be unlocked. Recognition: 70% of the cards come from it.
    # Toolkit: only cards tagged with it.
    pattern_filter: str | None = Field(default=None, max_length=MAX_PATTERN_ID_CHARS)
    size: int = Field(ge=1, le=MAX_DRILL_CARDS)


class DrillSessionView(CamelModel):
    session_id: uuid.UUID
    cards: list[DrillCard]


class DrillAnswerRequest(CamelModel):
    card_id: str = Field(min_length=1, max_length=MAX_CARD_ID_CHARS)
    # Recognition: a PlanCard (twist optional). Toolkit: {"tool": "..."}.
    answer: dict[str, Any]
    seconds: float = Field(ge=0, le=MAX_ANSWER_SECONDS, allow_inf_nan=False)
    overtime: bool = False


class ToolkitAnswer(CamelModel):
    """A toolkit answer: the tool as typed or picked (the tool, or the card's id)."""

    tool: str = Field(max_length=MAX_TOOL_CHARS)


class DrillFeedback(CamelModel):
    """Section 16.3. Recognition: `planGrade` (reveal always filled), `signals` and
    `title`. Toolkit: `tool` and `example`. Absent fields are left out."""

    correct: bool
    plan_grade: PlanGrade | None = Field(default=None, exclude_if=_is_none)
    signals: list[SignalView] | None = Field(default=None, exclude_if=_is_none)
    title: str | None = Field(default=None, exclude_if=_is_none)
    tool: str | None = Field(default=None, exclude_if=_is_none)
    example: str | None = Field(default=None, exclude_if=_is_none)


class DrillFinishRequest(CamelModel):
    """Optional body of `POST /drills/sessions/{id}/finish`. `addMissedToReview` is the
    end screen's toggle: false removes the review items this session's misses created,
    true (re)adds them; left out, nothing changes (missed cards are added as answered)."""

    add_missed_to_review: bool | None = None


class FieldTally(CamelModel):
    correct: int
    total: int


class FieldTallies(CamelModel):
    """Recognition accuracy by Plan card field; `twist` counts only answers that had a
    twist (it is optional in drills)."""

    pattern: FieldTally
    structures: FieldTally
    time: FieldTally
    space: FieldTally
    twist: FieldTally


class PatternTally(CamelModel):
    pattern_id: str
    pattern_name: str
    answered: int
    correct: int


class DrillMiss(CamelModel):
    """A missed card ("cards to review"). Recognition: slug, title, patternId. Toolkit:
    toolkitId, phrase, tool. `inReview`: a review item for it exists now."""

    card_id: str
    slug: str | None = Field(default=None, exclude_if=_is_none)
    title: str | None = Field(default=None, exclude_if=_is_none)
    pattern_id: str | None = Field(default=None, exclude_if=_is_none)
    toolkit_id: str | None = Field(default=None, exclude_if=_is_none)
    phrase: str | None = Field(default=None, exclude_if=_is_none)
    tool: str | None = Field(default=None, exclude_if=_is_none)
    in_review: bool


class DrillSummary(CamelModel):
    """The end screen (Section 6.6). `size` is the number of cards dealt; `accuracy` is
    correct / answered (null before any answer); `medianSeconds` is over answered cards;
    `overtime` counts answers past the 30 s timer. `fields` (accuracy by field) and
    `patterns` (results per pattern, roadmap order) are for recognition sessions; toolkit
    sessions get null and []. `missed` lists missed cards in session order."""

    session_id: uuid.UUID
    mode: DrillMode
    size: int
    answered: int
    correct: int
    accuracy: float | None
    median_seconds: float | None
    overtime: int
    fields: FieldTallies | None
    patterns: list[PatternTally]
    missed: list[DrillMiss]
    add_missed_to_review: bool
    started_at: datetime
    finished_at: datetime

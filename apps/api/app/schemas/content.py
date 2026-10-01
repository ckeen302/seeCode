"""Response bodies of the public content endpoints (Section 16.2).

`ProblemPublic` follows Section 16.3, plus `kind`, `io` and `checker`, which the browser
needs to run the tests (the harness's spec_json). The other views are not defined there;
their shapes are recorded in docs/DECISIONS.md. Answer fields a user may not see yet
(`patternId` in the problem list, `twist` on the pattern page) are left out of the
JSON entirely rather than sent as null. Per-user fields are null when signed out.
"""

from datetime import datetime
from typing import Any

from pydantic import Field

from app.content.models import (
    CompareMode,
    Complexity,
    Demo,
    Difficulty,
    Io,
    PatternSignal,
    ProblemKind,
    Slot,
    ToolkitCard,
    Variation,
)
from app.learning.mastery import PatternState, ProblemStatus
from app.schemas import CamelModel


def _is_none(value: object) -> bool:
    return value is None


class ExampleView(CamelModel):
    input: str
    output: str
    explanation: str | None = Field(default=None, exclude_if=_is_none)


class TargetsView(CamelModel):
    time: Complexity
    space: Complexity


class TestCaseView(CamelModel):
    """A function problem's test has `args`; a design problem's has `ops`, its calls."""

    __test__ = False  # not a pytest test class

    id: str
    args: list[Any] | None = Field(default=None, exclude_if=_is_none)
    ops: list[list[Any]] | None = Field(default=None, exclude_if=_is_none)
    expected: Any
    hidden: bool
    compare: CompareMode | None = Field(default=None, exclude_if=_is_none)


class ProblemPublic(CamelModel):
    """A Workspace problem without its answers: no approaches, signals, hints, solution,
    viz, constraintReading or related. Hidden tests are included (Section 9.3), and so
    are `io` and `checker` (left out when unset): the browser runs the tests."""

    slug: str
    title: str
    leetcode_url: str
    difficulty: Difficulty
    order: int
    summary: str
    examples: list[ExampleView]
    constraints: list[str]
    targets: TargetsView
    kind: ProblemKind
    entry: str
    io: Io | None = Field(default=None, exclude_if=_is_none)
    starter_code: str
    checker: str | None = Field(default=None, exclude_if=_is_none)
    tests: list[TestCaseView]
    content_version: str


class ProblemListItem(CamelModel):
    slug: str
    title: str
    difficulty: Difficulty
    order: int
    # Only when the user solved the problem or asked for ?showPatterns=true.
    pattern_id: str | None = Field(default=None, exclude_if=_is_none)
    status: ProblemStatus | None
    best_rung: int | None
    last_attempt_at: datetime | None


class PatternProgressView(CamelModel):
    solved: int
    mastered: int


class PatternSummary(CamelModel):
    id: str
    family: str
    name: str
    idea: str
    problem_count: int


class RoadmapNodeView(CamelModel):
    id: str
    name: str
    family: str
    x: int
    y: int
    prereqs: list[str]
    problem_count: int
    state: PatternState
    progress: PatternProgressView | None


class UnlockRuleView(CamelModel):
    solved_in_prereq: int


class RoadmapView(CamelModel):
    patterns: list[RoadmapNodeView]
    unlock_rule: UnlockRuleView


class PatternProblemView(CamelModel):
    slug: str
    title: str
    difficulty: Difficulty
    order: int
    status: ProblemStatus | None
    # The optimal approach's twist, only once the user solved the problem.
    twist: str | None = Field(default=None, exclude_if=_is_none)


class PatternView(CamelModel):
    id: str
    family: str
    name: str
    idea: str
    explanation: str
    signals: list[PatternSignal]
    template: str
    slots: list[Slot]
    variations: list[Variation]
    mistakes: list[str]
    demo: Demo
    toolkit: list[str]
    toolkit_cards: list[ToolkitCard]
    problem_count: int
    state: PatternState
    progress: PatternProgressView | None
    problems: list[PatternProblemView]

"""Hint ladder content (Sections 7.4 and 16.3), one model per rung.

Rung 3 also carries `reveal`, the optimal plan: from rung 3 on the Plan card shows the
reference values (7.3) even when the plan was never checked.
"""

from typing import Annotated, Any, Literal

from pydantic import Field

from app.content.models import Io, ProblemKind, ToolkitCard, VizConfig
from app.schemas import CamelModel
from app.schemas.plan import PlanReveal


def _is_none(value: object) -> bool:
    return value is None


def _is_function(value: object) -> bool:
    return value == "function"


class ClarifyHint(CamelModel):
    rung: Literal[1] = 1
    clarify: str


class SignalView(CamelModel):
    phrase: str
    meaning: str
    points_to: str


class SignalsHint(CamelModel):
    rung: Literal[2] = 2
    signals: list[SignalView]
    constraint_reading: str


class ApproachHint(CamelModel):
    rung: Literal[3] = 3
    pattern_id: str
    approach: str
    why_not: str
    reveal: PlanReveal


class SlotText(CamelModel):
    id: str
    label: str
    text: str


class PlanHint(CamelModel):
    rung: Literal[4] = 4
    pattern_id: str
    slots: list[SlotText]


class WalkthroughInput(CamelModel):
    """A visible test's `args`, or for a design problem its calls (`ops`)."""

    label: str
    args: list[Any] | None = Field(default=None, exclude_if=_is_none)
    ops: list[list[Any]] | None = Field(default=None, exclude_if=_is_none)


class WalkthroughPayload(CamelModel):
    """The reference solution (with its `# viz:` markers), its viz config and the inputs
    to trace: the problem's visible tests, labeled "Example 1", "Example 2", ...
    `kind` and `io` say how to run them, as for the tests (harness spec_json); both are
    left out when they are the default (a function problem with JSON arguments)."""

    code: str
    kind: ProblemKind = Field(default="function", exclude_if=_is_function)
    entry: str
    io: Io | None = Field(default=None, exclude_if=_is_none)
    viz: VizConfig
    inputs: list[WalkthroughInput]


class WalkthroughHint(CamelModel):
    rung: Literal[5] = 5
    walkthrough: WalkthroughPayload


class SolutionHint(CamelModel):
    rung: Literal[6] = 6
    code: str
    explanation: str
    toolkit: list[ToolkitCard]


HintContent = Annotated[
    ClarifyHint | SignalsHint | ApproachHint | PlanHint | WalkthroughHint | SolutionHint,
    Field(discriminator="rung"),
]

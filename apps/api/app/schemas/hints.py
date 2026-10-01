"""Hint ladder content (Sections 7.4 and 16.3), one model per rung.

Rung 3 also carries `reveal`, the optimal plan: from rung 3 on the Plan card shows the
reference values (7.3) even when the plan was never checked.
"""

from typing import Annotated, Any, Literal

from pydantic import Field

from app.content.models import ToolkitCard, VizConfig
from app.schemas import CamelModel
from app.schemas.plan import PlanReveal


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
    label: str
    args: list[Any]


class WalkthroughPayload(CamelModel):
    """The reference solution (with its `# viz:` markers), its viz config and the inputs
    to trace: the problem's visible tests, labeled "Example 1", "Example 2", ..."""

    code: str
    entry: str
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

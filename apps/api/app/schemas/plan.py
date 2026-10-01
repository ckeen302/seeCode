"""The Plan card and its grade (Sections 7.3, 11.1 and 16.3).

`PlanGrade` leaves out optional keys instead of sending null (`nudge`, `feedback`,
`note`, and `missing` while the answer is still hidden); `reveal` is always present and
null until the plan may be revealed.
"""

from typing import Literal

from pydantic import Field, ValidationInfo, field_validator

from app.content.models import Complexity
from app.schemas import CamelModel

# Section 16.3: the Plan card's complexity answers include "Not sure".
ComplexityAnswer = Literal["O(1)", "O(log n)", "O(n)", "O(n log n)", "O(n²)", "O(2ⁿ)", "Not sure"]
FieldResult = Literal["correct", "close", "wrong"]
TwistSource = Literal["keywords", "ai"]

MAX_STRUCTURES = 4
MAX_TWIST_CHARS = 140


def _is_none(value: object) -> bool:
    return value is None


class PlanCard(CamelModel):
    """What the user planned. `pattern` is a pattern id, "brute_force" or "not_sure"."""

    pattern: str | None = None
    structures: list[str] = Field(default_factory=list, max_length=MAX_STRUCTURES)
    time: ComplexityAnswer | None = None
    space: ComplexityAnswer | None = None
    twist: str = Field(default="", max_length=MAX_TWIST_CHARS)

    @field_validator("structures", "twist", mode="before")
    @classmethod
    def _null_is_empty(cls, value: object, info: ValidationInfo) -> object:
        if value is None:
            return [] if info.field_name == "structures" else ""
        return value

    @field_validator("structures")
    @classmethod
    def _unique_structures(cls, value: list[str]) -> list[str]:
        return list(dict.fromkeys(value))


class PatternFieldGrade(CamelModel):
    result: FieldResult
    nudge: str | None = Field(default=None, exclude_if=_is_none)


class StructuresFieldGrade(CamelModel):
    result: FieldResult
    # Missing ids would give the answer away, so they are sent only once the plan is
    # revealed (or when nothing is missing).
    missing: list[str] | None = Field(default=None, exclude_if=_is_none)
    extra: list[str]
    nudge: str | None = Field(default=None, exclude_if=_is_none)


class ComplexityFieldGrade(CamelModel):
    result: FieldResult
    nudge: str | None = Field(default=None, exclude_if=_is_none)


class TwistFieldGrade(CamelModel):
    result: FieldResult
    feedback: str | None = Field(default=None, exclude_if=_is_none)
    source: TwistSource


class PlanFields(CamelModel):
    pattern: PatternFieldGrade
    structures: StructuresFieldGrade
    time: ComplexityFieldGrade
    space: ComplexityFieldGrade
    twist: TwistFieldGrade


class PlanReveal(CamelModel):
    """The optimal approach, shown read-only in the Plan card."""

    pattern_id: str
    structures: list[str]
    time: Complexity
    space: Complexity
    twist: str


class PlanGrade(CamelModel):
    approach_id: str
    score: float
    correct: bool
    fields: PlanFields
    note: str | None = Field(default=None, exclude_if=_is_none)  # suboptimal approach note
    reveal: PlanReveal | None

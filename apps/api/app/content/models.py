"""Pydantic models for the content files (Sections 10 and 16.4).

JSON keys are camelCase only, unknown keys are errors, and values are validated
strictly (no "3" -> 3 coercion), so a typo in a content file fails validation.
Cross-file rules (references, markers, test counts) live in `validation.py`.
"""

from typing import Annotated, Any, Literal

from pydantic import AfterValidator, BaseModel, ConfigDict, Field, model_validator
from pydantic.alias_generators import to_camel

SlotId = Literal["setup", "loop", "update", "record", "return"]
# D1: every pattern has these five slots, in this order.
SLOT_IDS: tuple[SlotId, ...] = ("setup", "loop", "update", "record", "return")
BRUTE_FORCE = "brute_force"
OPTIMAL = "optimal"

Difficulty = Literal["easy", "medium", "hard"]
# Section 16.3 without "Not sure", which is a Plan card answer, never a content value. The
# values after O(2ⁿ) came with the NeetCode parity topics (docs/PARITY_PLAN.md 4.4).
Complexity = Literal[
    "O(1)",
    "O(log n)",
    "O(n)",
    "O(n log n)",
    "O(n²)",
    "O(2ⁿ)",
    "O(√n)",
    "O(n log k)",
    "O(k log n)",
    "O(n·m)",
    "O(V + E)",
    "O(E log V)",
    "O(n³)",
    "O(n·2ⁿ)",
    "O(n!)",
]
# "checker" calls the problem's `checker` code (PARITY_PLAN 4.3).
CompareMode = Literal["exact", "unordered", "unordered_nested", "float", "checker"]
# "function": tests call Solution().<entry>(*args). "design": `entry` is a class and each
# test is a list of calls (PARITY_PLAN 4.2).
ProblemKind = Literal["function", "design"]
# How the harness converts an argument or a result (PARITY_PLAN 4.1); see harness.py.
IoType = Literal[
    "json", "list_node", "list_node[]", "tree_node", "tree_node[]", "random_list", "graph_node"
]
# The io types that need LeetCode's Node class; the two Node classes differ.
NODE_IO_TYPES: tuple[IoType, ...] = ("random_list", "graph_node")
# A design call's argument {"$ref": i} passes what call i returned (round trips).
REF_KEY = "$ref"
PointerColor = Literal["a", "b", "c", "d"]
PredictKind = Literal["index", "yesno", "value"]


def _not_blank(value: str) -> str:
    if not value.strip():
        raise ValueError("must not be empty")
    return value


Text = Annotated[str, AfterValidator(_not_blank)]
# Pattern, structure, toolkit and approach ids.
Id = Annotated[str, Field(pattern=r"^[a-z][a-z0-9_]*$")]
Slug = Annotated[str, Field(pattern=r"^[a-z0-9]+(?:-[a-z0-9]+)*$")]
# Viz event ids and `# viz:<name>` marker names (the tracer's marker syntax).
MarkerName = Annotated[str, Field(pattern=r"^[A-Za-z0-9_]+$")]
TestId = Annotated[str, Field(pattern=r"^[A-Za-z0-9_-]+$")]
VarName = Annotated[str, Field(pattern=r"^[A-Za-z_][A-Za-z0-9_]*$")]
LeetcodeUrl = Annotated[str, Field(pattern=r"^https://leetcode\.com/problems/[a-z0-9-]+/?$")]


class ContentModel(BaseModel):
    model_config = ConfigDict(
        alias_generator=to_camel,
        extra="forbid",
        strict=True,
        frozen=True,
        serialize_by_alias=True,
    )


# ---------------------------------------------------------------- viz (Section 8.4)


class Pointer(ContentModel):
    var: VarName
    into: VarName
    label: Text
    color: PointerColor


class Window(ContentModel):
    into: VarName
    start: VarName
    end: VarName
    inclusive: bool = True


class Range(ContentModel):
    into: VarName
    lo: VarName
    hi: VarName
    mid: VarName | None = None


class Roles(ContentModel):
    stack: list[VarName] = Field(default_factory=list)
    queue: list[VarName] = Field(default_factory=list)
    hidden: list[VarName] = Field(default_factory=list)


class Confirmed(ContentModel):
    into: VarName
    outside: list[VarName] = Field(min_length=1)


class VizEvent(ContentModel):
    id: MarkerName
    at: MarkerName
    when: Text | None = None
    label: Text
    say: Text | None = None


class Predict(ContentModel):
    at_event: MarkerName
    occurrence: int = Field(default=1, ge=1)
    ask: Text
    var: VarName | None = None
    kind: PredictKind
    answer_when: Text | None = None

    @model_validator(mode="after")
    def _answer_source(self) -> "Predict":
        if self.kind in ("index", "value") and self.var is None:
            raise ValueError(f'kind "{self.kind}" needs "var"')
        if self.kind == "yesno" and self.answer_when is None:
            raise ValueError('kind "yesno" needs "answerWhen"')
        return self


class VizConfig(ContentModel):
    primary: VarName
    pointers: list[Pointer] = Field(default_factory=list)
    window: Window | None = None
    range: Range | None = None
    roles: Roles = Field(default_factory=Roles)
    confirmed: Confirmed | None = None
    events: list[VizEvent] = Field(default_factory=list)
    predict: list[Predict] = Field(default_factory=list)


# ---------------------------------------------------------------- patterns.json (10.2)


class PatternSignal(ContentModel):
    phrase: Text
    meaning: Text


class Slot(ContentModel):
    id: SlotId
    label: Text
    prompt: Text


class Variation(ContentModel):
    name: Text
    line: Text


class Demo(ContentModel):
    code: Text
    entry: VarName
    args: list[Any]
    viz: VizConfig


class Pattern(ContentModel):
    id: Id
    family: Id
    name: Text
    idea: Text
    explanation: Text
    signals: list[PatternSignal] = Field(min_length=1)
    template: Text
    slots: list[Slot]
    variations: list[Variation]
    mistakes: list[Text]
    demo: Demo
    toolkit: list[Id]


# ---------------------------------------------------------------- roadmap.json (10.3)


class RoadmapNode(ContentModel):
    id: Id
    x: int = Field(ge=0)
    y: int = Field(ge=0)
    prereqs: list[Id]


class UnlockRule(ContentModel):
    solved_in_prereq: int = Field(ge=1)


class Roadmap(ContentModel):
    patterns: list[RoadmapNode] = Field(min_length=1)
    unlock_rule: UnlockRule


# ---------------------------------------------------------------- structures.json, toolkit.json


class Structure(ContentModel):
    id: Id
    label: Text


class ToolkitCard(ContentModel):
    id: Id
    tool: Text
    phrases: list[Text] = Field(min_length=1)
    example: Text
    patterns: list[Id]


# ---------------------------------------------------------------- problems/<slug>.json (10.6)


class Example(ContentModel):
    input: Text
    output: Text
    explanation: Text | None = None


class Targets(ContentModel):
    time: Complexity
    space: Complexity


class Approach(ContentModel):
    id: Id
    pattern_id: Id
    structures: list[Id] = Field(min_length=1, max_length=4)  # a Plan card holds at most 4
    time: Complexity
    space: Complexity
    twist: Annotated[Text, Field(max_length=140)]  # the Plan card's twist limit (7.3)
    twist_keywords: list[Annotated[list[Text], Field(min_length=1)]] = Field(min_length=1)
    accepted_as: Literal["suboptimal"] | None = None
    note: Text | None = None

    @model_validator(mode="after")
    def _suboptimal_needs_note(self) -> "Approach":
        if self.accepted_as is not None and self.note is None:
            raise ValueError('"note" is required when "acceptedAs" is set')
        return self


class Signal(ContentModel):
    phrase: Text
    meaning: Text
    points_to: Text


class Hints(ContentModel):
    clarify: Text
    approach: Text
    why_not: Text
    slots: dict[str, Text]


class Solution(ContentModel):
    code: Text
    explanation: Text
    toolkit: list[Id]


def _valid_call(call: list[Any]) -> list[Any]:
    if not call or not isinstance(call[0], str) or not call[0].isidentifier():
        raise ValueError("a call is [name, ...args]: a class or method name, then its arguments")
    return call


# One call of a design test: ["MinStack"] constructs, ["push", 3] calls a method.
Call = Annotated[list[Any], AfterValidator(_valid_call)]


class TestCase(ContentModel):
    """Function problems give `args`; design problems give `ops` (a list of calls) and an
    `expected` value per call."""

    __test__ = False  # not a pytest test class

    id: TestId
    args: list[Any] | None = None
    ops: Annotated[list[Call], Field(min_length=1)] | None = None
    expected: Any
    hidden: bool
    compare: CompareMode | None = None

    @model_validator(mode="after")
    def _args_or_ops(self) -> "TestCase":
        if self.args is not None and self.ops is not None:
            raise ValueError('a test has "args" or "ops", not both')
        if self.args is None and self.ops is None:
            raise ValueError('"args" required ("ops" in a design problem)')
        return self


class IoParam(ContentModel):
    name: VarName
    type: IoType = "json"


class Io(ContentModel):
    """Typed parameters: how the harness builds each argument and reads the result."""

    params: list[IoParam] = Field(default_factory=list)
    returns: IoType = "json"
    in_place: VarName | None = None  # compare this parameter after the call instead


class Related(ContentModel):
    slug: Slug
    relation: Text


# Section 16.4: required unless the problem is drill-only.
WORKSPACE_FIELDS = ("entry", "starter_code", "tests", "solution", "hints", "viz")


class Problem(ContentModel):
    slug: Slug
    title: Text
    leetcode_url: LeetcodeUrl
    difficulty: Difficulty
    pattern_id: Id
    order: int = Field(ge=1)
    summary: Text
    examples: list[Example] = Field(min_length=1)
    constraints: list[Text] = Field(min_length=1)
    targets: Targets
    kind: ProblemKind = "function"
    entry: VarName | None = None
    io: Io | None = None
    starter_code: Text | None = None
    approaches: list[Approach] = Field(min_length=1, max_length=3)
    signals: list[Signal] = Field(min_length=1)
    constraint_reading: Text
    hints: Hints | None = None
    solution: Solution | None = None
    viz: VizConfig | None = None
    checker: Text | None = None  # Python code defining check(args, got) -> bool
    tests: list[TestCase] | None = None
    related: list[Related] = Field(default_factory=list)
    drill_only: bool = False

    @model_validator(mode="after")
    def _workspace_fields(self) -> "Problem":
        if not self.drill_only:
            missing = [to_camel(name) for name in WORKSPACE_FIELDS if getattr(self, name) is None]
            if missing:
                raise ValueError(f"{', '.join(missing)} required unless drillOnly is true")
        return self

    @property
    def optimal(self) -> Approach | None:
        return next((a for a in self.approaches if a.id == OPTIMAL), None)

    def harness_spec(self) -> dict[str, Any]:
        """The `spec_json` object the test harness takes for this problem (harness.py)."""
        return {
            "kind": self.kind,
            "io": None if self.io is None else self.io.model_dump(mode="json"),
            "checker": self.checker,
        }

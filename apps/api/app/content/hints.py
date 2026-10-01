"""What each hint rung shows (Sections 7.4 and 16.3), built from a problem's answer fields.

Nothing here decides who may see a rung: the attempt and guest routes do that.
"""

import re

from app.content.models import Problem
from app.content.store import ContentStore
from app.learning.plan_grading import plan_reveal
from app.schemas.hints import (
    ApproachHint,
    ClarifyHint,
    HintContent,
    PlanHint,
    SignalsHint,
    SignalView,
    SlotText,
    SolutionHint,
    WalkthroughHint,
    WalkthroughInput,
    WalkthroughPayload,
)

MIN_RUNG = 1
MAX_RUNG = 6
# A `# viz:<name>` marker at the end of a line (the tracer's syntax, Section 8.2).
_VIZ_MARKER = re.compile(r"[ \t]*#[ \t]*viz:[A-Za-z0-9_]+[ \t]*$", re.MULTILINE)


def strip_viz_markers(code: str) -> str:
    """The solution as rung 6 shows it: the walkthrough's `# viz:` comments removed."""
    return _VIZ_MARKER.sub("", code)


def _drill_only(problem: Problem) -> ValueError:
    return ValueError(f"{problem.slug} is drill-only: it has no hints or walkthrough")


def walkthrough_payload(problem: Problem) -> WalkthroughPayload:
    solution, viz, tests, entry = problem.solution, problem.viz, problem.tests, problem.entry
    if solution is None or viz is None or tests is None or entry is None:
        raise _drill_only(problem)
    visible = [test for test in tests if not test.hidden]
    return WalkthroughPayload(
        code=solution.code,
        kind=problem.kind,
        entry=entry,
        io=problem.io,
        viz=viz,
        inputs=[
            WalkthroughInput(label=f"Example {number}", args=test.args, ops=test.ops)
            for number, test in enumerate(visible, start=1)
        ],
    )


def hint_content(content: ContentStore, problem: Problem, rung: int) -> HintContent:
    """The content of hint rung `rung` (1-6) of a Workspace problem."""
    hints, solution = problem.hints, problem.solution
    if hints is None or solution is None:
        raise _drill_only(problem)
    if rung == 1:
        return ClarifyHint(clarify=hints.clarify)
    if rung == 2:
        return SignalsHint(
            signals=[
                SignalView(phrase=s.phrase, meaning=s.meaning, points_to=s.points_to)
                for s in problem.signals
            ],
            constraint_reading=problem.constraint_reading,
        )
    if rung == 3:
        return ApproachHint(
            pattern_id=problem.pattern_id,
            approach=hints.approach,
            why_not=hints.why_not,
            reveal=plan_reveal(problem),
        )
    if rung == 4:
        pattern = content.patterns_by_id[problem.pattern_id]
        return PlanHint(
            pattern_id=pattern.id,
            slots=[
                SlotText(id=slot.id, label=slot.label, text=hints.slots[slot.id])
                for slot in pattern.slots
                if slot.id in hints.slots
            ],
        )
    if rung == 5:
        return WalkthroughHint(walkthrough=walkthrough_payload(problem))
    if rung == 6:
        return SolutionHint(
            code=strip_viz_markers(solution.code),
            explanation=solution.explanation,
            toolkit=[
                content.toolkit_by_id[card_id]
                for card_id in solution.toolkit
                if card_id in content.toolkit_by_id
            ],
        )
    raise ValueError(f"hint rungs go from {MIN_RUNG} to {MAX_RUNG}, not {rung}")

"""Plan grading (Section 11.1). Pure functions, no I/O.

A plan is scored against every approach of the problem, field by field:

| field      | correct                                   | close                        |
|------------|-------------------------------------------|------------------------------|
| pattern    | same pattern                              | same family                  |
| structures | every structure present, at most 1 extra  | at least half present        |
| time/space | exact match                               | (none)                       |
| twist      | every keyword group matched               | at least one group matched   |

Anything else, "Not sure" and an empty twist are wrong. Field scores (correct 1, close
0.5, wrong 0) are weighted (pattern 0.35, structures 0.20, time 0.15, space 0.10, twist
0.20). The highest score picks the approach, ties going to the optimal one. A suboptimal
approach caps the pattern field at close and attaches its note; the reported score is
recomputed after the cap, so it always matches the fields shown. The plan is `correct`
when pattern and time are correct and the score is at least 0.8.

The twist is graded with keywords here: a group matches when any of its keywords appears
in the twist as a case-insensitive substring. The AI check (M7) may replace that result.
"""

import re
from collections.abc import Mapping, Sequence
from dataclasses import dataclass
from fractions import Fraction

from app.content.models import OPTIMAL, Approach, Problem
from app.schemas.plan import (
    ComplexityFieldGrade,
    FieldResult,
    PatternFieldGrade,
    PlanCard,
    PlanFields,
    PlanGrade,
    PlanReveal,
    StructuresFieldGrade,
    TwistFieldGrade,
)

FIELDS = ("pattern", "structures", "time", "space", "twist")
FIELD_POINTS: dict[FieldResult, Fraction] = {
    "correct": Fraction(1),
    "close": Fraction(1, 2),
    "wrong": Fraction(0),
}
WEIGHTS: dict[str, Fraction] = {
    "pattern": Fraction(35, 100),
    "structures": Fraction(20, 100),
    "time": Fraction(15, 100),
    "space": Fraction(10, 100),
    "twist": Fraction(20, 100),
}
CORRECT_MIN_SCORE = Fraction(4, 5)
SCORE_DECIMALS = 4

MAX_PLAN_CHECKS = 3  # per attempt (Section 7.3)
REVEAL_RUNG = 3  # the approach rung: from here on the plan is revealed and nudges stop

NOT_SURE_PATTERN = "not_sure"
NOT_SURE = "Not sure"
SUBOPTIMAL = "suboptimal"

NUDGE_PATTERN = "Look at the targets ({time}, {space}). Which approach reaches them?"
NUDGE_STRUCTURES_MISSING = (
    "You may be missing a structure. What do you need to look things up or remember?"
)
NUDGE_STRUCTURES_EXTRA = "Do you need everything you picked? Try it without {label}."
NUDGE_TIME = "Check the input size in the constraints. What does it allow?"
NUDGE_SPACE = "Check the space target in the problem."
NUDGE_TWIST = "Say what this problem does differently from the plain pattern."

_RANK: dict[FieldResult, int] = {"wrong": 0, "close": 1, "correct": 2}


# ---------------------------------------------------------------- one field at a time


def grade_pattern(answer: str | None, expected: str, families: Mapping[str, str]) -> FieldResult:
    """`families` maps pattern ids to their family; "brute_force" has none."""
    if answer is None or answer == NOT_SURE_PATTERN:
        return "wrong"
    if answer == expected:
        return "correct"
    family = families.get(answer)
    if family is not None and family == families.get(expected):
        return "close"
    return "wrong"


@dataclass(frozen=True, slots=True)
class StructuresMatch:
    result: FieldResult
    missing: list[str]  # the approach's structures the plan left out, in approach order
    extra: list[str]  # the plan's structures the approach does not use, in plan order


def grade_structures(answer: Sequence[str], expected: Sequence[str]) -> StructuresMatch:
    chosen = list(dict.fromkeys(answer))
    missing = [structure for structure in expected if structure not in chosen]
    extra = [structure for structure in chosen if structure not in expected]
    present = len(expected) - len(missing)
    result: FieldResult
    if not missing and len(extra) <= 1:
        result = "correct"
    elif expected and present * 2 >= len(expected):
        result = "close"
    else:
        result = "wrong"
    return StructuresMatch(result, missing, extra)


def grade_complexity(answer: str | None, expected: str) -> FieldResult:
    return "correct" if answer == expected and answer != NOT_SURE else "wrong"


def normalize_twist(twist: str) -> str:
    """Trimmed, with every run of whitespace collapsed to one space."""
    return " ".join(twist.split())


def keyword_in(keyword: str, text: str) -> bool:
    """Case-insensitive substring test, letter by letter (as signal phrases are matched)."""
    needle = normalize_twist(keyword)
    return bool(needle) and re.search(re.escape(needle), text, re.IGNORECASE) is not None


def twist_groups_matched(twist: str, groups: Sequence[Sequence[str]]) -> int:
    text = normalize_twist(twist)
    if not text:
        return 0
    return sum(any(keyword_in(keyword, text) for keyword in group) for group in groups)


def grade_twist(twist: str, groups: Sequence[Sequence[str]]) -> FieldResult:
    matched = twist_groups_matched(twist, groups)
    if groups and matched == len(groups):
        return "correct"
    return "close" if matched else "wrong"


# ---------------------------------------------------------------- scores and approaches


def plan_score(results: Mapping[str, FieldResult], count_twist: bool = True) -> Fraction:
    """Weighted score in [0, 1]. Without the twist, the other weights are renormalized."""
    fields = [name for name in FIELDS if count_twist or name != "twist"]
    total = sum((WEIGHTS[name] * FIELD_POINTS[results[name]] for name in fields), Fraction(0))
    return total / sum(WEIGHTS[name] for name in fields)


def is_correct(pattern: FieldResult, time: FieldResult, score: Fraction) -> bool:
    return pattern == "correct" and time == "correct" and score >= CORRECT_MIN_SCORE


def cap(result: FieldResult, limit: FieldResult) -> FieldResult:
    return result if _RANK[result] <= _RANK[limit] else limit


@dataclass(frozen=True, slots=True)
class ApproachMatch:
    approach: Approach
    structures: StructuresMatch
    results: Mapping[str, FieldResult]  # by field name
    score: Fraction


def match_approach(
    plan: PlanCard, approach: Approach, families: Mapping[str, str], count_twist: bool = True
) -> ApproachMatch:
    structures = grade_structures(plan.structures, approach.structures)
    results: dict[str, FieldResult] = {
        "pattern": grade_pattern(plan.pattern, approach.pattern_id, families),
        "structures": structures.result,
        "time": grade_complexity(plan.time, approach.time),
        "space": grade_complexity(plan.space, approach.space),
        "twist": grade_twist(plan.twist, approach.twist_keywords),
    }
    return ApproachMatch(approach, structures, results, plan_score(results, count_twist))


def choose_approach(matches: Sequence[ApproachMatch]) -> ApproachMatch:
    """Highest score; a tie goes to the optimal approach, then to the first listed."""
    if not matches:
        raise ValueError("a problem has at least one approach")
    return max(matches, key=lambda match: (match.score, match.approach.id == OPTIMAL))


def should_reveal(check_number: int, opened_rung: int, always_reveal: bool = False) -> bool:
    """Third check of the attempt, rung 3 or later open, or a drill/review answer."""
    return always_reveal or check_number >= MAX_PLAN_CHECKS or opened_rung >= REVEAL_RUNG


def optimal_approach(problem: Problem) -> Approach:
    optimal = problem.optimal
    if optimal is None:  # the validator guarantees one
        raise ValueError(f"{problem.slug} has no optimal approach")
    return optimal


def plan_reveal(problem: Problem) -> PlanReveal:
    optimal = optimal_approach(problem)
    return PlanReveal(
        pattern_id=optimal.pattern_id,
        structures=list(optimal.structures),
        time=optimal.time,
        space=optimal.space,
        twist=optimal.twist,
    )


# ---------------------------------------------------------------- the grade


def grade_plan(
    plan: PlanCard,
    problem: Problem,
    *,
    families: Mapping[str, str],
    structure_labels: Mapping[str, str],
    check_number: int = 1,
    opened_rung: int = 0,
    always_reveal: bool = False,
    twist_optional: bool = False,
) -> PlanGrade:
    """Grade `plan` against `problem` (Section 11.1).

    `families` maps pattern ids to their family and `structure_labels` structure ids to
    their labels. `check_number` is this check's number in the attempt (1-3) and
    `opened_rung` the highest hint rung open. Drills and reviews pass `always_reveal`;
    drills also pass `twist_optional`, which drops an empty twist from the score instead
    of counting it as wrong.
    """
    count_twist = not (twist_optional and not normalize_twist(plan.twist))
    chosen = choose_approach(
        [match_approach(plan, approach, families, count_twist) for approach in problem.approaches]
    )
    approach = chosen.approach
    suboptimal = approach.accepted_as == SUBOPTIMAL
    results = dict(chosen.results)
    if suboptimal:
        results["pattern"] = cap(results["pattern"], "close")
    score = plan_score(results, count_twist)

    revealed = should_reveal(check_number, opened_rung, always_reveal)
    nudges = opened_rung < REVEAL_RUNG

    def nudge(field: str, text: str | None) -> str | None:
        return text if nudges and results[field] != "correct" else None

    missing, extra = chosen.structures.missing, chosen.structures.extra
    structures_nudge: str | None = None
    if missing:
        structures_nudge = NUDGE_STRUCTURES_MISSING
    elif extra:
        label = structure_labels.get(extra[0], extra[0])
        structures_nudge = NUDGE_STRUCTURES_EXTRA.format(label=label)
    targets = problem.targets

    return PlanGrade(
        approach_id=approach.id,
        score=round(float(score), SCORE_DECIMALS),
        correct=is_correct(results["pattern"], results["time"], score),
        fields=PlanFields(
            pattern=PatternFieldGrade(
                result=results["pattern"],
                nudge=nudge(
                    "pattern", NUDGE_PATTERN.format(time=targets.time, space=targets.space)
                ),
            ),
            structures=StructuresFieldGrade(
                result=results["structures"],
                missing=list(missing) if revealed or not missing else None,
                extra=list(extra),
                nudge=nudge("structures", structures_nudge),
            ),
            time=ComplexityFieldGrade(result=results["time"], nudge=nudge("time", NUDGE_TIME)),
            space=ComplexityFieldGrade(result=results["space"], nudge=nudge("space", NUDGE_SPACE)),
            twist=TwistFieldGrade(
                result=results["twist"],
                # An optional twist left empty (drills) is not counted, so no nudge either.
                feedback=nudge("twist", NUDGE_TWIST) if count_twist else None,
                source="keywords",
            ),
        ),
        note=approach.note if suboptimal else None,
        reveal=plan_reveal(problem) if revealed else None,
    )

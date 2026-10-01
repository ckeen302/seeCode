"""Plan grading (Section 11.1): every field case, approach choice, the suboptimal cap,
nudges, reveal rules and the drills' optional twist."""

from fractions import Fraction
from typing import Any

import pytest

from app.content.models import Problem
from app.content.store import load_content
from app.learning.plan_grading import (
    FIELDS,
    NUDGE_PATTERN,
    NUDGE_SPACE,
    NUDGE_STRUCTURES_EXTRA,
    NUDGE_STRUCTURES_MISSING,
    NUDGE_TIME,
    NUDGE_TWIST,
    ApproachMatch,
    cap,
    choose_approach,
    grade_complexity,
    grade_pattern,
    grade_plan,
    grade_structures,
    grade_twist,
    is_correct,
    keyword_in,
    match_approach,
    optimal_approach,
    plan_score,
    should_reveal,
    twist_groups_matched,
)
from app.schemas.plan import FieldResult, PlanCard
from tests.conftest import REAL_CONTENT

FAMILIES = {
    "hashing": "hashing",
    "two_pointers_opposite": "two_pointers",
    "sliding_window": "two_pointers",
    "stack": "stack",
    "binary_search": "binary_search",
}
LABELS = {"array": "Array / string", "hash_map": "Hash map (dict)", "hash_set": "Hash set"}

OPTIMAL = {
    "id": "optimal",
    "patternId": "two_pointers_opposite",
    "structures": ["array"],
    "time": "O(n)",
    "space": "O(1)",
    "twist": "Skip characters that are not letters or digits.",
    "twistKeywords": [["skip", "ignore"], ["alnum", "letter", "digit"]],
}
CLEAN = {
    "id": "clean_reverse",
    "patternId": "brute_force",
    "structures": ["array"],
    "time": "O(n)",
    "space": "O(n)",
    "twist": "Build a cleaned copy and compare it with its reverse.",
    "twistKeywords": [["clean", "copy"], ["reverse"]],
    "acceptedAs": "suboptimal",
    "note": "Works, but the copy takes O(n) extra space.",
}


def make_problem(*approaches: dict[str, Any], time: str = "O(n)", space: str = "O(1)") -> Problem:
    return Problem.model_validate(
        {
            "slug": "mirror-check",
            "title": "Mirror Check",
            "leetcodeUrl": "https://leetcode.com/problems/mirror-check/",
            "difficulty": "easy",
            "patternId": approaches[0]["patternId"],
            "order": 101,
            "drillOnly": True,
            "summary": "Decide whether a string reads the same both ways.",
            "examples": [{"input": 's = "a"', "output": "true"}],
            "constraints": ["1 ≤ len(s) ≤ 10⁵"],
            "targets": {"time": time, "space": space},
            "approaches": list(approaches),
            "signals": [{"phrase": "string", "meaning": "m", "pointsTo": "two_pointers_opposite"}],
            "constraintReading": "Linear time is needed.",
        }
    )


PROBLEM = make_problem(OPTIMAL, CLEAN)


def plan(**fields: Any) -> PlanCard:
    return PlanCard.model_validate(fields)


def grade(card: PlanCard, problem: Problem = PROBLEM, **context: Any) -> dict[str, Any]:
    result = grade_plan(card, problem, families=FAMILIES, structure_labels=LABELS, **context)
    return result.model_dump(mode="json", by_alias=True)


OPTIMAL_PLAN = plan(
    pattern="two_pointers_opposite",
    structures=["array"],
    time="O(n)",
    space="O(1)",
    twist="Skip anything that is not a letter or digit",
)


# ---------------------------------------------------------------- pattern


@pytest.mark.parametrize(
    ("answer", "expected", "result"),
    [
        ("two_pointers_opposite", "two_pointers_opposite", "correct"),
        ("sliding_window", "two_pointers_opposite", "close"),  # same family
        ("hashing", "two_pointers_opposite", "wrong"),
        ("not_sure", "two_pointers_opposite", "wrong"),
        (None, "two_pointers_opposite", "wrong"),
        ("brute_force", "brute_force", "correct"),
        ("brute_force", "hashing", "wrong"),  # brute force has no family
        ("hashing", "brute_force", "wrong"),
        ("mystery", "two_pointers_opposite", "wrong"),
        ("not_sure", "not_sure", "wrong"),  # "Not sure" is never right
    ],
)
def test_pattern_field(answer: str | None, expected: str, result: str) -> None:
    assert grade_pattern(answer, expected, FAMILIES) == result


# ---------------------------------------------------------------- structures


@pytest.mark.parametrize(
    ("answer", "expected", "result", "missing", "extra"),
    [
        (["hash_map"], ["hash_map"], "correct", [], []),
        (["hash_map", "array"], ["hash_map"], "correct", [], ["array"]),  # one extra is fine
        (["array", "hash_map", "stack"], ["hash_map"], "close", [], ["array", "stack"]),
        (["hash_map"], ["hash_map", "counter"], "close", ["counter"], []),  # half present
        (["hash_map", "stack"], ["hash_map", "counter"], "close", ["counter"], ["stack"]),
        (["hash_map"], ["hash_map", "counter", "array"], "wrong", ["counter", "array"], []),
        (["hash_map", "counter"], ["hash_map", "counter", "array"], "close", ["array"], []),
        ([], ["array"], "wrong", ["array"], []),
        (["stack"], ["array"], "wrong", ["array"], ["stack"]),
        (["array", "array"], ["array"], "correct", [], []),  # duplicates count once
    ],
)
def test_structures_field(
    answer: list[str], expected: list[str], result: str, missing: list[str], extra: list[str]
) -> None:
    match = grade_structures(answer, expected)
    assert (match.result, match.missing, match.extra) == (result, missing, extra)


# ---------------------------------------------------------------- time and space


@pytest.mark.parametrize(
    ("answer", "expected", "result"),
    [
        ("O(n)", "O(n)", "correct"),
        ("O(n log n)", "O(n)", "wrong"),  # no "close" for complexities
        ("O(1)", "O(n)", "wrong"),
        ("Not sure", "O(n)", "wrong"),
        (None, "O(n)", "wrong"),
    ],
)
def test_complexity_fields(answer: str | None, expected: str, result: str) -> None:
    assert grade_complexity(answer, expected) == result


# ---------------------------------------------------------------- twist keywords

GROUPS = [["skip", "ignore"], ["alnum", "letter", "target \u2212"]]  # a minus sign


@pytest.mark.parametrize(
    ("twist", "result"),
    [
        ("Skip anything that is not a letter", "correct"),
        ("IGNORE NON-ALNUM CHARACTERS", "correct"),  # case-insensitive
        ("skipping non-letters", "correct"),  # substrings inside words count
        ("skip the spaces", "close"),
        ("compare letters in lowercase", "close"),
        ("use two pointers", "wrong"),
        ("", "wrong"),
        ("   \n\t ", "wrong"),
        ("look up target   \u2212   x after we skip it", "correct"),  # whitespace collapsed
    ],
)
def test_twist_field(twist: str, result: str) -> None:
    assert grade_twist(twist, GROUPS) == result


def test_twist_groups_matched_counts_each_group_once() -> None:
    assert twist_groups_matched("skip, ignore, skip", GROUPS) == 1
    assert twist_groups_matched("", GROUPS) == 0
    assert grade_twist("anything", []) == "wrong"


def test_keyword_match_is_literal() -> None:
    assert keyword_in("[::-1]", "compare with s[::-1]")
    assert not keyword_in("a.c", "abc")  # no regex meaning
    assert not keyword_in("   ", "anything")


# ---------------------------------------------------------------- score and correct


def _results(result: FieldResult, **fields: FieldResult) -> dict[str, FieldResult]:
    """Every field set to `result`, except those given."""
    return {**dict.fromkeys(FIELDS, result), **fields}


def test_weights_and_field_points() -> None:
    assert plan_score(_results("correct")) == 1
    assert plan_score(_results("wrong")) == 0
    for name, weight in [
        ("pattern", Fraction(35, 100)),
        ("structures", Fraction(20, 100)),
        ("time", Fraction(15, 100)),
        ("space", Fraction(10, 100)),
        ("twist", Fraction(20, 100)),
    ]:
        correct: FieldResult = "correct"
        close: FieldResult = "close"
        assert plan_score(_results("wrong", **{name: correct})) == weight
        assert plan_score(_results("wrong", **{name: close})) == weight / 2


def test_score_without_the_twist_is_renormalized() -> None:
    results = _results("correct", space="wrong", twist="wrong")
    assert plan_score(results) == Fraction(70, 100)
    assert plan_score(results, count_twist=False) == Fraction(70, 80)


@pytest.mark.parametrize(
    ("pattern", "time", "score", "correct"),
    [
        ("correct", "correct", Fraction(4, 5), True),
        ("correct", "correct", Fraction(79, 100), False),
        ("close", "correct", Fraction(1), False),
        ("correct", "wrong", Fraction(1), False),
    ],
)
def test_correct_needs_pattern_time_and_score(
    pattern: FieldResult, time: FieldResult, score: Fraction, correct: bool
) -> None:
    assert is_correct(pattern, time, score) is correct


def test_cap() -> None:
    assert cap("correct", "close") == "close"
    assert cap("close", "close") == "close"
    assert cap("wrong", "close") == "wrong"


# ---------------------------------------------------------------- the whole grade


def test_spec_example_scores_by_its_formula() -> None:
    """Sections 11.1 and 16.5: space wrong and twist close give 0.80 (11.1 prints 0.85)."""
    result = grade(
        plan(
            pattern="two_pointers_opposite",
            structures=["array"],
            time="O(n)",
            space="O(n)",
            twist="skip punctuation and spaces",
        )
    )
    assert result == {
        "approachId": "optimal",
        "score": 0.8,
        "correct": True,
        "fields": {
            "pattern": {"result": "correct"},
            "structures": {"result": "correct", "missing": [], "extra": []},
            "time": {"result": "correct"},
            "space": {"result": "wrong", "nudge": NUDGE_SPACE},
            "twist": {"result": "close", "feedback": NUDGE_TWIST, "source": "keywords"},
        },
        "reveal": None,
    }


def test_perfect_plan() -> None:
    result = grade(OPTIMAL_PLAN)
    assert result["approachId"] == "optimal"
    assert result["score"] == 1.0
    assert result["correct"] is True
    assert result["fields"] == {
        "pattern": {"result": "correct"},
        "structures": {"result": "correct", "missing": [], "extra": []},
        "time": {"result": "correct"},
        "space": {"result": "correct"},
        "twist": {"result": "correct", "source": "keywords"},
    }
    assert "note" not in result


def test_every_wrong_field_gets_its_nudge() -> None:
    result = grade(
        plan(pattern="hashing", structures=["hash_map"], time="O(n²)", space="Not sure", twist="x")
    )
    fields = result["fields"]
    assert result["score"] == 0.0
    assert result["correct"] is False
    assert fields["pattern"] == {
        "result": "wrong",
        "nudge": NUDGE_PATTERN.format(time="O(n)", space="O(1)"),
    }
    assert (
        fields["pattern"]["nudge"]
        == "Look at the targets (O(n), O(1)). Which approach reaches them?"
    )
    assert fields["structures"] == {
        "result": "wrong",
        "extra": ["hash_map"],
        "nudge": NUDGE_STRUCTURES_MISSING,
    }
    assert fields["time"] == {"result": "wrong", "nudge": NUDGE_TIME}
    assert fields["space"] == {"result": "wrong", "nudge": NUDGE_SPACE}
    assert fields["twist"] == {"result": "wrong", "feedback": NUDGE_TWIST, "source": "keywords"}


def test_close_fields_get_nudges_too() -> None:
    result = grade(
        plan(
            pattern="sliding_window",  # same family as two pointers
            structures=["array", "hash_map", "hash_set"],  # two extras
            time="O(n)",
            space="O(1)",
            twist="skip things",
        )
    )
    fields = result["fields"]
    assert fields["pattern"]["result"] == "close"
    assert "nudge" in fields["pattern"]
    assert fields["structures"] == {
        "result": "close",
        "missing": [],
        "extra": ["hash_map", "hash_set"],
        "nudge": NUDGE_STRUCTURES_EXTRA.format(label="Hash map (dict)"),
    }
    assert fields["twist"]["result"] == "close"
    # 0.175 + 0.1 + 0.15 + 0.1 + 0.1
    assert result["score"] == 0.625
    assert result["correct"] is False


def test_extra_structure_without_a_label_is_named_by_id() -> None:
    result = grade(plan(pattern="brute_force", structures=["array", "stack", "queue"], time="O(n)"))
    assert (
        result["fields"]["structures"]["nudge"]
        == "Do you need everything you picked? Try it without stack."
    )


def test_suboptimal_approach_caps_the_pattern_and_adds_its_note() -> None:
    result = grade(
        plan(
            pattern="brute_force",
            structures=["array"],
            time="O(n)",
            space="O(n)",
            twist="Make a clean copy and compare with its reverse",
        )
    )
    assert result["approachId"] == "clean_reverse"
    assert result["fields"]["pattern"]["result"] == "close"
    assert "nudge" in result["fields"]["pattern"]
    assert result["note"] == CLEAN["note"]
    assert result["score"] == 0.825  # recomputed after the cap: 1 - 0.35 / 2
    assert result["correct"] is False  # a suboptimal plan is never correct


def test_tie_prefers_the_optimal_approach() -> None:
    # 0.2 (structures) + 0.15 (time) on both approaches.
    result = grade(plan(pattern="not_sure", structures=["array"], time="O(n)"))
    assert result["approachId"] == "optimal"
    assert "note" not in result
    assert result["score"] == 0.35


def test_tie_between_other_approaches_goes_to_the_first_listed() -> None:
    problem = make_problem(
        {**OPTIMAL, "patternId": "hashing", "structures": ["hash_map"], "space": "O(n)"},
        {**CLEAN, "id": "first_alt", "structures": ["array"]},
        {**CLEAN, "id": "second_alt", "structures": ["sorted"]},
        space="O(n)",
    )
    matches = [
        match_approach(plan(structures=["array", "sorted"]), approach, FAMILIES)
        for approach in problem.approaches
    ]
    assert [m.score for m in matches] == [0, Fraction(1, 5), Fraction(1, 5)]
    assert choose_approach(matches).approach.id == "first_alt"
    assert grade(plan(structures=["array", "sorted"]), problem)["approachId"] == "first_alt"


def test_choose_approach_needs_an_approach() -> None:
    with pytest.raises(ValueError, match="at least one approach"):
        choose_approach([])


def test_highest_score_wins_even_against_the_optimal_approach() -> None:
    matches: list[ApproachMatch] = [
        match_approach(OPTIMAL_PLAN, approach, FAMILIES) for approach in PROBLEM.approaches
    ]
    assert choose_approach(matches).approach.id == "optimal"
    brute = plan(pattern="brute_force", space="O(n)", twist="reverse a clean copy")
    assert grade(brute)["approachId"] == "clean_reverse"


# ---------------------------------------------------------------- reveal and nudges


@pytest.mark.parametrize(
    ("check_number", "opened_rung", "always", "revealed"),
    [
        (1, 0, False, False),
        (2, 2, False, False),
        (3, 0, False, True),  # third check
        (1, 3, False, True),  # rung 3 open
        (2, 6, False, True),
        (1, 0, True, True),  # drills and reviews
    ],
)
def test_reveal_rules(check_number: int, opened_rung: int, always: bool, revealed: bool) -> None:
    assert should_reveal(check_number, opened_rung, always) is revealed
    result = grade(
        plan(pattern="hashing", time="O(n)"),
        check_number=check_number,
        opened_rung=opened_rung,
        always_reveal=always,
    )
    expected = {
        "patternId": "two_pointers_opposite",
        "structures": ["array"],
        "time": "O(n)",
        "space": "O(1)",
        "twist": OPTIMAL["twist"],
    }
    assert result["reveal"] == (expected if revealed else None)


def test_reveal_is_the_optimal_approach_even_for_a_suboptimal_match() -> None:
    result = grade(plan(pattern="brute_force", space="O(n)", twist="reverse"), check_number=3)
    assert result["approachId"] == "clean_reverse"
    assert result["reveal"]["patternId"] == "two_pointers_opposite"


def test_missing_structures_are_withheld_until_the_reveal() -> None:
    hidden = grade(plan(pattern="two_pointers_opposite", time="O(n)"))
    assert hidden["fields"]["structures"] == {
        "result": "wrong",
        "extra": [],
        "nudge": NUDGE_STRUCTURES_MISSING,
    }
    shown = grade(plan(pattern="two_pointers_opposite", time="O(n)"), check_number=3)
    assert shown["fields"]["structures"]["missing"] == ["array"]


def test_nudges_stop_once_rung_3_is_open() -> None:
    result = grade(plan(pattern="hashing", structures=["stack"], time="O(1)"), opened_rung=3)
    fields = result["fields"]
    assert all("nudge" not in fields[name] for name in ("pattern", "structures", "time", "space"))
    assert "feedback" not in fields["twist"]
    assert fields["structures"]["missing"] == ["array"]  # revealed
    assert result["reveal"] is not None


# ---------------------------------------------------------------- drills: optional twist


def test_optional_empty_twist_is_left_out_of_the_score() -> None:
    card = plan(pattern="two_pointers_opposite", structures=["array"], time="O(n)", space="O(n)")
    counted = grade(card)
    assert counted["score"] == 0.7  # the empty twist counts as wrong
    assert counted["correct"] is False
    assert counted["fields"]["twist"]["feedback"] == NUDGE_TWIST

    optional = grade(card, twist_optional=True, always_reveal=True)
    assert optional["score"] == 0.875  # 0.7 / 0.8
    assert optional["correct"] is True
    assert optional["fields"]["twist"] == {"result": "wrong", "source": "keywords"}


def test_optional_twist_still_counts_when_written() -> None:
    card = plan(
        pattern="two_pointers_opposite",
        structures=["array"],
        time="O(n)",
        space="O(n)",
        twist="use two pointers",
    )
    assert grade(card, twist_optional=True)["score"] == 0.7


def test_perfect_plan_without_twist_in_a_drill() -> None:
    card = plan(pattern="two_pointers_opposite", structures=["array"], time="O(n)", space="O(1)")
    assert grade(card, twist_optional=True)["score"] == 1.0


# ---------------------------------------------------------------- plan card input


def test_plan_card_defaults_and_duplicates() -> None:
    card = PlanCard.model_validate({"structures": ["array", "array", "stack"]})
    assert card.structures == ["array", "stack"]
    assert (card.pattern, card.time, card.space, card.twist) == (None, None, None, "")
    nulls = PlanCard.model_validate({"pattern": None, "structures": None, "twist": None})
    assert (nulls.structures, nulls.twist) == ([], "")


def test_optimal_approach_is_required() -> None:
    problem = make_problem({**OPTIMAL, "id": "best"})
    with pytest.raises(ValueError, match="no optimal approach"):
        optimal_approach(problem)


# ---------------------------------------------------------------- the real content


def _approach_plan(approach: Any) -> PlanCard:
    # Built without validation: one reference twist is longer than a Plan card allows.
    return PlanCard.model_construct(
        pattern=approach.pattern_id,
        structures=list(approach.structures),
        time=approach.time,
        space=approach.space,
        twist=approach.twist,
    )


def test_every_real_approach_grades_as_itself() -> None:
    """A full-credit approach's own plan grades correct with 1.0; a suboptimal one's plan
    picks that approach, is capped to 0.825 and never grades correct."""
    content = load_content(REAL_CONTENT)
    for problem in content.problems_by_slug.values():
        for approach in problem.approaches:
            result = grade_plan(
                _approach_plan(approach),
                problem,
                families=content.pattern_families,
                structure_labels=content.structure_labels,
            )
            where = f"{problem.slug}/{approach.id}"
            if approach.accepted_as is None:  # full credit (a tie may pick the optimal one)
                assert (result.correct, result.score) == (True, 1.0), where
            else:
                assert (result.approach_id, result.correct, result.score) == (
                    approach.id,
                    False,
                    0.825,
                ), where


def test_real_valid_palindrome_matches_the_spec_example() -> None:
    content = load_content(REAL_CONTENT)
    result = grade_plan(
        plan(
            pattern="two_pointers_opposite",
            structures=["array"],
            time="O(n)",
            space="O(n)",
            twist="skip punctuation and spaces",
        ),
        content.problems_by_slug["valid-palindrome"],
        families=content.pattern_families,
        structure_labels=content.structure_labels,
    )
    assert (result.approach_id, result.score, result.correct) == ("optimal", 0.8, True)
    assert result.fields.space.result == "wrong"
    assert result.fields.twist.result == "close"

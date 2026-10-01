"""Hint ladder content (Sections 7.4 and 16.3), built from the real content."""

from typing import Any

import pytest
from pydantic import BaseModel

from app.content.hints import hint_content, strip_viz_markers, walkthrough_payload
from app.content.store import ContentStore, load_content
from tests.conftest import REAL_CONTENT


@pytest.fixture(scope="module")
def content() -> ContentStore:
    return load_content(REAL_CONTENT)


def _dump(value: BaseModel) -> Any:
    return value.model_dump(mode="json", by_alias=True)


def test_rung_1_is_the_clarify_text(content: ContentStore) -> None:
    problem = content.problems_by_slug["valid-palindrome"]
    assert problem.hints is not None
    assert _dump(hint_content(content, problem, 1)) == {
        "rung": 1,
        "clarify": problem.hints.clarify,
    }


def test_rung_2_lists_signals_and_the_constraint_reading(content: ContentStore) -> None:
    problem = content.problems_by_slug["two-sum"]
    body = _dump(hint_content(content, problem, 2))
    assert body["rung"] == 2
    assert body["constraintReading"] == problem.constraint_reading
    assert body["signals"] == [
        {"phrase": s.phrase, "meaning": s.meaning, "pointsTo": s.points_to} for s in problem.signals
    ]


def test_rung_3_gives_the_approach_and_reveals_the_plan(content: ContentStore) -> None:
    problem = content.problems_by_slug["binary-search"]
    assert problem.hints is not None
    assert problem.optimal is not None
    body = _dump(hint_content(content, problem, 3))
    assert body == {
        "rung": 3,
        "patternId": "binary_search",
        "approach": problem.hints.approach,
        "whyNot": problem.hints.why_not,
        "reveal": {
            "patternId": "binary_search",
            "structures": list(problem.optimal.structures),
            "time": problem.optimal.time,
            "space": problem.optimal.space,
            "twist": problem.optimal.twist,
        },
    }


def test_rung_4_fills_the_pattern_slots_in_order(content: ContentStore) -> None:
    problem = content.problems_by_slug["valid-anagram"]
    assert problem.hints is not None
    pattern = content.patterns_by_id["hashing"]
    body = _dump(hint_content(content, problem, 4))
    assert body == {
        "rung": 4,
        "patternId": "hashing",
        "slots": [
            {"id": slot.id, "label": slot.label, "text": problem.hints.slots[slot.id]}
            for slot in pattern.slots
        ],
    }
    assert [slot["id"] for slot in body["slots"]] == [
        "setup",
        "loop",
        "update",
        "record",
        "return",
    ]


def test_rung_5_is_the_walkthrough_on_the_visible_tests(content: ContentStore) -> None:
    problem = content.problems_by_slug["valid-palindrome"]
    assert problem.solution is not None
    assert problem.tests is not None
    body = _dump(hint_content(content, problem, 5))
    walkthrough = body["walkthrough"]
    assert body["rung"] == 5
    assert walkthrough["code"] == problem.solution.code
    assert "# viz:" in walkthrough["code"]  # the tracer needs the markers
    assert walkthrough["entry"] == "isPalindrome"
    visible = [t for t in problem.tests if not t.hidden]
    assert walkthrough["inputs"] == [
        {"label": f"Example {n}", "args": t.args} for n, t in enumerate(visible, start=1)
    ]
    viz = walkthrough["viz"]
    assert set(viz) == {
        "primary",
        "pointers",
        "window",
        "range",
        "roles",
        "confirmed",
        "events",
        "predict",
    }
    assert viz["pointers"][0]["var"] == "l"
    assert walkthrough_payload(problem).model_dump(mode="json", by_alias=True) == walkthrough


def test_rung_6_is_the_solution_without_viz_markers(content: ContentStore) -> None:
    problem = content.problems_by_slug["valid-palindrome"]
    assert problem.solution is not None
    body = _dump(hint_content(content, problem, 6))
    assert body["rung"] == 6
    assert "viz:" not in body["code"]
    assert body["code"] == strip_viz_markers(problem.solution.code)
    assert "l += 1\n" in body["code"]
    assert body["explanation"] == problem.solution.explanation
    assert [card["id"] for card in body["toolkit"]] == ["isalnum", "lower"]
    assert set(body["toolkit"][0]) == {"id", "tool", "phrases", "example", "patterns"}


def test_strip_viz_markers() -> None:
    code = "x = 1  # viz:start\nif x:  #viz:check \n    y = '# viz:keep in text'\n"
    assert strip_viz_markers(code) == "x = 1\nif x:\n    y = '# viz:keep in text'\n"


def test_every_rung_of_every_workspace_problem_builds(content: ContentStore) -> None:
    for problem in content.problems:
        for rung in range(1, 7):
            assert hint_content(content, problem, rung).rung == rung


def test_drill_only_problems_have_no_ladder(content: ContentStore) -> None:
    problem = content.problems_by_slug["reverse-string"]
    assert problem.drill_only
    with pytest.raises(ValueError, match="drill-only"):
        hint_content(content, problem, 1)
    with pytest.raises(ValueError, match="drill-only"):
        walkthrough_payload(problem)


@pytest.mark.parametrize("rung", [0, 7])
def test_rungs_go_from_1_to_6(content: ContentStore, rung: int) -> None:
    with pytest.raises(ValueError, match="from 1 to 6"):
        hint_content(content, content.problems_by_slug["two-sum"], rung)


def test_walkthrough_of_a_function_problem_gives_args(content: ContentStore) -> None:
    body = _dump(walkthrough_payload(content.problems_by_slug["two-sum"]))
    # kind "function" and an absent io are the defaults, so the payload is as before.
    assert set(body) == {"code", "entry", "viz", "inputs"}
    assert all(set(item) == {"label", "args"} for item in body["inputs"])


def test_walkthrough_of_a_design_problem_gives_its_calls(content: ContentStore) -> None:
    problem = content.problems_by_slug["min-stack"]
    assert problem.tests is not None
    body = _dump(hint_content(content, problem, 5))["walkthrough"]
    assert (body["kind"], body["entry"]) == ("design", "MinStack")
    assert "io" not in body
    visible = [t for t in problem.tests if not t.hidden]
    assert body["inputs"] == [
        {"label": f"Example {n}", "ops": t.ops} for n, t in enumerate(visible, start=1)
    ]
    assert body["viz"]["roles"]["stack"] == ["vals", "mins"]

"""Content models (Sections 10 and 16.4): camelCase only, unknown keys and coercion refused."""

from typing import Any

import pytest
from pydantic import TypeAdapter, ValidationError

from app.content.models import (
    Approach,
    Pattern,
    Predict,
    Problem,
    Roadmap,
    Structure,
    TestCase,
    ToolkitCard,
    VizConfig,
)
from tests.conftest import fixture_documents

PROBLEMS = ("two-sum", "valid-anagram", "valid-palindrome", "binary-search", "reverse-string")


def _problem(slug: str = "valid-palindrome") -> dict[str, Any]:
    document: dict[str, Any] = fixture_documents()[f"problems/{slug}.json"]
    return document


def _errors(model: Any, data: Any) -> list[tuple[str, str]]:
    """(location, message) of every validation error."""
    adapter = model if isinstance(model, TypeAdapter) else TypeAdapter(model)
    with pytest.raises(ValidationError) as caught:
        adapter.validate_python(data)
    return [
        (".".join(str(part) for part in error["loc"]), error["msg"])
        for error in caught.value.errors()
    ]


# ---------------------------------------------------------------- valid content


def test_fixture_files_match_the_models() -> None:
    documents = fixture_documents()
    patterns = TypeAdapter(list[Pattern]).validate_python(documents["patterns.json"])
    roadmap = Roadmap.model_validate(documents["roadmap.json"])
    structures = TypeAdapter(list[Structure]).validate_python(documents["structures.json"])
    toolkit = TypeAdapter(list[ToolkitCard]).validate_python(documents["toolkit.json"])
    problems = [Problem.model_validate(documents[f"problems/{slug}.json"]) for slug in PROBLEMS]
    assert [p.id for p in patterns] == ["hashing", "two_pointers_opposite", "binary_search"]
    assert roadmap.unlock_rule.solved_in_prereq == 2
    assert len(structures) == 12
    assert {card.id for card in toolkit} >= {"lower", "isalnum"}
    assert [p.drill_only for p in problems] == [False, False, False, False, True]


def test_problem_fields_use_python_names_and_dump_as_camel_case() -> None:
    problem = Problem.model_validate(_problem())
    assert problem.leetcode_url == "https://leetcode.com/problems/valid-palindrome/"
    assert problem.starter_code is not None
    assert problem.drill_only is False
    assert problem.optimal is not None
    assert problem.optimal.id == "optimal"
    dumped = problem.model_dump(mode="json")
    assert {"leetcodeUrl", "starterCode", "constraintReading", "drillOnly"} <= set(dumped)
    assert "leetcode_url" not in dumped
    assert Problem.model_validate(dumped) == problem


def test_viz_config_defaults_when_keys_are_left_out() -> None:
    viz = VizConfig.model_validate({"primary": "nums"})
    assert viz.pointers == []
    assert viz.events == []
    assert viz.predict == []
    assert viz.window is None
    assert viz.range is None
    assert viz.confirmed is None
    assert viz.roles.stack == []
    assert viz.roles.queue == []
    assert viz.roles.hidden == []


@pytest.mark.parametrize("complexity", ["O(1)", "O(log n)", "O(n)", "O(n log n)", "O(n²)", "O(2ⁿ)"])
def test_every_section_16_3_complexity_is_accepted(complexity: str) -> None:
    data = _problem()
    data["targets"]["time"] = complexity
    assert Problem.model_validate(data).targets.time == complexity


@pytest.mark.parametrize("mode", ["exact", "unordered", "unordered_nested", "float"])
def test_every_compare_mode_is_accepted(mode: str) -> None:
    test = {"id": "t1", "args": [1], "expected": None, "hidden": False, "compare": mode}
    assert TestCase.model_validate(test).compare == mode


def test_expected_may_be_null_but_not_missing() -> None:
    assert TestCase.model_validate({"id": "a", "args": [], "expected": None, "hidden": True})
    errors = _errors(TestCase, {"id": "a", "args": [], "hidden": True})
    assert errors == [("expected", "Field required")]


# ---------------------------------------------------------------- drill-only problems


def test_drill_only_problem_needs_no_workspace_fields() -> None:
    problem = Problem.model_validate(_problem("reverse-string"))
    assert problem.drill_only
    assert problem.tests is None
    assert problem.solution is None
    assert problem.hints is None
    assert problem.viz is None
    assert problem.starter_code is None
    assert problem.entry is None


def test_workspace_problem_requires_workspace_fields() -> None:
    data = _problem()
    for key in ("tests", "solution", "hints", "viz", "starterCode", "entry"):
        del data[key]
    [(location, message)] = _errors(Problem, data)
    assert location == ""
    assert message == (
        "Value error, entry, starterCode, tests, solution, hints, viz required unless "
        "drillOnly is true"
    )


def test_drill_only_defaults_to_false() -> None:
    data = _problem()
    data.pop("drillOnly", None)
    assert Problem.model_validate(data).drill_only is False


# ---------------------------------------------------------------- keys


def test_unknown_keys_are_errors() -> None:
    data = _problem()
    data["hint"] = "typo for hints"
    data["approaches"][0]["complexity"] = "O(n)"
    errors = _errors(Problem, data)
    assert ("hint", "Extra inputs are not permitted") in errors
    assert ("approaches.0.complexity", "Extra inputs are not permitted") in errors


def test_snake_case_keys_are_not_accepted() -> None:
    data = _problem()
    data["leetcode_url"] = data.pop("leetcodeUrl")
    errors = _errors(Problem, data)
    assert ("leetcodeUrl", "Field required") in errors
    assert ("leetcode_url", "Extra inputs are not permitted") in errors


# ---------------------------------------------------------------- strict values


@pytest.mark.parametrize(
    ("change", "location"),
    [
        (lambda d: d.update(order="4"), "order"),
        (lambda d: d.update(order=0), "order"),
        (lambda d: d.update(difficulty="Easy"), "difficulty"),
        (lambda d: d["targets"].update(time="O(n^2)"), "targets.time"),
        (lambda d: d["targets"].update(space="Not sure"), "targets.space"),
        (lambda d: d["tests"][0].update(hidden=0), "tests.0.hidden"),
        (lambda d: d["tests"][0].update(compare="sorted"), "tests.0.compare"),
        (lambda d: d["viz"]["pointers"][0].update(color="e"), "viz.pointers.0.color"),
        (lambda d: d["viz"]["predict"][0].update(kind="choice"), "viz.predict.0.kind"),
        (lambda d: d["viz"]["events"][0].update(at="skip l"), "viz.events.0.at"),
        (lambda d: d.update(slug="Valid_Palindrome"), "slug"),
        (lambda d: d.update(leetcodeUrl="https://example.com/valid-palindrome"), "leetcodeUrl"),
        (lambda d: d.update(title="   "), "title"),
        (lambda d: d.update(examples=[]), "examples"),
        (lambda d: d.update(signals=[]), "signals"),
        (lambda d: d["approaches"][0].update(structures=["a", "b", "c", "d", "e"]), "approaches.0"),
        (lambda d: d["approaches"][0].update(twistKeywords=[[]]), "approaches.0.twistKeywords.0"),
    ],
)
def test_invalid_values_are_rejected(change: Any, location: str) -> None:
    data = _problem()
    change(data)
    assert any(loc.startswith(location) for loc, _ in _errors(Problem, data))


def test_approaches_are_limited_to_three() -> None:
    data = _problem()
    data["approaches"] = data["approaches"] * 2
    assert _errors(Problem, data)[0][0] == "approaches"


def test_twist_fits_the_plan_card() -> None:
    approach = _problem()["approaches"][0]
    approach["twist"] = "x" * 140
    assert Approach.model_validate(approach).twist == "x" * 140
    approach["twist"] = "x" * 141
    assert _errors(Approach, approach)[0][0] == "twist"


def test_suboptimal_approach_needs_a_note() -> None:
    approach = _problem()["approaches"][1]
    del approach["note"]
    assert _errors(Approach, approach) == [
        ("", 'Value error, "note" is required when "acceptedAs" is set')
    ]
    approach["acceptedAs"] = "fine"
    assert _errors(Approach, approach)[0][0] == "acceptedAs"


def test_predict_needs_the_field_its_kind_answers_with() -> None:
    base = {"atEvent": "compare", "ask": "Next?"}
    assert _errors(Predict, {**base, "kind": "index"}) == [
        ("", 'Value error, kind "index" needs "var"')
    ]
    assert _errors(Predict, {**base, "kind": "value"}) == [
        ("", 'Value error, kind "value" needs "var"')
    ]
    assert _errors(Predict, {**base, "kind": "yesno"}) == [
        ("", 'Value error, kind "yesno" needs "answerWhen"')
    ]
    assert Predict.model_validate({**base, "kind": "index", "var": "l"}).occurrence == 1


def test_pattern_slot_ids_are_the_five_fixed_ids() -> None:
    pattern = fixture_documents()["patterns.json"][0]
    pattern["slots"][0]["id"] = "init"
    assert _errors(Pattern, pattern)[0][0] == "slots.0.id"

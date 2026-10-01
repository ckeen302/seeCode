"""Content store: loading, indexes and public views (no database)."""

from datetime import UTC, datetime
from pathlib import Path
from typing import Any

import pytest

from app.content.store import (
    ContentError,
    ContentStore,
    UserProblem,
    compute_content_version,
    load_content,
)
from tests.conftest import FIXTURE_CONTENT, fixture_documents, write_documents
from tests.engine_fixtures import with_engine_problems

PROBLEM_PUBLIC_KEYS = {
    "slug",
    "title",
    "leetcodeUrl",
    "difficulty",
    "order",
    "summary",
    "examples",
    "constraints",
    "targets",
    "kind",
    "entry",
    "starterCode",
    "tests",
    "contentVersion",
}


@pytest.fixture(scope="module")
def store() -> ContentStore:
    return load_content(FIXTURE_CONTENT)


# ---------------------------------------------------------------- loading


def test_version_is_the_content_folder_hash(store: ContentStore) -> None:
    assert store.version == compute_content_version(FIXTURE_CONTENT)
    assert len(store.version) == 12


def test_errors_stop_loading_with_every_error_listed(tmp_path: Path) -> None:
    documents = fixture_documents()
    documents["problems/two-sum.json"]["patternId"] = "nope"
    del documents["problems/binary-search.json"]["tests"][0]
    with pytest.raises(ContentError) as caught:
        load_content(write_documents(tmp_path, documents))
    error = caught.value
    assert len(error.errors) == 2
    message = str(error)
    assert message.startswith(f"Content in {tmp_path} has 2 error(s); the API will not start")
    assert "error: problems/two-sum.json: patternId: unknown pattern id 'nope'" in message
    assert "error: problems/binary-search.json: tests: needs at least 2 visible" in message


def test_missing_folder_stops_loading(tmp_path: Path) -> None:
    with pytest.raises(ContentError, match="content folder not found"):
        load_content(tmp_path / "missing")


def test_empty_folder_stops_loading(tmp_path: Path) -> None:
    with pytest.raises(ContentError, match=r"patterns\.json: missing required file"):
        load_content(tmp_path)


def test_warnings_are_kept(tmp_path: Path) -> None:
    documents = fixture_documents()
    documents["problems/two-sum.json"]["summary"] += " More words." * 40
    store = load_content(write_documents(tmp_path, documents))
    assert [(w.level, w.file, w.path) for w in store.warnings] == [
        ("warning", "problems/two-sum.json", "summary")
    ]


# ---------------------------------------------------------------- indexes


def test_patterns_are_in_roadmap_order(tmp_path: Path) -> None:
    documents = fixture_documents()
    documents["patterns.json"].reverse()
    store = load_content(write_documents(tmp_path, documents))
    assert [p.id for p in store.patterns] == ["hashing", "two_pointers_opposite", "binary_search"]
    assert list(store.patterns_by_id) == ["hashing", "two_pointers_opposite", "binary_search"]


def test_problem_indexes(store: ContentStore) -> None:
    assert list(store.problems_by_slug) == [
        "two-sum",
        "valid-anagram",
        "valid-palindrome",
        "binary-search",
        "reverse-string",
    ]
    assert [p.slug for p in store.problems] == [
        "two-sum",
        "valid-anagram",
        "valid-palindrome",
        "binary-search",
    ]
    assert {k: [p.slug for p in v] for k, v in store.problems_by_pattern.items()} == {
        "hashing": ["two-sum", "valid-anagram"],
        "two_pointers_opposite": ["valid-palindrome"],
        "binary_search": ["binary-search"],
    }
    assert [p.slug for p in store.all_problems_by_pattern["two_pointers_opposite"]] == [
        "valid-palindrome",
        "reverse-string",
    ]


def test_problems_per_pattern_follow_order(tmp_path: Path) -> None:
    documents = fixture_documents()
    documents["problems/two-sum.json"]["order"] = 3
    store = load_content(write_documents(tmp_path, documents))
    assert [p.slug for p in store.problems_by_pattern["hashing"]] == ["valid-anagram", "two-sum"]


def test_lookup_indexes(store: ContentStore) -> None:
    assert store.toolkit_by_id["lower"].tool == ".lower()"
    assert store.structures_by_id["hash_map"].label == "Hash map (dict)"
    assert len(store.structures) == 12
    assert store.workspace_problem("two-sum") is store.problems_by_slug["two-sum"]
    assert store.workspace_problem("reverse-string") is None
    assert store.workspace_problem("nope") is None


def test_toolkit_for_a_pattern_joins_listed_and_tagged_cards(store: ContentStore) -> None:
    pattern = store.patterns_by_id["hashing"]
    assert [card.id for card in store.toolkit_for_pattern(pattern)] == [
        "enumerate",
        "set_ops",
        "counter",
    ]


# ---------------------------------------------------------------- ProblemPublic


def test_problem_public_has_exactly_the_public_fields(store: ContentStore) -> None:
    problem = store.problem_public("valid-palindrome")
    assert problem is not None
    body = problem.model_dump(mode="json", by_alias=True)
    assert set(body) == PROBLEM_PUBLIC_KEYS
    assert body["contentVersion"] == store.version
    assert body["targets"] == {"time": "O(n)", "space": "O(1)"}
    assert len(body["tests"]) == 6
    assert sum(test["hidden"] for test in body["tests"]) == 4


def test_problem_public_leaves_out_unset_optional_keys(store: ContentStore) -> None:
    body = store.problem_public("two-sum")
    assert body is not None
    dumped = body.model_dump(mode="json", by_alias=True)
    assert dumped["examples"][0]["explanation"] == "nums[2] + nums[3] is 2 + 8 = 10."
    assert set(dumped["examples"][1]) == {"input", "output"}
    assert dumped["tests"][0]["compare"] == "unordered"
    palindrome = store.problem_public("valid-palindrome")
    assert palindrome is not None
    assert set(palindrome.model_dump(mode="json", by_alias=True)["tests"][0]) == {
        "id",
        "args",
        "expected",
        "hidden",
    }


def test_problem_public_is_a_function_problem_by_default(store: ContentStore) -> None:
    body = store.problem_public("two-sum")
    assert body is not None
    dumped = body.model_dump(mode="json", by_alias=True)
    assert dumped["kind"] == "function"
    assert "io" not in dumped
    assert "checker" not in dumped
    assert all("ops" not in test for test in dumped["tests"])


@pytest.fixture(scope="module")
def engine_store(tmp_path_factory: pytest.TempPathFactory) -> ContentStore:
    root = tmp_path_factory.mktemp("engine")
    return load_content(write_documents(root, with_engine_problems(fixture_documents())))


def _public(store: ContentStore, slug: str) -> Any:
    problem = store.problem_public(slug)
    assert problem is not None
    return problem.model_dump(mode="json", by_alias=True)


def test_problem_public_carries_io_with_every_key(engine_store: ContentStore) -> None:
    body = _public(engine_store, "rotate-image")
    assert set(body) == PROBLEM_PUBLIC_KEYS | {"io"}
    assert body["io"] == {
        "params": [{"name": "matrix", "type": "json"}],
        "returns": "json",
        "inPlace": "matrix",
    }
    assert _public(engine_store, "merge-k-sorted-lists")["io"] == {
        "params": [{"name": "lists", "type": "list_node[]"}],
        "returns": "list_node",
        "inPlace": None,
    }


def test_problem_public_of_a_design_problem_has_calls(engine_store: ContentStore) -> None:
    body = _public(engine_store, "min-stack")
    assert (body["kind"], body["entry"]) == ("design", "MinStack")
    assert body["starterCode"].startswith("class MinStack:")
    assert body["tests"][0] == {
        "id": "e1",
        "ops": [["MinStack"], ["push", 3], ["push", 1], ["getMin"], ["pop"], ["top"]],
        "expected": [None, None, None, 1, None, 3],
        "hidden": False,
    }


def test_problem_public_carries_the_checker(engine_store: ContentStore) -> None:
    body = _public(engine_store, "encode-and-decode-strings")
    assert set(body) == PROBLEM_PUBLIC_KEYS | {"checker"}
    assert body["checker"].startswith("def check(args, got):")
    assert body["tests"][0]["compare"] == "checker"
    assert body["tests"][0]["ops"][2] == ["decode", {"$ref": 1}]
    # What the harness needs, and nothing that answers the problem.
    for key in ("approaches", "signals", "hints", "solution", "viz", "constraintReading"):
        assert key not in body


def test_no_public_view_for_drill_only_or_unknown_problems(store: ContentStore) -> None:
    assert store.problem_public("reverse-string") is None
    assert store.problem_public("nope") is None


# ---------------------------------------------------------------- problem list


def test_problem_list_signed_out_hides_patterns(store: ContentStore) -> None:
    items = [item.model_dump(mode="json", by_alias=True) for item in store.problem_list(None)]
    assert [item["slug"] for item in items] == [
        "two-sum",
        "valid-anagram",
        "valid-palindrome",
        "binary-search",
    ]
    assert items[0] == {
        "slug": "two-sum",
        "title": "Two Sum",
        "difficulty": "easy",
        "order": 1,
        "status": None,
        "bestRung": None,
        "lastAttemptAt": None,
    }


def test_problem_list_show_patterns(store: ContentStore) -> None:
    items = store.problem_list(None, show_patterns=True)
    assert [item.pattern_id for item in items] == [
        "hashing",
        "hashing",
        "two_pointers_opposite",
        "binary_search",
    ]


def test_problem_list_shows_patterns_of_solved_problems_only(store: ContentStore) -> None:
    when = datetime(2026, 9, 1, tzinfo=UTC)
    progress = {
        "two-sum": UserProblem("solved", best_rung=2, last_attempt_at=when),
        "valid-anagram": UserProblem("attempted", last_attempt_at=when),
        "binary-search": UserProblem("mastered", best_rung=0),
    }
    items = {item.slug: item for item in store.problem_list(progress)}
    assert {slug: item.pattern_id for slug, item in items.items()} == {
        "two-sum": "hashing",
        "valid-anagram": None,
        "valid-palindrome": None,
        "binary-search": "binary_search",
    }
    assert {slug: item.status for slug, item in items.items()} == {
        "two-sum": "solved",
        "valid-anagram": "attempted",
        "valid-palindrome": "new",
        "binary-search": "mastered",
    }
    assert items["two-sum"].best_rung == 2
    assert items["two-sum"].last_attempt_at == when
    assert "patternId" not in items["valid-anagram"].model_dump(mode="json", by_alias=True)


# ---------------------------------------------------------------- roadmap and pattern views


def test_roadmap_signed_out(store: ContentStore) -> None:
    view = store.roadmap_view(None).model_dump(mode="json", by_alias=True)
    assert view["unlockRule"] == {"solvedInPrereq": 2}
    assert view["patterns"][1] == {
        "id": "two_pointers_opposite",
        "name": "Two pointers (opposite ends)",
        "family": "two_pointers",
        "x": 1,
        "y": 0,
        "prereqs": ["hashing"],
        "problemCount": 1,
        "state": "available",
        "progress": None,
    }
    assert {node["state"] for node in view["patterns"]} == {"available"}


def test_roadmap_signed_in(store: ContentStore) -> None:
    fresh = store.roadmap_view({})
    assert [(n.state, n.progress) for n in fresh.patterns] == [
        ("available", fresh.patterns[0].progress),
        ("locked", fresh.patterns[1].progress),
        ("locked", fresh.patterns[2].progress),
    ]
    assert fresh.patterns[0].progress is not None
    assert fresh.patterns[0].progress.model_dump() == {"solved": 0, "mastered": 0}

    progress = {"two-sum": UserProblem("mastered"), "valid-anagram": UserProblem("mastered")}
    view = store.roadmap_view(progress)
    assert [n.state for n in view.patterns] == ["mastered", "available", "locked"]
    assert view.patterns[0].progress is not None
    assert view.patterns[0].progress.model_dump() == {"solved": 2, "mastered": 2}


def test_pattern_summaries(store: ContentStore) -> None:
    first = store.pattern_summaries()[0]
    assert first.model_dump(mode="json", by_alias=True) == {
        "id": "hashing",
        "family": "hashing",
        "name": "Hash map and counting",
        "idea": "Remember what you have already seen in a dict or set, so every lookup takes O(1).",
        "problemCount": 2,
    }


def test_pattern_view_signed_out(store: ContentStore) -> None:
    view = store.pattern_view("hashing", None)
    assert view is not None
    body = view.model_dump(mode="json", by_alias=True)
    assert body["state"] == "available"
    assert body["progress"] is None
    assert body["problemCount"] == 2
    assert [card["id"] for card in body["toolkitCards"]] == ["enumerate", "set_ops", "counter"]
    assert body["demo"]["entry"] == "demo"
    assert [slot["id"] for slot in body["slots"]] == ["setup", "loop", "update", "record", "return"]
    assert body["problems"] == [
        {"slug": "two-sum", "title": "Two Sum", "difficulty": "easy", "order": 1, "status": None},
        {
            "slug": "valid-anagram",
            "title": "Valid Anagram",
            "difficulty": "easy",
            "order": 2,
            "status": None,
        },
    ]


def test_pattern_view_shows_the_twist_of_solved_problems(store: ContentStore) -> None:
    view = store.pattern_view("hashing", {"two-sum": UserProblem("solved")})
    assert view is not None
    assert view.state == "in_progress"
    assert view.progress is not None
    assert view.progress.solved == 1
    two_sum, anagram = view.problems
    assert two_sum.twist == "Store each value's index; before storing x, look up target minus x."
    assert anagram.twist is None
    assert anagram.status == "new"
    assert "twist" not in anagram.model_dump(mode="json", by_alias=True)


def test_pattern_view_leaves_out_drill_only_problems(store: ContentStore) -> None:
    view = store.pattern_view("two_pointers_opposite", None)
    assert view is not None
    assert [p.slug for p in view.problems] == ["valid-palindrome"]


def test_unknown_pattern_has_no_view(store: ContentStore) -> None:
    assert store.pattern_view("stack", None) is None

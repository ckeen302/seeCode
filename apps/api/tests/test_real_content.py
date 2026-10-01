"""The real content/ folder (M1 acceptance): it validates, and the API serves it without answers.

The other tests load tests/fixtures/content so they do not break while authors edit
content/; these check the content that actually ships.
"""

import json
import subprocess
import sys
from collections.abc import AsyncIterator
from typing import Any

import pytest
from httpx import ASGITransport, AsyncClient

from app.config import REPO_ROOT
from app.content.validation import read_content_files, validate_content_dir
from app.main import create_app
from tests.conftest import make_settings

REAL_CONTENT = REPO_ROOT / "content"
SCRIPT = REPO_ROOT / "scripts" / "validate_content.py"
FORMAT_SCRIPT = REPO_ROOT / "scripts" / "format_content.py"
API = "/api/v1/content"
M1_PROBLEMS = ("two-sum", "valid-palindrome", "binary-search")
ANSWER_KEYS = ("approaches", "signals", "hints", "solution", "viz")
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


def _problems() -> dict[str, dict[str, Any]]:
    """Every problem file in content/, parsed, by slug."""
    return {
        name.removeprefix("problems/").removesuffix(".json"): json.loads(raw)
        for name, raw in read_content_files(REAL_CONTENT).items()
        if name.startswith("problems/")
    }


def _strings(value: Any) -> list[str]:
    """Every string in a parsed JSON value, keys included."""
    if isinstance(value, str):
        return [value]
    if isinstance(value, list):
        return [text for item in value for text in _strings(item)]
    if isinstance(value, dict):
        return [text for key, item in value.items() for text in [key, *_strings(item)]]
    return []


def _workspace_slugs() -> list[str]:
    return sorted(slug for slug, problem in _problems().items() if not problem.get("drillOnly"))


def _answers(problem: dict[str, Any]) -> list[str]:
    """Text found only in a problem's answer fields."""
    hints = problem["hints"]
    texts = [problem["constraintReading"], problem["solution"]["code"], "# viz:"]
    # Each line of the solution on its own, so a partial leak shows up too.
    starter = {line.strip() for line in problem["starterCode"].splitlines()}
    texts += [
        line.strip()
        for line in problem["solution"]["code"].splitlines()
        if line.strip() and line.strip() not in starter
    ]
    texts += [problem["solution"]["explanation"]]
    texts += [approach["twist"] for approach in problem["approaches"]]
    texts += [approach["note"] for approach in problem["approaches"] if "note" in approach]
    texts += [signal["meaning"] for signal in problem["signals"]]
    texts += [hints["clarify"], hints["approach"], hints["whyNot"], *hints["slots"].values()]
    texts += [related["relation"] for related in problem.get("related", [])]
    texts += [event["say"] for event in problem["viz"]["events"] if "say" in event]
    return texts


def test_m1_problems_are_written() -> None:
    assert set(M1_PROBLEMS) <= set(_workspace_slugs())


def test_real_content_has_no_static_errors() -> None:
    result = validate_content_dir(REAL_CONTENT)
    assert [str(issue) for issue in result.errors] == []


def test_real_content_passes_the_validator_including_rule_7() -> None:
    """What CI's content job runs: every static rule, then every solution against its tests."""
    done = subprocess.run(
        [sys.executable, str(SCRIPT)],
        capture_output=True,
        text=True,
        timeout=300,
        check=False,
        cwd=REPO_ROOT,
    )
    assert done.returncode == 0, done.stdout + done.stderr
    summary = done.stdout.splitlines()[-1]
    assert f"{len(_workspace_slugs())} solution(s) run: 0 error(s)" in summary, done.stdout


def test_real_content_follows_the_json_layout() -> None:
    done = subprocess.run(
        [sys.executable, str(FORMAT_SCRIPT), "--check"],
        capture_output=True,
        text=True,
        timeout=60,
        check=False,
        cwd=REPO_ROOT,
    )
    assert done.returncode == 0, done.stdout + done.stderr


# ---------------------------------------------------------------- the API on the real content


@pytest.fixture
async def real_client() -> AsyncIterator[AsyncClient]:
    """Signed-out requests only: the content endpoints then never touch the database."""
    application = create_app(make_settings(content_dir=REAL_CONTENT))
    transport = ASGITransport(app=application)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        yield client
    await application.state.engine.dispose()


async def test_valid_palindrome_has_no_answers(real_client: AsyncClient) -> None:
    """M1 acceptance: the problem detail has no approaches, signals, hints, solution or viz."""
    response = await real_client.get(f"{API}/problems/valid-palindrome")
    assert response.status_code == 200
    body = response.json()
    for key in ANSWER_KEYS:
        assert key not in body
    assert set(body) == PROBLEM_PUBLIC_KEYS


@pytest.mark.parametrize("slug", _workspace_slugs())
async def test_no_answer_text_in_any_problem_detail(real_client: AsyncClient, slug: str) -> None:
    response = await real_client.get(f"{API}/problems/{slug}")
    assert response.status_code == 200
    body = response.json()
    # `io` and `checker` are served when the problem has them: the browser's harness needs
    # them to run the tests.
    optional = {key for key in ("io", "checker") if key in _problems()[slug]}
    assert set(body) == PROBLEM_PUBLIC_KEYS | optional
    # Search the parsed strings: in the raw JSON, newlines and quotes are escaped.
    served = _strings(body)
    for answer in _answers(_problems()[slug]):
        assert not [text for text in served if answer in text], answer


def test_the_answer_search_reads_parsed_strings() -> None:
    """Raw JSON escapes newlines and quotes, so a search of response.text would miss a leak."""
    code = _problems()["valid-palindrome"]["solution"]["code"]
    leaked = {"summary": "x", "examples": [{"input": code}]}
    assert code not in json.dumps(leaked)
    assert any(code in text for text in _strings(leaked))


async def test_every_content_page_loads_without_answers(real_client: AsyncClient) -> None:
    patterns = (await real_client.get(f"{API}/patterns")).json()
    paths = ["/roadmap", "/structures", "/toolkit", "/problems"]
    paths += [f"/patterns/{pattern['id']}" for pattern in patterns]
    twists = [a["twist"] for p in _problems().values() for a in p["approaches"]]
    for path in paths:
        response = await real_client.get(f"{API}{path}")
        assert response.status_code == 200, path
        for twist in twists:
            assert twist not in response.text, (path, twist)
    assert [pattern["id"] for pattern in patterns] == [
        "hashing",
        "two_pointers_opposite",
        "stack",
        "sliding_window",
        "binary_search",
        "prefix_scan",
    ]


# ---------------------------------------------------------------- the fixed vocabularies


def _read(name: str) -> Any:
    return json.loads((REAL_CONTENT / name).read_text(encoding="utf-8"))


def test_pattern_ids_and_families_follow_section_24_1() -> None:
    """D2: the ids and families, in the table's order, then the parity plan's (P1 adds
    prefix_scan in the arrays family)."""
    assert [(p["id"], p["family"]) for p in _read("patterns.json")] == [
        ("hashing", "hashing"),
        ("two_pointers_opposite", "two_pointers"),
        ("stack", "stack"),
        ("sliding_window", "two_pointers"),
        ("binary_search", "binary_search"),
        ("prefix_scan", "arrays"),
    ]


def test_structure_ids_are_the_twelve_of_section_10_4() -> None:
    """D3: the Plan card's structure options, in order."""
    assert [s["id"] for s in _read("structures.json")] == [
        "array",
        "hash_map",
        "hash_set",
        "counter",
        "stack",
        "queue",
        "heap",
        "sorted",
        "grid",
        "linked_list",
        "tree",
        "graph",
    ]


def test_toolkit_ids_are_the_25_of_section_24_3_then_the_parity_cards() -> None:
    """D3: the toolkit cards, in the table's order, then the cards the parity phases add
    (P1: accumulate, for prefix_scan)."""
    assert [card["id"] for card in _read("toolkit.json")] == [
        "lower",
        "isalnum",
        "isalpha_isdigit",
        "ord_chr",
        "counter",
        "most_common",
        "defaultdict_list",
        "set_ops",
        "sorted_key",
        "enumerate",
        "zip",
        "heapq",
        "nlargest",
        "bisect_left",
        "deque",
        "inf",
        "divmod",
        "reverse_slice",
        "join",
        "split",
        "ceil",
        "cache",
        "min_max_key",
        "any_all",
        "int_trunc",
        "accumulate",
    ]


# D4: each Workspace problem's number in the Section 24.2 table; problems of the parity
# phase P1 continue from 16, in the order of docs/PARITY_PLAN.md.
WORKSPACE_ORDER = {
    "two-sum": 1,
    "valid-anagram": 2,
    "group-anagrams": 3,
    "valid-palindrome": 4,
    "two-sum-ii": 5,
    "three-sum": 6,
    "valid-parentheses": 7,
    "evaluate-rpn": 8,
    "daily-temperatures": 9,
    "best-time-to-buy-sell-stock": 10,
    "longest-substring-no-repeat": 11,
    "longest-repeating-replacement": 12,
    "binary-search": 13,
    "search-insert-position": 14,
    "koko-eating-bananas": 15,
    "min-stack": 16,
    "contains-duplicate": 17,
    "top-k-frequent-elements": 18,
    "encode-and-decode-strings": 19,
    "product-of-array-except-self": 20,
    "valid-sudoku": 21,
    "longest-consecutive-sequence": 22,
    "container-with-most-water": 23,
    "trapping-rain-water": 24,
    "permutation-in-string": 25,
    "minimum-window-substring": 26,
    "sliding-window-maximum": 27,
    "car-fleet": 28,
    "largest-rectangle-in-histogram": 29,
    "search-a-2d-matrix": 30,
    "find-minimum-in-rotated-sorted-array": 31,
    "search-in-rotated-sorted-array": 32,
    "time-based-key-value-store": 33,
    "median-of-two-sorted-arrays": 34,
}


def test_workspace_problems_follow_section_24_2_then_the_parity_plan() -> None:
    problems = _problems()
    assert set(_workspace_slugs()) <= set(WORKSPACE_ORDER)
    for slug in _workspace_slugs():
        assert problems[slug]["order"] == WORKSPACE_ORDER[slug], slug


def test_min_stack_is_a_design_problem() -> None:
    problem = _problems()["min-stack"]
    assert (problem["kind"], problem["entry"], problem.get("drillOnly", False)) == (
        "design",
        "MinStack",
        False,
    )
    tests = problem["tests"]
    assert sum(not t["hidden"] for t in tests) >= 2
    assert sum(t["hidden"] for t in tests) >= 4
    assert all(t["ops"][0] == ["MinStack"] and len(t["expected"]) == len(t["ops"]) for t in tests)
    # The walkthrough draws both lists as stacks with today's renderers.
    assert problem["viz"]["roles"]["stack"] == ["vals", "mins"]


async def test_min_stack_detail_carries_its_calls(real_client: AsyncClient) -> None:
    body = (await real_client.get(f"{API}/problems/min-stack")).json()
    assert (body["kind"], body["entry"]) == ("design", "MinStack")
    assert body["tests"][0]["ops"][:2] == [["MinStack"], ["push", 3]]
    assert "args" not in body["tests"][0]


# ---------------------------------------------------------------- twist keywords (11.1)


def _twist_result(approach: dict[str, Any], twist: str) -> str:
    """Section 11.1's keyword check: a group matches when any of its words appears in the
    twist, ignoring case; every group gives correct, some give close."""
    groups = approach["twistKeywords"]
    matched = sum(any(word in twist.lower() for word in group) for group in groups)
    return "correct" if matched == len(groups) else "close" if matched else "wrong"


def _optimal(slug: str) -> dict[str, Any]:
    [optimal] = [a for a in _problems()[slug]["approaches"] if a["id"] == "optimal"]
    return optimal


@pytest.mark.parametrize(
    "slug",
    [
        *M1_PROBLEMS,
        "three-sum",
        "three-sum-closest",
        "top-k-frequent-elements",
        "sqrt-x",
        "min-stack",
        # P1
        "contains-duplicate",
        "encode-and-decode-strings",
        "product-of-array-except-self",
        "valid-sudoku",
        "longest-consecutive-sequence",
        "container-with-most-water",
        "trapping-rain-water",
        "permutation-in-string",
        "minimum-window-substring",
        "sliding-window-maximum",
        "car-fleet",
        "largest-rectangle-in-histogram",
        "search-a-2d-matrix",
        "find-minimum-in-rotated-sorted-array",
        "search-in-rotated-sorted-array",
        "time-based-key-value-store",
        "median-of-two-sorted-arrays",
    ],
)
def test_every_approach_grades_its_own_twist_correct(slug: str) -> None:
    for approach in _problems()[slug]["approaches"]:
        assert _twist_result(approach, approach["twist"]) == "correct", approach["id"]


@pytest.mark.parametrize(
    ("slug", "twist", "expected"),
    [
        ("valid-palindrome", "Only letters and digits count, case doesn't matter", "correct"),
        ("valid-palindrome", "Skip what isn't a letter or number; compare lowercased", "correct"),
        # Half the twist, or a tool that drops digits or keeps punctuation.
        ("valid-palindrome", "Ignore uppercase letters", "close"),
        ("valid-palindrome", "Use isalpha to skip and lower to compare", "close"),
        ("valid-palindrome", "Skip every non-letter and lowercase", "close"),
        ("valid-palindrome", "Remove spaces and lowercase the string", "close"),
        ("two-sum", "Look up the number that completes the pair in a dict", "correct"),
        ("two-sum", "Check if the other number I need is in a dict before adding x", "correct"),
        # Vague: says what to store, not what to look up.
        ("two-sum", "I need to store numbers in a hash map", "close"),
        ("two-sum", "Use a dict; we need the index", "close"),
    ],
)
def test_optimal_twist_keywords_separate_real_twists(slug: str, twist: str, expected: str) -> None:
    assert _twist_result(_optimal(slug), twist) == expected


def _approach(slug: str, approach_id: str) -> dict[str, Any]:
    [approach] = [a for a in _problems()[slug]["approaches"] if a["id"] == approach_id]
    return approach


def test_approaches_use_the_parity_complexities() -> None:
    """The values PARITY_PLAN 4.4 added replace the closest-value workarounds."""
    assert _approach("three-sum", "all_triples")["time"] == "O(n³)"
    assert _approach("three-sum-closest", "all_triples")["time"] == "O(n³)"
    assert _approach("top-k-frequent-elements", "count_and_heap")["time"] == "O(n log k)"
    assert _approach("sqrt-x", "count_up")["time"] == "O(√n)"
    assert "the Plan card has no" not in _problems()["sqrt-x"]["constraintReading"]


@pytest.mark.parametrize(
    ("slug", "twist", "expected"),
    [
        ("three-sum", "Check all triples with three loops and dedupe with a set", "correct"),
        ("three-sum", "Try every triple", "close"),
        ("three-sum-closest", "Brute force every triple and keep the nearest sum", "correct"),
    ],
)
def test_brute_force_twist_keywords(slug: str, twist: str, expected: str) -> None:
    assert _twist_result(_approach(slug, "all_triples"), twist) == expected

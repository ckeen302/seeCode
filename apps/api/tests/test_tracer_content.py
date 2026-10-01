"""The tracer on the real content (M4): every walkthrough traces cleanly and quickly, and
scripts/viz_trace.py checks configs against those real traces."""

import importlib.util
import json
import time
from types import ModuleType
from typing import Any

import pytest

from app.config import REPO_ROOT
from app.content.models import Problem
from app.content.validation import validate_content_dir
from tests.test_tracer import tracer

SCRIPT = REPO_ROOT / "scripts" / "viz_trace.py"
# Section 8.7 asks for < 300 ms in the browser; CPython here is several times faster.
BUDGET_MS = 300


def _load_viz_trace() -> ModuleType:
    spec = importlib.util.spec_from_file_location("viz_trace", SCRIPT)
    assert spec is not None
    assert spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


viz_trace = _load_viz_trace()
CONTENT = validate_content_dir(REPO_ROOT / "content").content
WALKTHROUGHS = sorted(
    (problem for problem in CONTENT.problems.values() if problem.viz is not None),
    key=lambda problem: problem.slug,
)


def _inputs(problem: Problem) -> list[dict[str, Any]]:
    return [
        {"id": test.id, "ops": test.ops}
        if test.ops is not None
        else {"id": test.id, "args": test.args}
        for test in problem.tests or ()
        if not test.hidden
    ]


def _job(problem: Problem) -> dict[str, Any]:
    assert problem.viz is not None
    assert problem.solution is not None
    return {
        "code": problem.solution.code,
        "entry": problem.entry,
        "inputs": _inputs(problem),
        "viz": problem.viz.model_dump(mode="json"),
        "spec": problem.harness_spec(),
    }


def test_every_workspace_problem_has_a_walkthrough() -> None:
    workspace = [p for p in CONTENT.problems.values() if not p.drill_only]
    assert workspace
    assert all(problem.viz is not None for problem in workspace)


@pytest.mark.parametrize("problem", WALKTHROUGHS, ids=lambda problem: problem.slug)
def test_walkthroughs_trace_cleanly(problem: Problem) -> None:
    job = _job(problem)
    fired: set[str] = set()
    for given in job["inputs"]:
        start = time.perf_counter()
        result = tracer.trace(job["code"], job["entry"], given, job["viz"], job["spec"])
        elapsed = (time.perf_counter() - start) * 1000
        assert result["error"] is None, (given["id"], result["error"])
        assert not result["truncated"]
        assert elapsed < BUDGET_MS
        steps = result["steps"]
        assert steps
        for step in steps:
            fired.update(step["tags"])
            if step["tags"]:
                assert step["event"] == "line"
    # Every event fires on some example, and every step with narration has a tag.
    assert {event["id"] for event in job["viz"]["events"]} <= fired


@pytest.mark.parametrize("problem", WALKTHROUGHS, ids=lambda problem: problem.slug)
def test_viz_configs_match_their_traces(problem: Problem) -> None:
    report = viz_trace.check(tracer, _job(problem))
    assert report == {"errors": [], "warnings": [], "unfired": [], "unreached": []}


# The web unit tests play real traces of these walkthroughs (first visible test of each).
WEB_FIXTURE = REPO_ROOT / "apps" / "web" / "tests" / "unit" / "fixtures" / "viz-traces.json"
WEB_FIXTURE_PROBLEMS = (
    "valid-palindrome",
    "binary-search",
    "min-stack",
    "two-sum",
    "daily-temperatures",
    "group-anagrams",
)


TWO_INPUTS = ("valid-palindrome", "binary-search")


def web_fixture() -> str:
    """{slug: {"payload": WalkthroughPayload as the API sends it, "traces": [Trace]}}."""
    by_slug = {problem.slug: problem for problem in WALKTHROUGHS}
    out: dict[str, Any] = {}
    for slug in WEB_FIXTURE_PROBLEMS:
        problem = by_slug[slug]
        job = _job(problem)
        inputs = [
            {"label": f"Example {i}", **{k: v for k, v in given.items() if k != "id"}}
            for i, given in enumerate(job["inputs"], start=1)
        ]
        payload = {
            "code": job["code"],
            "kind": problem.kind,
            "entry": job["entry"],
            "viz": job["viz"],
            "inputs": inputs,
        }
        traces = [
            tracer.trace(job["code"], job["entry"], given, job["viz"], job["spec"])
            for given in job["inputs"][: 2 if slug in TWO_INPUTS else 1]
        ]
        out[slug] = {"payload": payload, "traces": traces}
    return json.dumps(out, separators=(",", ":"), sort_keys=True) + "\n"


def test_the_web_trace_fixture_is_current() -> None:
    # Regenerate: uv run python -m tests.test_tracer_content (from apps/api).
    assert WEB_FIXTURE.read_text(encoding="utf-8") == web_fixture()


def _palindrome_job(**viz: Any) -> dict[str, Any]:
    problem = CONTENT.problems["problems/valid-palindrome.json"]
    job = _job(problem)
    job["viz"] = {**job["viz"], **viz}
    return job


def test_viz_trace_flags_variables_of_the_wrong_type() -> None:
    job = _palindrome_job(
        pointers=[{"var": "s", "into": "s", "label": "s", "color": "a"}],
        window={"into": "l", "start": "l", "end": "r", "inclusive": True},
        roles={"stack": ["l"], "queue": [], "hidden": []},
    )
    errors = {error["path"]: error["message"] for error in viz_trace.check(tracer, job)["errors"]}
    assert errors["pointers[0].var"].startswith("'s' is a str, not an index (input 'e1'")
    assert errors["window.into"].startswith("'l' is a int, not a list or string")
    assert errors["roles.stack"].startswith("'l' is a int, not a list")


def test_viz_trace_flags_unanswerable_predicts_and_a_missing_primary() -> None:
    job = _palindrome_job(
        primary="nothing",
        predict=[{"atEvent": "done", "occurrence": 1, "ask": "?", "var": "l", "kind": "value"}],
    )
    report = viz_trace.check(tracer, job)
    assert report["errors"] == [
        {
            "path": "predict[0]",
            "message": "no answer on input 'e1': 'l' never changes after line 14",
        }
    ]
    assert report["warnings"] == [
        {"path": "primary", "message": "'nothing' is never a variable of the trace"}
    ]


def test_viz_trace_warns_about_a_cut_trace() -> None:
    job = _palindrome_job()
    job["code"] = (
        "class Solution:\n    def isPalindrome(self, s):\n        while True:\n            pass\n"
    )
    job["inputs"] = [{"id": "x", "args": ["ab"]}]
    report = viz_trace.check(tracer, job)
    assert {"path": "", "message": "the trace stops at 3000 steps on input 'x'"} in report[
        "warnings"
    ]


if __name__ == "__main__":
    WEB_FIXTURE.parent.mkdir(parents=True, exist_ok=True)
    WEB_FIXTURE.write_text(web_fixture(), encoding="utf-8")

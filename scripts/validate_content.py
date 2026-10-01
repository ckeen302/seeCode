"""Validate everything in content/ (Section 10.7).

Runs every static rule from app.content.validation (the checks the API also runs at
startup), then rule 7: each problem's reference solution must pass all of its tests
when run with the browser test harness (apps/web/public/py/harness.py), given the
problem's kind, io and checker as the browser gives them. Solutions run in a fresh Python
subprocess per problem with a timeout, so an infinite loop cannot hang CI. Pattern demos
are run once on their own arguments and must not raise.

Each walkthrough is also traced (scripts/viz_trace.py, with the browser's own tracer) on
its problem's visible tests (arguments built from their io types, or a design test's
calls), or its demo's arguments: an event `when`, `say` or predict `answerWhen` that raises,
an index/value predict point with no answer, or a viz variable of the wrong type (a
pointer that is not an integer, a stack that is not a list) is an error; an event that
never fires, a predict point never reached or a trace cut at the step limit is a warning.

Usage (from the repo root):
    uv run --project apps/api python scripts/validate_content.py [content_dir] [--timeout S]

Prints every error and warning with its file; exits 1 on any error.
"""

import argparse
import json
import subprocess
import sys
from pathlib import Path
from typing import Any

from app.content.models import Pattern, Problem, TestCase, VizConfig
from app.content.validation import PATTERNS_FILE, Issue, validate_content_dir

REPO_ROOT = Path(__file__).resolve().parent.parent
HARNESS = REPO_ROOT / "apps" / "web" / "public" / "py" / "harness.py"
TRACER = HARNESS.with_name("tracer.py")
VIZ_TRACE = Path(__file__).resolve().parent / "viz_trace.py"
DEFAULT_TIMEOUT = 10.0
MAX_SHOWN = 300

# Runs in a fresh interpreter: loads harness.py from its path (its source run in a new
# module, so no bytecode is written next to it), runs the job read from stdin, and writes
# the result to the real stdout. Anything the solution prints while loading goes to stderr
# instead, so it cannot corrupt the JSON.
_CHILD = """
import json, sys, types
harness = types.ModuleType("seecode_harness")
harness.__file__ = sys.argv[1]
with open(sys.argv[1], encoding="utf-8") as source:
    exec(compile(source.read(), sys.argv[1], "exec"), harness.__dict__)
job = json.load(sys.stdin)
out, sys.stdout = sys.stdout, sys.stderr
spec = json.dumps(job["spec"])
out.write(harness.run_tests(job["code"], job["entry"], json.dumps(job["tests"]), "exact", spec))
"""


class RunFailed(Exception):
    pass


def _run_child(name: str, command: list[str], job: dict[str, Any], timeout: float) -> Any:
    """Run a fresh, isolated interpreter (-I) that writes no bytecode (-B): harness.py sits in
    the web app's public/ folder, which is served as is."""
    try:
        done = subprocess.run(
            [sys.executable, "-I", "-B", *command],
            input=json.dumps(job),
            capture_output=True,
            text=True,
            timeout=timeout,
            check=False,
        )
    except subprocess.TimeoutExpired as exc:
        raise RunFailed(f"timed out after {timeout:g} s (an infinite loop?)") from exc
    if done.returncode != 0:
        raise RunFailed(f"the {name} crashed: {_tail(done.stderr)}")
    try:
        return json.loads(done.stdout)
    except json.JSONDecodeError as exc:
        raise RunFailed(f"the {name} returned no results: {_tail(done.stderr)}") from exc


def run_harness(
    code: str,
    entry: str,
    tests: list[dict[str, Any]],
    timeout: float,
    spec: dict[str, Any] | None = None,
) -> list[Any]:
    """The harness's results for `tests`; `spec` is its spec_json (kind, io, checker)."""
    job = {"code": code, "entry": entry, "tests": tests, "spec": spec}
    results = _run_child("harness", ["-c", _CHILD, str(HARNESS)], job, timeout)
    if not isinstance(results, list) or len(results) != len(tests):
        raise RunFailed(f"expected {len(tests)} results, got {results!r:.{MAX_SHOWN}}")
    return results


def harness_test(test: TestCase) -> dict[str, Any]:
    """A test as the browser sends it to the harness (the TestCaseView JSON)."""
    data: dict[str, Any] = {"id": test.id}
    if test.args is not None:
        data["args"] = test.args
    if test.ops is not None:
        data["ops"] = test.ops
    data.update(expected=test.expected, hidden=test.hidden)
    if test.compare is not None:
        data["compare"] = test.compare
    return data


def check_solution(file: str, problem: Problem, timeout: float) -> list[Issue]:
    """Rule 7: the reference solution passes every test."""
    if problem.solution is None or problem.entry is None or problem.tests is None:
        return []
    tests = [harness_test(test) for test in problem.tests]
    spec = problem.harness_spec()
    try:
        results = run_harness(problem.solution.code, problem.entry, tests, timeout, spec)
    except RunFailed as exc:
        return [Issue("error", file, "solution.code", str(exc))]
    issues = []
    for i, (test, result) in enumerate(zip(tests, results, strict=True)):
        status = result.get("status")
        if status == "pass":
            continue
        got = _show_got(result)
        if status == "fail" and result.get("error"):  # a checker, deep-copy or size verdict
            message = f"test {test['id']!r} fails: {_tail(str(result['error']))} (got {got})"
        elif status == "fail" and test.get("compare") == "checker":
            message = (
                f"test {test['id']!r} fails: the checker rejects {got} (one right answer: "
                f"{_show(test['expected'])})"
            )
        elif status == "fail":
            message = f"test {test['id']!r} fails: expected {_show(test['expected'])}, got {got}"
        else:
            message = f"test {test['id']!r} raises: {_tail(str(result.get('error')))}"
        issues.append(Issue("error", file, f"tests[{i}]", f"solution.code {message}"))
    return issues


def check_demo(index: int, pattern: Pattern, timeout: float) -> list[Issue]:
    """A pattern's demo runs on its own arguments without raising."""
    demo = pattern.demo
    path = f"[{index}].demo"
    probe = [{"id": "demo", "args": demo.args, "expected": None, "hidden": False}]
    try:
        (result,) = run_harness(demo.code, demo.entry, probe, timeout)
    except RunFailed as exc:
        return [Issue("error", PATTERNS_FILE, path, str(exc))]
    if result.get("status") == "error":
        message = f"the demo raises: {_tail(str(result.get('error')))}"
        return [Issue("error", PATTERNS_FILE, path, message)]
    return []


def check_walkthrough(
    file: str,
    path: str,
    code: str,
    entry: str,
    inputs: list[dict[str, Any]],
    viz: VizConfig,
    timeout: float,
    inputs_name: str = "any visible test",
    spec: dict[str, Any] | None = None,
) -> list[Issue]:
    """Trace `code` on each input ({"id", "args"}, or {"id", "ops"} for a design problem)
    and evaluate the viz expressions as the tracer would."""
    job = {
        "code": code,
        "entry": entry,
        "inputs": inputs,
        "viz": viz.model_dump(mode="json"),
        "spec": spec,
    }
    try:
        report = _run_child("tracer", [str(VIZ_TRACE), str(HARNESS), str(TRACER)], job, timeout)
    except RunFailed as exc:
        return [Issue("error", file, path, f"tracing the walkthrough: {exc}")]

    def where(sub: str) -> str:
        return f"{path}.{sub}" if sub else path

    issues = [
        Issue("error", file, where(error["path"]), error["message"]) for error in report["errors"]
    ]
    issues += [
        Issue("warning", file, where(warning["path"]), warning["message"])
        for warning in report.get("warnings", ())
    ]
    for event_id in report["unfired"]:
        index = next(i for i, event in enumerate(viz.events) if event.id == event_id)
        message = f"event {event_id!r} never fires on {inputs_name}"
        issues.append(Issue("warning", file, f"{path}.events[{index}]", message))
    for index in report["unreached"]:
        message = f"predict point never reached on {inputs_name}"
        issues.append(Issue("warning", file, f"{path}.predict[{index}]", message))
    return issues


def _show(value: Any) -> str:
    text = json.dumps(value, ensure_ascii=False)
    return text if len(text) <= MAX_SHOWN else text[:MAX_SHOWN] + "..."


def _show_got(result: dict[str, Any]) -> str:
    """A result's `got`; Python repr text (`gotRepr`) is shown as is, not as a string."""
    got = result.get("got")
    if result.get("gotRepr") and isinstance(got, str):
        return got if len(got) <= MAX_SHOWN else got[:MAX_SHOWN] + "..."
    return _show(got)


def _tail(text: str) -> str:
    lines = [line for line in text.strip().splitlines() if line.strip()]
    return lines[-1].strip() if lines else "(no output)"


def validate(content_dir: Path, timeout: float = DEFAULT_TIMEOUT) -> tuple[list[Issue], int, int]:
    """All issues, the number of files checked, and the number of solutions run."""
    result = validate_content_dir(content_dir)
    issues = list(result.issues)
    checked = len(list(content_dir.rglob("*.json"))) if content_dir.is_dir() else 0
    for needed, what in ((HARNESS, "test harness"), (TRACER, "tracer")):
        if not needed.is_file():
            issues.append(Issue("error", str(needed), "", f"{what} not found"))
            return issues, checked, 0
    walkthroughs: list[list[Issue]] = []
    for index, pattern in enumerate(result.content.patterns or ()):
        issues.extend(check_demo(index, pattern, timeout))
        demo = pattern.demo
        walkthroughs.append(
            check_walkthrough(
                PATTERNS_FILE,
                f"[{index}].demo.viz",
                demo.code,
                demo.entry,
                [{"id": "demo", "args": demo.args}],
                demo.viz,
                timeout,
                "the demo's arguments",
            )
        )
    # Every Workspace problem (the model requires these fields unless drillOnly is true).
    runnable = [
        (file, problem)
        for file, problem in result.content.problems.items()
        if problem.solution is not None and problem.entry is not None and problem.tests is not None
    ]
    runnable.sort(key=lambda item: item[0])
    for file, problem in runnable:
        issues.extend(check_solution(file, problem, timeout))
        viz, solution, entry = problem.viz, problem.solution, problem.entry
        if viz is not None and solution is not None and entry is not None:
            visible = [harness_test(t) for t in problem.tests or () if not t.hidden]
            spec = problem.harness_spec()
            walkthroughs.append(
                check_walkthrough(
                    file, "viz", solution.code, entry, visible, viz, timeout, spec=spec
                )
            )
    # An expression the static checks already reject would only repeat its error.
    static = {(issue.file, issue.path) for issue in result.errors}
    issues += [i for run in walkthroughs for i in run if (i.file, i.path) not in static]
    return issues, checked, len(runnable)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Validate SeeCode content (Section 10.7).")
    parser.add_argument(
        "content_dir", nargs="?", type=Path, default=REPO_ROOT / "content", help="default: content/"
    )
    parser.add_argument(
        "--timeout",
        type=float,
        default=DEFAULT_TIMEOUT,
        help=f"seconds per solution run (default {DEFAULT_TIMEOUT:g})",
    )
    args = parser.parse_args(argv)

    issues, checked, ran = validate(args.content_dir, args.timeout)
    issues.sort(key=lambda issue: (issue.file, issue.level != "error"))
    for issue in issues:
        print(issue)
    errors = sum(issue.level == "error" for issue in issues)
    warnings = len(issues) - errors
    print(
        f"{checked} content file(s) checked, {ran} solution(s) run: "
        f"{errors} error(s), {warnings} warning(s)"
    )
    return 1 if errors else 0


if __name__ == "__main__":
    sys.exit(main())

"""Validate everything in content/ (Section 10.7).

Runs every static rule from app.content.validation (the checks the API also runs at
startup), then rule 7: each problem's reference solution must pass all of its tests
when run with the browser test harness (apps/web/public/py/harness.py). Solutions run
in a fresh Python subprocess per problem with a timeout, so an infinite loop cannot
hang CI. Pattern demos are run once on their own arguments and must not raise.

Each walkthrough is also traced (scripts/viz_trace.py) on its problem's visible tests, or
its demo's arguments: an event `when`, `say` or predict `answerWhen` that raises is an
error, and an event that never fires or a predict point never reached is a warning.

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

from app.content.models import Pattern, Problem, VizConfig
from app.content.validation import PATTERNS_FILE, Issue, validate_content_dir

REPO_ROOT = Path(__file__).resolve().parent.parent
HARNESS = REPO_ROOT / "apps" / "web" / "public" / "py" / "harness.py"
VIZ_TRACE = Path(__file__).resolve().parent / "viz_trace.py"
DEFAULT_TIMEOUT = 10.0
MAX_SHOWN = 300

# Runs in a fresh interpreter: imports harness.py from its path, runs the job read from
# stdin, and writes the result to the real stdout. Anything the solution prints while
# loading goes to stderr instead, so it cannot corrupt the JSON.
_CHILD = """
import importlib.util, json, sys
spec = importlib.util.spec_from_file_location("seecode_harness", sys.argv[1])
harness = importlib.util.module_from_spec(spec)
spec.loader.exec_module(harness)
job = json.load(sys.stdin)
out, sys.stdout = sys.stdout, sys.stderr
out.write(harness.run_tests(job["code"], job["entry"], json.dumps(job["tests"])))
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


def run_harness(code: str, entry: str, tests: list[dict[str, Any]], timeout: float) -> list[Any]:
    job = {"code": code, "entry": entry, "tests": tests}
    results = _run_child("harness", ["-c", _CHILD, str(HARNESS)], job, timeout)
    if not isinstance(results, list) or len(results) != len(tests):
        raise RunFailed(f"expected {len(tests)} results, got {results!r:.{MAX_SHOWN}}")
    return results


def check_solution(file: str, problem: Problem, timeout: float) -> list[Issue]:
    """Rule 7: the reference solution passes every test."""
    if problem.solution is None or problem.entry is None or problem.tests is None:
        return []
    tests = [test.model_dump(mode="json") for test in problem.tests]
    try:
        results = run_harness(problem.solution.code, problem.entry, tests, timeout)
    except RunFailed as exc:
        return [Issue("error", file, "solution.code", str(exc))]
    issues = []
    for i, (test, result) in enumerate(zip(tests, results, strict=True)):
        status = result.get("status")
        if status == "pass":
            continue
        if status == "fail":
            message = (
                f"test {test['id']!r} fails: expected {_show(test['expected'])}, "
                f"got {_show(result.get('got'))}"
            )
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
    inputs: list[tuple[str, list[Any]]],
    viz: VizConfig,
    timeout: float,
    inputs_name: str = "any visible test",
) -> list[Issue]:
    """Trace `code` on each (id, args) input and evaluate the viz expressions as the tracer
    would."""
    job = {
        "code": code,
        "entry": entry,
        "inputs": [{"id": input_id, "args": args} for input_id, args in inputs],
        "viz": viz.model_dump(mode="json"),
    }
    try:
        report = _run_child("tracer", [str(VIZ_TRACE), str(HARNESS)], job, timeout)
    except RunFailed as exc:
        return [Issue("error", file, path, f"tracing the walkthrough: {exc}")]
    issues = [
        Issue("error", file, f"{path}.{error['path']}", error["message"])
        for error in report["errors"]
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


def _tail(text: str) -> str:
    lines = [line for line in text.strip().splitlines() if line.strip()]
    return lines[-1].strip() if lines else "(no output)"


def validate(content_dir: Path, timeout: float = DEFAULT_TIMEOUT) -> tuple[list[Issue], int, int]:
    """All issues, the number of files checked, and the number of solutions run."""
    result = validate_content_dir(content_dir)
    issues = list(result.issues)
    checked = len(list(content_dir.rglob("*.json"))) if content_dir.is_dir() else 0
    if not HARNESS.is_file():
        issues.append(Issue("error", str(HARNESS), "", "test harness not found"))
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
                [("demo", demo.args)],
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
            visible = [(t.id, t.args) for t in problem.tests or () if not t.hidden]
            walkthroughs.append(
                check_walkthrough(file, "viz", solution.code, entry, visible, viz, timeout)
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

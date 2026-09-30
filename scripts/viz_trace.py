"""Run a walkthrough's viz expressions where the Section 8.2 tracer will evaluate them.

A child process of scripts/validate_content.py. The tracer (M4) swallows errors in an
event's `when` and `say` and in a predict point's `answerWhen`, so a broken one silently
drops narration, skips an event or grades a predict point wrong. This traces the code on
each input with sys.settrace, evaluates every expression at the same steps and with the
same builtins, and reports the first error of each. (The tracer shows only the first
narration of a step; this checks every event's.) It also reports events that never fire
and predict points never reached. Standard library only; the code runs in the harness
namespace (prelude included), as it will in the browser.

    python -I -B scripts/viz_trace.py <harness.py> < job.json > result.json

job: {"code", "entry", "inputs": [{"id", "args"}], "viz": {"events", "predict"}}
result: {"errors": [{"path", "message"}], "unfired": [event id], "unreached": [predict index]}
"""

import copy
import importlib.util
import json
import re
import sys
from collections import Counter
from dataclasses import dataclass, field
from types import FrameType, ModuleType
from typing import Any

SOLUTION_FILE = "<solution>"
MAX_STEPS = 3000  # the tracer's limit
MARKER_RE = re.compile(r"#\s*viz:([a-zA-Z0-9_]+)")
# The only builtins the tracer gives narration and conditions (it evaluates `answerWhen`
# as an extra event condition).
SAY_BUILTINS = {"repr": repr, "len": len}
CONDITION_BUILTINS = {"len": len}


class StepLimit(Exception):
    pass


@dataclass
class Report:
    errors: dict[str, str] = field(default_factory=dict)  # path -> first error
    fired: Counter[str] = field(default_factory=Counter)
    reached: set[int] = field(default_factory=set)


def marker_lines(code: str) -> dict[str, list[int]]:
    """`# viz:<name>` markers by line, as the tracer finds them (the first on each line)."""
    out: dict[str, list[int]] = {}
    for lineno, line in enumerate(code.splitlines(), start=1):
        if match := MARKER_RE.search(line):
            out.setdefault(match.group(1), []).append(lineno)
    return out


def _evaluate(source: str, builtins: dict[str, Any], env: dict[str, Any]) -> Any:
    return eval(source, {"__builtins__": builtins}, env)


def trace_input(
    harness: ModuleType, job: dict[str, Any], input_id: str, args: list[Any], report: Report
) -> None:
    events: list[dict[str, Any]] = job["viz"].get("events", [])
    predicts: list[dict[str, Any]] = job["viz"].get("predict", [])
    markers = marker_lines(job["code"])
    counts: Counter[str] = Counter()
    steps = 0

    def fail(path: str, exc: Exception, frame: FrameType) -> None:
        message = f"raises {type(exc).__name__}: {exc} (input {input_id!r}, line {frame.f_lineno})"
        report.errors.setdefault(path, message)

    def tracer(frame: FrameType, event: str, arg: Any) -> Any:
        nonlocal steps
        if frame.f_code.co_filename != SOLUTION_FILE:
            return None
        if event not in ("line", "return"):
            return tracer
        steps += 1
        if steps > MAX_STEPS:
            raise StepLimit
        env = {name: value for name, value in frame.f_locals.items() if name != "self"}
        tags = []
        for i, ev in enumerate(events):
            if frame.f_lineno not in markers.get(ev["at"], ()):
                continue
            if ev.get("when"):
                try:
                    if not _evaluate(ev["when"], CONDITION_BUILTINS, env):
                        continue
                except Exception as exc:
                    fail(f"events[{i}].when", exc, frame)
                    continue
            tags.append(ev["id"])
            counts[ev["id"]] += 1
            if ev.get("say"):
                try:
                    _evaluate("f" + repr(ev["say"]), SAY_BUILTINS, env)
                except Exception as exc:
                    fail(f"events[{i}].say", exc, frame)
        for i, predict in enumerate(predicts):
            at_event = predict["atEvent"]
            if at_event not in tags or counts[at_event] != predict.get("occurrence", 1):
                continue
            report.reached.add(i)
            if predict.get("answerWhen"):
                try:
                    _evaluate(predict["answerWhen"], CONDITION_BUILTINS, env)
                except Exception as exc:
                    fail(f"predict[{i}].answerWhen", exc, frame)
        return tracer

    try:
        namespace = harness.new_namespace()
        exec(compile(job["code"], SOLUTION_FILE, "exec"), namespace)
        method = getattr(namespace["Solution"](), job["entry"])
    except Exception:
        return  # the static checks and rule 7 report code that does not load
    sys.settrace(tracer)
    try:
        method(*copy.deepcopy(args))
    except Exception:
        pass  # rule 7 reports a solution that raises; StepLimit ends a long trace
    finally:
        sys.settrace(None)
    report.fired.update(counts)


def check(harness: ModuleType, job: dict[str, Any]) -> dict[str, Any]:
    report = Report()
    for run in job["inputs"]:
        trace_input(harness, job, run["id"], run["args"], report)
    events = job["viz"].get("events", [])
    predicts = job["viz"].get("predict", [])
    return {
        "errors": [{"path": path, "message": message} for path, message in report.errors.items()],
        "unfired": [ev["id"] for ev in events if not report.fired[ev["id"]]],
        "unreached": [i for i in range(len(predicts)) if i not in report.reached],
    }


def main() -> None:
    spec = importlib.util.spec_from_file_location("seecode_harness", sys.argv[1])
    assert spec is not None
    assert spec.loader is not None
    harness = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(harness)
    job = json.load(sys.stdin)
    # Anything the code prints goes to stderr, so it cannot corrupt the JSON.
    out, sys.stdout = sys.stdout, sys.stderr
    out.write(json.dumps(check(harness, job)))


if __name__ == "__main__":
    main()

"""Check a walkthrough's viz config against real traces of its inputs.

A child process of scripts/validate_content.py. It traces the code on each input with the
browser's own tracer (apps/web/public/py/tracer.py, next to harness.py, in the harness
namespace with the arguments built from their io types, or a design input's calls), so
what it checks is exactly what the walkthrough player will get. The tracer swallows
errors in an event's `when` and `say` and in a predict point's `answerWhen` (a broken one
silently drops narration, skips an event or grades a predict point wrong); here its
`on_error` hook reports the first error of each, evaluating every event's `say`, not only
the one a step shows. It also reports:

- errors: an `index`/`value` predict point reached with no answer (its variable never
  changes after it); a pointer, window, range or confirmed variable that holds something
  other than an integer, or points into a variable that is not a list, tuple or string; a
  `roles.stack`/`roles.queue` variable that is not a list or deque;
- warnings: an event that never fires, a predict point never reached, a `primary` that is
  never a variable, an input whose trace stops at the step limit.

Standard library only.

    python -I -B scripts/viz_trace.py <harness.py> [tracer.py] < job.json > result.json

job: {"code", "entry", "inputs": [{"id", "args"} | {"id", "ops"}], "viz": viz config,
      "spec": harness spec_json object | null}
result: {"errors": [{"path", "message"}], "warnings": [{"path", "message"}],
         "unfired": [event id], "unreached": [predict index]}
"""

import json
import sys
from collections import Counter
from collections.abc import Iterator, Mapping
from dataclasses import dataclass, field
from pathlib import Path
from types import ModuleType
from typing import Any

PREDICT_TAG = "predict:"
SEQUENCES = ("list", "str", "deque")


@dataclass
class Report:
    errors: dict[str, str] = field(default_factory=dict)  # path -> first error
    warnings: dict[str, str] = field(default_factory=dict)
    fired: Counter[str] = field(default_factory=Counter)
    reached: set[int] = field(default_factory=set)
    seen: set[str] = field(default_factory=set)  # variable names visible at some step


def _variables(step: Mapping[str, Any]) -> dict[str, Any]:
    """What the player shows at a step: the instance's attributes, then the locals."""
    return {**(step.get("self") or {}), **step["locals"]}


def _is_int(snap: Any) -> bool:
    return (
        isinstance(snap, dict)
        and snap.get("t") == "prim"
        and isinstance(snap.get("v"), int)
        and not isinstance(snap.get("v"), bool)
        and not snap.get("f")
    )


def _index_vars(viz: Mapping[str, Any]) -> Iterator[tuple[str, str, str | None]]:
    """(path, variable, the array it indexes or None) for every integer the config names."""
    for i, pointer in enumerate(viz.get("pointers") or []):
        yield f"pointers[{i}].var", pointer["var"], pointer["into"]
    window = viz.get("window")
    if window:
        yield "window.start", window["start"], window["into"]
        yield "window.end", window["end"], window["into"]
    span = viz.get("range")
    if span:
        yield "range.lo", span["lo"], span["into"]
        yield "range.hi", span["hi"], span["into"]
        if span.get("mid"):
            yield "range.mid", span["mid"], span["into"]
    confirmed = viz.get("confirmed")
    if confirmed:
        for i, name in enumerate(confirmed.get("outside") or []):
            yield f"confirmed.outside[{i}]", name, confirmed["into"]


def _type_name(snap: Any) -> str:
    if isinstance(snap, dict):
        if snap.get("t") == "prim":
            value = snap.get("v")
            return "float" if snap.get("f") else type(value).__name__
        return str(snap.get("cls") or snap.get("t"))
    return "value"


def check_steps(
    viz: Mapping[str, Any], steps: list[dict[str, Any]], input_id: Any, report: Report
) -> None:
    """The variable checks (see the module docstring) on one input's trace."""
    indexes = list(_index_vars(viz))
    roles = viz.get("roles") or {}
    containers = [("stack", n) for n in roles.get("stack") or []] + [
        ("queue", n) for n in roles.get("queue") or []
    ]
    where = f"(input {input_id!r}"
    for step in steps:
        variables = _variables(step)
        report.seen.update(variables)
        if step["event"] != "line":
            continue
        for path, name, into in indexes:
            value = variables.get(name)
            if value is not None and not _is_int(value) and value.get("v") is not None:
                message = (
                    f"{name!r} is a {_type_name(value)}, not an index {where}, line {step['line']})"
                )
                report.errors.setdefault(path, message)
            target = variables.get(into) if into else None
            if target is not None and target.get("t") not in SEQUENCES:
                message = (
                    f"{into!r} is a {_type_name(target)}, not a list or string "
                    f"{where}, line {step['line']})"
                )
                report.errors.setdefault(path.rsplit(".", 1)[0] + ".into", message)
        for role, name in containers:
            value = variables.get(name)
            if value is not None and value.get("t") not in ("list", "deque"):
                message = (
                    f"{name!r} is a {_type_name(value)}, not a list {where}, line {step['line']})"
                )
                report.errors.setdefault(f"roles.{role}", message)


def trace_input(
    tracer: ModuleType, job: dict[str, Any], run: dict[str, Any], report: Report
) -> None:
    viz: dict[str, Any] = job["viz"]
    input_id = run["id"]

    def on_error(path: str, exc: BaseException, line: int) -> None:
        message = f"raises {type(exc).__name__}: {exc} (input {input_id!r}, line {line})"
        report.errors.setdefault(path, message)

    given = {"ops": run["ops"]} if "ops" in run else {"args": run.get("args") or []}
    trace: dict[str, Any] = tracer.trace(
        job["code"], job["entry"], given, viz, job.get("spec"), on_error=on_error
    )
    steps: list[dict[str, Any]] = trace["steps"]
    for step in steps:
        for tag in step["tags"]:
            if not tag.startswith(PREDICT_TAG):
                report.fired[tag] += 1
                continue
            n = int(tag[len(PREDICT_TAG) :])
            report.reached.add(n)
            point = viz["predict"][n]
            if str(n) not in (step.get("predictAnswers") or {}) and point.get("kind") != "yesno":
                message = (
                    f"no answer on input {input_id!r}: {point.get('var')!r} never changes "
                    f"after line {step['line']}"
                )
                report.errors.setdefault(f"predict[{n}]", message)
    check_steps(viz, steps, input_id, report)
    if trace["truncated"]:
        message = f"the trace stops at {tracer.MAX_STEPS} steps on input {input_id!r}"
        report.warnings.setdefault("", message)


def check(tracer: ModuleType, job: dict[str, Any]) -> dict[str, Any]:
    report = Report()
    for run in job["inputs"]:
        trace_input(tracer, job, run, report)
    viz = job["viz"]
    events = viz.get("events") or []
    predicts = viz.get("predict") or []
    primary = viz.get("primary")
    if primary and job["inputs"] and primary not in report.seen:
        report.warnings.setdefault("primary", f"{primary!r} is never a variable of the trace")
    return {
        "errors": [{"path": path, "message": message} for path, message in report.errors.items()],
        "warnings": [
            {"path": path, "message": message} for path, message in report.warnings.items()
        ],
        "unfired": [ev["id"] for ev in events if not report.fired[ev["id"]]],
        "unreached": [i for i in range(len(predicts)) if i not in report.reached],
    }


def load_module(name: str, path: str) -> ModuleType:
    """A file of apps/web/public/py as a module, registered under `name` (the tracer
    imports the harness by its name). Its source runs in a new module, so no bytecode is
    written next to it (apps/web/public/ is served as is)."""
    module = ModuleType(name)
    module.__file__ = path
    sys.modules[name] = module
    with open(path, encoding="utf-8") as source:
        exec(compile(source.read(), path, "exec"), module.__dict__)
    return module


def load_tracer(harness_path: str, tracer_path: str | None = None) -> ModuleType:
    load_module("seecode_harness", harness_path)
    path = tracer_path or str(Path(harness_path).with_name("tracer.py"))
    return load_module("seecode_tracer", path)


def main() -> None:
    tracer = load_tracer(sys.argv[1], sys.argv[2] if len(sys.argv) > 2 else None)
    job = json.load(sys.stdin)
    # The tracer captures what the code prints; anything else goes to stderr, so it
    # cannot corrupt the JSON.
    out, sys.stdout = sys.stdout, sys.stderr
    out.write(json.dumps(check(tracer, job)))


if __name__ == "__main__":
    main()

"""SeeCode tracer (Sections 8.2 and 8.4, with PARITY_PLAN 4.5 node snapshots).

Runs code under sys.settrace and records a Frame at each line and return event of the
solution's own code. The browser runner loads it into Pyodide next to the test harness
(this file is imported as `seecode_tracer`, the harness as `seecode_harness`); the web unit
tests run it in CPython. Standard library only.

    run_traced(code, entry, input_json, viz_json=None, spec_json=None) -> JSON string

`input_json` is {"args": [...]} for a function problem or {"ops": [[name, *args], ...]} for
a design problem; `viz_json` is the problem's viz config (8.4), or empty for "Trace my
code"; `spec_json` is the harness spec ({"kind", "io", "checker"}), or empty for a function
problem with plain JSON arguments.

The code runs as scripts/viz_trace.py (the validator's replica of these rules) runs it: in
the harness namespace (prelude included), with the arguments built from their io types
before the code is loaded, and for a design problem the constructor and every call traced,
in order. With an older harness that has no io helpers, the arguments stay plain JSON.

A step is recorded for every "line" event (it fires before its line runs: the locals are the
state just before it) and every "return" event of a "<solution>" frame, up to MAX_STEPS.
Generator expressions and lambdas (`<genexpr>`, `<lambda>`, and the comprehension frames of
older Pythons) are not traced: they run inside their line. On a line with a comprehension,
the repeated line events of the inlined loop (Python 3.12+) are one step. Locals whose name
is not an identifier (a comprehension's `.0`) are left out.

At each line step every viz event whose marker (`# viz:<name>`, the first on its line) is
on the step's line and whose `when` holds is tagged (return steps are never tagged, so a
marker on a `return` line tags one step); the step's narration is the `say` of its first
tagged event that has one. `when` and `answerWhen` see only `len`, `say` (an f-string)
only `repr` and `len`, and all of them see the frame's locals without `self`. An
expression that raises is skipped: no tag, no narration, no answer. `trace(...,
on_error=report)` also evaluates every tagged event's `say` and calls
`report(path, error, line)` for each expression that raises (path like "events[2].say",
"predict[0].answerWhen"): scripts/viz_trace.py validates content with it.

Trace:  {"steps": [Frame], "result": Snap, "error": str | null, "errorLine": int | null,
         "truncated": bool, "stdout": str}
Frame:  {"line", "event": "line" | "return", "func", "depth", "locals": {name: Snap},
         "tags": [event id ..., "predict:<n>" ...], "say"?, "ret"?,
         "self"?: {attribute: Snap}, "nodes"?: {id: Snap}, "nodesTruncated"?: true,
         "predictAnswers"?: {n: Snap}}

Snaps are JSON-safe descriptions of values (see `_Snapper.snap`). Nodes, objects with a
`val` and a link attribute (`next`, `left`, `right`, `random` or `neighbors`, as LeetCode's
ListNode, TreeNode and Node), keep their identity: {"t": "node", "id", "cls", "val", "next"
/ "left" / "right" / "random": id | null, "neighbors": [id]}, with the same id for the same
object across the whole trace. A step lists every node reachable from its locals once, in
`nodes`, so a variable holding a node can be drawn as an arrow and a shared node only once.
`self` is left out of the locals (narration never reads it); a method of the code's own
class also gets the instance's attributes in `self`.

Predict points (8.4): when the event `atEvent` fires for the `occurrence`-th time, the step
gets the tag "predict:<n>" (n is the point's index in viz.predict) and its answer in
predictAnswers[n]: for "yesno", `answerWhen` evaluated at that step; for "index" and
"value", the value `var` has at the next step of the same call where it changed, or where
the statement that just ran assigned it (so an equal value still answers). A point whose
answer cannot be worked out has the tag and no answer.
"""

import ast
import contextlib
import copy
import importlib
import io
import itertools
import json
import math
import re
import sys
import traceback
from collections import Counter, deque
from collections.abc import Callable, Mapping, Sequence
from types import CodeType, FrameType, ModuleType
from typing import Any


def _load_harness() -> ModuleType | None:
    """The test harness (harness.py), imported first in the browser and in tests."""
    try:
        return importlib.import_module("seecode_harness")
    except ImportError:
        return None


_harness = _load_harness()

SOLUTION_FILE = "<solution>"
MAX_STEPS = 3000
MAX_ITEMS = 64
MAX_STR = 200
MAX_DEPTH = 3
MAX_REPR = 80
MAX_STEP_NODES = 200
MAX_STDOUT = 4000
# JavaScript reads larger integers inexactly, so they are shown as text.
MAX_SAFE_INT = 2**53 - 1
MARKER_RE = re.compile(r"#\s*viz:([a-zA-Z0-9_]+)")
# The only builtins narration and conditions get (answerWhen is a condition).
SAY_BUILTINS: dict[str, Any] = {"repr": repr, "len": len}
CONDITION_BUILTINS: dict[str, Any] = {"len": len}
NODE_LINKS = ("next", "left", "right", "random")
PREDICT_TAG = "predict:"
# Used only when the harness is missing (it defines the real prelude).
FALLBACK_PRELUDE = (
    "from typing import *\n"
    "from collections import *\n"
    "import heapq, bisect, math, itertools, functools\n"
)

Snap = dict[str, Any]
# on_error(path, error, line): a viz expression raised (see the module docstring).
Reporter = Callable[[str, BaseException, int], None]
# Frames that run inside one line: never traced.
SKIPPED_FRAMES = frozenset({"<genexpr>", "<lambda>", "<listcomp>", "<setcomp>", "<dictcomp>"})


class StepLimit(BaseException):
    """Ends a trace at MAX_STEPS. A BaseException, so `except Exception` in the code cannot
    swallow it."""


# ---------------------------------------------------------------- snapshots


def _safe_repr(value: Any) -> str:
    try:
        return repr(value)
    except BaseException:  # a __repr__ that raises, or an int too long to print
        return f"<{type(value).__name__}>"


def _short_repr(value: Any) -> str:
    text = _safe_repr(value)
    return text if len(text) <= MAX_REPR else text[: MAX_REPR - 1] + "…"


def _instance_dict(value: Any) -> dict[str, Any] | None:
    """The instance attributes, read without running the object's own attribute hooks."""
    try:
        attributes = object.__getattribute__(value, "__dict__")
    except BaseException:
        return None
    return attributes if isinstance(attributes, dict) else None


def _is_node(value: Any) -> bool:
    if value is None or isinstance(value, type):
        return False
    attributes = _instance_dict(value)
    if attributes is None or "val" not in attributes:
        return False
    return "neighbors" in attributes or any(link in attributes for link in NODE_LINKS)


def _linked(attributes: Mapping[str, Any]) -> list[Any]:
    """The nodes a node links to, in a fixed order."""
    out = [attributes[link] for link in NODE_LINKS if _is_node(attributes.get(link))]
    neighbors = attributes.get("neighbors")
    if isinstance(neighbors, list | tuple):
        out.extend(node for node in neighbors[:MAX_ITEMS] if _is_node(node))
    return out


class _Snapper:
    """Snapshots values; gives every node object one id for the whole trace."""

    def __init__(self) -> None:
        self._ids: dict[int, int] = {}
        # Every node seen stays alive, so a later object never reuses its id().
        self._keep: list[Any] = []

    def node_id(self, node: Any) -> int:
        key = id(node)
        found = self._ids.get(key)
        if found is None:
            found = len(self._ids) + 1
            self._ids[key] = found
            self._keep.append(node)
        return found

    def snap(self, value: Any, depth: int = 0, found: list[Any] | None = None) -> Snap:
        """A JSON-safe description of a value (Section 8.3), at most MAX_DEPTH levels deep.
        Nodes met on the way are added to `found`."""
        if depth > MAX_DEPTH:
            return {"t": "trunc"}
        if value is None or isinstance(value, bool):
            return {"t": "prim", "v": value}
        if isinstance(value, int):
            if -MAX_SAFE_INT <= value <= MAX_SAFE_INT:
                return {"t": "prim", "v": int(value)}
            return {"t": "obj", "v": _short_repr(value), "cls": "int"}
        if isinstance(value, float):
            if math.isfinite(value):  # "f" keeps 4.0 apart from 4 once it is JSON
                return {"t": "prim", "v": float(value), "f": True}
            return {"t": "obj", "v": repr(float(value)), "cls": "float"}
        if isinstance(value, str):
            return {"t": "str", "v": str(value[:MAX_STR]), "n": len(value)}
        try:
            return self._snap_container(value, depth, found)
        except BaseException:  # a container that changes size or fails while being read
            return {"t": "obj", "v": _short_repr(value), "cls": type(value).__name__}

    def _snap_container(self, value: Any, depth: int, found: list[Any] | None) -> Snap:
        inner = depth + 1
        if isinstance(value, deque):
            items = list(itertools.islice(value, MAX_ITEMS))
            return {"t": "deque", "v": [self.snap(x, inner, found) for x in items], "n": len(value)}
        if isinstance(value, list | tuple):
            items = list(value[:MAX_ITEMS])
            return {
                "t": "list",
                "v": [self.snap(x, inner, found) for x in items],
                "n": len(value),
                "cls": type(value).__name__,
            }
        if isinstance(value, dict):
            pairs = list(itertools.islice(value.items(), MAX_ITEMS))
            return {
                "t": "dict",
                "v": [[self.snap(k, inner, found), self.snap(x, inner, found)] for k, x in pairs],
                "n": len(value),
                "cls": type(value).__name__,
            }
        if isinstance(value, set | frozenset):
            items = sorted(value, key=_safe_repr)[:MAX_ITEMS]
            out: Snap = {"t": "set", "v": [self.snap(x, inner, found) for x in items]}
            out["n"] = len(value)
            if isinstance(value, frozenset):
                out["cls"] = "frozenset"
            return out
        if _is_node(value):
            if found is not None:
                found.append(value)
            return self.node(value, depth)
        return {"t": "obj", "v": _short_repr(value), "cls": type(value).__name__}

    def node(self, node: Any, depth: int) -> Snap:
        attributes = _instance_dict(node) or {}
        out: Snap = {
            "t": "node",
            "id": self.node_id(node),
            "cls": type(node).__name__,
            "val": self.snap(attributes.get("val"), depth + 1),
        }
        for link in NODE_LINKS:
            if link in attributes:
                target = attributes[link]
                out[link] = self.node_id(target) if _is_node(target) else None
        if "neighbors" in attributes:
            neighbors = attributes["neighbors"]
            out["neighbors"] = (
                [self.node_id(x) for x in neighbors[:MAX_ITEMS] if _is_node(x)]
                if isinstance(neighbors, list | tuple)
                else []
            )
        return out

    def node_table(self, roots: Sequence[Any]) -> tuple[dict[str, Snap], bool]:
        """Every node reachable from `roots`, once each (breadth first), and whether the
        table stopped at MAX_STEP_NODES."""
        table: dict[str, Snap] = {}
        queue: deque[Any] = deque(roots)
        while queue:
            node = queue.popleft()
            key = str(self.node_id(node))
            if key in table:
                continue
            if len(table) >= MAX_STEP_NODES:
                return table, True
            table[key] = self.node(node, 0)
            queue.extend(_linked(_instance_dict(node) or {}))
        return table, False


# ---------------------------------------------------------------- the code


def marker_lines(code: str) -> dict[str, list[int]]:
    """`# viz:<name>` markers by line (the first on each line), as scripts/viz_trace.py."""
    out: dict[str, list[int]] = {}
    for lineno, line in enumerate(code.splitlines(), start=1):
        if match := MARKER_RE.search(line):
            out.setdefault(match.group(1), []).append(lineno)
    return out


def _target_names(targets: Sequence[ast.expr]) -> set[str]:
    names: set[str] = set()
    for target in targets:
        if isinstance(target, ast.Name):
            names.add(target.id)
        elif isinstance(target, ast.Tuple | ast.List):
            names |= _target_names(target.elts)
        elif isinstance(target, ast.Starred):
            names |= _target_names([target.value])
    return names


def assignments(code: str) -> dict[int, tuple[int, int, frozenset[str]]]:
    """For each line of a statement that binds local names (an assignment, a `for` header,
    a walrus), the statement's first and last line and the names it binds."""
    try:
        tree = ast.parse(code)
    except (SyntaxError, ValueError):
        return {}
    out: dict[int, tuple[int, int, frozenset[str]]] = {}
    for node in ast.walk(tree):
        names: set[str] = set()
        start = getattr(node, "lineno", 0)
        end = getattr(node, "end_lineno", None) or start
        if isinstance(node, ast.Assign):
            names = _target_names(node.targets)
        elif isinstance(node, ast.AugAssign | ast.AnnAssign | ast.NamedExpr):
            if not (isinstance(node, ast.AnnAssign) and node.value is None):
                names = _target_names([node.target])
        elif isinstance(node, ast.For | ast.AsyncFor):
            names = _target_names([node.target])
            end = node.iter.end_lineno or start  # the header only
        if not names:
            continue
        for line in range(start, end + 1):
            found = out.get(line)
            if found is not None and found[:2] == (start, end):
                names |= found[2]
            out[line] = (start, end, frozenset(names))
    return out


def comprehension_lines(code: str) -> frozenset[int]:
    """Lines with a list, set or dict comprehension (inlined since Python 3.12: its loop
    fires line events on its own line again and again)."""
    try:
        tree = ast.parse(code)
    except (SyntaxError, ValueError):
        return frozenset()
    lines: set[int] = set()
    for node in ast.walk(tree):
        if isinstance(node, ast.ListComp | ast.SetComp | ast.DictComp):
            lines.update(range(node.lineno, (node.end_lineno or node.lineno) + 1))
    return frozenset(lines)


def _compile(source: Any, *, fstring: bool = False) -> CodeType | None:
    """A viz expression compiled once; None when it does not compile (it never fires)."""
    if not isinstance(source, str) or not source:
        return None
    try:
        return compile("f" + repr(source) if fstring else source, "<viz>", "eval")
    except (SyntaxError, ValueError):
        return None


def _depth(frame: FrameType | None) -> int:
    depth = 0
    while frame is not None:
        if frame.f_code.co_filename == SOLUTION_FILE:
            depth += 1
        frame = frame.f_back
    return depth


class _Wait:
    """An index or value predict point waiting for its variable's next value."""

    __slots__ = ("before", "frame", "last", "n", "step", "var")

    def __init__(self, n: int, var: str, frame: FrameType, step: int, before: Snap | None) -> None:
        self.n = n
        self.var = var
        self.frame = frame
        self.last = frame.f_lineno  # the line about to run in that frame
        self.step = step
        self.before = before


class _Event:
    """A viz event, compiled. `index` is its place in viz.events (for error paths)."""

    __slots__ = ("has_when", "id", "index", "lines", "say", "when")

    def __init__(
        self, index: int, data: Mapping[str, Any], markers: Mapping[str, list[int]]
    ) -> None:
        self.index = index
        self.id: str = data["id"]
        at = data.get("at")
        # No marker: every line (the content model requires one; "Trace my code" has none).
        self.lines = frozenset(markers.get(at, ())) if at else None
        when = data.get("when")
        self.has_when = bool(when)
        self.when = _compile(when)
        self.say = _compile(data.get("say"), fstring=True)


class _Predict:
    """A predict point (8.4), compiled. `n` is its place in viz.predict."""

    __slots__ = ("answer_when", "at_event", "n", "occurrence", "var")

    def __init__(self, n: int, data: Mapping[str, Any]) -> None:
        self.n = n
        self.at_event = data.get("atEvent")
        occurrence = data.get("occurrence")
        self.occurrence = occurrence if isinstance(occurrence, int) and occurrence > 0 else 1
        kind = data.get("kind")
        var = data.get("var") if kind in ("index", "value") else None
        self.var: str | None = var if isinstance(var, str) else None
        self.answer_when = _compile(data.get("answerWhen")) if kind == "yesno" else None


class _Run:
    """One traced run: the trace function and what it records."""

    def __init__(
        self,
        code: str,
        viz: Mapping[str, Any],
        module_name: str,
        on_error: Reporter | None = None,
    ) -> None:
        markers = marker_lines(code)
        self.events = [
            _Event(i, event, markers)
            for i, event in enumerate(viz.get("events") or [])
            if isinstance(event, Mapping) and isinstance(event.get("id"), str)
        ]
        self.predicts = [
            _Predict(n, point)
            for n, point in enumerate(viz.get("predict") or [])
            if isinstance(point, Mapping)
        ]
        self.assigned = assignments(code) if any(p.var for p in self.predicts) else {}
        self.comprehensions = comprehension_lines(code)
        self.module_name = module_name
        self.on_error = on_error
        self.counts: Counter[str] = Counter()
        self.steps: list[dict[str, Any]] = []
        self.snapper = _Snapper()
        self.waits: list[_Wait] = []
        self.raising: set[FrameType] = set()
        # The last event recorded in each frame: (event, line).
        self.previous: dict[FrameType, tuple[str, int]] = {}
        self._line = 0  # the line of the step being recorded (for on_error)

    def _evaluate(
        self, code: CodeType | None, builtins: dict[str, Any], env: dict[str, Any], path: str
    ) -> tuple[bool, Any]:
        """(True, value), or (False, None) when the expression is missing or raises."""
        if code is None:
            return False, None
        try:
            return True, eval(code, {"__builtins__": builtins}, env)
        except Exception as exc:
            if self.on_error is not None:
                self.on_error(path, exc, self._line)
            return False, None

    def trace(self, frame: FrameType, event: str, arg: Any) -> Any:
        code = frame.f_code
        if code.co_filename != SOLUTION_FILE or code.co_name in SKIPPED_FRAMES:
            return None
        if event == "exception":
            self.raising.add(frame)
            return self.trace
        if event != "line" and event != "return":
            return self.trace
        line = frame.f_lineno
        previous = self.previous.get(frame)
        if event == "return":
            self.previous.pop(frame, None)
        else:
            self.previous[frame] = (event, line)
            if previous == ("line", line) and line in self.comprehensions:
                return self.trace  # the inlined comprehension's loop: still the same step
        if len(self.steps) >= MAX_STEPS:
            raise StepLimit
        self._line = line
        f_locals = frame.f_locals
        env = {
            name: value
            for name, value in f_locals.items()
            if name != "self" and name.isidentifier()
        }
        if self.waits:
            self._answer_waits(frame, event, line, env)

        tags: list[str] = []
        say: str | None = None
        if event == "line":
            say = self._tag(line, env, tags)

        found: list[Any] = []
        snap = self.snapper.snap
        step: dict[str, Any] = {
            "line": line,
            "event": event,
            "func": code.co_name,
            "depth": _depth(frame),
            "locals": {name: snap(value, 0, found) for name, value in env.items()},
            "tags": tags,
        }
        if say:
            step["say"] = say
        if event == "return":
            if frame in self.raising:  # leaving with an exception: nothing is returned
                self.raising.discard(frame)
            else:
                step["ret"] = snap(arg, 0, found)
        elif self.raising:
            self.raising.discard(frame)
        owner = f_locals.get("self")
        if owner is not None and getattr(type(owner), "__module__", None) == self.module_name:
            attributes = _instance_dict(owner)
            if attributes:
                step["self"] = {
                    name: snap(value, 0, found)
                    for name, value in itertools.islice(attributes.items(), MAX_ITEMS)
                    if not callable(value)
                }
        if found:
            nodes, cut = self.snapper.node_table(found)
            step["nodes"] = nodes
            if cut:
                step["nodesTruncated"] = True
        if event == "line":
            self._predict(frame, env, tags, step)
        self.steps.append(step)
        return self.trace

    def _tag(self, line: int, env: dict[str, Any], tags: list[str]) -> str | None:
        """Tags the events that fire at this line step; returns the narration."""
        say: str | None = None
        for event in self.events:
            if event.lines is not None and line not in event.lines:
                continue
            if event.has_when:
                ok, value = self._evaluate(
                    event.when, CONDITION_BUILTINS, env, f"events[{event.index}].when"
                )
                if not ok or not value:
                    continue
            tags.append(event.id)
            self.counts[event.id] += 1
            if event.say is not None and (say is None or self.on_error is not None):
                ok, text = self._evaluate(
                    event.say, SAY_BUILTINS, env, f"events[{event.index}].say"
                )
                if ok and say is None:
                    say = str(text)
        return say

    def _predict(
        self, frame: FrameType, env: dict[str, Any], tags: list[str], step: dict[str, Any]
    ) -> None:
        """Tags the predict points asked at this step and works out their answers."""
        fired = list(tags)
        for point in self.predicts:
            if point.at_event not in fired or self.counts[point.at_event] != point.occurrence:
                continue
            tags.append(f"{PREDICT_TAG}{point.n}")
            if point.answer_when is not None:
                ok, value = self._evaluate(
                    point.answer_when, CONDITION_BUILTINS, env, f"predict[{point.n}].answerWhen"
                )
                if ok:
                    answer = {"t": "prim", "v": bool(value)}
                    step.setdefault("predictAnswers", {})[str(point.n)] = answer
            elif point.var is not None:
                before = self.snapper.snap(env[point.var]) if point.var in env else None
                self.waits.append(_Wait(point.n, point.var, frame, len(self.steps), before))

    def _answer_waits(self, frame: FrameType, event: str, line: int, env: dict[str, Any]) -> None:
        """Answers the predict points waiting in this frame whose variable just changed or
        was just assigned. A return event ends the wait either way."""
        waiting: list[_Wait] = []
        for wait in self.waits:
            if wait.frame is not frame:
                waiting.append(wait)
                continue
            answer: Snap | None = None
            if wait.var in env:
                current = self.snapper.snap(env[wait.var])
                bound = self.assigned.get(wait.last)
                # The statement that was about to run has finished once this event is
                # outside it (a multi-line statement fires line events inside itself).
                assigned = bound is not None and wait.var in bound[2]
                finished = bound is not None and (
                    event == "return" or bound[0] == bound[1] or not bound[0] <= line <= bound[1]
                )
                if (assigned and finished) or current != wait.before:
                    answer = current
            if answer is not None:
                self.steps[wait.step].setdefault("predictAnswers", {})[str(wait.n)] = answer
            elif event == "line":
                wait.last = line
                waiting.append(wait)
        self.waits = waiting


# ---------------------------------------------------------------- running


class _Output(io.StringIO):
    """What the code prints; `sys.stdout.close()` keeps it."""

    def close(self) -> None:
        pass


def _new_namespace(spec: Any) -> dict[str, Any]:
    harness = _harness
    if harness is not None and hasattr(harness, "new_namespace"):
        namespace: dict[str, Any] = (
            harness.new_namespace(spec) if spec is not None else harness.new_namespace()
        )
        return namespace
    namespace = {"__name__": "solution"}
    exec(compile(FALLBACK_PRELUDE, "<prelude>", "exec"), namespace)
    return namespace


def _resolve_refs(args: Sequence[Any], outputs: Sequence[Any]) -> list[Any]:
    harness = _harness
    if harness is not None and hasattr(harness, "resolve_refs"):
        resolved: list[Any] = harness.resolve_refs(args, outputs)
        return resolved
    return [outputs[a["$ref"]] if isinstance(a, dict) and "$ref" in a else a for a in args]


def _replay(design_class: Any, calls: list[Any]) -> list[Any]:
    """A design test's calls in order, as the harness makes them: construct, then call."""
    if not calls or not isinstance(calls[0], list) or not calls[0]:
        raise ValueError("A design input needs its calls, the constructor first.")
    outputs: list[Any] = []
    instance = design_class(*_resolve_refs(calls[0][1:], outputs))
    outputs.append(None)
    for call in calls[1:]:
        name, *args = call
        outputs.append(getattr(instance, name)(*_resolve_refs(args, outputs)))
    return outputs


def _prepare(
    code: str, entry: str, given: Mapping[str, Any], spec_data: Any
) -> tuple[Callable[[], Any], str]:
    """Loads the code and returns what runs the input (the entry method on its arguments,
    or a design input's calls) and the namespace's module name."""
    harness = _harness
    spec = None
    if harness is not None and hasattr(harness, "parse_spec"):
        spec = harness.parse_spec(spec_data)
        kind = spec.kind
    else:
        kind = (spec_data or {}).get("kind") if isinstance(spec_data, Mapping) else None
    namespace = _new_namespace(spec)
    module_name = str(namespace.get("__name__", "solution"))
    if kind == "design":
        calls = copy.deepcopy(list(given.get("ops") or []))
        exec(compile(code, SOLUTION_FILE, "exec"), namespace)
        design_class = namespace.get(entry)
        if not isinstance(design_class, type):
            raise NameError(f"Define a class named {entry}.")
        return (lambda: _replay(design_class, calls)), module_name
    args = copy.deepcopy(list(given.get("args") or []))
    if spec is not None and harness is not None and hasattr(harness, "convert_args"):
        # Built before the code runs, which may define its own ListNode (as run_tests does).
        args = harness.convert_args(args, spec, namespace)
    exec(compile(code, SOLUTION_FILE, "exec"), namespace)
    solution_class = namespace.get("Solution")
    if not isinstance(solution_class, type):
        raise NameError("Define a class named Solution.")
    method = getattr(solution_class(), entry)
    return (lambda: method(*args)), module_name


def _describe(exc: BaseException) -> tuple[str, int | None]:
    """`Type: message` (Section 8.2) and the line of the user's code it points at."""
    if isinstance(exc, SyntaxError) and exc.filename == SOLUTION_FILE:
        return f"{type(exc).__name__}: {exc.msg} (line {exc.lineno})", exc.lineno
    try:
        message = str(exc)
    except BaseException:
        message = ""
    text = f"{type(exc).__name__}: {message}" if message else type(exc).__name__
    frames = traceback.extract_tb(exc.__traceback__)
    lines = [frame.lineno for frame in frames if frame.filename == SOLUTION_FILE]
    return text, (lines[-1] if lines else None)


def _loads(value: Any) -> Any:
    """A JSON argument: text, an already parsed object, or nothing (None, "", or Pyodide's
    jsnull for a JavaScript null)."""
    if isinstance(value, str):
        return json.loads(value) if value.strip() else None
    return value if isinstance(value, Mapping | list) else None


def trace(
    code: str,
    entry: str,
    given: Mapping[str, Any] | Sequence[Any],
    viz: Mapping[str, Any] | None = None,
    spec: Any = None,
    *,
    on_error: Reporter | None = None,
) -> dict[str, Any]:
    """The trace of one input, as a dict (run_traced returns it as JSON). `given` is
    {"args": [...]} or {"ops": [...]} (a bare list is the arguments); `spec` the harness
    spec (a dict, a JSON string or None); `on_error` see the module docstring."""
    if not isinstance(given, Mapping):
        given = {"args": list(given)}
    snapper = _Snapper()
    error: str | None = None
    error_line: int | None = None
    result: Any = None
    truncated = False
    stdout = _Output()
    run: _Run | None = None
    with contextlib.redirect_stdout(stdout):
        try:
            start, module_name = _prepare(code, entry, given, spec)
        except KeyboardInterrupt:
            raise
        except BaseException as exc:  # code or arguments that do not load
            error, error_line = _describe(exc)
        else:
            run = _Run(code, viz or {}, module_name, on_error)
            snapper = run.snapper
            outer = sys.gettrace()  # a debugger's or coverage's, restored afterwards
            sys.settrace(run.trace)
            try:
                result = start()
            except StepLimit:
                truncated = True
            except KeyboardInterrupt:
                raise
            except BaseException as exc:  # SystemExit and custom exceptions included
                error, error_line = _describe(exc)
            finally:
                sys.settrace(outer)
    return {
        "steps": run.steps if run is not None else [],
        "result": snapper.snap(result),
        "error": error,
        "errorLine": error_line,
        "truncated": truncated,
        "stdout": stdout.getvalue()[:MAX_STDOUT],
    }


def run_traced(
    code: str,
    entry: str,
    input_json: str,
    viz_json: str | None = None,
    spec_json: str | None = None,
) -> str:
    """The trace of one input as a JSON string (see the module docstring)."""
    given = _loads(input_json)
    viz = _loads(viz_json)
    spec = _loads(spec_json)
    result = trace(code, entry, given if given is not None else {}, viz or {}, spec)
    return json.dumps(result, separators=(",", ":"))

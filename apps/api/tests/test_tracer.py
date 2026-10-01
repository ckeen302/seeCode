"""apps/web/public/py/tracer.py (Section 8.2) in CPython, as the browser runs it in Pyodide."""

import json
import sys
from collections import Counter, OrderedDict, defaultdict, deque
from pathlib import Path
from types import ModuleType
from typing import Any

import pytest

from tests.harness_helpers import harness

TRACER_PATH = Path(__file__).resolve().parents[3] / "apps" / "web" / "public" / "py" / "tracer.py"


def _load_tracer() -> ModuleType:
    # The tracer imports the harness by name, as in the browser. Its source runs in a new
    # module, so no bytecode is written into the served public/ folder.
    sys.modules["seecode_harness"] = harness
    module = ModuleType("seecode_tracer")
    module.__file__ = str(TRACER_PATH)
    exec(
        compile(TRACER_PATH.read_text(encoding="utf-8"), str(TRACER_PATH), "exec"), module.__dict__
    )
    return module


tracer = _load_tracer()


def trace(code: str, entry: str, args: Any, viz: Any = None, spec: Any = None) -> dict[str, Any]:
    """run_traced as the worker calls it: JSON in, JSON out."""
    given = args if isinstance(args, dict) else {"args": args}
    out = tracer.run_traced(
        code,
        entry,
        json.dumps(given),
        None if viz is None else json.dumps(viz),
        None if spec is None else json.dumps(spec),
    )
    result: dict[str, Any] = json.loads(out)
    return result


def prim(value: Any) -> dict[str, Any]:
    return {"t": "prim", "v": value}


def snap(value: Any) -> Any:
    return tracer._Snapper().snap(value)


def lines(result: dict[str, Any]) -> list[tuple[str, int]]:
    return [(step["event"], step["line"]) for step in result["steps"]]


PALINDROME = """class Solution:
    def isPalindrome(self, s: str) -> bool:
        l, r = 0, len(s) - 1
        while l < r:
            if not s[l].isalnum():
                l += 1  # viz:skip_l
            elif not s[r].isalnum():
                r -= 1  # viz:skip_r
            elif s[l].lower() != s[r].lower():  # viz:compare
                return False  # viz:mismatch
            else:
                l += 1  # viz:match
                r -= 1
        return True  # viz:done
"""

PALINDROME_VIZ = {
    "primary": "s",
    "events": [
        {"id": "skip_l", "at": "skip_l", "label": "skip", "say": "s[{l}] is {s[l]!r}, skip it"},
        {"id": "skip_r", "at": "skip_r", "label": "skip", "say": "s[{r}] is {s[r]!r}, skip it"},
        {"id": "compare", "at": "compare", "label": "compare", "say": "Compare {s[l]!r}"},
        {"id": "match", "at": "match", "label": "match"},
        {"id": "mismatch", "at": "mismatch", "label": "mismatch", "say": "They differ"},
        {"id": "done", "at": "done", "label": "return", "say": "All pairs matched"},
    ],
    "predict": [
        {"atEvent": "skip_r", "occurrence": 1, "ask": "r?", "var": "r", "kind": "index"},
        {
            "atEvent": "compare",
            "occurrence": 2,
            "ask": "Match?",
            "kind": "yesno",
            "answerWhen": "s[l].lower() == s[r].lower()",
        },
    ],
}


# ---------------------------------------------------------------- snapshots


def test_primitives_and_strings() -> None:
    assert snap(None) == prim(None)
    assert snap(True) == prim(True)
    assert snap(7) == prim(7)
    assert snap(2.5) == {"t": "prim", "v": 2.5, "f": True}
    assert snap(4.0) == {"t": "prim", "v": 4.0, "f": True}
    assert snap(float("inf")) == {"t": "obj", "v": "inf", "cls": "float"}
    assert snap(2**60) == {"t": "obj", "v": str(2**60), "cls": "int"}
    assert snap("abc") == {"t": "str", "v": "abc", "n": 3}
    long = "x" * 500
    assert snap(long) == {"t": "str", "v": "x" * tracer.MAX_STR, "n": 500}


def test_containers() -> None:
    assert snap([1, "a"]) == {
        "t": "list",
        "v": [prim(1), {"t": "str", "v": "a", "n": 1}],
        "n": 2,
        "cls": "list",
    }
    assert snap((1,))["cls"] == "tuple"
    assert snap(deque([1, 2])) == {"t": "deque", "v": [prim(1), prim(2)], "n": 2}
    assert snap({"a": 1}) == {
        "t": "dict",
        "v": [[{"t": "str", "v": "a", "n": 1}, prim(1)]],
        "n": 1,
        "cls": "dict",
    }
    assert snap(Counter("aab"))["cls"] == "Counter"
    assert snap(defaultdict(list))["cls"] == "defaultdict"
    assert snap(OrderedDict())["cls"] == "OrderedDict"
    assert snap({3, 1, 2}) == {"t": "set", "v": [prim(1), prim(2), prim(3)], "n": 3}
    assert snap(frozenset({1}))["cls"] == "frozenset"


def test_limits() -> None:
    big = snap(list(range(100)))
    assert big["n"] == 100
    assert len(big["v"]) == tracer.MAX_ITEMS
    nested = snap([[[[[1]]]]])
    assert nested["v"][0]["v"][0]["v"][0]["v"][0] == {"t": "trunc"}


def test_objects_show_their_repr() -> None:
    class Point:
        def __repr__(self) -> str:
            return "Point(1, 2)"

    class Broken:
        def __repr__(self) -> str:
            raise RuntimeError("no")

    assert snap(Point()) == {"t": "obj", "v": "Point(1, 2)", "cls": "Point"}
    # No memory addresses: a trace is the same on every run.
    assert snap(lambda: 0)["v"] == "<function test_objects_show_their_repr.<locals>.<lambda>>"
    assert " at 0x" not in snap(object())["v"]
    assert snap(Broken()) == {"t": "obj", "v": "<Broken>", "cls": "Broken"}
    assert snap(range(3))["t"] == "obj"


def test_values_are_json_safe() -> None:
    value = [float("nan"), {1: {2, 3}}, (None, b"x"), 2**70]
    json.dumps(snap(value), allow_nan=False)


# ---------------------------------------------------------------- steps


def test_a_line_step_shows_the_state_before_its_line_runs() -> None:
    code = (
        "class Solution:\n    def f(self, n):\n        x = n + 1\n        x *= 2\n"
        "        return x\n"
    )
    result = trace(code, "f", [3])
    assert result["error"] is None
    assert result["result"] == prim(8)
    assert lines(result) == [("line", 3), ("line", 4), ("line", 5), ("return", 5)]
    steps = result["steps"]
    assert steps[0]["locals"] == {"n": prim(3)}  # x is not assigned yet
    assert steps[1]["locals"]["x"] == prim(4)
    assert steps[3]["ret"] == prim(8)
    assert all(step["func"] == "f" and step["depth"] == 1 for step in steps)
    assert "self" not in steps[0]["locals"]


def test_recursion_depth() -> None:
    code = (
        "class Solution:\n"
        "    def f(self, n):\n"
        "        if n == 0:\n"
        "            return 0\n"
        "        return 1 + self.f(n - 1)\n"
    )
    result = trace(code, "f", [2])
    assert result["result"] == prim(2)
    assert max(step["depth"] for step in result["steps"]) == 3


def test_nested_functions_are_traced_but_generator_frames_are_not() -> None:
    code = (
        "class Solution:\n"
        "    def f(self, xs):\n"
        "        def double(x):\n"
        "            return x * 2\n"
        "        total = sum(double(x) for x in xs)\n"
        "        return total\n"
    )
    result = trace(code, "f", [[1, 2]])
    funcs = {step["func"] for step in result["steps"]}
    assert funcs == {"f", "double"}
    assert result["result"] == prim(6)


def test_a_comprehension_line_is_one_step_and_hides_its_iterator() -> None:
    code = (
        "class Solution:\n"
        "    def f(self, xs):\n"
        "        ys = [x * 2 for x in xs]  # viz:build\n"
        "        return ys\n"
    )
    viz = {"events": [{"id": "build", "at": "build", "label": "build"}]}
    result = trace(code, "f", [[1, 2, 3]], viz)
    assert lines(result) == [("line", 3), ("line", 4), ("return", 4)]
    assert result["steps"][0]["tags"] == ["build"]
    for step in result["steps"]:
        assert all(name.isidentifier() for name in step["locals"])


def test_one_line_loops_still_step_each_iteration() -> None:
    code = (
        "class Solution:\n"
        "    def f(self, xs):\n"
        "        total = 0\n"
        "        for x in xs: total += x  # viz:add\n"
        "        return total\n"
    )
    viz = {"events": [{"id": "add", "at": "add", "label": "add"}]}
    result = trace(code, "f", [[1, 2, 3]], viz)
    assert sum("add" in step["tags"] for step in result["steps"]) >= 3


def test_the_step_limit_keeps_the_partial_trace() -> None:
    code = (
        "class Solution:\n"
        "    def f(self):\n"
        "        while True:\n"
        "            try:\n"
        "                pass\n"
        "            except Exception:\n"
        "                pass\n"
    )
    result = trace(code, "f", [])
    assert result["truncated"] is True
    assert result["error"] is None
    assert len(result["steps"]) == tracer.MAX_STEPS


def test_errors_carry_the_line() -> None:
    code = "class Solution:\n    def f(self, xs):\n        return xs[5]\n"
    result = trace(code, "f", [[1]])
    assert result["error"] == "IndexError: list index out of range"
    assert result["errorLine"] == 3
    assert result["steps"][-1]["event"] == "return"
    assert "ret" not in result["steps"][-1]  # it raised: nothing was returned


def test_syntax_errors_and_missing_classes() -> None:
    bad = trace("class Solution:\n    def f(self):\n        return (\n", "f", [])
    assert bad["error"].startswith("SyntaxError: ")
    assert bad["errorLine"] == 3
    assert bad["steps"] == []
    missing = trace("x = 1\n", "f", [])
    assert missing["error"] == "NameError: Define a class named Solution."


def test_printed_output_is_kept() -> None:
    code = "class Solution:\n    def f(self):\n        print('hi')\n        return 1\n"
    result = trace(code, "f", [])
    assert result["stdout"] == "hi\n"


def test_an_outer_trace_function_is_restored() -> None:
    def outer(*_: Any) -> None:
        return None

    previous = sys.gettrace()
    sys.settrace(outer)
    try:
        trace("class Solution:\n    def f(self):\n        return 1\n", "f", [])
        assert sys.gettrace() is outer
    finally:
        sys.settrace(previous)


def test_arguments_are_copies() -> None:
    code = "class Solution:\n    def f(self, xs):\n        xs.append(9)\n        return xs\n"
    given = {"args": [[1]]}
    tracer.trace(code, "f", given)
    assert given == {"args": [[1]]}


# ---------------------------------------------------------------- events and narration


def test_events_tag_marker_lines_and_narrate() -> None:
    result = trace(PALINDROME, "isPalindrome", ["a!b ca"], PALINDROME_VIZ)
    tagged = [
        (step["line"], step["tags"], step.get("say")) for step in result["steps"] if step["tags"]
    ]
    assert tagged[0] == (9, ["compare"], "Compare 'a'")
    assert tagged[1] == (12, ["match"], None)
    assert (6, ["skip_l"], "s[1] is '!', skip it") in tagged
    # A marker on a return line tags the line step only, never the return step too.
    assert sum("mismatch" in step["tags"] for step in result["steps"]) == 1
    assert result["steps"][-1]["event"] == "return"
    assert result["steps"][-1]["tags"] == []
    assert result["result"] == prim(False)


def test_when_conditions_and_raising_expressions() -> None:
    code = (
        "class Solution:\n    def f(self, xs):\n        for x in xs:\n            pass  # viz:see\n"
    )
    viz = {
        "events": [
            {"id": "big", "at": "see", "label": "big", "when": "x > 1", "say": "{x} is big"},
            {"id": "boom", "at": "see", "label": "boom", "when": "xs[10] == 1"},
            {"id": "any", "at": "see", "label": "any", "say": "{xs[10]}"},
            {"id": "nope", "at": "see", "label": "nope", "when": "sorted(xs)"},  # no builtin
        ]
    }
    result = trace(code, "f", [[1, 2]], viz)
    tags = [step["tags"] for step in result["steps"] if step["line"] == 4]
    assert tags == [["any"], ["big", "any"]]
    says = [step.get("say") for step in result["steps"] if step["line"] == 4]
    assert says == [None, "2 is big"]


def test_on_error_reports_every_raising_expression() -> None:
    errors: list[tuple[str, str, int]] = []
    code = (
        "class Solution:\n    def f(self, xs):\n        for x in xs:\n            pass  # viz:see\n"
    )
    viz = {
        "events": [
            {"id": "a", "at": "see", "label": "a", "say": "{x}"},
            {"id": "b", "at": "see", "label": "b", "say": "{xs[9]}"},
            {"id": "c", "at": "see", "label": "c", "when": "y > 1"},
        ],
        "predict": [
            {"atEvent": "a", "occurrence": 1, "ask": "?", "kind": "yesno", "answerWhen": "1/0"}
        ],
    }
    tracer.trace(
        code,
        "f",
        {"args": [[1]]},
        viz,
        on_error=lambda path, exc, line: errors.append((path, type(exc).__name__, line)),
    )
    assert errors == [
        ("events[1].say", "IndexError", 4),
        ("events[2].when", "NameError", 4),
        ("predict[0].answerWhen", "ZeroDivisionError", 4),
    ]


# ---------------------------------------------------------------- predict points


def predict_steps(result: dict[str, Any]) -> dict[str, tuple[int, Any]]:
    out = {}
    for index, step in enumerate(result["steps"]):
        for tag in step["tags"]:
            if tag.startswith("predict:"):
                n = tag.split(":")[1]
                out[n] = (index, (step.get("predictAnswers") or {}).get(n))
    return out


def test_predict_points_get_tags_and_answers() -> None:
    result = trace(PALINDROME, "isPalindrome", ["ab,b!a"], PALINDROME_VIZ)
    found = predict_steps(result)
    # skip_r fires first with r = 4 ('!'); r moves to 3.
    index, answer = found["0"]
    assert result["steps"][index]["locals"]["r"] == prim(4)
    assert answer == prim(3)
    # The 2nd compare is 'b' against 'b'.
    assert found["1"][1] == prim(True)


def test_an_index_answer_counts_an_assignment_of_the_same_value() -> None:
    code = (
        "class Solution:\n"
        "    def f(self, xs):\n"
        "        i = 1\n"
        "        i = 1  # viz:again\n"
        "        return i\n"
    )
    viz = {
        "events": [{"id": "again", "at": "again", "label": "again"}],
        "predict": [
            {"atEvent": "again", "occurrence": 1, "ask": "i?", "var": "i", "kind": "value"}
        ],
    }
    assert predict_steps(trace(code, "f", [[]], viz))["0"][1] == prim(1)


def test_a_predict_point_with_no_next_value_has_no_answer() -> None:
    code = "class Solution:\n    def f(self, x):\n        return x  # viz:end\n"
    viz = {
        "events": [{"id": "end", "at": "end", "label": "end"}],
        "predict": [{"atEvent": "end", "occurrence": 1, "ask": "x?", "var": "x", "kind": "value"}],
    }
    assert predict_steps(trace(code, "f", [1], viz)) == {"0": (0, None)}


def test_an_occurrence_never_reached_adds_no_tag() -> None:
    viz = {**PALINDROME_VIZ, "predict": [{**PALINDROME_VIZ["predict"][1], "occurrence": 50}]}
    assert predict_steps(trace(PALINDROME, "isPalindrome", ["aa"], viz)) == {}


# ---------------------------------------------------------------- typed io and design problems


def test_linked_lists_keep_node_identity() -> None:
    code = (
        "class Solution:\n"
        "    def f(self, head):\n"
        "        prev, curr = None, head\n"
        "        while curr:\n"
        "            curr.next, prev, curr = prev, curr, curr.next\n"
        "        return prev\n"
    )
    spec = {"io": {"params": [{"name": "head", "type": "list_node"}], "returns": "list_node"}}
    result = trace(code, "f", [[1, 2, 3]], None, spec)
    assert result["error"] is None
    first = result["steps"][0]
    head = first["locals"]["head"]
    assert head["t"] == "node"
    assert head["cls"] == "ListNode"
    assert head["val"] == prim(1)
    assert set(first["nodes"]) == {"1", "2", "3"}
    assert first["nodes"]["1"]["next"] == 2
    assert first["nodes"]["3"]["next"] is None
    last = result["steps"][-1]
    assert last["ret"]["id"] == 3  # the same object keeps its id across the trace
    assert last["nodes"]["1"]["next"] is None
    assert last["nodes"]["2"]["next"] == 1


def test_a_cycle_is_listed_once() -> None:
    code = (
        "class Solution:\n"
        "    def f(self):\n"
        "        a = ListNode(1)\n"
        "        a.next = a\n"
        "        return 0\n"
    )
    result = trace(code, "f", [])
    assert result["steps"][-1]["nodes"] == {
        "1": {"t": "node", "id": 1, "cls": "ListNode", "val": prim(1), "next": 1}
    }


def test_trees() -> None:
    code = "class Solution:\n    def f(self, root):\n        return root.val\n"
    spec = {"io": {"params": [{"name": "root", "type": "tree_node"}]}}
    result = trace(code, "f", [[1, None, 2]], None, spec)
    nodes = result["steps"][0]["nodes"]
    assert nodes["1"]["left"] is None
    assert nodes["1"]["right"] == 2


MIN_STACK = """class MinStack:
    def __init__(self):
        self.vals = []

    def push(self, val):
        self.vals.append(val)  # viz:push

    def top(self):
        return self.vals[-1]
"""


def test_design_problems_trace_every_call() -> None:
    viz = {"events": [{"id": "push", "at": "push", "label": "push", "say": "push {val}"}]}
    ops = [["MinStack"], ["push", 3], ["push", 5], ["top"]]
    result = trace(MIN_STACK, "MinStack", {"ops": ops}, viz, {"kind": "design"})
    assert result["error"] is None
    assert result["result"] == {
        "t": "list",
        "v": [prim(None), prim(None), prim(None), prim(5)],
        "n": 4,
        "cls": "list",
    }
    funcs = [step["func"] for step in result["steps"] if step["event"] == "return"]
    assert funcs == ["__init__", "push", "push", "top"]
    says = [step["say"] for step in result["steps"] if "say" in step]
    assert says == ["push 3", "push 5"]
    last = result["steps"][-1]
    assert last["self"]["vals"]["v"] == [prim(3), prim(5)]
    assert "self" not in last["locals"]


def test_design_refs_and_bad_calls() -> None:
    code = (
        "class Codec:\n    def encode(self, x):\n        return x * 2\n"
        "    def same(self, y):\n        return y\n"
    )
    ops = [["Codec"], ["encode", 4], ["same", {"$ref": 1}]]
    result = trace(code, "Codec", {"ops": ops}, None, {"kind": "design"})
    assert result["result"]["v"][2] == prim(8)
    missing = trace(code, "Codec", {"ops": [["Codec"], ["nope"]]}, None, {"kind": "design"})
    assert missing["error"].startswith("AttributeError")


def test_run_traced_accepts_empty_viz_and_spec() -> None:
    out = tracer.run_traced(
        "class Solution:\n    def f(self):\n        return 1\n", "f", '{"args": []}', "", ""
    )
    assert json.loads(out)["result"] == prim(1)


@pytest.mark.parametrize("given", [[2], {"args": [2]}])
def test_a_bare_argument_list_is_accepted(given: Any) -> None:
    code = "class Solution:\n    def f(self, n):\n        return n\n"
    assert tracer.trace(code, "f", given)["result"] == prim(2)

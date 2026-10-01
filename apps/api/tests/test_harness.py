"""The Python test harness (Section 9.2, D7), run in CPython as the validator runs it.

Typed parameters are tested in test_harness_io.py, design problems and checkers in
test_harness_design.py.
"""

import json
import time
from typing import Any

import pytest

from tests.harness_helpers import HARNESS_PATH, harness, run
from tests.harness_helpers import case as _test
from tests.harness_helpers import returning as _returning

# ---------------------------------------------------------------- prelude (D7)


def test_prelude_constants() -> None:
    assert harness.PRELUDE_LINES == 0
    # LeetCode's imports, then LeetCode's ListNode and TreeNode, exactly as its starters
    # define them in comments, so pasted code works.
    assert harness.PRELUDE == (
        "from typing import *\n"
        "from collections import *\n"
        "import heapq, bisect, math, itertools, functools\n"
        "\n"
        "\n"
        "class ListNode:\n"
        "    def __init__(self, val=0, next=None):\n"
        "        self.val = val\n"
        "        self.next = next\n"
        "\n"
        "\n"
        "class TreeNode:\n"
        "    def __init__(self, val=0, left=None, right=None):\n"
        "        self.val = val\n"
        "        self.left = left\n"
        "        self.right = right\n"
    )


def test_old_callers_need_no_spec() -> None:
    """The M2 runner calls run_tests(code, entry, tests_json, mode): no spec_json."""
    tests = json.dumps([_test([2], 4)])
    [result] = json.loads(harness.run_tests(_returning("args[0] * 2"), "f", tests, "exact"))
    assert result["status"] == "pass"
    for spec in (None, "", "null", "{}"):
        [same] = json.loads(harness.run_tests(_returning("args[0] * 2"), "f", tests, "exact", spec))
        assert same["status"] == "pass"


def test_prelude_names_are_available_without_imports() -> None:
    code = (
        "class Solution:\n"
        "    def f(self, nums: List[int]) -> Optional[Dict[str, int]]:\n"
        "        counts = Counter(nums)\n"
        "        groups = defaultdict(list)\n"
        "        queue = deque(nums)\n"
        "        heapq.heapify(nums)\n"
        "        return [counts[1], len(groups), queue[0], nums[0],\n"
        "                bisect.bisect_left([1, 3], 2), math.ceil(2.5),\n"
        "                len(list(itertools.permutations([1, 2]))),\n"
        "                functools.reduce(lambda a, b: a + b, [1, 2, 3])]\n"
    )
    [result] = run(code, [_test([[3, 1, 1]], [2, 0, 3, 1, 1, 3, 2, 6])])
    assert result["status"] == "pass", result


def test_collections_counter_wins_over_the_typing_alias() -> None:
    [result] = run(_returning("Counter('aab')['a']"), [_test([], 2)])
    assert result["status"] == "pass"


def test_main_guard_does_not_run() -> None:
    code = _returning("1") + "if __name__ == '__main__':\n    raise SystemExit('ran')\n"
    [result] = run(code, [_test([], 1)])
    assert result["status"] == "pass"


# ---------------------------------------------------------------- results and compare modes


def test_pass_and_fail_carry_id_got_stdout_and_ms() -> None:
    results = run(_returning("args[0] * 2"), [_test([2], 4, id="a"), _test([3], 7, id="b")])
    assert [r["id"] for r in results] == ["a", "b"]
    assert [r["status"] for r in results] == ["pass", "fail"]
    assert results[1]["got"] == 6
    assert all(r["stdout"] == "" and r["ms"] >= 0 for r in results)
    assert set(results[0]) == {"id", "status", "got", "stdout", "ms"}


def test_exact_compares_tuples_as_lists() -> None:
    [result] = run(_returning("(1, (2, 3))"), [_test([], [1, [2, 3]])])
    assert result == {**result, "status": "pass", "got": [1, [2, 3]]}


@pytest.mark.parametrize(
    ("expression", "expected", "status"),
    [
        ("[3, 1, 2]", [1, 2, 3], "pass"),
        ("[[1, 2], [0]]", [[0], [1, 2]], "pass"),
        ("[1, 1, 2]", [1, 2, 2], "fail"),
        ("{2, 1}", [1, 2], "pass"),
        ("None", [], "fail"),
    ],
)
def test_unordered(expression: str, expected: Any, status: str) -> None:
    [result] = run(_returning(expression), [_test([], expected)], mode="unordered")
    assert result["status"] == status


@pytest.mark.parametrize(
    ("expression", "expected", "status"),
    [
        ("[[2, 1], [3]]", [[3], [1, 2]], "pass"),
        ("[(-1, 0, 1), (-2, 1, 1)]", [[1, 1, -2], [1, -1, 0]], "pass"),
        ("[[1, 2], [3]]", [[1, 2], [4]], "fail"),
        ("[[1, 2]]", [[1, 2], [1, 2]], "fail"),
        ("[1, 2]", [[1], [2]], "fail"),
    ],
)
def test_unordered_nested(expression: str, expected: Any, status: str) -> None:
    [result] = run(_returning(expression), [_test([], expected)], mode="unordered_nested")
    assert result["status"] == status


@pytest.mark.parametrize(
    ("expression", "expected", "status"),
    [
        ("0.1 + 0.2", 0.3, "pass"),
        ("2.0000001", 2, "pass"),
        ("2.001", 2, "fail"),
        ("[1.5, 0.30000000000000004]", [1.5, 0.3], "pass"),
        ("[1.5]", [1.5, 2.0], "fail"),
        ("None", 1.0, "fail"),
    ],
)
def test_float(expression: str, expected: Any, status: str) -> None:
    [result] = run(_returning(expression), [_test([], expected)], mode="float")
    assert result["status"] == status


def test_exact_is_the_default_and_order_matters() -> None:
    [result] = run(_returning("[2, 1]"), [_test([], [1, 2])])
    assert result["status"] == "fail"


def test_each_test_can_set_its_own_compare_mode() -> None:
    tests = [_test([], [1, 2], id="plain"), _test([], [1, 2], id="any", compare="unordered")]
    results = run(_returning("[2, 1]"), tests)
    assert [r["status"] for r in results] == ["fail", "pass"]
    [overridden] = run(_returning("[2, 1]"), [_test([], [1, 2], compare="exact")], mode="unordered")
    assert overridden["status"] == "fail"


def test_results_that_are_not_json_are_shown_as_repr() -> None:
    results = run(_returning("args[0]"), [_test([1], 1)])
    assert results[0]["got"] == 1
    assert "gotRepr" not in results[0]
    [infinite] = run(_returning("float('inf')"), [_test([], 1)])
    assert infinite == {**infinite, "status": "fail", "got": "inf", "gotRepr": True}
    [custom] = run(_returning("object()"), [_test([], None)])
    assert custom["status"] == "fail"
    assert custom["got"].startswith("<object object")
    assert custom["gotRepr"] is True


@pytest.mark.parametrize(
    ("expression", "shown"),
    [
        ("float('nan')", "nan"),
        ("[1.5, float('-inf')]", "[1.5, -inf]"),
        ("(x for x in [1])", "<generator object"),
        ("{(1, 2): 'pair'}", "{(1, 2): 'pair'}"),
    ],
)
def test_got_repr_marks_python_text(expression: str, shown: str) -> None:
    [result] = run(_returning(expression), [_test([], None)])
    assert result["got"].startswith(shown)
    assert result["gotRepr"] is True
    assert set(result) == {"id", "status", "got", "gotRepr", "stdout", "ms"}


def test_a_returned_string_is_not_marked() -> None:
    [result] = run(_returning("'nan'"), [_test([], "nan")])
    assert result == {**result, "status": "pass", "got": "nan"}
    assert "gotRepr" not in result


def test_arguments_are_copied_for_every_test() -> None:
    code = "class Solution:\n    def f(self, nums):\n        nums.append(0)\n"
    code += "        return len(nums)\n"
    shared = [1, 2]
    results = run(code, [_test([shared], 3, id="a"), _test([shared], 3, id="b")])
    assert [r["status"] for r in results] == ["pass", "pass"]


def test_every_test_gets_a_new_solution_instance() -> None:
    code = (
        "class Solution:\n"
        "    def __init__(self):\n"
        "        self.stack = []\n"
        "    def f(self, s):\n"
        "        for ch in s:\n"
        "            if ch == '(':\n"
        "                self.stack.append(ch)\n"
        "            elif not self.stack or self.stack.pop() != '(':\n"
        "                return False\n"
        "        return not self.stack\n"
    )
    results = run(code, [_test(["(("], False, id="a"), _test(["()"], True, id="b")])
    assert [r["status"] for r in results] == ["pass", "pass"]


def test_an_error_in_init_is_that_tests_error() -> None:
    code = (
        "class Solution:\n"
        "    calls = 0\n"
        "    def __init__(self):\n"
        "        Solution.calls += 1\n"
        "        if Solution.calls == 2:\n"
        "            raise ValueError('second instance')\n"
        "    def f(self):\n"
        "        return 1\n"
    )
    results = run(code, [_test([], 1, id="a"), _test([], 1, id="b"), _test([], 1, id="c")])
    assert [r["status"] for r in results] == ["pass", "error", "pass"]
    assert 'File "<solution>", line 6, in __init__' in results[1]["error"]
    assert results[1]["error"].rstrip().endswith("ValueError: second instance")


def test_custom_cases_may_leave_out_expected_and_args() -> None:
    results = run(_returning("len(args)"), [{"id": "custom", "args": [1, 2]}, {"id": "none"}])
    assert [(r["id"], r["status"], r["got"]) for r in results] == [
        ("custom", "fail", 2),
        ("none", "fail", 0),
    ]
    [nothing] = run(_returning("None"), [{"id": "custom", "args": []}])
    assert nothing["status"] == "pass"


# ---------------------------------------------------------------- one result per test, always


@pytest.mark.parametrize(
    ("setup", "expression", "reason"),
    [
        ("x = []; x.append(x)", "x", "RecursionError"),  # a list that contains itself
        ("x = []\nfor _ in range(5000): x = [x]", "x", "RecursionError"),
        ("", "{'a': 1, 2: 'b'}.keys() | {object()}", ""),  # mixed keys: shown, not an error
        ("", "10 ** 5000", ""),  # too long for json and repr: shown as <int>
        ("class Bad:\n    def __repr__(self): raise ValueError('no')", "Bad()", ""),
        ("class Bad:\n    def __repr__(self): raise ValueError('no')", "{Bad(), Bad()}", ""),
    ],
)
def test_odd_return_values_give_a_result(setup: str, expression: str, reason: str) -> None:
    code = setup + "\n" + _returning(expression)
    results = run(code, [_test([], 1, id="a"), _test([], [1], id="b", compare="unordered")])
    assert [r["id"] for r in results] == ["a", "b"]
    for result in results:
        if reason:
            assert result["status"] == "error"
            assert result["error"].startswith(f"Could not read the returned value: {reason}")
        else:
            assert result["status"] == "fail"
            assert isinstance(result["got"], str | list)


def test_an_exception_while_comparing_is_that_tests_error() -> None:
    code = (
        "class Stop(BaseException):\n    pass\n\n"
        "class Odd:\n    def __eq__(self, other):\n        raise Stop('eq')\n\n"
    ) + _returning("[Odd()]")
    results = run(code, [_test([], [1], id="a"), _test([], 1, id="b")])
    assert [r["status"] for r in results] == ["error", "fail"]
    assert results[0]["error"] == "Could not read the returned value: solution.Stop: eq\n"


def test_a_value_too_long_to_show_is_named_by_its_type() -> None:
    [result] = run(_returning("10 ** 5000"), [_test([], 1)])
    assert result == {**result, "status": "fail", "got": "<int>", "gotRepr": True}


# ---------------------------------------------------------------- results too large to read


@pytest.mark.parametrize(
    ("expression", "preview"),
    [
        ("list(range(10 ** 6))", "[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, ... (1,000,000 items)]"),
        (
            "[[0] * 1000] * 1000",
            "[<list of 1,000>, <list of 1,000>, ",
        ),  # shared rows count each time
        ("{i: i for i in range(200000)}", "{0: 0, 1: 1, 2: 2, "),
        ("'ab' * 10 ** 7", "'ababab"),
        ("[list(range(400))] * 300", "[<list of 400>, "),
    ],
)
def test_a_result_too_large_to_read_fails_fast(expression: str, preview: str) -> None:
    started = time.perf_counter()
    [result] = run(_returning(expression), [_test([], [0])])
    assert time.perf_counter() - started < 2
    assert result["status"] == "fail"
    assert result["got"].startswith(preview)
    assert result["gotRepr"] is True
    assert result["error"] == (
        "The result holds more than 100,000 items, too many to check or show; no test expects "
        "one that large. Does a loop add too much?"
    )


def test_a_result_at_the_size_limit_is_read() -> None:
    code = _returning(f"list(range({harness.MAX_RESULT_ITEMS}))")
    [result] = run(code, [_test([], list(range(harness.MAX_RESULT_ITEMS)))])
    assert result["status"] == "pass"
    [over] = run(_returning(f"[0] * {harness.MAX_RESULT_ITEMS + 1}"), [_test([], [0])])
    assert over["status"] == "fail"
    assert over["gotRepr"] is True


# ---------------------------------------------------------------- bytecode


def test_loading_the_harness_writes_no_bytecode() -> None:
    """apps/web/public/ is served as is: no __pycache__ may appear next to harness.py."""
    cache = HARNESS_PATH.parent / "__pycache__"
    run(_returning("1"), [_test([], 1)])
    assert not cache.exists() or not list(cache.glob("harness*"))


@pytest.mark.parametrize(
    "statement",
    ["raise GeneratorExit", "raise KeyError('k')", "class Stop(BaseException): pass\nraise Stop"],
)
def test_any_exception_in_the_method_is_that_tests_error(statement: str) -> None:
    body = "".join(f"            {line}\n" for line in statement.splitlines())
    code = f"class Solution:\n    def f(self, x):\n        if x:\n{body}        return 1\n"
    results = run(code, [_test([1], 1, id="a"), _test([0], 1, id="b")])
    assert [r["status"] for r in results] == ["error", "pass"]


def test_any_exception_while_loading_fails_every_test() -> None:
    code = "class Stop(BaseException):\n    pass\n\nraise Stop('loading')\n"
    results = run(code, [_test([], 1, id="a"), _test([], 1, id="b")])
    assert [r["status"] for r in results] == ["error", "error"]
    assert 'File "<solution>", line 4, in <module>' in results[0]["error"]
    [generator_exit] = run("raise GeneratorExit\n", [_test([], 1)])
    assert "GeneratorExit" in generator_exit["error"]


def test_keyboard_interrupt_stops_the_run() -> None:
    """Pyodide interrupts a run with KeyboardInterrupt; the harness must not swallow it."""
    with pytest.raises(KeyboardInterrupt):
        run(_returning("(_ for _ in ()).throw(KeyboardInterrupt)"), [_test([], 1)])
    with pytest.raises(KeyboardInterrupt):
        run("raise KeyboardInterrupt\n", [_test([], 1)])


# ---------------------------------------------------------------- stdout


def test_stdout_is_captured_per_test() -> None:
    code = "class Solution:\n    def f(self, x):\n        print('x is', x)\n        return x\n"
    results = run(code, [_test([1], 1), _test([2], 2)])
    assert [r["stdout"] for r in results] == ["x is 1\n", "x is 2\n"]


def test_output_printed_while_loading_goes_to_the_first_test() -> None:
    code = "print('loading')\n" + _returning("1")
    results = run(code, [_test([], 1), _test([], 1)])
    assert [r["stdout"] for r in results] == ["loading\n", ""]


def test_stdout_is_truncated() -> None:
    code = "class Solution:\n    def f(self):\n        print('x' * 10000)\n        return 1\n"
    [result] = run(code, [_test([], 1)])
    assert len(result["stdout"]) == harness.MAX_STDOUT


def test_stdout_is_kept_when_the_code_raises() -> None:
    code = "class Solution:\n    def f(self):\n        print('before')\n        return 1 / 0\n"
    [result] = run(code, [_test([], 1)])
    assert result["status"] == "error"
    assert result["stdout"] == "before\n"


def test_closing_stdout_keeps_the_output_and_the_results() -> None:
    code = (
        "import sys\n"
        "print('loading')\n"
        "sys.stdout.close()\n"
        "class Solution:\n"
        "    def f(self, x):\n"
        "        print('x is', x)\n"
        "        sys.stdout.close()\n"
        "        print('still here')\n"
        "        return x\n"
    )
    results = run(code, [_test([1], 1, id="a"), _test([2], 3, id="b")])
    assert [(r["id"], r["status"], r["stdout"]) for r in results] == [
        ("a", "pass", "loading\nx is 1\nstill here\n"),
        ("b", "fail", "x is 2\nstill here\n"),
    ]
    broken = "import sys\nprint('x')\nsys.stdout.close()\nraise ValueError('boom')\n"
    [failed] = run(broken, [_test([], 1)])
    assert failed["status"] == "error"
    assert failed["stdout"] == "x\n"
    assert failed["error"].rstrip().endswith("ValueError: boom")


def test_stderr_is_captured_with_stdout_in_order() -> None:
    code = (
        "import sys\n"
        "class Solution:\n"
        "    def f(self):\n"
        "        print('one')\n"
        "        print('two', file=sys.stderr)\n"
        "        sys.stderr.write('three\\n')\n"
        "        print('four')\n"
        "        return 1\n"
    )
    results = run(code, [_test([], 1), _test([], 1, id="b")])
    assert [r["stdout"] for r in results] == ["one\ntwo\nthree\nfour\n"] * 2


def test_stderr_while_loading_goes_to_the_first_test() -> None:
    code = "import sys\nprint('careful', file=sys.stderr)\n" + _returning("1")
    first, second = run(code, [_test([], 1), _test([], 1, id="b")])
    assert (first["stdout"], second["stdout"]) == ("careful\n", "")


# ---------------------------------------------------------------- errors and line numbers


def test_runtime_error_traceback_uses_editor_line_numbers() -> None:
    code = (
        "class Solution:\n"  # line 1
        "    def f(self, nums):\n"
        "        return self.helper(nums)\n"  # line 3
        "\n"
        "    def helper(self, nums):\n"
        "        return nums[10]\n"  # line 6
    )
    [result] = run(code, [_test([[1, 2]], 1)])
    assert result["status"] == "error"
    error = result["error"]
    assert error.startswith("Traceback (most recent call last):\n")
    assert 'File "<solution>", line 3, in f' in error
    assert 'File "<solution>", line 6, in helper' in error
    assert "return nums[10]" in error  # the offending source line is shown
    assert error.rstrip().endswith("IndexError: list index out of range")
    assert "harness.py" not in error


def test_syntax_error_fails_every_test_with_its_line() -> None:
    code = "class Solution:\n    def f(self):\n        return (1 +\n\n"
    results = run(code, [_test([], 1, id="a"), _test([], 1, id="b")])
    assert [r["id"] for r in results] == ["a", "b"]
    assert all(r["status"] == "error" for r in results)
    assert 'File "<solution>", line 3' in results[0]["error"]
    assert "SyntaxError" in results[0]["error"]


def test_error_at_load_time_reports_its_line() -> None:
    code = "x = 1\ny = undefined_name\n" + _returning("1")
    [result] = run(code, [_test([], 1)])
    assert 'File "<solution>", line 2, in <module>' in result["error"]
    assert "NameError: name 'undefined_name' is not defined" in result["error"]


def test_missing_solution_class() -> None:
    [result] = run("def f():\n    return 1\n", [_test([], 1)])
    assert result["status"] == "error"
    assert result["error"] == "NameError: Define a class named Solution.\n"


def test_missing_entry_method() -> None:
    [result] = run(_returning("1"), [_test([], 1)], entry="solve")
    assert result["error"] == "AttributeError: Solution has no method named 'solve'.\n"


def test_system_exit_is_an_error_not_a_crash() -> None:
    [result] = run(_returning("exit()"), [_test([], 1)])
    assert result["status"] == "error"
    assert "SystemExit" in result["error"]


def test_deep_recursion_is_an_error() -> None:
    code = "class Solution:\n    def f(self, n):\n        return self.f(n + 1)\n"
    [result] = run(code, [_test([0], 1)])
    assert result["status"] == "error"
    assert "RecursionError" in result["error"]
    # Only the innermost frames are kept (and repeated ones are collapsed).
    assert result["error"].count('File "<solution>"') <= harness.MAX_TRACEBACK_FRAMES
    assert len(result["error"].splitlines()) < 20


def test_new_namespace_is_fresh_each_time() -> None:
    first = harness.new_namespace()
    first["leak"] = 1
    second = harness.new_namespace()
    assert "leak" not in second
    assert "List" in second
    assert "deque" in second
    assert "heapq" in second

"""Design problems and checkers in the test harness (docs/PARITY_PLAN.md 4.2 and 4.3)."""

from typing import Any

import pytest

from tests.harness_helpers import calls, case, run

DESIGN = {"kind": "design"}
MIN_STACK = (
    "class MinStack:\n"
    "    def __init__(self):\n"
    "        self.stack = []\n"
    "\n"
    "    def push(self, val):\n"
    "        low = min(val, self.stack[-1][1]) if self.stack else val\n"
    "        self.stack.append((val, low))\n"
    "\n"
    "    def pop(self):\n"
    "        self.stack.pop()\n"
    "\n"
    "    def top(self):\n"
    "        return self.stack[-1][0]\n"
    "\n"
    "    def getMin(self):\n"
    "        return self.stack[-1][1]\n"
)


def _design(code: str, tests: list[dict[str, Any]], entry: str = "MinStack") -> Any:
    return run(code, tests, entry=entry, spec=DESIGN)


# ---------------------------------------------------------------- design runs


def test_got_is_one_value_per_call() -> None:
    ops = [["MinStack"], ["push", 3], ["push", 1], ["getMin"], ["pop"], ["top"], ["getMin"]]
    [result] = _design(MIN_STACK, [calls(ops, [None, None, None, 1, None, 3, 3])])
    assert result == {**result, "status": "pass", "got": [None, None, None, 1, None, 3, 3]}
    assert set(result) == {"id", "status", "got", "stdout", "ms"}


def test_a_wrong_output_fails_with_every_output_shown() -> None:
    ops = [["MinStack"], ["push", 3], ["push", 1], ["getMin"]]
    [result] = _design(MIN_STACK, [calls(ops, [None, None, None, 3])])
    assert (result["status"], result["got"]) == ("fail", [None, None, None, 1])


def test_the_constructor_takes_the_first_calls_arguments() -> None:
    code = (
        "class Counter:\n"
        "    def __init__(self, start, step=1):\n"
        "        self.value, self.step = start, step\n"
        "\n"
        "    def tick(self):\n"
        "        self.value += self.step\n"
        "        return self.value\n"
    )
    tests = [
        calls([["Counter", 5], ["tick"], ["tick"]], [None, 6, 7], id="a"),
        calls([["Counter", 0, 10], ["tick"]], [None, 10], id="b"),
    ]
    assert [r["status"] for r in _design(code, tests, entry="Counter")] == ["pass", "pass"]


def test_every_test_gets_a_new_instance_and_fresh_arguments() -> None:
    code = (
        "class Bag:\n"
        "    def __init__(self):\n"
        "        self.items = []\n"
        "\n"
        "    def add(self, item):\n"
        "        item.append('seen')\n"
        "        self.items.append(item)\n"
        "        return len(self.items)\n"
    )
    shared = [["Bag"], ["add", []], ["add", ["x"]]]
    tests = [calls(shared, [None, 1, 2], id="a"), calls(shared, [None, 1, 2], id="b")]
    assert [r["status"] for r in _design(code, tests, entry="Bag")] == ["pass", "pass"]


def test_float_compare_applies_to_each_output() -> None:
    code = (
        "class Median:\n"
        "    def __init__(self):\n"
        "        self.values = []\n"
        "\n"
        "    def add(self, x):\n"
        "        self.values.append(x)\n"
        "\n"
        "    def median(self):\n"
        "        v = sorted(self.values)\n"
        "        return (v[(len(v) - 1) // 2] + v[len(v) // 2]) / 2\n"
    )
    ops = [["Median"], ["add", 1], ["add", 2], ["median"], ["add", 4], ["median"]]
    test = calls(ops, [None, None, None, 1.5000001, None, 2], compare="float")
    [result] = _design(code, [test], entry="Median")
    assert result["status"] == "pass"


def test_outputs_json_cannot_hold_are_shown_as_a_repr() -> None:
    code = (
        "class Odd:\n"
        "    def make(self):\n"
        "        return object()\n"
        "\n"
        "    def size(self):\n"
        "        return 2\n"
    )
    [result] = _design(code, [calls([["Odd"], ["make"], ["size"]], [None, None, 2])], entry="Odd")
    assert result["status"] == "fail"
    assert result["got"].startswith("[None, <object object")
    assert result["got"].endswith(", 2]")
    assert result["gotRepr"] is True


def test_outputs_too_large_to_read_fail_fast() -> None:
    code = "class Big:\n    def make(self):\n        return [0] * 60000\n"
    ops = [["Big"], ["make"], ["make"]]
    [result] = _design(code, [calls(ops, [None, [], []])], entry="Big")
    assert result["status"] == "fail"
    assert result["got"] == "[None, <list of 60,000>, <list of 60,000>, ... (3 items)]"
    assert result["error"].startswith("The result holds more than 100,000 items")


def test_stdout_is_captured_per_test() -> None:
    code = "print('loading')\n" + MIN_STACK.replace(
        "    def top(self):\n", "    def top(self):\n        print('top', self.stack)\n"
    )
    ops = [["MinStack"], ["push", 2], ["top"]]
    tests = [calls(ops, [None, None, 2], id="a"), calls(ops, [None, None, 2], id="b")]
    assert [r["stdout"] for r in _design(code, tests)] == [
        "loading\ntop [(2, 2)]\n",
        "top [(2, 2)]\n",
    ]


# ---------------------------------------------------------------- calls that go wrong


def test_an_error_names_the_call_that_raised() -> None:
    ops = [["MinStack"], ["push", 1], ["pop"], ["pop"], ["top"]]
    [result] = _design(MIN_STACK, [calls(ops, [None] * 5)])
    assert result["status"] == "error"
    error = result["error"]
    assert error.startswith("In call 4 of 5, pop():\nTraceback (most recent call last):\n")
    assert 'File "<solution>", line 10, in pop' in error
    assert error.rstrip().endswith("IndexError: pop from empty list")


def test_an_error_in_the_constructor_is_call_1() -> None:
    code = "class Box:\n    def __init__(self, size):\n        self.slots = [0] * size\n"
    [result] = _design(code, [calls([["Box", "two"]], [None])], entry="Box")
    assert result["error"].startswith('In call 1 of 1, Box("two"):\nTraceback')
    assert "TypeError: can't multiply sequence" in result["error"]


def test_a_missing_method_is_named() -> None:
    [result] = _design(MIN_STACK, [calls([["MinStack"], ["push", 1], ["peek"]], [None] * 3)])
    assert result["error"] == (
        "In call 3 of 3, peek():\nAttributeError: MinStack has no method named 'peek'.\n"
    )


def test_an_attribute_that_is_not_a_method_is_not_called() -> None:
    [result] = _design(MIN_STACK, [calls([["MinStack"], ["stack"]], [None, None])])
    assert "MinStack has no method named 'stack'." in result["error"]


def test_a_missing_class_fails_every_test() -> None:
    results = _design("class Solution:\n    pass\n", [calls([["MinStack"]], [None])] * 2)
    assert [r["error"] for r in results] == ["NameError: Define a class named MinStack.\n"] * 2


@pytest.mark.parametrize(
    ("ops", "message"),
    [
        (None, 'A design test needs "ops": a list of calls, the constructor first.'),
        ([], 'A design test needs "ops": a list of calls, the constructor first.'),
        ([["MinStack"], []], "Call 2 should be [name, ...args], not []."),
        ([["MinStack"], [3]], "Call 2 should be [name, ...args], not [3]."),
        ([["MinStack"], "pop"], 'Call 2 should be [name, ...args], not "pop".'),
        ([["push", 1]], "The first call must construct MinStack, not call 'push'."),
        (
            [["MinStack", {"$ref": 0}]],
            'Call 1: {"$ref": 0} should be {"$ref": n}, where n is the index of an earlier '
            "call (0 to -1).",
        ),
        (
            [["MinStack"], ["push", {"$ref": 1}]],
            'Call 2: {"$ref": 1} should be {"$ref": n}, where n is the index of an earlier '
            "call (0 to 0).",
        ),
        (
            [["MinStack"], ["push", 1], ["push", {"$ref": 1, "x": 2}]],
            'Call 3: {"$ref": 1, "x": 2} should be {"$ref": n}',
        ),
    ],
)
def test_malformed_calls_are_errors_before_anything_runs(ops: Any, message: str) -> None:
    code = "print('ran')\n" + MIN_STACK
    test = {"id": "t", "expected": None, "hidden": False}
    if ops is not None:
        test["ops"] = ops
    [result] = _design(code, [test])
    assert result["status"] == "error"
    assert result["error"].startswith(message)
    assert result["stdout"] == "ran\n"  # module output only: no call ran


def test_keyboard_interrupt_stops_a_design_run() -> None:
    code = "class Spin:\n    def go(self):\n        raise KeyboardInterrupt\n"
    with pytest.raises(KeyboardInterrupt):
        _design(code, [calls([["Spin"], ["go"]], [None, None])], entry="Spin")


# ---------------------------------------------------------------- round trips ({"$ref": i})

CODEC = (
    "class Codec:\n"
    "    def encode(self, strs):\n"
    "        return ''.join(f'{len(s)}#{s}' for s in strs)\n"
    "\n"
    "    def decode(self, s):\n"
    "        out, i = [], 0\n"
    "        while i < len(s):\n"
    "            j = s.index('#', i)\n"
    "            n = int(s[i:j])\n"
    "            out.append(s[j + 1 : j + 1 + n])\n"
    "            i = j + 1 + n\n"
    "        return out\n"
)


def test_a_ref_passes_what_an_earlier_call_returned() -> None:
    strs = ["4#", "", "plain"]
    ops = [["Codec"], ["encode", strs], ["decode", {"$ref": 1}]]
    [result] = _design(CODEC, [calls(ops, [None, "2#4#0#5#plain", strs])], entry="Codec")
    assert result["status"] == "pass"


def test_a_ref_passes_the_object_itself_not_its_json() -> None:
    code = (
        "class Keeper:\n"
        "    def make(self):\n"
        "        self.made = (1, 2)\n"
        "        return self.made\n"
        "\n"
        "    def same(self, value):\n"
        "        return [value is self.made, type(value).__name__]\n"
    )
    ops = [["Keeper"], ["make"], ["same", {"$ref": 1}], ["same", {"$ref": 0}]]
    expected = [None, [1, 2], [True, "tuple"], [False, "NoneType"]]
    assert _design(code, [calls(ops, expected)], entry="Keeper")[0]["status"] == "pass"


def test_an_error_shows_which_result_a_ref_passed() -> None:
    ops = [["Codec"], ["encode", ["a"]], ["decode", {"$ref": 1}], ["decode", 5]]
    [result] = _design(CODEC, [calls(ops, [None] * 4)], entry="Codec")
    assert result["error"].startswith("In call 4 of 4, decode(5):\n")
    broken = CODEC.replace("n = int(s[i:j])", "n = int(s[i:j]) + 'x'")
    [result] = _design(broken, [calls(ops, [None] * 4)], entry="Codec")
    assert result["error"].startswith("In call 3 of 4, decode(<what call 2 returned>):\n")


# ---------------------------------------------------------------- checkers

ANY_PAIR = (
    "class Solution:\n"
    "    def f(self, nums, target):\n"
    "        seen = {}\n"
    "        for i, x in enumerate(nums):\n"
    "            if target - x in seen:\n"
    "                return [seen[target - x], i]\n"
    "            seen[x] = i\n"
    "        return []\n"
)
CHECK_PAIR = (
    "def check(args, got):\n"
    "    nums, target = args\n"
    "    return len(got) == 2 and got[0] != got[1] and nums[got[0]] + nums[got[1]] == target\n"
)


def _checked(
    code: str, checker: str | None, tests: list[dict[str, Any]], **spec: Any
) -> list[dict[str, Any]]:
    result: list[dict[str, Any]] = run(code, tests, spec={"checker": checker, **spec})
    return result


def test_a_checker_accepts_any_valid_answer() -> None:
    # The expected value is one answer; the checker accepts the other one too.
    tests = [case([[1, 4, 3, 2], 5], [2, 3], compare="checker")]
    [result] = _checked(ANY_PAIR, CHECK_PAIR, tests)
    assert (result["status"], result["got"]) == ("pass", [0, 1])
    assert "error" not in result


def test_a_checker_rejects_a_wrong_answer() -> None:
    wrong = ANY_PAIR.replace("return [seen[target - x], i]", "return [i, i]")
    [result] = _checked(wrong, CHECK_PAIR, [case([[1, 4], 5], [0, 1], compare="checker")])
    assert (result["status"], result["got"]) == ("fail", [1, 1])
    assert "error" not in result


def test_checker_can_be_the_default_mode() -> None:
    results = run(
        ANY_PAIR,
        [case([[1, 4], 5], [0, 1]), case([[2, 2], 9], [0, 1], id="u")],
        mode="checker",
        spec={"checker": CHECK_PAIR},
    )
    assert [r["status"] for r in results] == ["pass", "fail"]


def test_a_checker_gets_json_copies_of_args_and_got() -> None:
    """args are the test's JSON (not ListNodes); got is the converted result."""
    checker = (
        "def check(args, got):\n"
        "    ok = args == [[2, 7]] and got == [7, 2]\n"
        "    args[0].append(99)\n"
        "    got.append(99)\n"
        "    return ok\n"
    )
    code = (
        "class Solution:\n"
        "    def f(self, head):\n"
        "        second = head.next\n"
        "        second.next, head.next = head, None\n"
        "        return second\n"
    )
    io = {"params": [{"name": "head", "type": "list_node"}], "returns": "list_node"}
    test = case([[2, 7]], [2, 7], compare="checker")
    [result] = _checked(code, checker, [test], io=io)
    assert (result["status"], result["got"]) == ("pass", [7, 2])  # the checker's edits don't show
    assert test["args"] == [[2, 7]]


def test_a_checker_that_raises_fails_the_test_with_a_reason() -> None:
    checker = "def check(args, got):\n    return got[5] == 1\n"
    [result] = _checked(ANY_PAIR, checker, [case([[1, 4], 5], [0, 1], compare="checker")])
    assert result["status"] == "fail"
    assert result["got"] == [0, 1]
    assert result["error"] == (
        "The checker could not judge this answer: IndexError: list index out of range "
        "(checker line 2)"
    )


@pytest.mark.parametrize("verdict", ["None", "1", "'yes'", "[True]"])
def test_a_checker_must_return_a_bool(verdict: str) -> None:
    checker = f"def check(args, got):\n    return {verdict}\n"
    [result] = _checked(ANY_PAIR, checker, [case([[1, 4], 5], [0, 1], compare="checker")])
    assert result["status"] == "fail"
    assert result["error"] == f"The checker returned {verdict}, not True or False."


@pytest.mark.parametrize(
    ("checker", "message"),
    [
        (None, 'This test compares with "checker", but the problem has no checker.'),
        (
            "def check(args, got)\n    return True\n",
            "The problem's checker does not load: SyntaxError: expected ':' (checker line 1)",
        ),
        (
            "x = 1 / 0\n",
            "The problem's checker does not load: ZeroDivisionError: division by zero "
            "(checker line 1)",
        ),
        ("def judge(args, got):\n    return True\n", "The problem's checker defines no "),
        ("check = 3\n", "The problem's checker defines no check(args, got) function."),
    ],
)
def test_a_checker_that_cannot_run_is_an_error(checker: str | None, message: str) -> None:
    code = ANY_PAIR.replace("seen = {}", "print('ran')\n        seen = {}")
    tests = [case([[1, 4], 5], [0, 1], compare="checker"), case([[1, 4], 5], [0, 1], id="u")]
    checked, plain = _checked(code, checker, tests)
    assert checked["status"] == "error"
    assert checked["error"].startswith(message)
    assert checked["stdout"] == ""  # the method did not run
    assert plain["status"] == "pass"  # tests that compare otherwise are unaffected


def test_checker_output_is_not_mixed_into_the_tests_stdout() -> None:
    checker = (
        "print('loading checker')\ndef check(args, got):\n    print('judging')\n    return True\n"
    )
    [result] = _checked(ANY_PAIR, checker, [case([[1, 4], 5], [0, 1], compare="checker")])
    assert (result["status"], result["stdout"]) == ("pass", "")


def test_keyboard_interrupt_in_a_checker_stops_the_run() -> None:
    checker = "def check(args, got):\n    raise KeyboardInterrupt\n"
    with pytest.raises(KeyboardInterrupt):
        _checked(ANY_PAIR, checker, [case([[1, 4], 5], [0, 1], compare="checker")])


def test_a_design_checker_gets_the_calls_and_the_outputs() -> None:
    checker = (
        "def check(args, got):\n"
        "    strs = args[1][1]\n"
        "    return isinstance(got[1], str) and got[2] == strs\n"
    )
    ops = [["Codec"], ["encode", ["x", "#"]], ["decode", {"$ref": 1}]]
    test = calls(ops, [None, None, ["x", "#"]], compare="checker")
    [result] = run(CODEC, [test], entry="Codec", spec={"kind": "design", "checker": checker})
    assert (result["status"], result["got"]) == ("pass", [None, "1#x1##", ["x", "#"]])
    lossy = CODEC.replace("return out", "return out[:1]")
    [result] = run(lossy, [test], entry="Codec", spec={"kind": "design", "checker": checker})
    assert result["status"] == "fail"


def test_a_deep_copy_note_wins_over_a_passing_checker() -> None:
    code = "class Solution:\n    def f(self, head):\n        return head\n"
    io = {"params": [{"name": "head", "type": "random_list"}], "returns": "random_list"}
    accept = "def check(args, got):\n    return True\n"
    [result] = _checked(code, accept, [case([[[1, None]]], [[1, None]], compare="checker")], io=io)
    assert result["status"] == "fail"
    assert result["error"].startswith("The result reuses nodes of the input list")

"""SeeCode test harness (Section 9.2).

The single source for running tests: the browser runner loads it into Pyodide (M2) and
scripts/validate_content.py runs it in CPython. Standard library only.

    run_tests(code, entry, tests_json, mode="exact") -> JSON string

returns one TestResult per test, in order:
    {"id", "status": "pass" | "fail" | "error", "got"?, "stdout"?, "error"?, "ms"?}
("timeout" is set by the caller, which owns the clock and kills the run.) Whatever the
code does or returns, each test gets its own result; only KeyboardInterrupt, which Pyodide
uses to stop a run, gets through.

The prelude is executed in the namespace before the user's code is compiled as
"<solution>", so a traceback's `File "<solution>", line N` is editor line N.
"""

import contextlib
import copy
import io
import json
import linecache
import time
import traceback
from collections import deque
from typing import Any

SOLUTION_FILE = "<solution>"
# Names every run can use without importing them.
PRELUDE = (
    "from typing import *\n"
    "from collections import *\n"
    "import heapq, bisect, math, itertools, functools\n"
)
# The prelude is not prepended to the user's code, so line numbers need no offset.
PRELUDE_LINES = 0
COMPARE_MODES = ("exact", "unordered", "unordered_nested", "float")
FLOAT_TOLERANCE = 1e-6
MAX_STDOUT = 4000
MAX_TRACEBACK_FRAMES = 5


def new_namespace() -> dict[str, Any]:
    """A fresh namespace with the prelude names imported."""
    # __name__ is not "__main__", so an `if __name__ == "__main__":` block does not run.
    namespace: dict[str, Any] = {"__name__": "solution"}
    exec(compile(PRELUDE, "<prelude>", "exec"), namespace)
    return namespace


class _Output(io.StringIO):
    """Captured stdout. The code may call `sys.stdout.close()`; what it printed is kept."""

    def close(self) -> None:
        pass


def _normalize(value: Any) -> Any:
    """Make a result comparable with JSON: tuples and deques become lists, sets sorted lists."""
    if isinstance(value, list | tuple | deque):
        return [_normalize(item) for item in value]
    if isinstance(value, set | frozenset):
        return sorted((_normalize(item) for item in value), key=_sort_key)
    if isinstance(value, dict):
        return {key: _normalize(item) for key, item in value.items()}
    return value


def _safe_repr(value: Any) -> str:
    try:
        return repr(value)
    except Exception:  # a user-defined __repr__ that raises, or an int too long to print
        return f"<{type(value).__name__}>"


def _sort_key(value: Any) -> str:
    try:
        return json.dumps(value, sort_keys=True, default=_safe_repr)
    except Exception:
        return _safe_repr(value)


def _close(got: Any, expected: Any) -> bool:
    numbers = (int, float)
    if isinstance(got, numbers) and isinstance(expected, numbers):
        if isinstance(got, bool) or isinstance(expected, bool):
            return got == expected
        return got == expected or abs(got - expected) < FLOAT_TOLERANCE
    if isinstance(got, list) and isinstance(expected, list):
        return len(got) == len(expected) and all(map(_close, got, expected))
    return bool(got == expected)


def _equal(got: Any, expected: Any, mode: str) -> bool:
    """Compare a normalized result with the expected JSON value (unknown modes: exact)."""
    try:
        if mode == "unordered":
            if not (isinstance(got, list) and isinstance(expected, list)):
                return False
            return sorted(map(_sort_key, got)) == sorted(map(_sort_key, expected))
        if mode == "unordered_nested":
            if not (isinstance(got, list) and isinstance(expected, list)):
                return False
            if not all(isinstance(inner, list) for inner in [*got, *expected]):
                return False

            def canonical(outer: list[Any]) -> list[str]:
                return sorted(_sort_key(sorted(inner, key=_sort_key)) for inner in outer)

            return canonical(got) == canonical(expected)
        if mode == "float":
            return _close(got, expected)
        return bool(got == expected)
    except Exception:
        return False


def _jsonable(value: Any) -> Any:
    """The value if it survives JSON (as the browser reads it), else its repr."""
    try:
        json.dumps(value, allow_nan=False)
    except Exception:
        return _safe_repr(value)
    return value


def _format_error(exc: BaseException) -> str:
    """The exception with only the user's own frames, innermost last."""
    frames = [f for f in traceback.extract_tb(exc.__traceback__) if f.filename == SOLUTION_FILE]
    lines = traceback.format_exception_only(type(exc), exc)
    if frames:
        shown = traceback.format_list(frames[-MAX_TRACEBACK_FRAMES:])
        lines = ["Traceback (most recent call last):\n", *shown, *lines]
    return "".join(lines)


def _solution_class(namespace: dict[str, Any], entry: str) -> type:
    solution_class = namespace.get("Solution")
    if not isinstance(solution_class, type):
        raise NameError("Define a class named Solution.")
    if not callable(getattr(solution_class, entry, None)):
        raise AttributeError(f"Solution has no method named {entry!r}.")
    return solution_class


def _elapsed_ms(start: float) -> float:
    return round((time.perf_counter() - start) * 1000, 2)


def _run_one(
    solution_class: type, entry: str, test: dict[str, Any], mode: str, stdout: str
) -> dict[str, Any]:
    buffer = _Output()
    buffer.write(stdout)
    start = time.perf_counter()

    def error(message: str) -> dict[str, Any]:
        return {
            "id": test.get("id"),
            "status": "error",
            "error": message,
            "stdout": buffer.getvalue()[:MAX_STDOUT],
            "ms": _elapsed_ms(start),
        }

    try:
        with contextlib.redirect_stdout(buffer):
            # A fresh instance per test, so state kept on `self` cannot leak between tests.
            method = getattr(solution_class(), entry)
            got = method(*copy.deepcopy(test.get("args", [])))
    except KeyboardInterrupt:
        raise
    except BaseException as exc:  # SystemExit, GeneratorExit and custom ones included
        return error(_format_error(exc))
    ms = _elapsed_ms(start)
    try:
        # A custom case can leave out "expected" (Section 7.5); it then compares with None.
        got = _normalize(got)
        passed = _equal(got, test.get("expected"), mode)
        shown = _jsonable(got)
    except KeyboardInterrupt:
        raise
    except BaseException as exc:  # e.g. a list that contains itself, or a raising __eq__
        reason = "".join(traceback.format_exception_only(type(exc), exc)).strip()
        return error(f"Could not read the returned value: {reason}\n")
    return {
        "id": test.get("id"),
        "status": "pass" if passed else "fail",
        "got": shown,
        "stdout": buffer.getvalue()[:MAX_STDOUT],
        "ms": ms,
    }


def run_tests(code: str, entry: str, tests_json: str, mode: str = "exact") -> str:
    """Run `Solution().<entry>(*args)` for every test; returns a JSON list of TestResult.

    Each test may set its own `compare` mode; `mode` is the default. Every test gets a new
    `Solution()` and a deep copy of its arguments, so state kept on `self` and changes to
    the arguments cannot reach the next test.
    """
    tests: list[dict[str, Any]] = json.loads(tests_json)
    # Lets tracebacks show the offending line of the user's code.
    linecache.cache[SOLUTION_FILE] = (len(code), None, code.splitlines(True), SOLUTION_FILE)
    namespace = new_namespace()
    module_stdout = _Output()
    try:
        with contextlib.redirect_stdout(module_stdout):
            exec(compile(code, SOLUTION_FILE, "exec"), namespace)
            solution_class = _solution_class(namespace, entry)
    except KeyboardInterrupt:
        raise
    except BaseException as exc:
        error = _format_error(exc)
        stdout = module_stdout.getvalue()[:MAX_STDOUT]
        return json.dumps(
            [
                {"id": t.get("id"), "status": "error", "error": error, "stdout": stdout}
                for t in tests
            ]
        )

    results = []
    # Output printed while the code was loading is shown with the first test.
    stdout = module_stdout.getvalue()
    for test in tests:
        results.append(_run_one(solution_class, entry, test, test.get("compare") or mode, stdout))
        stdout = ""
    return json.dumps(results)

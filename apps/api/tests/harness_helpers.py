"""Loads apps/web/public/py/harness.py as the validator does, for the harness tests."""

import json
from pathlib import Path
from types import ModuleType
from typing import Any

HARNESS_PATH = Path(__file__).resolve().parents[3] / "apps" / "web" / "public" / "py" / "harness.py"


def _load_harness() -> ModuleType:
    # Its source runs in a new module: no import machinery, so no __pycache__ is written
    # next to harness.py (everything in public/ is served).
    module = ModuleType("seecode_harness")
    module.__file__ = str(HARNESS_PATH)
    source = HARNESS_PATH.read_text(encoding="utf-8")
    exec(compile(source, str(HARNESS_PATH), "exec"), module.__dict__)
    return module


harness = _load_harness()


def case(args: list[Any], expected: Any, **extra: Any) -> dict[str, Any]:
    """A function test."""
    return {
        "id": extra.pop("id", "t"),
        "args": args,
        "expected": expected,
        "hidden": False,
        **extra,
    }


def calls(ops: list[list[Any]], expected: Any, **extra: Any) -> dict[str, Any]:
    """A design test."""
    return {"id": extra.pop("id", "t"), "ops": ops, "expected": expected, "hidden": False, **extra}


def run(
    code: str,
    tests: list[dict[str, Any]],
    entry: str = "f",
    mode: str = "exact",
    spec: dict[str, Any] | None = None,
) -> Any:
    """run_tests as the browser calls it; `spec` is sent as spec_json when given."""
    spec_json = None if spec is None else json.dumps(spec)
    return json.loads(harness.run_tests(code, entry, json.dumps(tests), mode, spec_json))


def returning(expression: str) -> str:
    return f"class Solution:\n    def f(self, *args):\n        return {expression}\n"

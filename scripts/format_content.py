"""Format the JSON in content/ with the layout recorded in docs/DECISIONS.md.

2-space indent, UTF-8 characters kept as they are (O(n²), ≥), and any object or list that
fits in 100 columns, counting its indent, key and trailing comma, on one line. A longer
list of numbers is filled across lines; any other longer object or list gets one item per
line. A string is never split, so a line holding a long string can pass 100 columns.

Usage (from the repo root):
    python scripts/format_content.py [content_dir] [--check]

With --check nothing is written: it lists the files that need formatting and exits 1 if
there are any. Standard library only.
"""

import argparse
import json
import sys
from pathlib import Path
from typing import Any

REPO_ROOT = Path(__file__).resolve().parent.parent
WIDTH = 100
INDENT = 2


class FormatError(ValueError):
    pass


def _object(pairs: list[tuple[str, Any]]) -> dict[str, Any]:
    obj: dict[str, Any] = {}
    for key, value in pairs:
        if key in obj:  # formatting would silently drop one of them
            raise FormatError(f"duplicate key {key!r}")
        obj[key] = value
    return obj


def _reject_constant(name: str) -> Any:
    raise FormatError(f"{name} is not valid JSON")


def _flat(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False)


def _is_number(value: Any) -> bool:
    return isinstance(value, int | float) and not isinstance(value, bool)


def _lines(value: Any, indent: int, prefix: str, suffix: str) -> list[str]:
    """The lines of `prefix + value + suffix`, indented by `indent` spaces."""
    pad = " " * indent
    line = pad + prefix + _flat(value) + suffix
    if not isinstance(value, list | dict) or not value or len(line) <= WIDTH:
        return [line]
    inner = " " * (indent + INDENT)
    if isinstance(value, list) and all(map(_is_number, value)):
        rows: list[str] = []
        row = ""
        for i, number in enumerate(value):
            piece = _flat(number) + ("," if i < len(value) - 1 else "")
            if row and len(inner + row + " " + piece) > WIDTH:
                rows.append(inner + row)
                row = piece
            else:
                row = f"{row} {piece}" if row else piece
        rows.append(inner + row)
        return [f"{pad}{prefix}[", *rows, f"{pad}]{suffix}"]
    if isinstance(value, dict):
        items = [(_flat(key) + ": ", item) for key, item in value.items()]
        opening, closing = "{", "}"
    else:
        items = [("", item) for item in value]
        opening, closing = "[", "]"
    out = [pad + prefix + opening]
    for i, (key, item) in enumerate(items):
        out += _lines(item, indent + INDENT, key, "," if i < len(items) - 1 else "")
    out.append(pad + closing + suffix)
    return out


def format_json(text: str) -> str:
    """`text` in the content layout; raises FormatError or ValueError if it is not JSON."""
    value = json.loads(text, object_pairs_hook=_object, parse_constant=_reject_constant)
    return "\n".join(_lines(value, 0, "", "")) + "\n"


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Format SeeCode content JSON.")
    parser.add_argument(
        "content_dir", nargs="?", type=Path, default=REPO_ROOT / "content", help="default: content/"
    )
    parser.add_argument("--check", action="store_true", help="report, don't write")
    args = parser.parse_args(argv)

    failed = False
    for path in sorted(args.content_dir.rglob("*.json")):
        name = path.relative_to(args.content_dir).as_posix()
        text = path.read_text(encoding="utf-8")
        try:
            formatted = format_json(text)
        except ValueError as exc:  # includes FormatError and JSONDecodeError
            print(f"{name}: not formatted: {exc}")
            failed = True
            continue
        if formatted == text:
            continue
        if args.check:
            print(f"{name}: needs formatting")
            failed = True
        else:
            path.write_text(formatted, encoding="utf-8")
            print(f"{name}: formatted")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())

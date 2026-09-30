"""Validate everything in content/ (Section 10.7).

M0 scaffold: checks that every JSON file under content/ parses. M1 replaces this with
the full rule set (Pydantic models, references, signal phrases, solutions passing
their tests, viz markers).

Usage (from the repo root):
    uv run --project apps/api python scripts/validate_content.py [content_dir]
"""

import json
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent


def validate(content_dir: Path) -> list[str]:
    if not content_dir.is_dir():
        return [f"{content_dir} is not a directory"]
    errors = []
    for path in sorted(content_dir.rglob("*.json")):
        try:
            json.loads(path.read_text(encoding="utf-8"))
        except (UnicodeDecodeError, json.JSONDecodeError) as exc:
            errors.append(f"{path.relative_to(content_dir)}: {exc}")
    return errors


def main(argv: list[str]) -> int:
    content_dir = Path(argv[1]) if len(argv) > 1 else REPO_ROOT / "content"
    errors = validate(content_dir)
    for error in errors:
        print(f"error: {error}")
    checked = len(list(content_dir.rglob("*.json"))) if content_dir.is_dir() else 0
    print(f"{checked} content file(s) checked, {len(errors)} error(s)")
    return 1 if errors else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))

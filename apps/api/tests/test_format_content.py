"""scripts/format_content.py: the content JSON layout recorded in DECISIONS.md."""

import importlib.util
import json
from pathlib import Path
from types import ModuleType

import pytest

SCRIPT = Path(__file__).resolve().parents[3] / "scripts" / "format_content.py"


def _load() -> ModuleType:
    spec = importlib.util.spec_from_file_location("format_content", SCRIPT)
    assert spec is not None
    assert spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


format_content = _load()


def test_what_fits_in_100_columns_stays_on_one_line() -> None:
    text = format_content.format_json(
        '{"id": "e1", "args": [[5, 11], 10], "targets": {"time": "O(n²)"}, "tags": []}'
    )
    assert text == (
        '{"id": "e1", "args": [[5, 11], 10], "targets": {"time": "O(n²)"}, "tags": []}\n'
    )


def test_longer_objects_and_lists_get_one_item_per_line() -> None:
    words = [f"word{i}" for i in range(12)]
    text = format_content.format_json(json.dumps({"id": "x", "words": words, "n": 1}))
    lines = text.splitlines()
    assert lines[:3] == ["{", '  "id": "x",', '  "words": [']
    assert lines[3:15] == [f'    "word{i}",' for i in range(11)] + ['    "word11"']
    assert lines[15:] == ["  ],", '  "n": 1', "}"]


def test_longer_lists_of_numbers_fill_their_lines() -> None:
    text = format_content.format_json(json.dumps({"args": [list(range(100000, 100040)), 7]}))
    lines = text.splitlines()
    assert lines[:3] == ["{", '  "args": [', "    ["]
    assert all(len(line) <= format_content.WIDTH for line in lines)
    assert lines[3].startswith("      100000, 100001,")
    assert lines[-4:] == ["    ],", "    7", "  ]", "}"]
    assert json.loads(text) == {"args": [list(range(100000, 100040)), 7]}


def test_a_long_string_is_never_split() -> None:
    long = "x" * 150
    assert format_content.format_json(json.dumps({"say": long})) == f'{{\n  "say": "{long}"\n}}\n'


@pytest.mark.parametrize(
    ("text", "message"),
    [('{"a": 1, "a": 2}', "duplicate key 'a'"), ('{"a": NaN}', "NaN is not valid JSON")],
)
def test_json_that_would_change_meaning_is_refused(text: str, message: str) -> None:
    with pytest.raises(ValueError, match=message):
        format_content.format_json(text)


def test_check_reports_and_format_writes(
    tmp_path: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    (tmp_path / "problems").mkdir()
    messy = tmp_path / "problems" / "a.json"
    messy.write_text('{\n"id":   "a"}', encoding="utf-8")
    (tmp_path / "b.json").write_text('{"id": "b"}\n', encoding="utf-8")
    (tmp_path / "broken.json").write_text('{"id": ', encoding="utf-8")

    assert format_content.main([str(tmp_path), "--check"]) == 1
    assert messy.read_text(encoding="utf-8") == '{\n"id":   "a"}'
    output = capsys.readouterr().out.splitlines()
    assert output[0].startswith("broken.json: not formatted: Expecting value")
    assert output[1:] == ["problems/a.json: needs formatting"]

    (tmp_path / "broken.json").unlink()
    assert format_content.main([str(tmp_path)]) == 0
    assert messy.read_text(encoding="utf-8") == '{"id": "a"}\n'
    assert format_content.main([str(tmp_path), "--check"]) == 0

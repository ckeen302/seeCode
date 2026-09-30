"""scripts/validate_content.py end to end (M1 acceptance): exit 0 on good content, 1 on bad."""

import subprocess
import sys
from pathlib import Path

from tests.conftest import FIXTURE_CONTENT, fixture_documents, write_documents

REPO_ROOT = Path(__file__).resolve().parents[3]
SCRIPT = REPO_ROOT / "scripts" / "validate_content.py"
HARNESS_DIR = REPO_ROOT / "apps" / "web" / "public" / "py"
PALINDROME = "problems/valid-palindrome.json"
BINARY_SEARCH = "problems/binary-search.json"


def _run(*args: str) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        [sys.executable, str(SCRIPT), *args],
        capture_output=True,
        text=True,
        timeout=120,
        check=False,
        cwd=REPO_ROOT,
    )


def _bytecode() -> dict[Path, int]:
    cache = HARNESS_DIR / "__pycache__"
    return {path: path.stat().st_mtime_ns for path in cache.iterdir()} if cache.is_dir() else {}


def test_good_content_passes() -> None:
    before = _bytecode()
    done = _run(str(FIXTURE_CONTENT))
    assert done.returncode == 0, done.stdout + done.stderr
    assert done.stdout == "9 content file(s) checked, 4 solution(s) run: 0 error(s), 0 warning(s)\n"
    # The children run with -B: nothing is written into the served public/ folder.
    assert _bytecode() == before


def test_a_solution_that_fails_a_test_fails_validation(tmp_path: Path) -> None:
    documents = fixture_documents()
    solution = documents[PALINDROME]["solution"]
    solution["code"] = solution["code"].replace(
        "return True  # viz:done", "return len(s) > 1  # viz:done"
    )
    done = _run(str(write_documents(tmp_path, documents)))
    assert done.returncode == 1
    assert done.stdout.splitlines() == [
        "error: problems/valid-palindrome.json: tests[2]: solution.code test 'h1' fails: "
        "expected true, got false",
        "9 content file(s) checked, 4 solution(s) run: 1 error(s), 0 warning(s)",
    ]


def test_a_solution_that_raises_fails_validation(tmp_path: Path) -> None:
    documents = fixture_documents()
    solution = documents[PALINDROME]["solution"]
    solution["code"] = solution["code"].replace("l, r = 0, len(s) - 1", "l, r = 0, len(s)")
    done = _run(str(write_documents(tmp_path, documents)))
    assert done.returncode == 1
    assert "tests[0]: solution.code test 'e1' raises: IndexError: string index out of range" in (
        done.stdout
    )


def test_an_infinite_loop_times_out(tmp_path: Path) -> None:
    documents = fixture_documents()
    solution = documents[PALINDROME]["solution"]
    solution["code"] = solution["code"].replace("            l += 1\n            r -= 1\n", "")
    done = _run(str(write_documents(tmp_path, documents)), "--timeout", "1")
    assert done.returncode == 1
    assert (
        "error: problems/valid-palindrome.json: solution.code: timed out after 1 s "
        "(an infinite loop?)"
    ) in done.stdout


def test_a_broken_problem_file_fails_the_static_rules(tmp_path: Path) -> None:
    documents = fixture_documents()
    problem = documents[PALINDROME]
    problem["approaches"][0]["id"] = "best"  # rule 5
    problem["signals"][0]["pointsTo"] = "toolkit:nope"  # D5
    del problem["tests"][2:4]  # rule 9
    done = _run(str(write_documents(tmp_path, documents)))
    assert done.returncode == 1
    lines = done.stdout.splitlines()
    assert lines[:3] == [
        "error: problems/valid-palindrome.json: approaches: exactly one approach must have id "
        '"optimal" (found 0)',
        "error: problems/valid-palindrome.json: signals[0].pointsTo: unknown toolkit id 'nope'",
        "error: problems/valid-palindrome.json: tests: needs at least 2 visible and 3 hidden "
        "tests (found 2 visible, 2 hidden)",
    ]
    assert lines[-1].endswith("3 error(s), 0 warning(s)")


def test_invalid_json_fails(tmp_path: Path) -> None:
    content = write_documents(tmp_path, fixture_documents())
    (content / PALINDROME).write_text('{"slug": ', encoding="utf-8")
    done = _run(str(content))
    assert done.returncode == 1
    assert done.stdout.startswith("error: problems/valid-palindrome.json: not valid JSON")
    assert "3 solution(s) run" in done.stdout


def test_a_demo_that_raises_fails(tmp_path: Path) -> None:
    documents = fixture_documents()
    demo = documents["patterns.json"][0]["demo"]
    demo["args"] = [None]
    done = _run(str(write_documents(tmp_path, documents)))
    assert done.returncode == 1
    assert done.stdout.startswith(
        "error: patterns.json: [0].demo: the demo raises: TypeError: 'NoneType' object is not "
        "iterable"
    )


def test_warnings_alone_do_not_fail(tmp_path: Path) -> None:
    documents = fixture_documents()
    documents[PALINDROME]["summary"] += " Keep going." * 40
    done = _run(str(write_documents(tmp_path, documents)))
    assert done.returncode == 0
    assert "warning: problems/valid-palindrome.json: summary:" in done.stdout
    assert done.stdout.endswith("0 error(s), 1 warning(s)\n")


def test_missing_folder_fails(tmp_path: Path) -> None:
    done = _run(str(tmp_path / "nope"))
    assert done.returncode == 1
    assert "content folder not found" in done.stdout


# ---------------------------------------------------------------- walkthroughs, traced


def test_narration_that_reads_a_variable_too_early_fails(tmp_path: Path) -> None:
    """A line event fires before its line runs, so `mid` does not exist yet the first time."""
    documents = fixture_documents()
    solution = documents[BINARY_SEARCH]["solution"]
    solution["code"] = solution["code"].replace(
        "mid = (lo + hi) // 2\n            if nums[mid] == target:  # viz:mid\n",
        "mid = (lo + hi) // 2  # viz:mid\n            if nums[mid] == target:\n",
    )
    done = _run(str(write_documents(tmp_path, documents)))
    assert done.returncode == 1
    assert done.stdout.splitlines() == [
        "error: problems/binary-search.json: viz.events[0].say: raises NameError: name 'mid' "
        "is not defined (input 'e1', line 5)",
        "9 content file(s) checked, 4 solution(s) run: 1 error(s), 0 warning(s)",
    ]


def test_conditions_that_raise_fail(tmp_path: Path) -> None:
    documents = fixture_documents()
    viz = documents[PALINDROME]["viz"]
    viz["events"][3]["when"] = "s[l + 100] != s[r]"
    viz["predict"][1]["answerWhen"] = "s[r + 50] == s[l]"
    done = _run(str(write_documents(tmp_path, documents)))
    assert done.returncode == 1
    assert done.stdout.splitlines() == [
        "error: problems/valid-palindrome.json: viz.events[3].when: raises IndexError: string "
        "index out of range (input 'e1', line 9)",
        "error: problems/valid-palindrome.json: viz.predict[1].answerWhen: raises IndexError: "
        "string index out of range (input 'e1', line 9)",
        "warning: problems/valid-palindrome.json: viz.events[3]: event 'mismatch' never fires "
        "on any visible test",
        "9 content file(s) checked, 4 solution(s) run: 2 error(s), 1 warning(s)",
    ]


def test_narration_may_only_use_repr_and_len(tmp_path: Path) -> None:
    documents = fixture_documents()
    documents["patterns.json"][0]["demo"]["viz"]["events"][1]["say"] = "Remember {x} ({sum(nums)})"
    done = _run(str(write_documents(tmp_path, documents)))
    assert done.returncode == 1
    # The static check reports it once; the traced run does not repeat it.
    assert done.stdout.splitlines() == [
        "error: patterns.json: [0].demo.viz.events[1].say: 'sum' is not a variable in the code "
        "(the only builtins here are len and repr)",
        "9 content file(s) checked, 4 solution(s) run: 1 error(s), 0 warning(s)",
    ]


def test_events_that_never_fire_and_unreached_predicts_are_warnings(tmp_path: Path) -> None:
    documents = fixture_documents()
    documents[PALINDROME]["viz"]["predict"][1]["occurrence"] = 40
    documents["patterns.json"][1]["demo"]["viz"]["events"][0]["when"] = "nums[l] > 100"
    done = _run(str(write_documents(tmp_path, documents)))
    assert done.returncode == 0
    assert done.stdout.splitlines() == [
        "warning: patterns.json: [1].demo.viz.events[0]: event 'sum' never fires on the demo's "
        "arguments",
        "warning: problems/valid-palindrome.json: viz.predict[1]: predict point never reached "
        "on any visible test",
        "9 content file(s) checked, 4 solution(s) run: 0 error(s), 2 warning(s)",
    ]

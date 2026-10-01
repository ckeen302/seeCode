"""scripts/validate_content.py end to end (M1 acceptance): exit 0 on good content, 1 on bad."""

import subprocess
import sys
from pathlib import Path

from tests.conftest import FIXTURE_CONTENT, fixture_documents, write_documents
from tests.engine_fixtures import (
    Document,
    any_pair,
    clone_graph,
    copy_random_list,
    encode_decode,
    file_name,
    min_stack,
    reverse_linked_list,
    with_engine_problems,
)

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


# ---------------------------------------------------------------- io, design and checkers


def _with(tmp_path: Path, *problems: Document) -> str:
    documents = fixture_documents()
    for problem in problems:
        documents[file_name(problem)] = problem
    return str(write_documents(tmp_path, documents))


def _issues(done: subprocess.CompletedProcess[str]) -> list[str]:
    return done.stdout.splitlines()[:-1]


def test_engine_problems_pass_every_rule(tmp_path: Path) -> None:
    """Typed arguments, in-place results, design calls, round trips and checkers all run
    through the harness, and their walkthroughs are traced without warnings."""
    before = _bytecode()
    done = _run(str(write_documents(tmp_path, with_engine_problems(fixture_documents()))))
    assert done.returncode == 0, done.stdout + done.stderr
    assert (
        done.stdout == "19 content file(s) checked, 14 solution(s) run: 0 error(s), 0 warning(s)\n"
    )
    assert _bytecode() == before


def test_a_typed_result_that_differs_fails(tmp_path: Path) -> None:
    problem = reverse_linked_list()
    problem["tests"][0]["expected"] = [1, 2, 3]
    done = _run(_with(tmp_path, problem))
    assert _issues(done) == [
        "error: problems/reverse-linked-list.json: tests[0]: solution.code test 'e1' fails: "
        "expected [1, 2, 3], got [3, 2, 1]"
    ]


def test_a_result_with_a_cycle_fails_without_hanging(tmp_path: Path) -> None:
    problem = reverse_linked_list()
    problem["solution"]["code"] = problem["solution"]["code"].replace(
        "        return prev  # viz:done\n",
        "        if prev and prev.next:\n"
        "            prev.next.next = prev\n"
        "        return prev  # viz:done\n",
    )
    done = _run(_with(tmp_path, problem))
    assert done.returncode == 1
    assert _issues(done)[0] == (
        "error: problems/reverse-linked-list.json: tests[0]: solution.code test 'e1' raises: "
        "Could not read the returned value: the list has a cycle: node 2 links back to node 1"
    )


def test_a_copy_that_reuses_input_nodes_fails(tmp_path: Path) -> None:
    problem = copy_random_list()
    problem["solution"]["code"] = problem["solution"]["code"].replace(
        "return copies[head]  # viz:done", "return head  # viz:done"
    )
    done = _run(_with(tmp_path, problem))
    assert _issues(done)[0] == (
        "error: problems/copy-list-with-random-pointer.json: tests[0]: solution.code test 'e1' "
        "fails: The result reuses nodes of the input list: a deep copy is made of new Node "
        "objects. (got [[3, null], [1, 0], [2, 1]])"
    )


def test_a_bad_typed_test_input_is_reported(tmp_path: Path) -> None:
    problem = clone_graph()
    problem["tests"][2]["args"] = [[[2], [1], []]]
    done = _run(_with(tmp_path, problem))
    assert _issues(done) == [
        "error: problems/clone-graph.json: tests[2]: solution.code test 'h1' raises: Could not "
        "build the arguments: node (graph_node): node(s) 3 cannot be reached from node 1, and "
        "the method only gets node 1"
    ]


def test_checker_verdicts_are_reported(tmp_path: Path) -> None:
    wrong = any_pair()
    wrong["solution"]["code"] = wrong["solution"]["code"].replace(
        "return [seen[target - x], i]", "return [i, i]"
    )
    done = _run(_with(tmp_path, wrong))
    assert _issues(done)[0] == (
        "error: problems/any-pair.json: tests[0]: solution.code test 'e1' fails: the checker "
        "rejects [1, 1] (one right answer: [0, 1])"
    )
    broken = any_pair()
    broken["checker"] = "def check(args, got):\n    return got[0] / 0 == 1\n"
    done = _run(_with(tmp_path, broken))
    assert _issues(done)[0] == (
        "error: problems/any-pair.json: tests[0]: solution.code test 'e1' fails: The checker "
        "could not judge this answer: ZeroDivisionError: division by zero (checker line 2) "
        "(got [0, 1])"
    )


def test_design_results_and_errors_are_reported(tmp_path: Path) -> None:
    wrong = min_stack()
    wrong["tests"][0]["expected"] = [None, None, None, 3, None, 3]
    done = _run(_with(tmp_path, wrong))
    assert _issues(done) == [
        "error: problems/min-stack.json: tests[0]: solution.code test 'e1' fails: expected "
        "[null, null, null, 3, null, 3], got [null, null, null, 1, null, 3]"
    ]
    broken = min_stack()
    broken["solution"]["code"] = broken["solution"]["code"].replace(
        "self.stack.pop()", "self.stack.pop(5)"
    )
    done = _run(_with(tmp_path, broken))
    assert _issues(done)[0] == (
        "error: problems/min-stack.json: tests[0]: solution.code test 'e1' raises: IndexError: "
        "pop index out of range"
    )


def test_round_trips_run_through_refs(tmp_path: Path) -> None:
    lossy = encode_decode()
    lossy["solution"]["code"] = lossy["solution"]["code"].replace("return out", "return out[1:]")
    done = _run(_with(tmp_path, lossy))
    assert _issues(done)[0] == (
        "error: problems/encode-and-decode-strings.json: tests[0]: solution.code test 'e1' "
        'fails: the checker rejects [null, "3#see4#code", ["code"]] (one right answer: [null, '
        'null, ["see", "code"]])'
    )


def test_walkthroughs_trace_typed_arguments(tmp_path: Path) -> None:
    """The tracer builds ListNodes from the test's lists, so narration can read them."""
    good = reverse_linked_list()
    good["viz"]["events"][0]["say"] = "{prev.val} now leads the list"
    assert _run(_with(tmp_path, good)).returncode == 0
    broken = reverse_linked_list()
    broken["viz"]["events"][0]["say"] = "{head.val} leads the list"
    done = _run(_with(tmp_path, broken))
    assert _issues(done) == [
        "error: problems/reverse-linked-list.json: viz.events[0].say: raises AttributeError: "
        "'NoneType' object has no attribute 'val' (input 'e1', line 6)"
    ]


def test_walkthroughs_trace_design_calls(tmp_path: Path) -> None:
    broken = min_stack()
    broken["viz"]["events"][0]["say"] = "{val + 'x'}"
    done = _run(_with(tmp_path, broken))
    assert _issues(done) == [
        "error: problems/min-stack.json: viz.events[0].say: raises TypeError: unsupported "
        "operand type(s) for +: 'int' and 'str' (input 'e1', line 7)"
    ]
    unfired = min_stack()
    code = unfired["solution"]["code"].replace(
        "        return self.stack[-1][0]\n", "        return self.stack[-1][0]  # viz:peek\n"
    )
    unfired["solution"]["code"] = code
    unfired["viz"]["events"].append({"id": "peek", "at": "peek", "label": "top"})
    done = _run(_with(tmp_path, unfired))
    assert done.returncode == 0
    assert _issues(done) == []  # e1 calls top(), so the event fires

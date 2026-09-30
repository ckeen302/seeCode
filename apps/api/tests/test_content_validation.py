"""Static content validation: Section 10.7 rules 1-6 and 8-10, plus the cross references."""

from collections.abc import Callable
from pathlib import Path
from typing import Any

import pytest

from app.content.validation import (
    Issue,
    ValidationResult,
    validate_content_dir,
    validate_files,
)
from tests.conftest import FIXTURE_CONTENT, encode_documents, fixture_documents

Documents = dict[str, Any]
TWO_SUM = "problems/two-sum.json"
PALINDROME = "problems/valid-palindrome.json"
DRILL = "problems/reverse-string.json"


def _validate(change: Callable[[Documents], object] | None = None) -> ValidationResult:
    documents = fixture_documents()
    if change is not None:
        change(documents)
    return validate_files(encode_documents(documents))


def _messages(result: ValidationResult, file: str, level: str = "error") -> list[str]:
    """`path: message` of each issue in `file` at `level`."""
    return [
        f"{issue.path}: {issue.message}"
        for issue in result.issues
        if issue.file == file and issue.level == level
    ]


def _only_errors(change: Callable[[Documents], object]) -> list[str]:
    """Every error, as `file: path: message`."""
    return [f"{i.file}: {i.path}: {i.message}" for i in _validate(change).errors]


def test_fixture_content_is_valid() -> None:
    result = _validate()
    assert result.issues == []
    assert result.content.patterns is not None
    assert len(result.content.patterns) == 3
    assert sorted(result.content.problems) == [
        "problems/binary-search.json",
        "problems/reverse-string.json",
        "problems/two-sum.json",
        "problems/valid-anagram.json",
        "problems/valid-palindrome.json",
    ]


def test_validate_content_dir_reads_the_folder() -> None:
    assert validate_content_dir(FIXTURE_CONTENT).issues == []


def test_missing_content_folder_is_an_error(tmp_path: Path) -> None:
    result = validate_content_dir(tmp_path / "nope")
    assert [str(issue) for issue in result.issues] == [
        f"error: {tmp_path / 'nope'}: content folder not found"
    ]


def test_issue_string_names_file_and_path() -> None:
    assert str(Issue("error", "a.json", "x[0].y", "bad")) == "error: a.json: x[0].y: bad"
    assert str(Issue("warning", "a.json", "", "bad")) == "warning: a.json: bad"


# ---------------------------------------------------------------- rule 1: files and models


def test_invalid_json_is_reported() -> None:
    files = encode_documents(fixture_documents())
    files[TWO_SUM] = b'{"slug": "two-sum",'
    [issue] = validate_files(files).errors
    assert issue.file == TWO_SUM
    assert issue.message.startswith("not valid JSON")


def test_duplicate_json_keys_are_reported() -> None:
    files = encode_documents(fixture_documents())
    files[TWO_SUM] = files[TWO_SUM].replace(b'"title": "Two Sum"', b'"title": "A", "title": "B"')
    assert _messages(validate_files(files), TWO_SUM) == [": not valid JSON: duplicate key 'title'"]


def test_nan_is_not_valid_json() -> None:
    files = encode_documents(fixture_documents())
    files[TWO_SUM] = files[TWO_SUM].replace(b'"expected": [2, 3]', b'"expected": NaN')
    assert _messages(validate_files(files), TWO_SUM) == [": not valid JSON: NaN is not valid JSON"]


def test_model_errors_carry_json_paths() -> None:
    def change(d: Documents) -> None:
        d[TWO_SUM]["approaches"][0]["time"] = "O(n^2)"
        d[TWO_SUM]["approaches"][1]["extra"] = 1
        del d[TWO_SUM]["summary"]
        d["patterns.json"][1]["slots"][0]["label"] = ""

    result = _validate(change)
    assert _messages(result, TWO_SUM) == [
        "summary: required",
        "approaches[0].time: Input should be 'O(1)', 'O(log n)', 'O(n)', 'O(n log n)', "
        "'O(n²)' or 'O(2ⁿ)'",
        "approaches[1].extra: unknown key",
    ]
    assert _messages(result, "patterns.json") == ["[1].slots[0].label: must not be empty"]


def test_unknown_and_missing_files_are_reported() -> None:
    def change(d: Documents) -> None:
        d["drills.json"] = []
        d["problems/extra/deep.json"] = {}
        del d["toolkit.json"]

    assert _only_errors(change) == [
        "drills.json: : unknown content file (expected patterns.json, roadmap.json, "
        "structures.json, toolkit.json or problems/<slug>.json)",
        "problems/extra/deep.json: : unknown content file (expected patterns.json, roadmap.json, "
        "structures.json, toolkit.json or problems/<slug>.json)",
        "toolkit.json: : missing required file",
    ]


def test_a_broken_file_does_not_cascade_into_reference_errors() -> None:
    result = _validate(lambda d: d.update({"patterns.json": {"not": "a list"}}))
    assert [issue.file for issue in result.errors] == ["patterns.json"]
    assert result.content.patterns is None
    assert len(result.content.problems) == 5


# ---------------------------------------------------------------- rule 2: names and uniqueness


def test_slug_must_equal_the_file_name() -> None:
    result = _validate(lambda d: d[TWO_SUM].update(slug="two-sum-x"))
    assert "slug: 'two-sum-x' must equal the file name 'two-sum'" in _messages(result, TWO_SUM)


def test_slugs_are_unique() -> None:
    def change(d: Documents) -> None:
        d["problems/two-sum-copy.json"] = {**d[TWO_SUM], "order": 99}

    result = _validate(change)
    assert _messages(result, "problems/two-sum-copy.json") == [
        "slug: 'two-sum' must equal the file name 'two-sum-copy'"
    ]
    # Files are checked in name order; the later one gets the duplicate error.
    assert _messages(result, TWO_SUM) == ["slug: slug also used by problems/two-sum-copy.json"]


@pytest.mark.parametrize(
    ("file", "path", "message"),
    [
        ("patterns.json", "[1].id", "duplicate pattern id 'hashing'"),
        ("structures.json", "[1].id", "duplicate structure id 'array'"),
        ("toolkit.json", "[1].id", "duplicate toolkit id 'lower'"),
    ],
)
def test_ids_are_unique(file: str, path: str, message: str) -> None:
    def change(d: Documents) -> None:
        d[file][1] = {**d[file][1], "id": d[file][0]["id"]}

    assert f"{path}: {message}" in _messages(_validate(change), file)


def test_roadmap_ids_are_unique() -> None:
    def change(d: Documents) -> None:
        d["roadmap.json"]["patterns"].append({"id": "hashing", "x": 5, "y": 5, "prereqs": []})

    result = _validate(change)
    assert "patterns[3].id: duplicate roadmap id 'hashing'" in _messages(result, "roadmap.json")


def test_problem_orders_are_unique() -> None:
    result = _validate(lambda d: d[TWO_SUM].update(order=4))
    assert _messages(result, PALINDROME) == ["order: order also used by problems/two-sum.json"]


def test_drill_only_problems_are_numbered_from_101() -> None:
    result = _validate(lambda d: d[DRILL].update(order=16))
    assert _messages(result, DRILL) == [
        "order: drill-only problems are numbered from 101, in the order of the Section 24.2 "
        "drill-only table"
    ]
    # The drill-only problem (101) is checked first, so the Workspace problem gets both errors.
    assert _messages(_validate(lambda d: d[TWO_SUM].update(order=101)), TWO_SUM) == [
        "order: order also used by problems/reverse-string.json",
        "order: a Workspace problem's order is its Section 24.2 number (below 101)",
    ]


# ---------------------------------------------------------------- rule 3: references


@pytest.mark.parametrize(
    ("change", "file", "expected"),
    [
        (
            lambda d: d[TWO_SUM].update(patternId="hashmap"),
            TWO_SUM,
            "patternId: unknown pattern id 'hashmap'",
        ),
        (
            lambda d: d[TWO_SUM]["approaches"][1].update(patternId="brute"),
            TWO_SUM,
            "approaches[1].patternId: unknown pattern id (or \"brute_force\") 'brute'",
        ),
        (
            lambda d: d[TWO_SUM]["approaches"][0].update(structures=["hash_map", "dict"]),
            TWO_SUM,
            "approaches[0].structures[1]: unknown structure id 'dict'",
        ),
        (
            lambda d: d[TWO_SUM]["solution"].update(toolkit=["enumerate", "zip"]),
            TWO_SUM,
            "solution.toolkit[1]: unknown toolkit id 'zip'",
        ),
        (
            lambda d: d["patterns.json"][0].update(toolkit=["heapq"]),
            "patterns.json",
            "[0].toolkit[0]: unknown toolkit id 'heapq'",
        ),
        (
            lambda d: d["toolkit.json"][0].update(patterns=["stack"]),
            "toolkit.json",
            "[0].patterns[0]: unknown pattern id 'stack'",
        ),
    ],
)
def test_references_must_exist(
    change: Callable[[Documents], object], file: str, expected: str
) -> None:
    assert expected in _messages(_validate(change), file)


@pytest.mark.parametrize(
    ("change", "file", "expected"),
    [
        (
            lambda d: d[TWO_SUM]["approaches"][0].update(structures=["hash_map", "hash_map"]),
            TWO_SUM,
            "approaches[0].structures: duplicate structure id 'hash_map'",
        ),
        (
            lambda d: d[TWO_SUM]["solution"].update(toolkit=["enumerate", "enumerate"]),
            TWO_SUM,
            "solution.toolkit: duplicate toolkit id 'enumerate'",
        ),
        (
            lambda d: d["patterns.json"][0]["toolkit"].append("counter"),
            "patterns.json",
            "[0].toolkit: duplicate toolkit id 'counter'",
        ),
        (
            lambda d: d["toolkit.json"][0]["patterns"].append("two_pointers_opposite"),
            "toolkit.json",
            "[0].patterns: duplicate pattern id 'two_pointers_opposite'",
        ),
        (
            lambda d: d["roadmap.json"]["patterns"][1]["prereqs"].append("hashing"),
            "roadmap.json",
            "patterns[1].prereqs: duplicate prereq 'hashing'",
        ),
    ],
)
def test_id_lists_have_no_duplicates(
    change: Callable[[Documents], object], file: str, expected: str
) -> None:
    assert _messages(_validate(change), file) == [expected]


def test_a_pattern_lists_exactly_the_toolkit_cards_tagged_with_it() -> None:
    def change(d: Documents) -> None:
        d["patterns.json"][0]["toolkit"] = ["enumerate", "set_ops", "lower"]

    assert _messages(_validate(change), "patterns.json") == [
        "[0].toolkit: must list exactly the toolkit cards tagged 'hashing': missing counter; "
        "lower not tagged 'hashing' in toolkit.json"
    ]


def test_a_toolkit_phrase_belongs_to_one_card() -> None:
    def change(d: Documents) -> None:
        d["toolkit.json"][3]["phrases"].append("Need the index and the value")

    assert _messages(_validate(change), "toolkit.json") == [
        "[3].phrases[2]: 'Need the index and the value' is already a phrase of 'enumerate'; "
        "a phrase belongs to one card"
    ]


def test_brute_force_approaches_are_allowed() -> None:
    result = _validate()
    assert result.content.problems[TWO_SUM].approaches[1].pattern_id == "brute_force"
    assert result.issues == []


# ---------------------------------------------------------------- rule 4: signal phrases


def test_signal_phrase_must_appear_in_summary_or_constraints() -> None:
    def change(d: Documents) -> None:
        d[TWO_SUM]["signals"][0]["phrase"] = "sum of two numbers"

    assert _messages(_validate(change), TWO_SUM) == [
        "signals[0].phrase: 'sum of two numbers' does not appear word for word in the summary "
        "or constraints"
    ]


def test_signal_phrase_match_ignores_case_and_accepts_constraints() -> None:
    def change(d: Documents) -> None:
        d[TWO_SUM]["signals"][0]["phrase"] = "EXACTLY ONE PAIR ADDS UP"  # from a constraint
        d[TWO_SUM]["signals"][1]["phrase"] = "Return Those Two Positions"

    assert _validate(change).issues == []


@pytest.mark.parametrize(
    ("constraint", "phrase"),
    [
        ("nums is an unsorted array", "sorted array"),  # "sorted" only inside "unsorted"
        ("every value is listed", "value is li"),  # stops inside a word
        ("the values repeat", "values rep"),
        ("indices_only", "indices"),  # an underscore is part of a word
    ],
)
def test_signal_phrase_must_match_whole_words(constraint: str, phrase: str) -> None:
    def change(d: Documents) -> None:
        d[TWO_SUM]["constraints"].append(constraint)
        d[TWO_SUM]["signals"][0]["phrase"] = phrase

    assert _messages(_validate(change), TWO_SUM) == [
        f"signals[0].phrase: {phrase!r} does not appear word for word in the summary or constraints"
    ]


@pytest.mark.parametrize(
    ("constraint", "phrase"),
    [
        ("nums is an unsorted array", "unsorted array"),
        ("(values may repeat)", "values may repeat"),  # punctuation may touch a phrase
        ("it runs in O(log n) time.", "O(log n) time"),
        ("find `target`, then stop", "`target`,"),
    ],
)
def test_signal_phrase_may_touch_punctuation(constraint: str, phrase: str) -> None:
    def change(d: Documents) -> None:
        d[TWO_SUM]["constraints"].append(constraint)
        d[TWO_SUM]["signals"][0]["phrase"] = phrase

    assert _validate(change).issues == []


def test_signal_phrase_cannot_start_or_end_with_a_space() -> None:
    def change(d: Documents) -> None:
        d[TWO_SUM]["signals"][0]["phrase"] = "add up to "

    assert _messages(_validate(change), TWO_SUM) == [
        "signals[0].phrase: 'add up to ' starts or ends with a space"
    ]


# ---------------------------------------------------------------- rule 5: one optimal approach


def test_exactly_one_optimal_approach() -> None:
    none = _validate(lambda d: d[TWO_SUM]["approaches"][0].update(id="best"))
    assert 'approaches: exactly one approach must have id "optimal" (found 0)' in _messages(
        none, TWO_SUM
    )

    def two(d: Documents) -> None:
        d[TWO_SUM]["approaches"][1]["id"] = "optimal"

    assert 'approaches: exactly one approach must have id "optimal" (found 2)' in _messages(
        _validate(two), TWO_SUM
    )


def test_optimal_approach_cannot_be_suboptimal() -> None:
    def change(d: Documents) -> None:
        d[TWO_SUM]["approaches"][0].update(acceptedAs="suboptimal", note="No.")

    assert _messages(_validate(change), TWO_SUM) == [
        "approaches[0].acceptedAs: the optimal approach cannot be suboptimal"
    ]


def test_approach_ids_are_unique() -> None:
    def change(d: Documents) -> None:
        d[TWO_SUM]["approaches"].append({**d[TWO_SUM]["approaches"][1]})

    assert "approaches[2].id: duplicate approach id 'every_pair'" in _messages(
        _validate(change), TWO_SUM
    )


def test_problem_pattern_differing_from_the_optimal_approach_is_a_warning() -> None:
    def change(d: Documents) -> None:
        d[TWO_SUM]["approaches"][0]["patternId"] = "two_pointers_opposite"

    result = _validate(change)
    assert result.errors == []
    assert _messages(result, TWO_SUM, "warning") == [
        "patternId: differs from the optimal approach's patternId 'two_pointers_opposite'"
    ]


# ---------------------------------------------------------------- rule 6 and D1: hint slots


def test_hint_slots_must_cover_every_slot_of_the_pattern() -> None:
    result = _validate(lambda d: d[TWO_SUM]["hints"]["slots"].pop("record"))
    assert _messages(result, TWO_SUM) == ["hints.slots: missing slot(s): record"]


def test_hint_slots_cannot_add_unknown_slots() -> None:
    result = _validate(lambda d: d[TWO_SUM]["hints"]["slots"].update(extra="More."))
    assert _messages(result, TWO_SUM) == [
        "hints.slots: unknown slot(s): extra (slots are setup, loop, update, record, return)"
    ]


def test_pattern_slots_are_the_five_ids_in_order() -> None:
    def change(d: Documents) -> None:
        slots = d["patterns.json"][0]["slots"]
        slots[0], slots[1] = slots[1], slots[0]

    assert _messages(_validate(change), "patterns.json") == [
        "[0].slots: slots must be setup, loop, update, record, return in this order "
        "(found loop, setup, update, record, return)"
    ]


def test_missing_template_slot_comment_is_a_warning() -> None:
    def change(d: Documents) -> None:
        pattern = d["patterns.json"][0]
        pattern["template"] = pattern["template"].replace("# RECORD", "# save it")

    result = _validate(change)
    assert result.errors == []
    assert _messages(result, "patterns.json", "warning") == [
        "[0].template: no '# RECORD' slot comment"
    ]


def test_repeated_template_slot_comment_is_a_warning() -> None:
    def change(d: Documents) -> None:
        d["patterns.json"][0]["template"] += "# SETUP: again\n"

    result = _validate(change)
    assert result.errors == []
    assert _messages(result, "patterns.json", "warning") == [
        "[0].template: '# SETUP' appears 2 times; use it once"
    ]


# ---------------------------------------------------------------- rule 8: viz markers


def test_viz_event_marker_must_exist_in_the_solution() -> None:
    def change(d: Documents) -> None:
        code = d[PALINDROME]["solution"]["code"]
        d[PALINDROME]["solution"]["code"] = code.replace("# viz:done", "# done")

    assert _messages(_validate(change), PALINDROME) == [
        "viz.events[4].at: no '# viz:done' marker in code"
    ]


def test_pattern_demo_markers_must_exist_in_the_demo_code() -> None:
    def change(d: Documents) -> None:
        d["patterns.json"][1]["demo"]["viz"]["events"][0]["at"] = "total"

    assert _messages(_validate(change), "patterns.json") == [
        "[1].demo.viz.events[0].at: no '# viz:total' marker in code"
    ]


def test_viz_event_ids_are_unique() -> None:
    def change(d: Documents) -> None:
        d[PALINDROME]["viz"]["events"][1]["id"] = "skip_l"

    assert _messages(_validate(change), PALINDROME) == [
        "viz.events[1].id: duplicate event id 'skip_l'"
    ]


def test_predict_must_point_at_an_event() -> None:
    def change(d: Documents) -> None:
        d[PALINDROME]["viz"]["predict"][0]["atEvent"] = "skip_x"

    assert _messages(_validate(change), PALINDROME) == [
        "viz.predict[0].atEvent: unknown event id 'skip_x'"
    ]


def test_at_most_three_predict_points() -> None:
    def change(d: Documents) -> None:
        predict = d[PALINDROME]["viz"]["predict"]
        predict.extend([predict[0], predict[1]])

    assert _messages(_validate(change), PALINDROME) == [
        "viz.predict: at most 3 predict points per walkthrough (found 4)"
    ]


def test_viz_variables_must_appear_in_the_code() -> None:
    def change(d: Documents) -> None:
        viz = d[PALINDROME]["viz"]
        viz["pointers"][1]["var"] = "right"
        viz["confirmed"]["outside"] = ["l", "rr"]

    assert _messages(_validate(change), PALINDROME) == [
        "viz.pointers[1].var: variable 'right' does not appear in the code",
        "viz.confirmed.outside[1]: variable 'rr' does not appear in the code",
    ]


@pytest.mark.parametrize(
    ("old", "new", "expected"),
    [
        (
            "l += 1  # viz:skip_l",
            "l += 1  # viz:skip_l # viz:step",
            "solution.code: line 6 has 2 viz markers; the tracer only sees the first "
            "('# viz:skip_l')",
        ),
        (
            "                l += 1  # viz:skip_l\n",
            "                # viz:skip_l\n                l += 1\n",
            "solution.code: '# viz:skip_l' on line 6 never fires: the tracer only stops on lines "
            "that run code inside a function (not a comment-only line, `else:` or a `def` line)",
        ),
        (
            "    def isPalindrome(self, s: str) -> bool:",
            "    def isPalindrome(self, s: str) -> bool:  # viz:start",
            "solution.code: '# viz:start' on line 2 never fires: the tracer only stops on lines "
            "that run code inside a function (not a comment-only line, `else:` or a `def` line)",
        ),
    ],
)
def test_markers_must_be_where_the_tracer_sees_them(old: str, new: str, expected: str) -> None:
    def change(d: Documents) -> None:
        solution = d[PALINDROME]["solution"]
        assert old in solution["code"]
        solution["code"] = solution["code"].replace(old, new)

    assert _messages(_validate(change), PALINDROME) == [expected]


def test_a_second_marker_on_a_line_is_not_a_marker() -> None:
    def change(d: Documents) -> None:
        solution = d[PALINDROME]["solution"]
        solution["code"] = solution["code"].replace("  # viz:done", "  # viz:skip_l # viz:done")

    assert _messages(_validate(change), PALINDROME) == [
        "solution.code: line 13 has 2 viz markers; the tracer only sees the first ('# viz:skip_l')",
        "viz.events[4].at: no '# viz:done' marker in code",
    ]


def test_a_marker_on_an_else_line_never_fires() -> None:
    code = (
        "class Solution:\n"
        "    def search(self, nums, target):\n"
        "        if target in nums:\n"
        "            return nums.index(target)  # viz:found\n"
        "        else:  # viz:missing\n"
        "            return -1\n"
    )

    def change(d: Documents) -> None:
        d["problems/binary-search.json"]["solution"]["code"] = code
        d["problems/binary-search.json"]["viz"] = {
            "primary": "nums",
            "events": [
                {"id": "found", "at": "found", "label": "found"},
                {"id": "missing", "at": "missing", "label": "missing"},
            ],
        }

    assert _messages(_validate(change), "problems/binary-search.json") == [
        "solution.code: '# viz:missing' on line 5 never fires: the tracer only stops on lines "
        "that run code inside a function (not a comment-only line, `else:` or a `def` line)"
    ]


def test_markers_in_nested_functions_and_comprehensions_fire() -> None:
    code = (
        "class Solution:\n"
        "    def isPalindrome(self, s: str) -> bool:\n"
        "        def keep(ch):  # viz:helper\n"
        "            return ch.isalnum()  # viz:skip_l\n"
        "        kept = [ch.lower() for ch in s if keep(ch)]  # viz:skip_r\n"
        "        l, r = 0, len(kept) - 1\n"
        "        while l < r:\n"
        "            if kept[l] != kept[r]:  # viz:compare\n"
        "                return False\n"
        "            l, r = l + 1, r - 1\n"
        "        return True  # viz:done\n"
    )

    def change(d: Documents) -> None:
        d[PALINDROME]["solution"]["code"] = code
        d[PALINDROME]["viz"]["events"] = [
            {"id": name, "at": name, "label": name}
            for name in ("helper", "skip_l", "skip_r", "compare", "done")
        ]
        d[PALINDROME]["viz"]["predict"] = []

    assert _validate(change).issues == []


@pytest.mark.parametrize(
    ("key", "value", "expected"),
    [
        (
            "say",
            "s[{l}] is {s[l}!r}",
            "does not parse: closing parenthesis '}' does not match opening parenthesis '['",
        ),
        (
            "say",
            "{undefined_var} moved",
            "'undefined_var' is not a variable in the code (the only builtins here are len and "
            "repr)",
        ),
        (
            "say",
            "{max(l, r)}",
            "'max' is not a variable in the code (the only builtins here are len and repr)",
        ),
        (
            "say",
            "{self.memo}",
            "'self' is not a variable in the code (the only builtins here are len and repr)",
        ),
        ("when", "l <", "does not parse: invalid syntax"),
        (
            "when",
            "repr(s[l]) == 'a'",
            "'repr' is not a variable in the code (the only builtins here are len)",
        ),
    ],
)
def test_viz_narration_and_conditions_are_checked(key: str, value: str, expected: str) -> None:
    def change(d: Documents) -> None:
        d[PALINDROME]["viz"]["events"][0][key] = value

    assert _messages(_validate(change), PALINDROME) == [f"viz.events[0].{key}: {expected}"]


def test_predict_answer_when_is_checked() -> None:
    def change(d: Documents) -> None:
        predict = d[PALINDROME]["viz"]["predict"][1]
        predict["answerWhen"] = "s[l].lower() =="

    assert _messages(_validate(change), PALINDROME) == [
        "viz.predict[1].answerWhen: does not parse: invalid syntax"
    ]


def test_viz_expressions_may_use_their_own_names_and_the_allowed_builtins() -> None:
    def change(d: Documents) -> None:
        events = d[PALINDROME]["viz"]["events"]
        events[0]["say"] = "{len([c for c in s[:l] if c.isalnum()])} kept, {repr(s[l])} next"
        events[1]["when"] = "len(s) > 1 and all(c != ' ' for c in s[r:])"
        d[PALINDROME]["viz"]["predict"][1]["answerWhen"] = "len({s[l].lower(), s[r].lower()}) < 2"

    # `all` is not one of the tracer's builtins either, so only it is reported.
    assert _messages(_validate(change), PALINDROME) == [
        "viz.events[1].when: 'all' is not a variable in the code (the only builtins here are len)"
    ]


def test_pattern_demo_narration_is_checked() -> None:
    def change(d: Documents) -> None:
        d["patterns.json"][1]["demo"]["viz"]["events"][0]["say"] = "{nums[l] + nums[rr]}"

    assert _messages(_validate(change), "patterns.json") == [
        "[1].demo.viz.events[0].say: 'rr' is not a variable in the code (the only builtins here "
        "are len and repr)"
    ]


def test_viz_needs_a_solution() -> None:
    def change(d: Documents) -> None:
        d[DRILL]["viz"] = {"primary": "s"}

    assert _messages(_validate(change), DRILL) == [
        "viz: viz needs a solution: its events mark solution.code"
    ]


# ---------------------------------------------------------------- code checks (never run)


@pytest.mark.parametrize(
    ("code", "expected"),
    [
        ("class Solution:\n    def isPalindrome(self, s)\n", "syntax error on line 2"),
        (
            "class Solution:\n    def isPalindrome(self, s):\n        return True\nreturn 1\n",
            "syntax error on line 4: 'return' outside function",
        ),
        ("def isPalindrome(s):\n    return True\n", "must define class Solution"),
        ("class Solution:\n    def check(self, s):\n        return True\n", "has no method"),
    ],
)
def test_solution_code_defines_the_entry_method(code: str, expected: str) -> None:
    result = _validate(lambda d: d[PALINDROME]["solution"].update(code=code))
    [message] = [m for m in _messages(result, PALINDROME) if m.startswith("solution.code:")]
    assert expected in message


def test_starter_code_defines_the_entry_method() -> None:
    def change(d: Documents) -> None:
        d[PALINDROME]["starterCode"] = "class Solution:\n    def solve(self, s):\n        pass\n"

    assert _messages(_validate(change), PALINDROME) == [
        "starterCode: class Solution has no method 'isPalindrome'"
    ]


# ---------------------------------------------------------------- rule 9: tests


def test_needs_two_visible_tests() -> None:
    result = _validate(lambda d: d[TWO_SUM]["tests"][1].update(hidden=True))
    assert _messages(result, TWO_SUM) == [
        "tests: needs at least 2 visible and 3 hidden tests (found 1 visible, 4 hidden)"
    ]


def test_needs_three_hidden_tests() -> None:
    result = _validate(lambda d: d[TWO_SUM]["tests"].pop())
    assert _messages(result, TWO_SUM) == [
        "tests: needs at least 2 visible and 3 hidden tests (found 2 visible, 2 hidden)"
    ]


def test_test_ids_are_unique() -> None:
    result = _validate(lambda d: d[TWO_SUM]["tests"][3].update(id="h1"))
    assert _messages(result, TWO_SUM) == ["tests[3].id: duplicate test id 'h1'"]


# ---------------------------------------------------------------- rule 10: summary length


def test_long_summary_is_only_a_warning() -> None:
    result = _validate(lambda d: d[TWO_SUM].update(summary=d[TWO_SUM]["summary"] + " x" * 200))
    assert result.errors == []
    [warning] = _messages(result, TWO_SUM, "warning")
    assert warning.startswith("summary: ")
    assert warning.endswith("keep it under 450")


# ---------------------------------------------------------------- D5: signal targets


@pytest.mark.parametrize(
    ("points_to", "expected"),
    [
        ("hash_map", '\'hash_map\' is not a pattern id, "toolkit:<id>" or "structure:<id>"'),
        ("toolkit:zip", "unknown toolkit id 'zip'"),
        ("structure:dict", "unknown structure id 'dict'"),
    ],
)
def test_signal_points_to_must_resolve(points_to: str, expected: str) -> None:
    result = _validate(lambda d: d[TWO_SUM]["signals"][0].update(pointsTo=points_to))
    assert _messages(result, TWO_SUM) == [f"signals[0].pointsTo: {expected}"]


@pytest.mark.parametrize("points_to", ["binary_search", "toolkit:lower", "structure:hash_set"])
def test_signal_points_to_accepts_each_form(points_to: str) -> None:
    assert _validate(lambda d: d[TWO_SUM]["signals"][0].update(pointsTo=points_to)).issues == []


# ---------------------------------------------------------------- related problems


@pytest.mark.parametrize(
    ("slug", "expected"),
    [
        ("two-sum", "a problem cannot be related to itself"),
        ("reverse-string", "'reverse-string' is drill-only and has no Workspace"),
    ],
)
def test_related_slugs_must_be_other_workspace_problems(slug: str, expected: str) -> None:
    result = _validate(lambda d: d[TWO_SUM]["related"][0].update(slug=slug))
    assert _messages(result, TWO_SUM) == [f"related[0].slug: {expected}"]


def test_related_problem_without_a_file_yet_is_a_warning() -> None:
    result = _validate(lambda d: d[TWO_SUM]["related"][0].update(slug="three-sum"))
    assert result.errors == []
    assert _messages(result, TWO_SUM, "warning") == [
        "related[0].slug: no problem 'three-sum' yet; the link stays hidden until its file exists"
    ]


def test_related_problem_with_a_broken_file_still_exists() -> None:
    result = _validate(lambda d: d["problems/valid-anagram.json"].pop("title"))
    assert [issue.file for issue in result.errors] == ["problems/valid-anagram.json"]


# ---------------------------------------------------------------- roadmap


def test_roadmap_ids_must_be_patterns_and_cover_every_pattern() -> None:
    def change(d: Documents) -> None:
        d["roadmap.json"]["patterns"][2]["id"] = "stack"

    assert _messages(_validate(change), "roadmap.json") == [
        "patterns[2].id: unknown pattern id 'stack'",
        "patterns: pattern 'binary_search' is missing from the roadmap",
    ]


def test_roadmap_prereqs_must_be_roadmap_ids() -> None:
    def change(d: Documents) -> None:
        nodes = d["roadmap.json"]["patterns"]
        nodes[1]["prereqs"] = ["hashing", "stack"]
        nodes[0]["prereqs"] = ["hashing"]

    assert _messages(_validate(change), "roadmap.json") == [
        "patterns[0].prereqs[0]: a pattern cannot be its own prereq",
        "patterns[1].prereqs[1]: 'stack' is not in the roadmap",
    ]


def test_roadmap_prereqs_cannot_form_a_cycle() -> None:
    result = _validate(lambda d: d["roadmap.json"]["patterns"][0].update(prereqs=["binary_search"]))
    assert _messages(result, "roadmap.json") == [
        "patterns: prereqs form a cycle: hashing -> binary_search -> two_pointers_opposite "
        "-> hashing"
    ]


def test_roadmap_nodes_sharing_a_position_is_a_warning() -> None:
    result = _validate(lambda d: d["roadmap.json"]["patterns"][1].update(x=0, y=0))
    assert result.errors == []
    assert _messages(result, "roadmap.json", "warning") == [
        "patterns[1]: same x/y position as 'hashing'"
    ]

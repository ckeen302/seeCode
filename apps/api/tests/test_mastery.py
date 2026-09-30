"""Pattern states (Section 11.3) from problem_progress statuses."""

import pytest

from app.learning.mastery import PatternProgress, is_solved, pattern_progress, problem_status

# a -> b -> d, a -> c -> d (d needs both b and c)
PREREQS = {"a": [], "b": ["a"], "c": ["a"], "d": ["b", "c"]}
PROBLEMS = {"a": ["a1", "a2", "a3"], "b": ["b1", "b2"], "c": ["c1"], "d": ["d1", "d2"]}


def _states(statuses: dict[str, str], solved_in_prereq: int = 2) -> dict[str, str]:
    progress = pattern_progress(PROBLEMS, PREREQS, statuses, solved_in_prereq)
    return {pattern_id: p.state for pattern_id, p in progress.items()}


def test_new_user_can_start_only_the_root() -> None:
    assert _states({}) == {"a": "available", "b": "locked", "c": "locked", "d": "locked"}


def test_counts_and_order_follow_the_roadmap() -> None:
    progress = pattern_progress(PROBLEMS, PREREQS, {"a1": "mastered", "a2": "solved"}, 2)
    assert list(progress) == ["a", "b", "c", "d"]
    assert progress["a"] == PatternProgress("in_progress", solved=2, mastered=1, total=3)
    assert progress["d"] == PatternProgress("locked", solved=0, mastered=0, total=2)


def test_attempted_problems_do_not_count() -> None:
    assert _states({"a1": "attempted", "a2": "new"})["a"] == "available"


def test_one_solved_problem_means_in_progress() -> None:
    assert _states({"a1": "solved"})["a"] == "in_progress"


def test_prereq_unlocks_after_enough_solved_problems() -> None:
    one = _states({"a1": "solved"})
    assert (one["b"], one["c"]) == ("locked", "locked")
    two = _states({"a1": "solved", "a2": "mastered"})  # mastered counts as solved
    assert (two["b"], two["c"]) == ("available", "available")


def test_every_prereq_must_be_met() -> None:
    base = {"a1": "solved", "a2": "solved"}
    assert _states({**base, "b1": "solved", "b2": "solved"})["d"] == "locked"
    assert _states({**base, "b1": "solved", "b2": "solved", "c1": "solved"})["d"] == "available"


def test_prereq_with_fewer_problems_than_the_rule_needs_all_of_them() -> None:
    # c has one problem, so solving it is enough even though the rule says 2.
    states = _states(
        {"a1": "solved", "a2": "solved", "b1": "solved", "b2": "solved", "c1": "solved"}
    )
    assert states["d"] == "available"


def test_unlock_rule_value_is_used() -> None:
    assert _states({"a1": "solved"}, solved_in_prereq=1)["b"] == "available"
    assert _states({"a1": "solved", "a2": "solved"}, solved_in_prereq=3)["b"] == "locked"


def test_two_mastered_problems_master_the_pattern() -> None:
    assert _states({"a1": "mastered", "a2": "solved"})["a"] == "in_progress"
    assert _states({"a1": "mastered", "a2": "mastered"})["a"] == "mastered"


def test_pattern_with_one_problem_is_mastered_when_it_is() -> None:
    assert _states({"c1": "mastered"})["c"] == "mastered"


def test_pattern_without_problems_is_never_mastered() -> None:
    progress = pattern_progress({}, {"x": []}, {}, 2)
    assert progress["x"] == PatternProgress("available", solved=0, mastered=0, total=0)


def test_pattern_without_problems_does_not_block_what_follows() -> None:
    progress = pattern_progress({"y": ["y1"]}, {"x": [], "y": ["x"]}, {}, 2)
    assert progress["y"].state == "available"


def test_solved_work_shows_even_while_prereqs_are_unmet() -> None:
    states = _states({"d1": "solved"})
    assert states["d"] == "in_progress"
    assert _states({"d1": "mastered", "d2": "mastered"})["d"] == "mastered"


def test_rows_for_unknown_problems_are_ignored() -> None:
    assert _states({"gone": "mastered"})["a"] == "available"


@pytest.mark.parametrize(
    ("value", "status"),
    [
        ("new", "new"),
        ("attempted", "attempted"),
        ("solved", "solved"),
        ("mastered", "mastered"),
        ("weird", "new"),
        (None, "new"),
    ],
)
def test_problem_status_normalizes_values(value: str | None, status: str) -> None:
    assert problem_status(value) == status


def test_is_solved() -> None:
    assert is_solved("solved")
    assert is_solved("mastered")
    assert not is_solved("attempted")
    assert not is_solved("new")
    assert not is_solved(None)

"""Attempt outcomes (Section 11.2), submit coverage, rungs, and the review item an attempt
leaves (Section 11.4 and the lead's starting values)."""

import random
from datetime import UTC, datetime, timedelta

import pytest

from app.learning.outcomes import (
    OUTCOMES,
    check_submission,
    counted_max_rung,
    is_solved_outcome,
    next_rung,
    review_after_attempt,
    solved_outcome,
)
from app.learning.scheduling import ReviewState

NOW = datetime(2026, 9, 30, 12, 0, tzinfo=UTC)
EARLIER = NOW - timedelta(days=10)


@pytest.mark.parametrize(
    ("max_rung", "outcome"),
    [
        (0, "solved_clean"),
        (1, "solved_clean"),
        (2, "solved_clean"),
        (3, "solved_with_help"),
        (4, "solved_with_help"),
        (5, "solved_with_help"),
        (6, "solved_with_solution"),
    ],
)
def test_solved_outcome_follows_the_max_rung(max_rung: int, outcome: str) -> None:
    assert solved_outcome(max_rung) == outcome


def test_outcome_names() -> None:
    assert OUTCOMES == (
        "solved_clean",
        "solved_with_help",
        "solved_with_solution",
        "gave_up",
        "abandoned",
    )
    assert [is_solved_outcome(o) for o in OUTCOMES] == [True, True, True, False, False]
    assert not is_solved_outcome(None)


def test_max_rung_skips_free_rungs() -> None:
    assert counted_max_rung([], []) == 0
    assert counted_max_rung([1, 2], [1, 2]) == 0
    assert counted_max_rung([1, 2, 3], [1, 2]) == 3
    assert counted_max_rung([1], [1]) == 0
    assert counted_max_rung([1, 2], [1]) == 2
    assert counted_max_rung([1, 2, 3, 4], []) == 4


def test_next_rung() -> None:
    assert next_rung([]) == 1
    assert next_rung([1, 2]) == 3
    assert next_rung([1, 2, 3, 4, 5, 6]) == 7


# ---------------------------------------------------------------- submit coverage

TEST_IDS = ["e1", "e2", "h1"]


def test_submission_passes_when_every_test_passes() -> None:
    results = [("e1", "pass"), ("e2", "pass"), ("h1", "pass"), ("custom1", "fail")]
    assert check_submission(TEST_IDS, results) == ([], True)


def test_submission_fails_on_any_other_status() -> None:
    for status in ("fail", "error", "timeout"):
        results = [("e1", "pass"), ("e2", status), ("h1", "pass")]
        assert check_submission(TEST_IDS, results) == ([], False)


def test_submission_reports_missing_tests() -> None:
    assert check_submission(TEST_IDS, [("e1", "pass")]) == (["e2", "h1"], False)
    assert check_submission(TEST_IDS, []) == (TEST_IDS, False)


def test_duplicate_results_must_all_pass() -> None:
    results = [("e1", "pass"), ("e1", "fail"), ("e2", "pass"), ("h1", "pass")]
    assert check_submission(TEST_IDS, results) == ([], False)


# ---------------------------------------------------------------- review items


@pytest.mark.parametrize(
    ("outcome", "reps", "interval", "resolve"),
    [
        ("solved_clean", 1, 3.0, False),
        ("solved_with_help", 0, 1.0, False),
        ("solved_with_solution", 0, 1.0, True),
        ("gave_up", 0, 1.0, True),
    ],
)
def test_first_attempt_creates_the_item(
    outcome: str, reps: int, interval: float, resolve: bool
) -> None:
    change = review_after_attempt(None, outcome, NOW)  # type: ignore[arg-type]
    assert change is not None
    assert (change.created, change.changed, change.review_grade) == (True, True, None)
    item = change.state
    assert (item.reps, item.interval_days, item.resolve) == (reps, interval, resolve)
    assert item.due_at == NOW + timedelta(days=interval)
    assert (item.ease, item.lapses, item.last_grade, item.last_reviewed_at) == (
        2.5,
        0,
        None,
        None,
    )


def test_abandoned_attempts_leave_no_item() -> None:
    assert review_after_attempt(None, "abandoned", NOW) is None
    assert review_after_attempt(ReviewState(due_at=NOW), "abandoned", NOW) is None


def _scheduled() -> ReviewState:
    return ReviewState(
        due_at=NOW + timedelta(days=5),
        interval_days=7.5,
        ease=2.5,
        reps=3,
        lapses=0,
        last_grade="good",
        last_reviewed_at=EARLIER,
    )


@pytest.mark.parametrize("outcome", ["solved_with_solution", "gave_up"])
def test_a_new_failure_resets_an_existing_item(outcome: str) -> None:
    before = _scheduled()
    change = review_after_attempt(before, outcome, NOW)  # type: ignore[arg-type]
    assert change is not None
    assert (change.created, change.changed, change.review_grade) == (False, True, None)
    item = change.state
    assert (item.reps, item.lapses, item.interval_days, item.resolve) == (0, 1, 1.0, True)
    assert item.ease == pytest.approx(2.3)
    assert (item.due_at, item.last_grade, item.last_reviewed_at) == (
        NOW + timedelta(days=1),
        "again",
        NOW,
    )
    assert before == _scheduled()  # the input is not modified


@pytest.mark.parametrize("outcome", ["solved_clean", "solved_with_help"])
def test_a_success_leaves_a_scheduled_item_alone(outcome: str) -> None:
    change = review_after_attempt(_scheduled(), outcome, NOW)  # type: ignore[arg-type]
    assert change is not None
    assert (change.created, change.changed) == (False, False)
    assert change.state == _scheduled()


@pytest.mark.parametrize(
    ("outcome", "grade", "resolve_after"),
    [
        ("solved_clean", "good", False),
        ("solved_with_help", "hard", False),
        ("solved_with_solution", "hard", True),
        ("gave_up", "again", True),
    ],
)
def test_the_attempt_is_the_review_of_a_resolve_item(
    outcome: str, grade: str, resolve_after: bool
) -> None:
    waiting = ReviewState(due_at=NOW, interval_days=1.0, reps=0, lapses=1, resolve=True)
    change = review_after_attempt(waiting, outcome, NOW, random.Random(3))  # type: ignore[arg-type]
    assert change is not None
    assert (change.created, change.changed) == (False, True)
    assert (change.review_grade, change.interval_before) == (grade, 1.0)
    item = change.state
    assert (item.last_grade, item.last_reviewed_at, item.resolve) == (grade, NOW, resolve_after)
    assert item.due_at == NOW + timedelta(days=item.interval_days)
    if grade == "again":
        assert (item.reps, item.lapses, item.interval_days) == (0, 2, 1.0)
    else:
        assert item.reps == 1
        assert 0.9 <= item.interval_days <= 1.3

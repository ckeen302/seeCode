"""Attempt outcomes (Section 11.2) and the review item an attempt leaves (11.4). Pure.

Review items after an attempt ends:

- no item yet: `solved_clean` starts at reps 1 with a 3-day interval (due in 3 days), so
  the first good review does not shrink it; `solved_with_help` starts at reps 0 and 1 day;
  `solved_with_solution` and `gave_up` start at 1 day with `resolve` set;
- an item waiting for a re-solve (`resolve`): the attempt is that review (solved_clean ->
  good, other solved -> hard, gave_up -> again), and `resolve` stays only after a failure;
- any other item: a failure (`solved_with_solution`, `gave_up`) resets it with grade
  `again` and sets `resolve`; a success leaves its schedule alone.
"""

import dataclasses
import random
from collections.abc import Iterable
from dataclasses import dataclass
from datetime import datetime, timedelta
from typing import Literal, get_args

from app.learning.scheduling import Grade, ReviewState, schedule

Outcome = Literal[
    "solved_clean", "solved_with_help", "solved_with_solution", "gave_up", "abandoned"
]
OUTCOMES: tuple[Outcome, ...] = get_args(Outcome)
SOLVED_OUTCOMES: frozenset[str] = frozenset(
    {"solved_clean", "solved_with_help", "solved_with_solution"}
)
# Outcomes that schedule a re-solve (`resolve: true`) and reset an existing item.
FAILED_OUTCOMES: frozenset[str] = frozenset({"solved_with_solution", "gave_up"})

MAX_RUNG = 6
CLEAN_MAX_RUNG = 2  # solved_clean: maxRung <= 2
HELP_MAX_RUNG = 5  # solved_with_help: 3 <= maxRung <= 5

# (reps, interval in days, resolve) of the item a first attempt creates.
FIRST_REVIEW: dict[str, tuple[int, float, bool]] = {
    "solved_clean": (1, 3.0, False),
    "solved_with_help": (0, 1.0, False),
    "solved_with_solution": (0, 1.0, True),
    "gave_up": (0, 1.0, True),
}
# How the attempt grades an item that was waiting for a re-solve.
RESOLVE_GRADES: dict[str, Grade] = {
    "solved_clean": "good",
    "solved_with_help": "hard",
    "solved_with_solution": "hard",
    "gave_up": "again",
}


def is_solved_outcome(outcome: str | None) -> bool:
    return outcome in SOLVED_OUTCOMES


def solved_outcome(max_rung: int) -> Outcome:
    """The outcome of a passing Submit, from the attempt's max rung."""
    if max_rung <= CLEAN_MAX_RUNG:
        return "solved_clean"
    if max_rung <= HELP_MAX_RUNG:
        return "solved_with_help"
    return "solved_with_solution"


def check_submission(
    test_ids: Iterable[str], results: Iterable[tuple[str, str]]
) -> tuple[list[str], bool]:
    """(missing test ids, passed) for a Submit's (id, status) results (Section 16.2).

    The browser runs the tests, so results are trusted; they must cover every visible and
    hidden test. `passed` needs every result for those ids to be "pass"; results for
    other ids (custom cases) are ignored.
    """
    statuses: dict[str, list[str]] = {}
    for test_id, status in results:
        statuses.setdefault(test_id, []).append(status)
    ids = list(test_ids)
    missing = [test_id for test_id in ids if test_id not in statuses]
    passed = not missing and all(
        all(status == "pass" for status in statuses[test_id]) for test_id in ids
    )
    return missing, passed


def counted_max_rung(opened: Iterable[int], free: Iterable[int]) -> int:
    """The highest opened rung that counts: rungs given by fading (11.6) do not."""
    free_rungs = set(free)
    return max((rung for rung in opened if rung not in free_rungs), default=0)


def next_rung(opened: Iterable[int]) -> int:
    """Rungs open strictly in order, so the next one follows the highest open rung."""
    return max(opened, default=0) + 1


@dataclass(frozen=True, slots=True)
class AttemptReview:
    state: ReviewState  # the item after the attempt: new, updated or unchanged
    created: bool
    changed: bool
    # Set when the attempt counted as the review of an item waiting for a re-solve.
    review_grade: Grade | None = None
    interval_before: float | None = None


def review_after_attempt(
    item: ReviewState | None,
    outcome: Outcome,
    now: datetime,
    rng: random.Random | None = None,
) -> AttemptReview | None:
    """The `problem_plan` review item after an attempt ends; None for `abandoned`."""
    if outcome not in FIRST_REVIEW:
        return None
    if item is None:
        reps, interval, resolve = FIRST_REVIEW[outcome]
        state = ReviewState(
            due_at=now + timedelta(days=interval),
            interval_days=interval,
            reps=reps,
            resolve=resolve,
        )
        return AttemptReview(state, created=True, changed=True)

    state = dataclasses.replace(item)
    if item.resolve:
        grade = RESOLVE_GRADES[outcome]
        schedule(state, grade, now, rng)
        state.resolve = outcome in FAILED_OUTCOMES
        return AttemptReview(
            state,
            created=False,
            changed=True,
            review_grade=grade,
            interval_before=item.interval_days,
        )
    if outcome in FAILED_OUTCOMES:
        schedule(state, "again", now, rng)
        state.resolve = True
        return AttemptReview(state, created=False, changed=True)
    return AttemptReview(state, created=False, changed=False)

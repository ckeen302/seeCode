"""Mastery (Section 11.3): pattern states from problem statuses. Pure functions, no I/O."""

from collections.abc import Mapping, Sequence
from dataclasses import dataclass
from typing import Literal, get_args

ProblemStatus = Literal["new", "attempted", "solved", "mastered"]
PatternState = Literal["locked", "available", "in_progress", "mastered"]

PROBLEM_STATUSES: tuple[ProblemStatus, ...] = get_args(ProblemStatus)
SOLVED_STATUSES: frozenset[str] = frozenset({"solved", "mastered"})
MASTERED_PROBLEMS_NEEDED = 2
# A problem solved clean is mastered by a later review graded good or easy at an interval
# of at least this many days.
MASTERY_INTERVAL_DAYS = 6.0
# Section 11.3: signed-out users see every pattern as available.
SIGNED_OUT_STATE: PatternState = "available"


@dataclass(frozen=True, slots=True)
class PatternProgress:
    state: PatternState
    solved: int  # includes mastered problems
    mastered: int
    total: int


def problem_status(value: str | None) -> ProblemStatus:
    """A `problem_progress.status` value; anything unknown or missing counts as new."""
    for status in PROBLEM_STATUSES:
        if value == status:
            return status
    return "new"


def is_solved(status: str | None) -> bool:
    return status in SOLVED_STATUSES


def is_mastery_review(grade: str, interval_before: float) -> bool:
    """Whether a review can master its problem (Section 11.3): graded good or easy at an
    interval of at least 6 days, `interval_before` being the interval the item waited.
    The problem also needs an earlier `solved_clean` attempt, which the caller checks."""
    return grade in ("good", "easy") and interval_before >= MASTERY_INTERVAL_DAYS


def pattern_progress(
    problems_by_pattern: Mapping[str, Sequence[str]],
    prereqs: Mapping[str, Sequence[str]],
    statuses: Mapping[str, str],
    solved_in_prereq: int,
) -> dict[str, PatternProgress]:
    """State and counts for every pattern in `prereqs` (the roadmap), in its order.

    `problems_by_pattern` lists each pattern's Workspace problem slugs, `statuses` holds the
    user's problem_progress status by slug (missing slugs are new).

    - locked: a prerequisite has fewer than `solved_in_prereq` solved problems (or fewer
      than all of them, when it has fewer problems than that);
    - available: unlocked, nothing solved;
    - in_progress: at least one problem solved;
    - mastered: at least 2 problems mastered (all of them when there are fewer than 2).

    Solved work always shows: a pattern with solved problems is in_progress or mastered
    even while its prerequisites are unmet (any problem can be opened directly).
    """
    counts: dict[str, tuple[int, int, int]] = {}
    for pattern_id in prereqs:
        slugs = problems_by_pattern.get(pattern_id, ())
        found = [statuses.get(slug) for slug in slugs]
        solved = sum(is_solved(status) for status in found)
        mastered = sum(status == "mastered" for status in found)
        counts[pattern_id] = (solved, mastered, len(slugs))

    def prereq_met(pattern_id: str) -> bool:
        solved, _, total = counts.get(pattern_id, (0, 0, 0))
        return solved >= min(solved_in_prereq, total)

    progress: dict[str, PatternProgress] = {}
    for pattern_id, (solved, mastered, total) in counts.items():
        state: PatternState
        if total and mastered >= min(MASTERED_PROBLEMS_NEEDED, total):
            state = "mastered"
        elif solved:
            state = "in_progress"
        elif all(prereq_met(prereq) for prereq in prereqs[pattern_id]):
            state = "available"
        else:
            state = "locked"
        progress[pattern_id] = PatternProgress(state, solved, mastered, total)
    return progress


def next_problem(
    problems: Sequence[tuple[str, str]],
    states: Mapping[str, PatternProgress],
    statuses: Mapping[str, str],
    exclude: str | None = None,
) -> str | None:
    """The first problem in roadmap order that the user has not solved, in an unlocked
    pattern ("Next problem" in the wrap-up; Today's roadmap card uses the same rule).

    `problems` lists (slug, pattern id) of the Workspace problems by `order`.
    """
    for slug, pattern_id in problems:
        if slug == exclude or is_solved(statuses.get(slug)):
            continue
        state = states.get(pattern_id)
        if state is not None and state.state != "locked":
            return slug
    return None

"""Review answers and the review queue (Sections 11.4 and 11.5). Pure.

Grades of a problem-plan answer (graded like a drill, so the twist is optional):

- `easy`: the plan is correct and was answered in at most 25 seconds;
- `good`: the plan is correct;
- `again`: the score is below 0.5;
- anything else is borderline (0.5 <= score < 0.8, or a score of 0.8 or more without a
  correct pattern and time): the user rates it Hard or Good.

A toolkit answer is `good` when right and `again` when wrong.

The queue holds the items due by the end of the user's day, oldest due first, at most 20,
then interleaved so no two items in a row share a pattern when that can be avoided:
greedily, the next item is the oldest one whose pattern differs from the previous item's.
Toolkit items have no pattern and never clash.
"""

from collections.abc import Callable, Sequence
from typing import Literal

from app.learning.scheduling import Grade

EASY_SECONDS = 25.0
BORDERLINE_MIN_SCORE = 0.5
QUEUE_MAX = 20

SelfRating = Literal["hard", "good"]
REMEMBERED: frozenset[str] = frozenset({"hard", "good", "easy"})


def plan_review_grade(correct: bool, score: float, seconds: float) -> Grade | None:
    """The automatic grade of a problem-plan answer; None when the user must rate it."""
    if correct:
        return "easy" if seconds <= EASY_SECONDS else "good"
    if score < BORDERLINE_MIN_SCORE:
        return "again"
    return None


def toolkit_review_grade(correct: bool) -> Grade:
    return "good" if correct else "again"


def interleave[T](items: Sequence[T], pattern: Callable[[T], str | None]) -> list[T]:
    """Reorder `items` (oldest due first) so no two in a row share a pattern when
    possible: each step takes the oldest item whose pattern differs from the previous
    one's, or the oldest item when every item left shares it."""
    left = list(items)
    order: list[T] = []
    previous: str | None = None
    while left:
        index = next(
            (i for i, item in enumerate(left) if previous is None or pattern(item) != previous),
            0,
        )
        item = left.pop(index)
        order.append(item)
        previous = pattern(item)
    return order

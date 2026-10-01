"""Review scheduling (Section 11.4): the SM-2 variant, exactly as specified. No I/O.

`schedule` updates any object with the review fields (a `ReviewItem` row or a
`ReviewState`) in place and returns it. Pass `rng` (a seeded `random.Random`) in tests to
fix the ±10% interval fuzz.
"""

import random
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from typing import Literal, Protocol

Grade = Literal["again", "hard", "good", "easy"]

MAX_INTERVAL = 180.0
MIN_EASE = 1.3
MAX_EASE = 3.0
DEFAULT_EASE = 2.5
FUZZ = (0.9, 1.1)


class Schedulable(Protocol):
    reps: int
    lapses: int
    ease: float
    interval_days: float
    due_at: datetime
    last_grade: str | None
    last_reviewed_at: datetime | None


@dataclass
class ReviewState:
    """The scheduling fields of a `review_items` row, with the Section 11.4 defaults."""

    due_at: datetime
    interval_days: float = 0.0
    ease: float = DEFAULT_EASE
    reps: int = 0
    lapses: int = 0
    resolve: bool = False
    last_grade: str | None = None
    last_reviewed_at: datetime | None = None


def schedule[S: Schedulable](
    item: S, grade: Grade, now: datetime | None = None, rng: random.Random | None = None
) -> S:
    now = now or datetime.now(UTC)
    if grade == "again":
        item.reps = 0
        item.lapses += 1
        item.ease = max(MIN_EASE, item.ease - 0.20)
        item.interval_days = 1.0
    else:
        item.reps += 1
        if item.reps == 1:
            base = 1.0
        elif item.reps == 2:
            base = 3.0
        else:
            base = item.interval_days * item.ease
        if grade == "hard":
            item.ease = max(MIN_EASE, item.ease - 0.15)
            base = max(1.0, item.interval_days * 1.2)
        elif grade == "easy":
            item.ease = min(MAX_EASE, item.ease + 0.15)
            base *= 1.3
        uniform = rng.uniform if rng is not None else random.uniform
        item.interval_days = min(MAX_INTERVAL, round(base * uniform(*FUZZ), 1))
    item.due_at = now + timedelta(days=item.interval_days)
    item.last_grade = grade
    item.last_reviewed_at = now
    return item

"""Review scheduling (Section 11.4): each grade, the bounds and the fuzz."""

import random
import uuid
from datetime import UTC, datetime, timedelta

import pytest

from app.learning.scheduling import (
    DEFAULT_EASE,
    MAX_EASE,
    MAX_INTERVAL,
    MIN_EASE,
    ReviewState,
    schedule,
)
from app.models import ReviewItem

NOW = datetime(2026, 9, 30, 12, 0, tzinfo=UTC)


class FixedRandom(random.Random):
    """`uniform` always returns the same factor."""

    def __init__(self, factor: float) -> None:
        super().__init__(0)
        self.factor = factor

    def uniform(self, a: float, b: float) -> float:
        assert (a, b) == (0.9, 1.1)
        return self.factor


NO_FUZZ = FixedRandom(1.0)


def state(**fields: object) -> ReviewState:
    return ReviewState(due_at=NOW, **fields)  # type: ignore[arg-type]


def test_defaults_match_the_spec() -> None:
    item = state()
    assert (item.ease, item.reps, item.lapses, item.interval_days) == (2.5, 0, 0, 0.0)
    assert DEFAULT_EASE == 2.5


def test_again_resets() -> None:
    item = schedule(state(reps=4, lapses=1, ease=2.5, interval_days=20.0), "again", NOW)
    assert (item.reps, item.lapses, item.interval_days) == (0, 2, 1.0)
    assert item.ease == pytest.approx(2.3)
    assert item.due_at == NOW + timedelta(days=1)
    assert (item.last_grade, item.last_reviewed_at) == ("again", NOW)


def test_again_never_drops_ease_below_the_floor() -> None:
    assert schedule(state(ease=1.4), "again", NOW).ease == MIN_EASE


def test_good_first_second_and_later_reviews() -> None:
    item = schedule(state(), "good", NOW, NO_FUZZ)
    assert (item.reps, item.interval_days) == (1, 1.0)
    item = schedule(item, "good", NOW, NO_FUZZ)
    assert (item.reps, item.interval_days) == (2, 3.0)
    item = schedule(item, "good", NOW, NO_FUZZ)
    assert (item.reps, item.interval_days) == (3, 7.5)  # 3.0 x 2.5
    assert item.ease == DEFAULT_EASE
    assert item.due_at == NOW + timedelta(days=7.5)
    assert item.last_grade == "good"


def test_attempt_created_item_keeps_three_days_at_the_first_good_review() -> None:
    # A solved_clean attempt starts at reps 1 and 3 days (Section 11.4, lead decision).
    item = schedule(state(reps=1, interval_days=3.0), "good", NOW, NO_FUZZ)
    assert (item.reps, item.interval_days) == (2, 3.0)


def test_hard_uses_the_current_interval_and_lowers_ease() -> None:
    item = schedule(state(reps=3, interval_days=10.0, ease=2.0), "hard", NOW, NO_FUZZ)
    assert item.reps == 4
    assert item.interval_days == 12.0  # 10 x 1.2
    assert item.ease == pytest.approx(1.85)
    fresh = schedule(state(), "hard", NOW, NO_FUZZ)
    assert fresh.interval_days == 1.0  # at least one day
    assert schedule(state(ease=1.35), "hard", NOW, NO_FUZZ).ease == MIN_EASE


def test_easy_raises_ease_and_stretches_the_interval() -> None:
    item = schedule(state(reps=2, interval_days=4.0, ease=2.5), "easy", NOW, NO_FUZZ)
    assert item.reps == 3
    assert item.ease == pytest.approx(2.65)
    assert item.interval_days == pytest.approx(round(4.0 * 2.5 * 1.3, 1))  # base uses old ease
    assert schedule(state(ease=2.95), "easy", NOW, NO_FUZZ).ease == MAX_EASE
    assert schedule(state(), "easy", NOW, NO_FUZZ).interval_days == 1.3


@pytest.mark.parametrize(("factor", "interval"), [(0.9, 6.8), (1.1, 8.2), (1.0, 7.5)])
def test_fuzz_is_applied_and_rounded_to_a_tenth(factor: float, interval: float) -> None:
    item = schedule(state(reps=2, interval_days=3.0), "good", NOW, FixedRandom(factor))
    assert item.interval_days == interval


def test_interval_is_capped() -> None:
    item = schedule(state(reps=5, interval_days=150.0, ease=3.0), "good", NOW, FixedRandom(1.1))
    assert item.interval_days == MAX_INTERVAL
    assert item.due_at == NOW + timedelta(days=180)


def test_default_randomness_stays_within_ten_percent() -> None:
    for seed in range(50):
        item = schedule(state(reps=2, interval_days=10.0), "good", NOW, random.Random(seed))
        assert 22.5 <= item.interval_days <= 27.5  # 10 x 2.5 +- 10%, rounded
    unseeded = schedule(state(reps=2, interval_days=10.0), "good", NOW)
    assert 22.5 <= unseeded.interval_days <= 27.5


def test_now_defaults_to_the_current_time() -> None:
    before = datetime.now(UTC)
    item = schedule(state(), "again")
    assert item.last_reviewed_at is not None
    assert before <= item.last_reviewed_at <= datetime.now(UTC)


def test_schedules_a_review_item_row_in_place() -> None:
    row = ReviewItem(
        id=uuid.uuid4(),
        user_id=uuid.uuid4(),
        kind="problem_plan",
        ref="two-sum",
        due_at=NOW,
        interval_days=3.0,
        ease=2.5,
        reps=1,
        lapses=0,
    )
    assert schedule(row, "good", NOW, NO_FUZZ) is row
    assert (row.reps, row.interval_days, row.last_grade) == (2, 3.0, "good")

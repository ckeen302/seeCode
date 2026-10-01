"""Review rules (Sections 11.3-11.5), calendar days and streaks, Today's drill pick
(11.8) and the stats helpers (6.8). Pure functions, no database."""

import random
from collections import Counter
from datetime import UTC, date, datetime, timedelta
from zoneinfo import ZoneInfo

import pytest

from app.learning.activity import (
    current_streak,
    day_start,
    end_of_day,
    local_day,
    longest_streak,
    week_start,
)
from app.learning.mastery import is_mastery_review
from app.learning.review import interleave, plan_review_grade, toolkit_review_grade
from app.learning.scheduling import ReviewState, schedule
from app.learning.stats import (
    accuracy,
    median_or_none,
    plan_misses,
    rung_histogram,
    top_misses,
    week_starts,
)
from app.learning.today import AttemptFact, greeting_name, weak_pattern

NOW = datetime(2026, 10, 1, 12, 0, tzinfo=UTC)
PATTERNS = ["hashing", "two_pointers_opposite", "stack", "sliding_window", "binary_search"]


# ---------------------------------------------------------------- grades (11.4)


@pytest.mark.parametrize(
    ("correct", "score", "seconds", "grade"),
    [
        (True, 1.0, 10.0, "easy"),
        (True, 0.8, 25.0, "easy"),  # at most 25 s
        (True, 0.8, 25.1, "good"),
        (True, 1.0, 300.0, "good"),
        (False, 0.4999, 5.0, "again"),
        (False, 0.0, 5.0, "again"),
        (False, 0.5, 5.0, None),  # borderline: the user rates it
        (False, 0.7999, 5.0, None),
        (False, 0.85, 5.0, None),  # high score but pattern or time wrong: still borderline
    ],
)
def test_plan_review_grade(correct: bool, score: float, seconds: float, grade: str | None) -> None:
    assert plan_review_grade(correct, score, seconds) == grade


def test_toolkit_review_grade() -> None:
    assert toolkit_review_grade(True) == "good"
    assert toolkit_review_grade(False) == "again"


@pytest.mark.parametrize(
    ("grade", "interval", "masters"),
    [
        ("good", 6.0, True),
        ("easy", 7.5, True),
        ("good", 5.9, False),
        ("hard", 30.0, False),
        ("again", 30.0, False),
    ],
)
def test_mastery_needs_a_good_review_at_six_days(
    grade: str, interval: float, masters: bool
) -> None:
    assert is_mastery_review(grade, interval) is masters


def test_a_clean_solve_is_mastered_at_the_third_good_review() -> None:
    """With no fuzz, a clean solve (reps 1, 3 days) waits 3, 3 and then 7.5 days: the
    review after the 7.5-day wait is the first at an interval of 6 days or more."""

    class NoFuzz(random.Random):
        def uniform(self, a: float, b: float) -> float:
            return 1.0

    item = ReviewState(due_at=NOW, interval_days=3.0, reps=1)
    waits = []
    for _ in range(3):
        waits.append(item.interval_days)
        schedule(item, "good", NOW, NoFuzz())
    assert waits == [3.0, 3.0, 7.5]
    assert [is_mastery_review("good", wait) for wait in waits] == [False, False, True]


# ---------------------------------------------------------------- the queue (11.5)


def test_interleave_takes_the_oldest_item_of_another_pattern() -> None:
    items = ["a1", "a2", "b1", "b2", "c1"]
    order = interleave(items, lambda item: item[0])
    assert order == ["a1", "b1", "a2", "b2", "c1"]


def test_interleave_keeps_order_when_it_cannot_help() -> None:
    assert interleave(["a1", "a2", "a3"], lambda item: item[0]) == ["a1", "a2", "a3"]
    assert interleave(["a1", "a2", "a3", "b1"], lambda item: item[0]) == ["a1", "b1", "a2", "a3"]
    assert interleave([], lambda item: item) == []


def test_items_without_a_pattern_never_clash() -> None:
    def pattern(item: str) -> str | None:
        return None if item.startswith("t") else item[0]

    assert interleave(["a1", "t1", "a2", "t2"], pattern) == ["a1", "t1", "a2", "t2"]
    assert interleave(["t1", "t2", "a1"], pattern) == ["t1", "t2", "a1"]


def test_interleave_repeats_a_pattern_only_when_nothing_else_is_left() -> None:
    rng = random.Random(3)
    for _ in range(300):
        items = [f"{rng.choice('abc')}{n:02d}" for n in range(rng.randint(0, 20))]
        order = interleave(items, lambda item: item[0])
        assert sorted(order) == sorted(items)
        for index in range(1, len(order)):
            if order[index][0] == order[index - 1][0]:
                assert {item[0] for item in order[index:]} == {order[index][0]}
            else:
                # Otherwise the oldest item of another pattern came next.
                left = [item for item in items if item not in order[:index]]
                other = [item for item in left if item[0] != order[index - 1][0]]
                assert order[index] == other[0]


# ---------------------------------------------------------------- calendar days


def test_end_of_day_uses_the_users_time_zone() -> None:
    assert end_of_day(NOW, "UTC") == datetime(2026, 10, 2, tzinfo=UTC)
    assert end_of_day(NOW, None) == datetime(2026, 10, 2, tzinfo=UTC)
    # 12:00 UTC is 02:00 next day in UTC+14: the day ends 10:00 UTC on Oct 2.
    assert local_day(NOW, "Pacific/Kiritimati") == date(2026, 10, 2)
    assert end_of_day(NOW, "Pacific/Kiritimati") == datetime(2026, 10, 2, 10, 0, tzinfo=UTC)
    # Los Angeles in October is UTC-7: Oct 1 ends at 07:00 UTC on Oct 2.
    assert end_of_day(NOW, "America/Los_Angeles") == datetime(2026, 10, 2, 7, 0, tzinfo=UTC)
    # An unknown zone falls back to UTC.
    assert end_of_day(NOW, "Mars/Base") == datetime(2026, 10, 2, tzinfo=UTC)


def test_day_start_across_a_daylight_saving_change() -> None:
    # Clocks go back on Nov 1, 2026 in Los Angeles: that day starts at 07:00 UTC (PDT)
    # and the next one at 08:00 UTC (PST).
    start = day_start(date(2026, 11, 1), "America/Los_Angeles")
    assert start == datetime(2026, 11, 1, 7, 0, tzinfo=UTC)
    assert day_start(date(2026, 11, 2), "America/Los_Angeles") - start == timedelta(hours=25)
    zone = ZoneInfo("America/Los_Angeles")
    assert start.astimezone(zone).hour == 0


def test_week_start_is_monday() -> None:
    assert week_start(date(2026, 10, 1)) == date(2026, 9, 28)  # a Thursday
    assert week_start(date(2026, 9, 28)) == date(2026, 9, 28)
    assert week_start(date(2026, 10, 4)) == date(2026, 9, 28)  # Sunday
    assert week_starts(date(2026, 9, 28), 3) == [
        date(2026, 9, 14),
        date(2026, 9, 21),
        date(2026, 9, 28),
    ]


def test_streaks() -> None:
    today = date(2026, 10, 1)
    days = [today - timedelta(days=n) for n in (0, 1, 2, 4, 5)]
    assert current_streak(days, today) == 3
    # Today has no activity yet: the streak still counts up to yesterday.
    assert current_streak(days[1:], today) == 2
    assert current_streak([today - timedelta(days=2)], today) == 0
    assert current_streak([], today) == 0
    assert longest_streak(days) == 3
    assert longest_streak([]) == 0
    assert longest_streak([today, today]) == 1


# ---------------------------------------------------------------- Today's drill pick (11.8)


def fact(slug: str, pattern: str, rung: int, days_ago: int) -> AttemptFact:
    return AttemptFact(slug, pattern, rung, NOW - timedelta(days=days_ago))


def pick_of(
    unlocked: list[str],
    recent: dict[str, list[bool]],
    counts: dict[str, int],
    attempts: list[AttemptFact],
) -> tuple[str, str] | None:
    pick = weak_pattern(unlocked, recent, counts, attempts)
    return None if pick is None else (pick.pattern_id, pick.reason)


def test_the_weakest_drilled_pattern_comes_first() -> None:
    recent = {
        "hashing": [True, True, False, True],  # weakness 0.25
        "stack": [False, False, True, False],  # 0.75
        "two_pointers_opposite": [False, False],  # too few answers
    }
    assert pick_of(PATTERNS, recent, {}, []) == (
        "stack",
        "You got 1 of your last 4 drills in this pattern right.",
    )


def test_weakness_ties_go_to_roadmap_order_and_locked_patterns_are_skipped() -> None:
    recent = {"stack": [False, True, True], "hashing": [True, False, True]}
    assert pick_of(PATTERNS, recent, {}, []) == (
        "hashing",
        "You got 2 of your last 3 drills in this pattern right.",
    )
    recent = {"stack": [False] * 5, "hashing": [False, True, True]}
    assert pick_of(["hashing"], recent, {}, []) == (
        "hashing",
        "You got 2 of your last 3 drills in this pattern right.",
    )


def test_hints_on_attempts_come_next() -> None:
    attempts = [
        fact("daily-temperatures", "stack", 4, 1),
        fact("two-sum", "hashing", 5, 2),
        fact("valid-parentheses", "stack", 1, 3),
        fact("daily-temperatures", "stack", 6, 4),  # older attempt of the same problem
        fact("evaluate-rpn", "stack", 3, 5),
    ]
    perfect = {"hashing": [True, True, True]}  # weakness 0: no drill reason
    assert pick_of(PATTERNS, perfect, {"hashing": 3}, attempts) == (
        "stack",
        "You needed hints on 2 of your last 3 problems in this pattern.",
    )
    assert pick_of(PATTERNS, {}, {}, [fact("two-sum", "hashing", 3, 0)]) == (
        "hashing",
        "You needed hints on your last problem in this pattern.",
    )
    # A hinted attempt in a locked pattern does not count.
    assert pick_of(["hashing"], {}, {}, attempts[:1]) == pick_of(["hashing"], {}, {}, [])


def test_otherwise_the_least_drilled_pattern() -> None:
    counts = {"hashing": 4, "two_pointers_opposite": 1}
    assert pick_of(PATTERNS[:3], {}, counts, []) == (
        "stack",
        "You haven't drilled this pattern yet.",
    )
    assert pick_of(["hashing"], {}, {"hashing": 1}, []) == (
        "hashing",
        "You've done 1 drill in this pattern so far.",
    )
    assert pick_of(["hashing"], {}, {"hashing": 2}, []) == (
        "hashing",
        "You've done 2 drills in this pattern so far.",
    )
    assert pick_of(["hashing"], {"hashing": [True] * 5}, {"hashing": 5}, []) == (
        "hashing",
        "Keep this pattern fresh with a quick drill.",
    )
    assert pick_of([], {}, {}, []) is None


def test_greeting_name() -> None:
    assert greeting_name("Ada Lovelace") == "Ada"
    assert greeting_name("  Grace  ") == "Grace"
    assert greeting_name("") == ""
    assert greeting_name(None) == ""


# ---------------------------------------------------------------- stats helpers


def test_medians_and_accuracy() -> None:
    assert median_or_none([]) is None
    assert median_or_none([3.0, 1.0, 2.0]) == 2.0
    assert median_or_none([1, 2]) == 1.5
    assert median_or_none([10.04, 10.06]) == 10.1  # rounded to a tenth
    assert accuracy([]) is None
    assert accuracy([True, False, True]) == 0.6667


def test_rung_histogram() -> None:
    assert rung_histogram([0, 0, 2, 6, 3]) == [2, 0, 1, 1, 0, 0, 1]
    assert rung_histogram([]) == [0] * 7
    assert rung_histogram([9, -1]) == [1, 0, 0, 0, 0, 0, 1]


def test_plan_misses_reads_a_stored_grade() -> None:
    grade = {
        "approachId": "optimal",
        "fields": {
            "pattern": {"result": "correct"},
            "structures": {"result": "wrong", "missing": ["hash_map", "array"], "extra": []},
            "time": {"result": "wrong"},
            "space": {"result": "correct"},
            "twist": {"result": "wrong", "source": "keywords"},
        },
    }
    assert plan_misses(grade, "O(n)", "O(n)") == [
        ("structure", "hash_map"),
        ("structure", "array"),
        ("time", "O(n)"),
    ]
    # Unrevealed grades carry no `missing`; an approach that is gone has no targets.
    del grade["fields"]["structures"]["missing"]
    assert plan_misses(grade, None, None) == []
    assert plan_misses({}, "O(n)", "O(1)") == []


def test_top_misses_ranks_by_count_then_kind() -> None:
    counts = Counter(
        {
            ("time", "O(n)"): 3,
            ("structure", "stack"): 3,
            ("space", "O(1)"): 5,
            ("structure", "array"): 1,
            ("structure", "hash_map"): 2,
            ("time", "O(log n)"): 1,
        }
    )
    assert top_misses(counts) == [
        ("space", "O(1)", 5),
        ("structure", "stack", 3),
        ("time", "O(n)", 3),
        ("structure", "hash_map", 2),
        ("structure", "array", 1),
    ]

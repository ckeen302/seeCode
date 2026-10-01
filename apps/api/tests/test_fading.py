"""Worked-example fading (Section 11.6) and calendar days for streaks."""

from datetime import UTC, date, datetime, timedelta, timezone

from app.learning.activity import local_day, user_zone
from app.learning.fading import NO_FADING, Fading, fading_for, given_pattern

SLUGS = ["two-sum", "valid-anagram", "group-anagrams"]


def test_first_problem_of_a_pattern() -> None:
    assert fading_for("two-sum", "hashing", SLUGS, first_attempt=True) == Fading(
        given_pattern="hashing", free_rungs=(1, 2), open_rungs=(1, 2)
    )


def test_second_problem_gets_rung_1_free_but_not_open() -> None:
    assert fading_for("valid-anagram", "hashing", SLUGS, first_attempt=True) == Fading(
        given_pattern=None, free_rungs=(1,), open_rungs=()
    )


def test_later_problems_get_no_support() -> None:
    assert fading_for("group-anagrams", "hashing", SLUGS, first_attempt=True) == NO_FADING


def test_only_the_first_attempt_is_supported() -> None:
    assert fading_for("two-sum", "hashing", SLUGS, first_attempt=False) == NO_FADING
    assert fading_for("valid-anagram", "hashing", SLUGS, first_attempt=False) == NO_FADING


def test_unknown_problem_gets_no_support() -> None:
    assert fading_for("koko-eating-bananas", "hashing", SLUGS, first_attempt=True) == NO_FADING


def test_given_pattern_is_read_back_from_the_free_rungs() -> None:
    assert given_pattern("hashing", [1, 2]) == "hashing"
    assert given_pattern("hashing", [2, 1]) == "hashing"
    assert given_pattern("hashing", [1]) is None
    assert given_pattern("hashing", []) is None


# ---------------------------------------------------------------- local days


def test_local_day_uses_the_user_time_zone() -> None:
    late_utc = datetime(2026, 9, 30, 23, 30, tzinfo=UTC)
    assert local_day(late_utc, "UTC") == date(2026, 9, 30)
    assert local_day(late_utc, "Europe/Berlin") == date(2026, 10, 1)
    assert local_day(late_utc, "America/Los_Angeles") == date(2026, 9, 30)
    early_utc = datetime(2026, 10, 1, 3, 0, tzinfo=UTC)
    assert local_day(early_utc, "America/New_York") == date(2026, 9, 30)


def test_unknown_or_missing_zones_fall_back_to_utc() -> None:
    at = datetime(2026, 9, 30, 23, 30, tzinfo=UTC)
    for zone in (None, "", "Mars/Olympus_Mons", "../etc/passwd", "not a zone"):
        assert user_zone(zone) is UTC
        assert local_day(at, zone) == date(2026, 9, 30)


def test_naive_and_offset_datetimes() -> None:
    assert local_day(datetime(2026, 9, 30, 23, 30), "Asia/Tokyo") == date(2026, 10, 1)
    plus_two = datetime(2026, 10, 1, 1, 0, tzinfo=timezone(timedelta(hours=2)))
    assert local_day(plus_two, "UTC") == date(2026, 9, 30)

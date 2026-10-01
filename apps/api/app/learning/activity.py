"""Calendar days in the user's time zone (streaks, Sections 4.2 and 11.8). Pure."""

from collections.abc import Iterable
from datetime import UTC, date, datetime, time, timedelta, tzinfo
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

ONE_DAY = timedelta(days=1)


def user_zone(name: str | None) -> tzinfo:
    """The profile's IANA time zone; UTC when it is missing or unknown."""
    if not name:
        return UTC
    try:
        return ZoneInfo(name)
    except (ZoneInfoNotFoundError, ValueError):
        return UTC


def local_day(at: datetime, zone_name: str | None) -> date:
    """The calendar day `at` falls on for the user (naive datetimes are taken as UTC)."""
    if at.tzinfo is None:
        at = at.replace(tzinfo=UTC)
    return at.astimezone(user_zone(zone_name)).date()


def day_start(day: date, zone_name: str | None) -> datetime:
    """The first instant of the user's calendar day `day`, in UTC."""
    return datetime.combine(day, time.min, tzinfo=user_zone(zone_name)).astimezone(UTC)


def end_of_day(at: datetime, zone_name: str | None) -> datetime:
    """The first instant after the user's calendar day of `at` (exclusive end), in UTC.

    "Due by the end of today" (Section 11.5) means `due_at < end_of_day(now, zone)`.
    """
    return day_start(local_day(at, zone_name) + ONE_DAY, zone_name)


def week_start(day: date) -> date:
    """The Monday of `day`'s week."""
    return day - timedelta(days=day.weekday())


def current_streak(days: Iterable[date], today: date) -> int:
    """Consecutive active days ending today, or ending yesterday while today has no
    activity yet (a streak is not broken until the day is over)."""
    active = set(days)
    day = today if today in active else today - ONE_DAY
    streak = 0
    while day in active:
        streak += 1
        day -= ONE_DAY
    return streak


def longest_streak(days: Iterable[date]) -> int:
    longest = run = 0
    previous: date | None = None
    for day in sorted(set(days)):
        run = run + 1 if previous is not None and day - previous == ONE_DAY else 1
        longest = max(longest, run)
        previous = day
    return longest

"""Calendar days in the user's time zone (streaks, Sections 4.2 and 11.8). Pure."""

from datetime import UTC, date, datetime, tzinfo
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError


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

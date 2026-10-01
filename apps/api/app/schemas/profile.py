"""`PATCH /me` (Sections 6.9 and 16.2): display name, time zone and settings.

`settings` is merged key by key into the stored object: a key set to null is removed
(back to its default), keys left out stay as they are, unknown keys and wrong types are
validation errors. The stored object (returned as `Profile.settings`) holds only the keys
the user set; the web applies the defaults below for the rest.
"""

import unicodedata
from functools import lru_cache
from typing import Literal
from zoneinfo import available_timezones

from pydantic import ConfigDict, Field, field_validator

from app.schemas import CamelModel

MAX_DISPLAY_NAME_CHARS = 60
MIN_EDITOR_FONT_SIZE = 10
MAX_EDITOR_FONT_SIZE = 28


@lru_cache(maxsize=1)
def known_time_zones() -> frozenset[str]:
    return frozenset(available_timezones()) | {"UTC"}


def is_time_zone(name: str) -> bool:
    """An IANA time zone name the server's tz database knows ("UTC" always works)."""
    return name in known_time_zones()


class UserSettings(CamelModel):
    """Settings (Section 6.9). Defaults when unset: theme "dark", sound false,
    reducedMotion "system" (follow the system setting), drillTimer true, editorFontSize
    14, monacoAccessibility "auto" (Monaco's `accessibilitySupport`)."""

    model_config = ConfigDict(extra="forbid", strict=True)

    theme: Literal["dark", "light", "system"] | None = None
    sound: bool | None = None
    reduced_motion: Literal["system", "on", "off"] | None = None
    drill_timer: bool | None = None
    editor_font_size: int | None = Field(
        default=None, ge=MIN_EDITOR_FONT_SIZE, le=MAX_EDITOR_FONT_SIZE
    )
    monaco_accessibility: Literal["auto", "on", "off"] | None = None


class ProfilePatch(CamelModel):
    """Fields left out stay as they are. `displayName: null` clears the name."""

    model_config = ConfigDict(extra="forbid")

    display_name: str | None = Field(default=None, max_length=MAX_DISPLAY_NAME_CHARS)
    timezone: str | None = Field(default=None, max_length=64)
    settings: UserSettings | None = None

    @field_validator("display_name")
    @classmethod
    def _clean_name(cls, value: str | None) -> str | None:
        if value is None:
            return None
        name = " ".join(value.split())
        if not name:
            raise ValueError("must not be empty")
        if any(unicodedata.category(char) == "Cc" for char in name):
            raise ValueError("must not contain control characters")
        return name

    @field_validator("timezone")
    @classmethod
    def _known_zone(cls, value: str | None) -> str | None:
        if value is None:
            raise ValueError("must be an IANA time zone name such as Europe/Paris")
        if not is_time_zone(value):
            raise ValueError(f"unknown time zone {value!r}")
        return value

    @field_validator("settings")
    @classmethod
    def _settings_object(cls, value: UserSettings | None) -> UserSettings | None:
        if value is None:
            raise ValueError("must be an object; set a key to null to reset it")
        return value

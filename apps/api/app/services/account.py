"""The account (Sections 6.9, 16.2 and 20): profile changes, "Export my data" and
"Delete account".

Deleting an account removes the profile, and with it every row the user owns (foreign
keys cascade; `ai_usage` rows lose their user id). The Supabase auth user is deleted
through the admin API when `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are set; a
dev-bypass user's local `auth.users` row is deleted instead.
"""

import uuid
from datetime import datetime
from typing import Any

import httpx
from pydantic.alias_generators import to_camel
from sqlalchemy import delete, inspect, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import AuthUser
from app.config import Settings
from app.errors import ApiError
from app.models import (
    ActivityDay,
    AiUsage,
    Attempt,
    Base,
    DrillAnswer,
    DrillSession,
    Note,
    ProblemProgress,
    Profile,
    ReviewItem,
    ReviewLog,
    auth_users,
)
from app.schemas.profile import ProfilePatch

ADMIN_TIMEOUT_SECONDS = 10.0


class AccountDeletionError(RuntimeError):
    """The auth provider did not delete the user."""


class SupabaseAdmin:
    """The one Supabase admin call the API makes: deleting an auth user."""

    def __init__(
        self,
        url: str,
        service_role_key: str,
        transport: httpx.AsyncBaseTransport | None = None,
    ) -> None:
        self.url = url.rstrip("/")
        self._key = service_role_key
        self._transport = transport

    @classmethod
    def from_settings(cls, settings: Settings) -> "SupabaseAdmin | None":
        if settings.supabase_url and settings.supabase_service_role_key:
            return cls(settings.supabase_url, settings.supabase_service_role_key)
        return None

    def _headers(self) -> dict[str, str]:
        headers = {"apikey": self._key}
        # Legacy service_role keys are JWTs and also go in Authorization; the newer
        # `sb_secret_...` keys are not JWTs and go in `apikey` only.
        if self._key.count(".") == 2:
            headers["Authorization"] = f"Bearer {self._key}"
        return headers

    async def delete_user(self, user_id: uuid.UUID) -> None:
        """Delete the auth user; a user that is already gone counts as deleted."""
        try:
            async with httpx.AsyncClient(
                timeout=ADMIN_TIMEOUT_SECONDS, transport=self._transport
            ) as client:
                response = await client.delete(
                    f"{self.url}/auth/v1/admin/users/{user_id}", headers=self._headers()
                )
        except httpx.HTTPError as exc:
            raise AccountDeletionError(f"Supabase admin API unreachable: {exc}") from exc
        if response.status_code == httpx.codes.NOT_FOUND:
            return
        if response.is_error:
            raise AccountDeletionError(
                f"Supabase admin API answered {response.status_code}: {response.text[:200]}"
            )


# ---------------------------------------------------------------- profile


async def update_profile(session: AsyncSession, user_id: uuid.UUID, patch: ProfilePatch) -> Profile:
    profile = await session.scalar(select(Profile).where(Profile.id == user_id).with_for_update())
    if profile is None:
        raise ApiError(404, "not_found", "Profile not found.")
    given = patch.model_fields_set
    if "display_name" in given:
        profile.display_name = patch.display_name
    if "timezone" in given and patch.timezone is not None:
        profile.timezone = patch.timezone
    if "settings" in given and patch.settings is not None:
        settings = dict(profile.settings or {})
        changes = patch.settings.model_dump(by_alias=True, include=patch.settings.model_fields_set)
        for key, value in changes.items():
            if value is None:
                settings.pop(key, None)
            else:
                settings[key] = value
        profile.settings = settings
    await session.flush()
    return profile


# ---------------------------------------------------------------- export


def row_json(row: Base) -> dict[str, Any]:
    """Every column of a row, keys in camelCase (the API's JSON convention)."""
    return {to_camel(attr.key): getattr(row, attr.key) for attr in inspect(row).mapper.column_attrs}


EXPORT_TABLES: list[tuple[str, type[Base], tuple[Any, ...]]] = [
    ("attempts", Attempt, (Attempt.started_at, Attempt.id)),
    ("problemProgress", ProblemProgress, (ProblemProgress.problem_slug,)),
    ("notes", Note, (Note.problem_slug,)),
    ("drillSessions", DrillSession, (DrillSession.started_at, DrillSession.id)),
    ("drillAnswers", DrillAnswer, (DrillAnswer.created_at, DrillAnswer.id)),
    ("reviewItems", ReviewItem, (ReviewItem.created_at, ReviewItem.id)),
    ("reviewLogs", ReviewLog, (ReviewLog.created_at, ReviewLog.id)),
    ("activityDays", ActivityDay, (ActivityDay.day,)),
    ("aiUsage", AiUsage, (AiUsage.created_at, AiUsage.id)),
]


async def export_data(
    session: AsyncSession, user_id: uuid.UUID, content_version: str, now: datetime
) -> dict[str, Any]:
    """All of the user's rows: the profile, then one list per table."""
    profile = await session.get(Profile, user_id)
    if profile is None:
        raise ApiError(404, "not_found", "Profile not found.")
    data: dict[str, Any] = {
        "exportedAt": now,
        "contentVersion": content_version,
        "profile": row_json(profile),
    }
    for name, model, order in EXPORT_TABLES:
        owner = model.__table__.c.user_id
        rows = await session.scalars(select(model).where(owner == user_id).order_by(*order))
        data[name] = [row_json(row) for row in rows]
    return data


# ---------------------------------------------------------------- delete


async def delete_account(
    session: AsyncSession, user: AuthUser, admin: SupabaseAdmin | None
) -> None:
    """Delete the user's rows (and auth user); the caller commits."""
    if user.is_dev:
        # The local stand-in for auth.users (dev bypass); the profile cascades from it.
        await session.execute(delete(auth_users).where(auth_users.c.id == user.id))
    elif admin is not None:
        try:
            await admin.delete_user(user.id)
        except AccountDeletionError as exc:
            raise ApiError(
                503, "internal", "Could not delete your account right now. Try again."
            ) from exc
    await session.execute(delete(Profile).where(Profile.id == user.id))

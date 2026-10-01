"""PATCH /me, GET /me/export and DELETE /me (Sections 6.9, 16.2 and 20)."""

import uuid
from typing import Any
from zoneinfo import ZoneInfo

import httpx
import pytest
from fastapi import FastAPI
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncEngine

from app.services.account import SupabaseAdmin
from tests.api_helpers import API, ME, OTHER, db_execute, db_rows, error, ok, solve, start
from tests.conftest import DEV_USER, SUPABASE_URL, create_auth_user, make_settings, make_token
from tests.learning_helpers import WRONG_PLAN, answer, sign_in, start_drill

USER_TABLES = [
    "attempts",
    "problem_progress",
    "notes",
    "drill_sessions",
    "drill_answers",
    "review_items",
    "review_logs",
    "activity_days",
]
JWT_LIKE_KEY = "eyJhbGciOiJIUzI1NiJ9.eyJyb2xlIjoic2VydmljZV9yb2xlIn0.c2lnbmF0dXJl"


async def patch_me(client: AsyncClient, body: Any, headers: dict[str, str] = ME) -> httpx.Response:
    return await client.patch(f"{API}/me", json=body, headers=headers)


async def counts(engine: AsyncEngine, user: str) -> dict[str, int]:
    found = {}
    for table in USER_TABLES:
        rows = await db_rows(
            engine, f"select count(*) as n from {table} where user_id = :u", u=uuid.UUID(user)
        )
        found[table] = int(rows[0]["n"])
    return found


async def make_some_rows(client: AsyncClient, headers: dict[str, str] = ME) -> None:
    """An attempt, progress, a review item, notes, a drill miss (session and answer) and
    an activity day."""
    await solve_as(client, "group-anagrams", headers)
    ok(
        await client.put(
            f"{API}/problems/group-anagrams/notes", json={"body": "group by key"}, headers=headers
        )
    )
    body = await start_drill(client, size=1, headers=headers)
    ok(await answer(client, body["sessionId"], "c1", WRONG_PLAN, headers=headers))


async def solve_as(client: AsyncClient, slug: str, headers: dict[str, str]) -> None:
    if headers == ME:
        await solve(client, slug)
        return
    attempt = await start(client, slug, headers)
    url = f"{API}/attempts/{attempt['id']}/end"
    ok(await client.post(url, json={"reason": "gave_up"}, headers=headers))


# ---------------------------------------------------------------- PATCH /me


async def test_patch_display_name_and_time_zone(client: AsyncClient) -> None:
    profile = ok(
        await patch_me(client, {"displayName": "  Ada \t Lovelace ", "timezone": "Asia/Tokyo"})
    )
    assert set(profile) == {"id", "displayName", "timezone", "settings", "createdAt"}
    assert (profile["displayName"], profile["timezone"]) == ("Ada Lovelace", "Asia/Tokyo")
    assert ok(await client.get(f"{API}/me", headers=ME)) == profile
    # Fields left out stay; null clears the name.
    assert ok(await patch_me(client, {}))["displayName"] == "Ada Lovelace"
    cleared = ok(await patch_me(client, {"displayName": None}))
    assert (cleared["displayName"], cleared["timezone"]) == (None, "Asia/Tokyo")
    assert ok(await patch_me(client, {"timezone": "UTC"}))["timezone"] == "UTC"


@pytest.mark.parametrize(
    ("body", "message"),
    [
        ({"displayName": ""}, "displayName: Value error, must not be empty"),
        ({"displayName": "   "}, "displayName: Value error, must not be empty"),
        ({"displayName": "x" * 61}, "displayName: String should have at most 60 characters"),
        ({"displayName": "Ada\x00"}, "displayName: Value error, must not contain control"),
        ({"displayName": 7}, "displayName: Input should be a valid string"),
        ({"timezone": "Mars/Olympus_Mons"}, "timezone: Value error, unknown time zone"),
        ({"timezone": "utc"}, "timezone: Value error, unknown time zone"),
        ({"timezone": None}, "timezone: Value error, must be an IANA time zone name"),
        ({"settings": None}, "settings: Value error, must be an object"),
        ({"settings": {"colour": "red"}}, "settings.colour: Extra inputs are not permitted"),
        ({"settings": {"theme": "sepia"}}, "settings.theme:"),
        ({"settings": {"sound": "yes"}}, "settings.sound: Input should be a valid boolean"),
        ({"settings": {"editorFontSize": 9}}, "settings.editorFontSize:"),
        ({"settings": {"editorFontSize": 29}}, "settings.editorFontSize:"),
        ({"settings": {"editorFontSize": 14.5}}, "settings.editorFontSize:"),
        ({"settings": {"reducedMotion": True}}, "settings.reducedMotion:"),
        ({"settings": {"monacoAccessibility": "always"}}, "settings.monacoAccessibility:"),
        ({"settings": []}, "settings:"),
        ({"nickname": "ada"}, "nickname: Extra inputs are not permitted"),
    ],
)
async def test_patch_is_validated(client: AsyncClient, body: Any, message: str) -> None:
    before = ok(await client.get(f"{API}/me", headers=ME))
    assert error(await patch_me(client, body), 422, "validation_error").startswith(message)
    assert ok(await client.get(f"{API}/me", headers=ME)) == before


async def test_settings_merge_key_by_key(client: AsyncClient) -> None:
    first = ok(
        await patch_me(
            client,
            {
                "settings": {
                    "theme": "light",
                    "sound": False,
                    "reducedMotion": "on",
                    "drillTimer": False,
                    "editorFontSize": 16,
                    "monacoAccessibility": "on",
                }
            },
        )
    )
    assert first["settings"] == {
        "theme": "light",
        "sound": False,
        "reducedMotion": "on",
        "drillTimer": False,
        "editorFontSize": 16,
        "monacoAccessibility": "on",
    }
    second = ok(await patch_me(client, {"settings": {"theme": "system", "sound": None}}))
    assert second["settings"] == {
        "theme": "system",
        "reducedMotion": "on",
        "drillTimer": False,
        "editorFontSize": 16,
        "monacoAccessibility": "on",
    }
    assert ok(await patch_me(client, {"settings": {}}))["settings"] == second["settings"]
    assert ok(await patch_me(client, {"displayName": "Grace"}))["settings"] == second["settings"]


async def test_me_routes_require_sign_in(client: AsyncClient) -> None:
    for method, path in (("PATCH", "/me"), ("GET", "/me/export"), ("DELETE", "/me")):
        response = await client.request(
            method, f"{API}{path}", json={} if method == "PATCH" else None
        )
        assert error(response, 401, "unauthorized") == "Sign in to continue."


async def test_the_time_zone_moves_the_activity_day(
    real_client: AsyncClient, engine: AsyncEngine
) -> None:
    ok(await patch_me(real_client, {"timezone": "Pacific/Kiritimati"}))
    body = await start_drill(real_client, size=1)
    ok(await answer(real_client, body["sessionId"], "c1", WRONG_PLAN))
    rows = await db_rows(engine, "select a.created_at, d.day from drill_answers a, activity_days d")
    zone = ZoneInfo("Pacific/Kiritimati")
    assert rows == [
        {"created_at": rows[0]["created_at"], "day": rows[0]["created_at"].astimezone(zone).date()}
    ]


# ---------------------------------------------------------------- export


async def test_export_holds_every_row_of_the_user(
    real_client: AsyncClient, engine: AsyncEngine
) -> None:
    await make_some_rows(real_client)
    await make_some_rows(real_client, OTHER)
    await db_execute(
        engine,
        "insert into ai_usage (user_id, feature, cached, success, latency_ms)"
        " values (:u, 'twist', false, true, 120)",
        u=uuid.UUID(DEV_USER),
    )
    response = await real_client.get(f"{API}/me/export", headers=ME)
    data = ok(response)
    assert response.headers["content-disposition"].startswith(
        'attachment; filename="seecode-export-'
    )
    assert response.headers["cache-control"] == "no-store"
    assert set(data) == {
        "exportedAt",
        "contentVersion",
        "profile",
        "attempts",
        "problemProgress",
        "notes",
        "drillSessions",
        "drillAnswers",
        "reviewItems",
        "reviewLogs",
        "activityDays",
        "aiUsage",
    }
    mine = await counts(engine, DEV_USER)
    assert len(data["attempts"]) == mine["attempts"] == 1
    assert len(data["problemProgress"]) == mine["problem_progress"]
    assert len(data["drillAnswers"]) == mine["drill_answers"] == 1
    assert len(data["reviewItems"]) == mine["review_items"] >= 1
    assert len(data["activityDays"]) == mine["activity_days"]
    assert len(data["notes"]) == 1
    assert len(data["aiUsage"]) == 1
    assert data["profile"]["id"] == DEV_USER
    assert data["profile"]["displayName"] == "Dev user 0001"
    note = data["notes"][0]
    assert set(note) == {"userId", "problemSlug", "body", "updatedAt"}
    assert (note["problemSlug"], note["body"]) == ("group-anagrams", "group by key")
    attempt = data["attempts"][0]
    assert {
        "id",
        "userId",
        "problemSlug",
        "status",
        "outcome",
        "code",
        "planCorrectSeconds",
    } <= set(attempt)
    assert attempt["outcome"] == "solved_clean"
    session = data["drillSessions"][0]
    assert {"cards", "addMissed", "patternFilter", "startedAt"} <= set(session)
    every_row = [row for key, rows in data.items() if isinstance(rows, list) for row in rows]
    assert {row["userId"] for row in every_row} == {DEV_USER}


# ---------------------------------------------------------------- delete


async def test_deleting_a_dev_user_removes_everything(
    real_client: AsyncClient, engine: AsyncEngine
) -> None:
    await make_some_rows(real_client)
    await make_some_rows(real_client, OTHER)
    other_before = await counts(engine, "00000000-0000-4000-8000-000000000002")
    response = await real_client.delete(f"{API}/me", headers=ME)
    assert response.status_code == 204
    assert response.content == b""
    assert await counts(engine, DEV_USER) == dict.fromkeys(USER_TABLES, 0)
    assert (
        await db_rows(engine, "select id from profiles where id = :u", u=uuid.UUID(DEV_USER)) == []
    )
    users = await db_rows(engine, "select id from auth.users where id = :u", u=uuid.UUID(DEV_USER))
    assert users == []
    assert await counts(engine, "00000000-0000-4000-8000-000000000002") == other_before
    # Signing in again starts over with a fresh profile.
    fresh = await sign_in(real_client)
    assert (fresh["displayName"], fresh["settings"]) == ("Dev user 0001", {})
    assert ok(await real_client.get(f"{API}/today", headers=ME))["start"] is not None


async def test_deleting_without_the_admin_api_removes_local_rows(
    client: AsyncClient, engine: AsyncEngine
) -> None:
    user_id = uuid.uuid4()
    await create_auth_user(engine, user_id, {"full_name": "Ada Lovelace"})
    headers = {"Authorization": f"Bearer {make_token(user_id)}"}
    ok(await patch_me(client, {"timezone": "Europe/Paris"}, headers))
    assert (await client.delete(f"{API}/me", headers=headers)).status_code == 204
    assert await db_rows(engine, "select id from profiles where id = :u", u=user_id) == []
    # Supabase's auth user stays (no service role key); it is not ours to delete.
    assert await db_rows(engine, "select id from auth.users where id = :u", u=user_id) == [
        {"id": user_id}
    ]


class AdminServer:
    """Records the admin API calls and answers with `status`."""

    def __init__(self, status: int) -> None:
        self.status = status
        self.requests: list[httpx.Request] = []

    def __call__(self, request: httpx.Request) -> httpx.Response:
        self.requests.append(request)
        return httpx.Response(self.status, json={})


@pytest.mark.parametrize(("status", "deleted"), [(200, True), (404, True), (500, False)])
async def test_deleting_with_the_admin_api(
    app: FastAPI, client: AsyncClient, engine: AsyncEngine, status: int, deleted: bool
) -> None:
    server = AdminServer(status)
    app.state.supabase_admin = SupabaseAdmin(
        SUPABASE_URL, JWT_LIKE_KEY, transport=httpx.MockTransport(server)
    )
    user_id = uuid.uuid4()
    await create_auth_user(engine, user_id)
    headers = {"Authorization": f"Bearer {make_token(user_id)}"}
    ok(await client.get(f"{API}/me", headers=headers))
    response = await client.delete(f"{API}/me", headers=headers)
    if deleted:
        assert response.status_code == 204
    else:
        message = error(response, 503, "internal")
        assert message == "Could not delete your account right now. Try again."
    [request] = server.requests
    assert request.method == "DELETE"
    assert str(request.url) == f"{SUPABASE_URL}/auth/v1/admin/users/{user_id}"
    assert request.headers["apikey"] == JWT_LIKE_KEY
    assert request.headers["authorization"] == f"Bearer {JWT_LIKE_KEY}"
    profiles = await db_rows(engine, "select id from profiles where id = :u", u=user_id)
    assert (profiles == []) is deleted


async def test_new_secret_keys_go_in_apikey_only(app: FastAPI, client: AsyncClient) -> None:
    server = AdminServer(200)
    admin = SupabaseAdmin(
        SUPABASE_URL + "/", "sb_secret_abc", transport=httpx.MockTransport(server)
    )
    await admin.delete_user(uuid.UUID(DEV_USER))
    [request] = server.requests
    assert request.headers["apikey"] == "sb_secret_abc"
    assert "authorization" not in request.headers
    assert str(request.url) == f"{SUPABASE_URL}/auth/v1/admin/users/{DEV_USER}"


async def test_an_unreachable_admin_api_keeps_the_account(
    app: FastAPI, client: AsyncClient, engine: AsyncEngine
) -> None:
    def refuse(request: httpx.Request) -> httpx.Response:
        raise httpx.ConnectError("refused", request=request)

    app.state.supabase_admin = SupabaseAdmin(
        SUPABASE_URL, JWT_LIKE_KEY, transport=httpx.MockTransport(refuse)
    )
    user_id = uuid.uuid4()
    await create_auth_user(engine, user_id)
    headers = {"Authorization": f"Bearer {make_token(user_id)}"}
    error(await client.delete(f"{API}/me", headers=headers), 503, "internal")
    assert await db_rows(engine, "select id from profiles where id = :u", u=user_id) == [
        {"id": user_id}
    ]


def test_admin_only_with_url_and_service_role_key() -> None:
    assert SupabaseAdmin.from_settings(make_settings()) is None
    admin = SupabaseAdmin.from_settings(make_settings(supabase_service_role_key="k"))
    assert admin is not None
    assert admin.url == SUPABASE_URL
    assert (
        SupabaseAdmin.from_settings(make_settings(supabase_url=None, supabase_service_role_key="k"))
        is None
    )

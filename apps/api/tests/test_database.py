"""Migration 001: tables, trigger, row level security, and agreement with the models."""

import json
import uuid
from typing import Any

import pytest
from alembic.autogenerate import compare_metadata
from alembic.migration import MigrationContext
from sqlalchemy import Connection, text
from sqlalchemy.exc import DBAPIError
from sqlalchemy.ext.asyncio import AsyncEngine

from app.models import Base
from app.models.base import include_in_autogenerate
from tests.conftest import create_auth_user

SECTION_15_TABLES = {
    "profiles",
    "attempts",
    "problem_progress",
    "drill_sessions",
    "drill_answers",
    "review_items",
    "review_logs",
    "notes",
    "activity_days",
    "ai_cache",
    "ai_usage",
}
PROBE_ROLE = "seecode_rls_probe"


async def _scalars(engine: AsyncEngine, sql: str, **params: Any) -> list[Any]:
    async with engine.connect() as conn:
        return list((await conn.execute(text(sql), params)).scalars())


async def test_every_table_exists_with_rls(engine: AsyncEngine) -> None:
    rows = await _scalars(
        engine,
        "select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace"
        " where n.nspname = 'public' and c.relkind = 'r' and c.relrowsecurity",
    )
    assert set(rows) >= SECTION_15_TABLES


async def test_owner_policies_on_user_tables_only(engine: AsyncEngine) -> None:
    rows = await _scalars(engine, "select tablename from pg_policies where schemaname = 'public'")
    assert set(rows) == SECTION_15_TABLES - {"ai_cache", "ai_usage"}
    assert len(rows) == len(set(rows)), "one policy per table"


async def test_named_indexes_exist(engine: AsyncEngine) -> None:
    rows = await _scalars(engine, "select indexname from pg_indexes where schemaname = 'public'")
    assert {
        "attempts_user_problem",
        "attempts_one_active",
        "drill_answers_user_pattern",
        "review_items_due",
        "ai_usage_user_day",
    } <= set(rows)


async def test_trigger_prefers_full_name_then_name(engine: AsyncEngine) -> None:
    both, name_only, neither = uuid.uuid4(), uuid.uuid4(), uuid.uuid4()
    await create_auth_user(engine, both, {"full_name": "Ada Lovelace", "name": "ada"})
    await create_auth_user(engine, name_only, {"name": "grace"})
    await create_auth_user(engine, neither, {})
    async with engine.connect() as conn:
        result = await conn.execute(text("select id, display_name, timezone from public.profiles"))
        profiles = {row.id: (row.display_name, row.timezone) for row in result}
    assert profiles == {
        both: ("Ada Lovelace", "UTC"),
        name_only: ("grace", "UTC"),
        neither: (None, "UTC"),
    }


async def test_only_one_active_attempt_per_problem(engine: AsyncEngine) -> None:
    user = uuid.uuid4()
    await create_auth_user(engine, user)
    insert = text(
        "insert into public.attempts (user_id, problem_slug, content_version, status)"
        " values (:user, 'two-sum', 'v1', :status)"
    )
    async with engine.begin() as conn:
        await conn.execute(insert, {"user": user, "status": "active"})
        await conn.execute(insert, {"user": user, "status": "abandoned"})
    with pytest.raises(DBAPIError):
        async with engine.begin() as conn:
            await conn.execute(insert, {"user": user, "status": "active"})


async def test_deleting_the_auth_user_cascades(engine: AsyncEngine) -> None:
    user = uuid.uuid4()
    await create_auth_user(engine, user)
    async with engine.begin() as conn:
        await conn.execute(
            text("insert into public.notes (user_id, problem_slug, body) values (:u, 'x', 'hi')"),
            {"u": user},
        )
        await conn.execute(text("delete from auth.users where id = :u"), {"u": user})
    assert await _scalars(engine, "select count(*) from public.notes") == [0]
    assert await _scalars(engine, "select count(*) from public.profiles") == [0]


async def test_rls_limits_clients_to_their_own_rows(engine: AsyncEngine) -> None:
    """A non-owner role (like Supabase's `authenticated`) sees and writes only its rows."""
    me, other = uuid.uuid4(), uuid.uuid4()
    await create_auth_user(engine, me)
    await create_auth_user(engine, other)
    async with engine.begin() as conn:
        exists = (
            await conn.execute(text("select 1 from pg_roles where rolname = :r"), {"r": PROBE_ROLE})
        ).first()
        if not exists:
            await conn.execute(text(f"create role {PROBE_ROLE} nologin"))
            await conn.execute(text(f"grant {PROBE_ROLE} to current_user"))
        await conn.execute(text(f"grant usage on schema public, auth to {PROBE_ROLE}"))
        await conn.execute(
            text(f"grant select, insert on all tables in schema public to {PROBE_ROLE}")
        )
        for user in (me, other):
            await conn.execute(
                text("insert into public.notes (user_id, problem_slug) values (:u, 'two-sum')"),
                {"u": user},
            )
        await conn.execute(
            text("insert into public.ai_cache (key, feature, response) values ('k', 'twist', '{}')")
        )

    async def as_client(sql: str, **params: Any) -> list[Any]:
        async with engine.begin() as conn:
            await conn.execute(text(f"set local role {PROBE_ROLE}"))
            await conn.execute(
                text("select set_config('request.jwt.claims', :claims, true)"),
                {"claims": json.dumps({"sub": str(me)})},
            )
            return list((await conn.execute(text(sql), params)).scalars())

    assert await as_client("select id from public.profiles") == [me]
    assert await as_client("select user_id from public.notes") == [me]
    assert await as_client("select key from public.ai_cache") == [], "service-only table"
    with pytest.raises(DBAPIError, match="row-level security"):
        await as_client(
            "insert into public.notes (user_id, problem_slug) values (:u, 'x') returning user_id",
            u=other,
        )


async def test_models_match_the_migration(engine: AsyncEngine) -> None:
    def diff(connection: Connection) -> list[Any]:
        context = MigrationContext.configure(
            connection,
            opts={"include_object": include_in_autogenerate, "compare_type": True},
        )
        return list(compare_metadata(context, Base.metadata))

    async with engine.connect() as conn:
        differences = await conn.run_sync(diff)
    assert differences == []

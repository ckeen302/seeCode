"""Helpers for the drill, review, Today, Stats and account endpoint tests (real content/)."""

import random
import uuid
from datetime import datetime
from typing import Any

from httpx import AsyncClient, Response
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncEngine

from tests.api_helpers import API, ME, db_execute, db_rows, ok, optimal_plan
from tests.conftest import DEV_USER

USER_ID = uuid.UUID(DEV_USER)
# Every field wrong: the score is 0.
WRONG_PLAN: dict[str, Any] = {
    "pattern": "not_sure",
    "structures": [],
    "time": "Not sure",
    "space": "Not sure",
    "twist": "",
}
# Two solved problems in hashing and in two pointers unlock every v1 pattern.
UNLOCK_ALL = ["two-sum", "valid-anagram", "valid-palindrome", "two-sum-ii"]


class FixedRandom(random.Random):
    """A seeded Random whose `uniform` (the interval fuzz) always returns `factor`."""

    def __init__(self, factor: float = 1.0, seed: int = 0) -> None:
        super().__init__(seed)
        self.factor = factor

    def uniform(self, a: float, b: float) -> float:
        return self.factor


async def sign_in(client: AsyncClient, headers: dict[str, str] = ME) -> dict[str, Any]:
    """Make sure the user's profile exists (GET /me) and return it."""
    return ok(await client.get(f"{API}/me", headers=headers))  # type: ignore[no-any-return]


async def set_status(
    engine: AsyncEngine, slug: str, status: str = "solved", user: uuid.UUID = USER_ID
) -> None:
    await db_execute(
        engine,
        "insert into problem_progress (user_id, problem_slug, status) values (:u, :s, :st)"
        " on conflict (user_id, problem_slug) do update set status = excluded.status",
        u=user,
        s=slug,
        st=status,
    )


async def unlock_all(engine: AsyncEngine, user: uuid.UUID = USER_ID) -> None:
    for slug in UNLOCK_ALL:
        await set_status(engine, slug, "solved", user)


async def start_drill(
    client: AsyncClient,
    mode: str = "recognition",
    size: int = 10,
    pattern_filter: str | None = None,
    headers: dict[str, str] = ME,
) -> dict[str, Any]:
    body: dict[str, Any] = {"mode": mode, "size": size}
    if pattern_filter is not None:
        body["patternFilter"] = pattern_filter
    return ok(await client.post(f"{API}/drills/sessions", json=body, headers=headers))  # type: ignore[no-any-return]


async def answer(
    client: AsyncClient,
    session_id: str,
    card_id: str,
    given: dict[str, Any],
    seconds: float = 10.0,
    overtime: bool = False,
    headers: dict[str, str] = ME,
) -> Response:
    return await client.post(
        f"{API}/drills/sessions/{session_id}/answers",
        json={"cardId": card_id, "answer": given, "seconds": seconds, "overtime": overtime},
        headers=headers,
    )


async def finish(
    client: AsyncClient,
    session_id: str,
    body: dict[str, Any] | None = None,
    headers: dict[str, str] = ME,
) -> Response:
    return await client.post(
        f"{API}/drills/sessions/{session_id}/finish", json=body, headers=headers
    )


def right_plan(slug: str) -> dict[str, Any]:
    """The optimal approach as a plan (Workspace and drill-only problems)."""
    return optimal_plan(slug)


async def review_items(
    engine: AsyncEngine, kind: str | None = None, user: uuid.UUID = USER_ID
) -> list[dict[str, Any]]:
    sql = "select * from review_items where user_id = :u"
    if kind is not None:
        sql += " and kind = :k"
    return await db_rows(engine, sql + " order by due_at, ref", u=user, k=kind)


async def review_item(engine: AsyncEngine, kind: str, ref: str) -> dict[str, Any]:
    rows = await db_rows(
        engine,
        "select * from review_items where user_id = :u and kind = :k and ref = :r",
        u=USER_ID,
        k=kind,
        r=ref,
    )
    assert len(rows) == 1, rows
    return rows[0]


async def add_item(
    engine: AsyncEngine,
    kind: str,
    ref: str,
    due_at: datetime,
    *,
    user: uuid.UUID = USER_ID,
    interval_days: float = 1.0,
    reps: int = 0,
    resolve: bool = False,
) -> uuid.UUID:
    """Insert a review item directly; returns its id."""
    async with engine.begin() as conn:
        result = await conn.execute(
            text(
                "insert into review_items"
                " (user_id, kind, ref, due_at, interval_days, reps, resolve)"
                " values (:u, :k, :r, :d, :i, :reps, :res) returning id"
            ),
            {
                "u": user,
                "k": kind,
                "r": ref,
                "d": due_at,
                "i": interval_days,
                "reps": reps,
                "res": resolve,
            },
        )
        item_id: uuid.UUID = result.scalar_one()
    return item_id

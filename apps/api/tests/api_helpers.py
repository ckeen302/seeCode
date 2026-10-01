"""Helpers for the attempt, problem and guest endpoint tests (real content/)."""

import json
from datetime import datetime, timedelta
from functools import cache
from typing import Any

from httpx import AsyncClient, Response
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncEngine

from tests.conftest import DEV_USER, REAL_CONTENT

API = "/api/v1"
OTHER_USER = "00000000-0000-4000-8000-000000000002"
ME = {"X-Dev-User": DEV_USER}
OTHER = {"X-Dev-User": OTHER_USER}


@cache
def problem_json(slug: str) -> dict[str, Any]:
    """A real problem file, parsed."""
    return json.loads((REAL_CONTENT / "problems" / f"{slug}.json").read_text())  # type: ignore[no-any-return]


def problem_test_ids(slug: str) -> list[str]:
    return [test["id"] for test in problem_json(slug)["tests"]]


def passing(slug: str) -> list[dict[str, Any]]:
    return [{"id": test_id, "status": "pass"} for test_id in problem_test_ids(slug)]


def optimal(slug: str) -> dict[str, Any]:
    approaches: list[dict[str, Any]] = problem_json(slug)["approaches"]
    return next(a for a in approaches if a["id"] == "optimal")


def optimal_plan(slug: str) -> dict[str, Any]:
    approach = optimal(slug)
    return {
        "pattern": approach["patternId"],
        "structures": approach["structures"],
        "time": approach["time"],
        "space": approach["space"],
        "twist": approach["twist"],
    }


def ok(response: Response, status: int = 200) -> Any:
    assert response.status_code == status, response.text
    return response.json()


def error(response: Response, status: int, code: str) -> str:
    assert response.status_code == status, response.text
    body = response.json()["error"]
    assert body["code"] == code, body
    return body["message"]  # type: ignore[no-any-return]


async def start(client: AsyncClient, slug: str, headers: dict[str, str] = ME) -> dict[str, Any]:
    return ok(await client.post(f"{API}/attempts", json={"slug": slug}, headers=headers))  # type: ignore[no-any-return]


async def open_rung(
    client: AsyncClient, attempt_id: str, rung: int, headers: dict[str, str] = ME
) -> Response:
    return await client.post(
        f"{API}/attempts/{attempt_id}/hints", json={"rung": rung}, headers=headers
    )


async def open_rungs(client: AsyncClient, attempt_id: str, first: int, last: int) -> None:
    for rung in range(first, last + 1):
        ok(await open_rung(client, attempt_id, rung))


async def submit(
    client: AsyncClient,
    attempt_id: str,
    results: list[dict[str, Any]],
    code: str = "class Solution: ...",
    headers: dict[str, str] = ME,
) -> Response:
    return await client.post(
        f"{API}/attempts/{attempt_id}/submit",
        json={"code": code, "results": results},
        headers=headers,
    )


async def solve(client: AsyncClient, slug: str, rungs: int = 0) -> dict[str, Any]:
    """Start (or resume) an attempt, open hint rungs up to `rungs`, submit passing tests."""
    attempt = await start(client, slug)
    opened = [hint["rung"] for hint in attempt["openedRungs"]]
    await open_rungs(client, attempt["id"], max(opened, default=0) + 1, rungs)
    return ok(await submit(client, attempt["id"], passing(slug)))  # type: ignore[no-any-return]


async def check_plan(
    client: AsyncClient, attempt_id: str, plan: dict[str, Any], headers: dict[str, str] = ME
) -> Response:
    return await client.post(
        f"{API}/attempts/{attempt_id}/plan", json={"plan": plan}, headers=headers
    )


async def db_rows(engine: AsyncEngine, sql: str, **params: Any) -> list[dict[str, Any]]:
    async with engine.connect() as conn:
        result = await conn.execute(text(sql), params)
        return [dict(row._mapping) for row in result]


async def db_execute(engine: AsyncEngine, sql: str, **params: Any) -> None:
    async with engine.begin() as conn:
        await conn.execute(text(sql), params)


def close_to(value: datetime, expected: datetime, seconds: float = 30) -> bool:
    return abs(value - expected) <= timedelta(seconds=seconds)

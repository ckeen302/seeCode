"""Per-user problem endpoints (Section 16.2): the walkthrough after solving, and notes."""

from datetime import UTC, datetime

import pytest
from httpx import AsyncClient

from tests.api_helpers import API, ME, OTHER, close_to, error, ok, problem_json, solve

PLAIN = "group-anagrams"


# ---------------------------------------------------------------- walkthrough


async def test_walkthrough_needs_a_solve(real_client: AsyncClient) -> None:
    url = f"{API}/problems/{PLAIN}/walkthrough"
    message = error(await real_client.get(url, headers=ME), 403, "forbidden")
    assert message == "Solve this problem first. Until then, the walkthrough is hint rung 5."

    await solve(real_client, PLAIN)
    body = ok(await real_client.get(url, headers=ME))
    problem = problem_json(PLAIN)
    assert set(body) == {"code", "entry", "viz", "inputs"}
    assert body["code"] == problem["solution"]["code"]
    assert body["entry"] == problem["entry"]
    assert body["viz"]["primary"] == problem["viz"]["primary"]
    visible = [t for t in problem["tests"] if not t["hidden"]]
    assert body["inputs"] == [
        {"label": f"Example {n}", "args": t["args"]} for n, t in enumerate(visible, start=1)
    ]
    # Solving is per user.
    error(await real_client.get(url, headers=OTHER), 403, "forbidden")


async def test_a_given_up_problem_has_no_walkthrough(real_client: AsyncClient) -> None:
    attempt = ok(await real_client.post(f"{API}/attempts", json={"slug": PLAIN}, headers=ME))
    ok(
        await real_client.post(
            f"{API}/attempts/{attempt['id']}/end", json={"reason": "gave_up"}, headers=ME
        )
    )
    url = f"{API}/problems/{PLAIN}/walkthrough"
    error(await real_client.get(url, headers=ME), 403, "forbidden")


@pytest.mark.parametrize("slug", ["no-such-problem", "reverse-string"])
async def test_walkthrough_of_unknown_or_drill_only_problems(
    real_client: AsyncClient, slug: str
) -> None:
    response = await real_client.get(f"{API}/problems/{slug}/walkthrough", headers=ME)
    error(response, 404, "not_found")


# ---------------------------------------------------------------- notes


async def test_notes_round_trip(real_client: AsyncClient) -> None:
    url = f"{API}/problems/{PLAIN}/notes"
    assert ok(await real_client.get(url, headers=ME)) == {"body": "", "updatedAt": None}

    before = datetime.now(UTC)
    saved = ok(await real_client.put(url, json={"body": "Sort each word → key."}, headers=ME))
    assert saved["body"] == "Sort each word → key."
    assert close_to(datetime.fromisoformat(saved["updatedAt"]), before)
    assert ok(await real_client.get(url, headers=ME)) == saved

    updated = ok(await real_client.put(url, json={"body": ""}, headers=ME))
    assert updated["body"] == ""
    assert ok(await real_client.get(url, headers=ME)) == updated
    # Notes are per user.
    assert ok(await real_client.get(url, headers=OTHER)) == {"body": "", "updatedAt": None}


async def test_notes_limit_is_10_kb(real_client: AsyncClient) -> None:
    url = f"{API}/problems/{PLAIN}/notes"
    ok(await real_client.put(url, json={"body": "n" * 10 * 1024}, headers=ME))
    for body in ("n" * (10 * 1024 + 1), "ü" * (5 * 1024 + 1)):
        message = error(
            await real_client.put(url, json={"body": body}, headers=ME), 422, "validation_error"
        )
        assert "10 KB" in message
    error(await real_client.put(url, json={}, headers=ME), 422, "validation_error")


@pytest.mark.parametrize("slug", ["no-such-problem", "reverse-string"])
async def test_notes_of_unknown_or_drill_only_problems(real_client: AsyncClient, slug: str) -> None:
    url = f"{API}/problems/{slug}/notes"
    error(await real_client.get(url, headers=ME), 404, "not_found")
    error(await real_client.put(url, json={"body": "x"}, headers=ME), 404, "not_found")

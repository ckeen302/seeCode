"""Guest mode (Section 16.2): plan checks and hints without an account, and the import
of a guest's attempts after sign-in (idempotent)."""

import asyncio
import uuid
from datetime import UTC, datetime, timedelta
from typing import Any

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncEngine

from tests.api_helpers import (
    API,
    ME,
    db_rows,
    error,
    ok,
    optimal,
    passing,
    problem_json,
    solve,
    start,
    submit,
)
from tests.conftest import DEV_USER

GUEST_PROBLEM = "valid-palindrome"
SPEC_PLAN = {
    "pattern": "two_pointers_opposite",
    "structures": ["array"],
    "time": "O(n)",
    "space": "O(n)",
    "twist": "skip punctuation and spaces",
}


def _plan_url(slug: str = GUEST_PROBLEM) -> str:
    return f"{API}/guest/problems/{slug}/plan"


def _iso(value: datetime) -> str:
    return value.isoformat().replace("+00:00", "Z")


# ---------------------------------------------------------------- plan checks


async def test_guest_plan_check_needs_no_account(real_client: AsyncClient) -> None:
    body = ok(await real_client.post(_plan_url(), json={"plan": SPEC_PLAN, "checkNumber": 1}))
    assert set(body) == {"grade"}
    grade = body["grade"]
    assert (grade["approachId"], grade["score"], grade["correct"]) == ("optimal", 0.8, True)
    assert grade["fields"]["twist"]["source"] == "keywords"
    assert grade["fields"]["space"]["nudge"] == "Check the space target in the problem."
    assert grade["reveal"] is None


async def test_guest_grade_matches_a_signed_in_grade(real_client: AsyncClient) -> None:
    attempt = await start(real_client, "group-anagrams")
    signed_in = ok(
        await real_client.post(
            f"{API}/attempts/{attempt['id']}/plan", json={"plan": SPEC_PLAN}, headers=ME
        )
    )["grade"]
    guest = ok(
        await real_client.post(
            _plan_url("group-anagrams"), json={"plan": SPEC_PLAN, "checkNumber": 1}
        )
    )["grade"]
    assert guest == signed_in


@pytest.mark.parametrize(
    ("check_number", "opened_rung", "revealed", "nudges"),
    [
        (1, 0, False, True),
        (2, 2, False, True),
        (3, 0, True, True),
        (1, 3, True, False),
        (3, 6, True, False),
    ],
)
async def test_guest_reveal_follows_the_same_rules(
    real_client: AsyncClient, check_number: int, opened_rung: int, revealed: bool, nudges: bool
) -> None:
    body = {"plan": SPEC_PLAN, "checkNumber": check_number, "openedRung": opened_rung}
    grade = ok(await real_client.post(_plan_url(), json=body))["grade"]
    approach = optimal(GUEST_PROBLEM)
    expected = {
        "patternId": approach["patternId"],
        "structures": approach["structures"],
        "time": approach["time"],
        "space": approach["space"],
        "twist": approach["twist"],
    }
    assert grade["reveal"] == (expected if revealed else None)
    assert ("nudge" in grade["fields"]["space"]) is nudges


async def test_guest_fourth_check_is_refused(real_client: AsyncClient) -> None:
    response = await real_client.post(_plan_url(), json={"plan": SPEC_PLAN, "checkNumber": 4})
    error(response, 409, "plan_checks_exhausted")


@pytest.mark.parametrize(
    "body",
    [
        {"plan": SPEC_PLAN},
        {"plan": SPEC_PLAN, "checkNumber": 0},
        {"plan": SPEC_PLAN, "checkNumber": 1, "openedRung": 7},
        {"plan": {**SPEC_PLAN, "pattern": "graphs"}, "checkNumber": 1},
        {"plan": {**SPEC_PLAN, "twist": "t" * 141}, "checkNumber": 1},
        {"plan": {"pattern": "hashing"}, "checkNumber": 1},
    ],
)
async def test_guest_plan_validation(real_client: AsyncClient, body: dict[str, Any]) -> None:
    error(await real_client.post(_plan_url(), json=body), 422, "validation_error")


@pytest.mark.parametrize("slug", ["no-such-problem", "reverse-string"])
async def test_guest_plan_of_unknown_or_drill_only_problems(
    real_client: AsyncClient, slug: str
) -> None:
    response = await real_client.post(_plan_url(slug), json={"plan": SPEC_PLAN, "checkNumber": 1})
    error(response, 404, "not_found")


# ---------------------------------------------------------------- hints


async def test_guest_hints_match_the_signed_in_ladder(real_client: AsyncClient) -> None:
    attempt = await start(real_client, "group-anagrams")
    for rung in range(1, 7):
        guest = ok(await real_client.get(f"{API}/guest/problems/group-anagrams/hints/{rung}"))
        signed_in = ok(
            await real_client.post(
                f"{API}/attempts/{attempt['id']}/hints", json={"rung": rung}, headers=ME
            )
        )
        assert guest == signed_in
        assert guest["rung"] == rung
    clarify = problem_json(GUEST_PROBLEM)["hints"]["clarify"]
    body = ok(await real_client.get(f"{API}/guest/problems/{GUEST_PROBLEM}/hints/1"))
    assert body == {"rung": 1, "clarify": clarify}


@pytest.mark.parametrize("rung", ["0", "7", "one"])
async def test_guest_hint_rung_must_be_1_to_6(real_client: AsyncClient, rung: str) -> None:
    response = await real_client.get(f"{API}/guest/problems/{GUEST_PROBLEM}/hints/{rung}")
    error(response, 422, "validation_error")


@pytest.mark.parametrize("slug", ["no-such-problem", "reverse-string"])
async def test_guest_hints_of_unknown_or_drill_only_problems(
    real_client: AsyncClient, slug: str
) -> None:
    error(await real_client.get(f"{API}/guest/problems/{slug}/hints/1"), 404, "not_found")


# ---------------------------------------------------------------- import


def _guest_attempt(**fields: Any) -> dict[str, Any]:
    now = datetime.now(UTC)
    attempt: dict[str, Any] = {
        "slug": GUEST_PROBLEM,
        "code": "class Solution:\n    def isPalindrome(self, s): ...\n",
        "solved": True,
        "startedAt": _iso(now - timedelta(hours=3, milliseconds=123)),
        "updatedAt": _iso(now - timedelta(hours=2)),
        "solvedAt": _iso(now - timedelta(hours=2)),
    }
    attempt.update(fields)
    return attempt


async def _import(client: AsyncClient, *attempts: dict[str, Any]) -> int:
    body = ok(
        await client.post(f"{API}/guest/import", json={"attempts": list(attempts)}, headers=ME)
    )
    assert set(body) == {"imported"}
    return body["imported"]  # type: ignore[no-any-return]


async def _rows(engine: AsyncEngine, table: str) -> list[dict[str, Any]]:
    return await db_rows(engine, f"select * from {table} where user_id = :u", u=uuid.UUID(DEV_USER))


async def test_import_a_solved_attempt(real_client: AsyncClient, engine: AsyncEngine) -> None:
    guest = _guest_attempt(
        maxRung=1,
        plan=SPEC_PLAN,
        planChecks=1,
        activeSeconds=600,
        plannedFirst=True,
    )
    assert await _import(real_client, guest) == 1
    solved_at = datetime.fromisoformat(guest["solvedAt"])

    [attempt] = await _rows(engine, "attempts")
    assert (attempt["status"], attempt["outcome"], attempt["problem_slug"]) == (
        "finished",
        "solved_clean",
        GUEST_PROBLEM,
    )
    assert attempt["started_at"] == datetime.fromisoformat(guest["startedAt"])
    assert attempt["finished_at"] == solved_at
    assert (attempt["code"], attempt["max_rung"], attempt["free_rungs"]) == (guest["code"], 1, [])
    assert [entry["rung"] for entry in attempt["rungs_opened"]] == [1]
    assert (attempt["active_seconds"], attempt["submits"], attempt["planned_first"]) == (
        600,
        1,
        True,
    )
    assert attempt["plan"] == SPEC_PLAN
    assert attempt["plan_checks"] == 1
    assert attempt["plan_grade"]["score"] == 0.8
    assert attempt["plan_first_correct"] is True

    [progress] = await _rows(engine, "problem_progress")
    assert (progress["status"], progress["best_rung"]) == ("solved", 1)
    assert progress["first_solved_at"] == solved_at
    assert progress["last_attempt_at"] == solved_at

    [item] = await _rows(engine, "review_items")
    assert (item["kind"], item["ref"], item["reps"], item["interval_days"]) == (
        "problem_plan",
        GUEST_PROBLEM,
        1,
        3.0,
    )
    assert item["due_at"] == solved_at + timedelta(days=3)
    assert [row["day"] for row in await _rows(engine, "activity_days")] == [solved_at.date()]

    # The user can now see the walkthrough, and a new attempt has no fading.
    ok(await real_client.get(f"{API}/problems/{GUEST_PROBLEM}/walkthrough", headers=ME))
    new = await start(real_client, GUEST_PROBLEM)
    assert new["id"] != str(attempt["id"])
    assert new["fading"] == {"givenPattern": None, "freeRungs": []}


@pytest.mark.parametrize(
    ("max_rung", "outcome", "resolve"),
    [(3, "solved_with_help", False), (6, "solved_with_solution", True)],
)
async def test_imported_outcome_follows_the_max_rung(
    real_client: AsyncClient, engine: AsyncEngine, max_rung: int, outcome: str, resolve: bool
) -> None:
    assert await _import(real_client, _guest_attempt(maxRung=max_rung)) == 1
    [attempt] = await _rows(engine, "attempts")
    assert attempt["outcome"] == outcome
    [item] = await _rows(engine, "review_items")
    assert (item["resolve"], item["interval_days"]) == (resolve, 1.0)


async def test_import_is_idempotent(real_client: AsyncClient, engine: AsyncEngine) -> None:
    solved = _guest_attempt()
    unsolved = _guest_attempt(slug="group-anagrams", solved=False, solvedAt=None, maxRung=2)
    assert await _import(real_client, solved, unsolved) == 2
    snapshot = {
        table: await _rows(engine, table)
        for table in ("attempts", "problem_progress", "review_items", "activity_days")
    }
    assert await _import(real_client, solved, unsolved) == 0
    assert await _import(real_client, unsolved) == 0
    for table, rows in snapshot.items():
        assert await _rows(engine, table) == rows, table


async def test_concurrent_imports_add_each_attempt_once(
    real_client: AsyncClient, engine: AsyncEngine
) -> None:
    await start(real_client, "two-sum")  # the profile exists, as after sign-in
    guest = _guest_attempt()
    counts = await asyncio.gather(*(_import(real_client, guest) for _ in range(4)))
    assert sorted(counts) == [0, 0, 0, 1]
    rows = await _rows(engine, "attempts")
    assert [row["problem_slug"] for row in rows].count(GUEST_PROBLEM) == 1
    assert len(await _rows(engine, "review_items")) == 1


async def test_an_unsolved_attempt_is_resumed_after_sign_in(
    real_client: AsyncClient, engine: AsyncEngine
) -> None:
    plan = {"pattern": "hashing", "structures": ["hash_map"], "time": "O(n)", "space": "O(n)"}
    guest = _guest_attempt(
        slug="group-anagrams",
        code="draft",
        solved=False,
        solvedAt=None,
        maxRung=2,
        plan=plan,
        planChecks=2,
        activeSeconds=300,
    )
    assert await _import(real_client, guest) == 1
    assert await _rows(engine, "review_items") == []
    [progress] = await _rows(engine, "problem_progress")
    assert progress["status"] == "attempted"

    view = await start(real_client, "group-anagrams")
    [row] = await _rows(engine, "attempts")
    assert view["id"] == str(row["id"])
    assert (view["status"], view["code"], view["activeSeconds"]) == ("active", "draft", 300)
    assert (view["maxRung"], [hint["rung"] for hint in view["openedRungs"]]) == (2, [1, 2])
    assert view["checksLeft"] == 1
    assert view["plan"] == {**plan, "twist": ""}
    assert view["planGrade"]["reveal"] is None
    assert view["planGrade"]["fields"]["pattern"]["result"] == "correct"
    assert view["fading"] == {"givenPattern": None, "freeRungs": []}

    # It works like any attempt from here on.
    body = ok(await submit(real_client, view["id"], passing("group-anagrams")))
    assert body["outcome"] == "solved_clean"


async def test_an_unsolved_attempt_does_not_replace_an_active_one(
    real_client: AsyncClient, engine: AsyncEngine
) -> None:
    mine = await start(real_client, "group-anagrams")
    guest = _guest_attempt(slug="group-anagrams", solved=False, solvedAt=None, code="guest")
    assert await _import(real_client, guest) == 0
    assert (await start(real_client, "group-anagrams"))["id"] == mine["id"]
    assert len(await _rows(engine, "attempts")) == 1


async def test_a_solved_import_merges_with_existing_progress(
    real_client: AsyncClient, engine: AsyncEngine
) -> None:
    await solve(real_client, GUEST_PROBLEM, rungs=4)
    [before] = await _rows(engine, "problem_progress")
    guest = _guest_attempt(maxRung=0)
    assert await _import(real_client, guest) == 1
    [after] = await _rows(engine, "problem_progress")
    assert (after["status"], after["best_rung"]) == ("solved", 0)
    assert after["first_solved_at"] == datetime.fromisoformat(guest["solvedAt"])
    assert after["last_attempt_at"] == before["last_attempt_at"]  # the later of the two
    assert len(await _rows(engine, "attempts")) == 2


async def test_unknown_and_drill_only_problems_are_skipped(
    real_client: AsyncClient, engine: AsyncEngine
) -> None:
    attempts = [
        _guest_attempt(slug="no-such-problem"),
        _guest_attempt(slug="reverse-string"),
        _guest_attempt(),
    ]
    assert await _import(real_client, *attempts) == 1
    assert [row["problem_slug"] for row in await _rows(engine, "attempts")] == [GUEST_PROBLEM]
    assert await _import(real_client) == 0  # nothing to import


async def test_future_timestamps_are_capped_at_now(
    real_client: AsyncClient, engine: AsyncEngine
) -> None:
    ahead = datetime.now(UTC) + timedelta(hours=5)
    guest = _guest_attempt(startedAt=_iso(ahead), updatedAt=_iso(ahead), solvedAt=_iso(ahead))
    before = datetime.now(UTC)
    assert await _import(real_client, guest) == 1
    after = datetime.now(UTC)
    [attempt] = await _rows(engine, "attempts")
    assert attempt["started_at"] == ahead  # kept: it identifies the guest attempt
    assert before <= attempt["finished_at"] <= after
    [item] = await _rows(engine, "review_items")
    assert before + timedelta(days=3) <= item["due_at"] <= after + timedelta(days=3)
    assert await _import(real_client, guest) == 0


@pytest.mark.parametrize(
    "change",
    [
        {"startedAt": "2026-09-30T10:00:00"},  # no time zone
        {"startedAt": "yesterday"},
        {"maxRung": 7},
        {"planChecks": 4},
        {"code": "x" * (50 * 1024 + 1)},
        {"slug": ""},
        {"plan": {"twist": "t" * 141}},
    ],
)
async def test_import_validation(real_client: AsyncClient, change: dict[str, Any]) -> None:
    body = {"attempts": [_guest_attempt(**change)]}
    error(
        await real_client.post(f"{API}/guest/import", json=body, headers=ME),
        422,
        "validation_error",
    )


async def test_import_limits(real_client: AsyncClient, engine: AsyncEngine) -> None:
    body = {
        "attempts": [_guest_attempt(startedAt=f"2026-09-{d:02d}T10:00:00Z") for d in range(1, 30)]
        * 2
    }
    assert len(body["attempts"]) == 58
    error(
        await real_client.post(f"{API}/guest/import", json=body, headers=ME),
        422,
        "validation_error",
    )
    # Huge active times are capped, not refused.
    assert await _import(real_client, _guest_attempt(activeSeconds=10**9)) == 1
    [attempt] = await _rows(engine, "attempts")
    assert attempt["active_seconds"] == 7 * 24 * 60 * 60


async def test_import_accepts_the_m2_guest_shape(real_client: AsyncClient) -> None:
    """The web's M2 localStorage entry: slug, code, solved and three timestamps."""
    guest = {
        "slug": GUEST_PROBLEM,
        "code": "pass",
        "solved": False,
        "startedAt": "2026-09-29T08:00:00.000Z",
        "updatedAt": "2026-09-29T08:05:00.000Z",
        "solvedAt": None,
    }
    assert await _import(real_client, guest) == 1
    view = await start(real_client, GUEST_PROBLEM)
    assert (view["code"], view["maxRung"], view["plan"], view["checksLeft"]) == ("pass", 0, None, 3)

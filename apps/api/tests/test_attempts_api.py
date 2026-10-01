"""Attempt endpoints (Section 16.2, signed in) on the real content/ folder.

Covers auth, ownership (404), fading (11.6), sync, plan checks and their limit, the
reveal, hint order (409), submit coverage, outcomes (11.2), progress (11.3), review items
(11.4), activity days, restart, predictions, and that no rung leaks early.
"""

import asyncio
import uuid
from datetime import UTC, date, datetime, timedelta
from typing import Any
from zoneinfo import ZoneInfo

import pytest
from httpx import ASGITransport, AsyncClient, Response
from sqlalchemy.ext.asyncio import AsyncEngine

from app.main import create_app
from tests.api_helpers import (
    API,
    ME,
    OTHER,
    check_plan,
    close_to,
    db_execute,
    db_rows,
    error,
    ok,
    open_rung,
    open_rungs,
    optimal,
    optimal_plan,
    passing,
    problem_json,
    solve,
    start,
    submit,
)
from tests.conftest import (
    DEV_USER,
    REAL_CONTENT,
    fixture_documents,
    make_settings,
    write_documents,
)

ATTEMPT_KEYS = {
    "id",
    "slug",
    "status",
    "code",
    "plan",
    "planGrade",
    "checksLeft",
    "maxRung",
    "openedRungs",
    "fading",
    "lastResults",
    "activeSeconds",
    "outcome",
    "runs",
    "plannedFirst",
    "planSkipped",
    "startedAt",
    "updatedAt",
}
# A problem that is neither first nor second of its pattern: no fading.
PLAIN = "group-anagrams"


def _now() -> datetime:
    return datetime.now(UTC)


async def _review_item(engine: AsyncEngine, slug: str) -> dict[str, Any]:
    rows = await db_rows(
        engine,
        "select * from review_items where user_id = :u and kind = 'problem_plan' and ref = :s",
        u=uuid.UUID(DEV_USER),
        s=slug,
    )
    assert len(rows) == 1, rows
    return rows[0]


async def _progress(engine: AsyncEngine, slug: str) -> dict[str, Any] | None:
    rows = await db_rows(
        engine,
        "select * from problem_progress where user_id = :u and problem_slug = :s",
        u=uuid.UUID(DEV_USER),
        s=slug,
    )
    return rows[0] if rows else None


async def _attempt_row(engine: AsyncEngine, attempt_id: str) -> dict[str, Any]:
    rows = await db_rows(engine, "select * from attempts where id = :id", id=uuid.UUID(attempt_id))
    return rows[0]


# ---------------------------------------------------------------- auth and ownership

SOME_ID = "4a0b7a5e-3c1d-4e2f-9a8b-7c6d5e4f3a2b"
SIGNED_IN_ROUTES: list[tuple[str, str, dict[str, Any] | None]] = [
    ("POST", "/attempts", {"slug": "two-sum"}),
    ("GET", f"/attempts/{SOME_ID}", None),
    ("PATCH", f"/attempts/{SOME_ID}", {"code": "x"}),
    ("POST", f"/attempts/{SOME_ID}/plan", {"plan": {"pattern": "hashing", "time": "O(n)"}}),
    ("POST", f"/attempts/{SOME_ID}/hints", {"rung": 1}),
    ("POST", f"/attempts/{SOME_ID}/submit", {"code": "x", "results": []}),
    ("POST", f"/attempts/{SOME_ID}/end", {"reason": "gave_up"}),
    ("POST", f"/attempts/{SOME_ID}/restart", None),
    ("POST", f"/attempts/{SOME_ID}/predictions", {"predictions": []}),
    ("GET", "/problems/two-sum/walkthrough", None),
    ("GET", "/problems/two-sum/notes", None),
    ("PUT", "/problems/two-sum/notes", {"body": "hi"}),
    ("POST", "/guest/import", {"attempts": []}),
]


@pytest.mark.parametrize(("method", "path", "body"), SIGNED_IN_ROUTES)
async def test_signed_in_routes_require_sign_in(
    real_client: AsyncClient, method: str, path: str, body: dict[str, Any] | None
) -> None:
    response = await real_client.request(method, f"{API}{path}", json=body)
    assert error(response, 401, "unauthorized") == "Sign in to continue."


async def test_another_users_attempt_is_not_found(real_client: AsyncClient) -> None:
    attempt = await start(real_client, PLAIN)
    base = f"{API}/attempts/{attempt['id']}"
    requests = [
        ("GET", base, None),
        ("PATCH", base, {"code": "stolen"}),
        ("POST", f"{base}/plan", {"plan": optimal_plan(PLAIN)}),
        ("POST", f"{base}/hints", {"rung": 1}),
        ("POST", f"{base}/submit", {"code": "x", "results": passing(PLAIN)}),
        ("POST", f"{base}/end", {"reason": "gave_up"}),
        ("POST", f"{base}/restart", None),
        ("POST", f"{base}/predictions", {"predictions": [{"id": "p1", "correct": True}]}),
    ]
    for method, url, body in requests:
        response = await real_client.request(method, url, json=body, headers=OTHER)
        assert error(response, 404, "not_found") == "Attempt not found.", (method, url)
    # Nothing changed for the owner.
    mine = ok(await real_client.get(base, headers=ME))
    assert (mine["status"], mine["code"], mine["checksLeft"], mine["openedRungs"]) == (
        "active",
        attempt["code"],
        3,
        [],
    )


async def test_unknown_attempt_and_malformed_id(real_client: AsyncClient) -> None:
    error(await real_client.get(f"{API}/attempts/{SOME_ID}", headers=ME), 404, "not_found")
    error(await real_client.get(f"{API}/attempts/nope", headers=ME), 422, "validation_error")


@pytest.mark.parametrize(
    "slug", ["no-such-problem", "reverse-string"]
)  # reverse-string: drill-only
async def test_unknown_and_drill_only_problems_have_no_attempts(
    real_client: AsyncClient, slug: str
) -> None:
    response = await real_client.post(f"{API}/attempts", json={"slug": slug}, headers=ME)
    assert error(response, 404, "not_found") == "Problem not found."


async def test_attempt_routes_are_rate_limited(engine: AsyncEngine) -> None:
    application = create_app(make_settings(content_dir=REAL_CONTENT, rate_limit_per_minute=2))
    async with AsyncClient(transport=ASGITransport(app=application), base_url="http://t") as client:
        statuses = [
            (await client.post(f"{API}/attempts", json={"slug": PLAIN}, headers=ME)).status_code
            for _ in range(3)
        ]
    await application.state.engine.dispose()
    assert statuses == [200, 200, 429]


# ---------------------------------------------------------------- create and resume


async def test_new_attempt_view(real_client: AsyncClient, engine: AsyncEngine) -> None:
    before = _now()
    attempt = await start(real_client, PLAIN)
    assert set(attempt) == ATTEMPT_KEYS
    assert attempt["slug"] == PLAIN
    assert attempt["status"] == "active"
    assert attempt["code"] == problem_json(PLAIN)["starterCode"]
    assert (attempt["plan"], attempt["planGrade"], attempt["checksLeft"]) == (None, None, 3)
    assert (attempt["maxRung"], attempt["openedRungs"]) == (0, [])
    assert attempt["fading"] == {"givenPattern": None, "freeRungs": []}
    assert (attempt["lastResults"], attempt["activeSeconds"], attempt["outcome"]) == (None, 0, None)
    assert (attempt["runs"], attempt["plannedFirst"], attempt["planSkipped"]) == (0, False, False)
    assert close_to(datetime.fromisoformat(attempt["startedAt"]), before)

    progress = await _progress(engine, PLAIN)
    assert progress is not None
    assert progress["status"] == "attempted"
    assert close_to(progress["last_attempt_at"], before)
    row = await _attempt_row(engine, attempt["id"])
    assert (
        row["content_version"] == (await real_client.get(f"{API}/health")).json()["contentVersion"]
    )


async def test_opening_again_resumes_the_active_attempt(real_client: AsyncClient) -> None:
    first = await start(real_client, PLAIN)
    ok(await real_client.patch(f"{API}/attempts/{first['id']}", json={"code": "mine"}, headers=ME))
    again = await start(real_client, PLAIN)
    assert again["id"] == first["id"]
    assert again["code"] == "mine"
    fetched = ok(await real_client.get(f"{API}/attempts/{first['id']}", headers=ME))
    assert fetched == again


async def test_concurrent_opens_share_one_attempt(
    real_client: AsyncClient, engine: AsyncEngine
) -> None:
    await start(real_client, "two-sum")  # the profile exists first, as in the app
    await db_execute(engine, "delete from attempts")
    views = await asyncio.gather(*(start(real_client, PLAIN) for _ in range(4)))
    assert len({view["id"] for view in views}) == 1
    rows = await db_rows(engine, "select id from attempts where problem_slug = :s", s=PLAIN)
    assert len(rows) == 1


async def test_idle_attempt_is_abandoned_after_14_days(
    real_client: AsyncClient, engine: AsyncEngine
) -> None:
    old = await start(real_client, PLAIN)
    await db_execute(
        engine,
        "update attempts set updated_at = now() - interval '15 days' where id = :id",
        id=uuid.UUID(old["id"]),
    )
    new = await start(real_client, PLAIN)
    assert new["id"] != old["id"]
    stale = ok(await real_client.get(f"{API}/attempts/{old['id']}", headers=ME))
    assert (stale["status"], stale["outcome"]) == ("abandoned", "abandoned")
    await db_execute(
        engine,
        "update attempts set updated_at = now() - interval '13 days' where id = :id",
        id=uuid.UUID(new["id"]),
    )
    assert (await start(real_client, PLAIN))["id"] == new["id"]


# ---------------------------------------------------------------- fading (11.6)


async def test_first_problem_of_a_pattern_is_given(real_client: AsyncClient) -> None:
    hints = problem_json("two-sum")["hints"]
    attempt = await start(real_client, "two-sum")
    assert attempt["fading"] == {"givenPattern": "hashing", "freeRungs": [1, 2]}
    assert [hint["rung"] for hint in attempt["openedRungs"]] == [1, 2]
    assert attempt["openedRungs"][0] == {"rung": 1, "clarify": hints["clarify"]}
    assert attempt["maxRung"] == 0

    # Rungs 1 and 2 are open, so rung 3 is next; they never count.
    again = ok(await open_rung(real_client, attempt["id"], 1))
    assert again == attempt["openedRungs"][0]
    error(await open_rung(real_client, attempt["id"], 4), 409, "rung_order")
    ok(await open_rung(real_client, attempt["id"], 3))
    view = ok(await real_client.get(f"{API}/attempts/{attempt['id']}", headers=ME))
    assert view["maxRung"] == 3
    assert view["fading"] == {"givenPattern": "hashing", "freeRungs": [1, 2]}


async def test_second_problem_gets_rung_1_free(real_client: AsyncClient) -> None:
    attempt = await start(real_client, "valid-anagram")
    assert attempt["fading"] == {"givenPattern": None, "freeRungs": [1]}
    assert attempt["openedRungs"] == []
    ok(await open_rung(real_client, attempt["id"], 1))
    view = ok(await real_client.get(f"{API}/attempts/{attempt['id']}", headers=ME))
    assert view["maxRung"] == 0
    ok(await open_rung(real_client, attempt["id"], 2))
    view = ok(await real_client.get(f"{API}/attempts/{attempt['id']}", headers=ME))
    assert view["maxRung"] == 2


@pytest.mark.parametrize("slug", ["group-anagrams", "three-sum", "koko-eating-bananas"])
async def test_third_problem_gets_no_support(real_client: AsyncClient, slug: str) -> None:
    attempt = await start(real_client, slug)
    assert attempt["fading"] == {"givenPattern": None, "freeRungs": []}


async def test_fading_only_until_an_attempt_is_finished(real_client: AsyncClient) -> None:
    first = await start(real_client, "binary-search")
    assert first["fading"]["givenPattern"] == "binary_search"
    restarted = ok(await real_client.post(f"{API}/attempts/{first['id']}/restart", headers=ME))
    assert restarted["fading"] == {"givenPattern": "binary_search", "freeRungs": [1, 2]}
    ok(
        await real_client.post(
            f"{API}/attempts/{restarted['id']}/end", json={"reason": "gave_up"}, headers=ME
        )
    )
    after = await start(real_client, "binary-search")
    assert after["fading"] == {"givenPattern": None, "freeRungs": []}
    assert after["openedRungs"] == []


async def test_a_clean_solve_with_free_rungs(real_client: AsyncClient) -> None:
    result = await solve(real_client, "two-sum")  # rungs 1 and 2 open, both free
    assert result["outcome"] == "solved_clean"
    assert result["wrapUp"]["maxRung"] == 0


# ---------------------------------------------------------------- PATCH (sync)


async def test_patch_syncs_code_time_runs_and_results(real_client: AsyncClient) -> None:
    attempt = await start(real_client, PLAIN)
    url = f"{API}/attempts/{attempt['id']}"
    results = [
        {"id": "e1", "status": "pass", "got": None, "stdout": "", "ms": 1.5},
        {"id": "e2", "status": "error", "error": "Traceback ...", "stdout": "hi\n"},
        {"id": "c1", "status": "fail", "got": [["eat"]]},
    ]
    first = ok(
        await real_client.patch(
            url,
            json={"code": "v1", "activeSecondsDelta": 12, "runsDelta": 1, "lastResults": results},
            headers=ME,
        )
    )
    assert set(first) == {"ok", "updatedAt"}
    assert first["ok"] is True
    second = ok(
        await real_client.patch(
            url, json={"activeSecondsDelta": 8, "planSkipped": True}, headers=ME
        )
    )
    assert datetime.fromisoformat(second["updatedAt"]) >= datetime.fromisoformat(first["updatedAt"])
    view = ok(await real_client.get(url, headers=ME))
    assert (view["code"], view["activeSeconds"], view["runs"]) == ("v1", 20, 1)
    assert view["lastResults"] == results  # exactly as sent, null `got` included
    assert view["planSkipped"] is True
    assert view["updatedAt"] == second["updatedAt"]
    ok(await real_client.patch(url, json={}, headers=ME))  # an empty sync is fine


@pytest.mark.parametrize(
    "body",
    [
        {"code": "x" * (50 * 1024 + 1)},
        {"code": "é" * (25 * 1024 + 1)},  # 2 bytes each in UTF-8
        {"activeSecondsDelta": -1},
        {"activeSecondsDelta": 86401},
        {"runsDelta": -2},
        {"lastResults": [{"id": "e1", "status": "maybe"}]},
        {"lastResults": [{"status": "pass"}]},
    ],
)
async def test_patch_limits(real_client: AsyncClient, body: dict[str, Any]) -> None:
    attempt = await start(real_client, PLAIN)
    response = await real_client.patch(f"{API}/attempts/{attempt['id']}", json=body, headers=ME)
    error(response, 422, "validation_error")


async def test_code_of_exactly_50_kb_is_accepted(real_client: AsyncClient) -> None:
    attempt = await start(real_client, PLAIN)
    code = "x" * (50 * 1024)
    ok(await real_client.patch(f"{API}/attempts/{attempt['id']}", json={"code": code}, headers=ME))


async def test_patch_is_refused_once_the_attempt_ended(real_client: AsyncClient) -> None:
    attempt = await start(real_client, PLAIN)
    ok(await submit(real_client, attempt["id"], passing(PLAIN)))
    response = await real_client.patch(
        f"{API}/attempts/{attempt['id']}", json={"code": "late"}, headers=ME
    )
    error(response, 409, "conflict")


# ---------------------------------------------------------------- plan checks (7.3, 11.1)

SPEC_PLAN = {
    "pattern": "two_pointers_opposite",
    "structures": ["array"],
    "time": "O(n)",
    "space": "O(n)",
    "twist": "skip punctuation and spaces",
}


async def test_plan_check_follows_section_16_5(real_client: AsyncClient) -> None:
    attempt = await start(real_client, "valid-palindrome")
    body = ok(await check_plan(real_client, attempt["id"], SPEC_PLAN))
    assert body == {
        "grade": {
            "approachId": "optimal",
            "score": 0.8,
            "correct": True,
            "fields": {
                "pattern": {"result": "correct"},
                "structures": {"result": "correct", "missing": [], "extra": []},
                "time": {"result": "correct"},
                "space": {"result": "wrong", "nudge": "Check the space target in the problem."},
                "twist": {
                    "result": "close",
                    "feedback": "Say what this problem does differently from the plain pattern.",
                    "source": "keywords",
                },
            },
            "reveal": None,
        },
        "checksLeft": 2,
    }
    view = ok(await real_client.get(f"{API}/attempts/{attempt['id']}", headers=ME))
    assert view["plan"] == SPEC_PLAN
    assert view["planGrade"] == body["grade"]
    assert view["checksLeft"] == 2


async def test_third_check_reveals_and_a_fourth_is_refused(real_client: AsyncClient) -> None:
    attempt = await start(real_client, PLAIN)
    wrong = {"pattern": "stack", "structures": ["stack"], "time": "O(2ⁿ)", "twist": "push"}
    for expected_left in (2, 1):
        body = ok(await check_plan(real_client, attempt["id"], wrong))
        assert body["checksLeft"] == expected_left
        assert body["grade"]["reveal"] is None
        assert "missing" not in body["grade"]["fields"]["structures"]
    third = ok(await check_plan(real_client, attempt["id"], wrong))
    approach = optimal(PLAIN)
    assert third["checksLeft"] == 0
    assert third["grade"]["reveal"] == {
        "patternId": approach["patternId"],
        "structures": approach["structures"],
        "time": approach["time"],
        "space": approach["space"],
        "twist": approach["twist"],
    }
    assert third["grade"]["fields"]["structures"]["missing"] == approach["structures"]
    response = await check_plan(real_client, attempt["id"], optimal_plan(PLAIN))
    error(response, 409, "plan_checks_exhausted")
    view = ok(await real_client.get(f"{API}/attempts/{attempt['id']}", headers=ME))
    assert view["checksLeft"] == 0
    assert view["planGrade"] == third["grade"]


async def test_plan_is_revealed_once_rung_3_is_open(real_client: AsyncClient) -> None:
    attempt = await start(real_client, PLAIN)
    await open_rungs(real_client, attempt["id"], 1, 3)
    grade = ok(await check_plan(real_client, attempt["id"], SPEC_PLAN))["grade"]
    assert grade["reveal"]["patternId"] == "hashing"
    fields = grade["fields"]
    assert all("nudge" not in fields[name] for name in ("pattern", "structures", "time", "space"))
    assert "feedback" not in fields["twist"]


@pytest.mark.parametrize(
    ("plan", "message"),
    [
        ({**SPEC_PLAN, "twist": "x" * 141}, "twist"),
        ({**SPEC_PLAN, "pattern": "dynamic_programming"}, "unknown pattern"),
        ({**SPEC_PLAN, "structures": ["array", "trie"]}, "unknown structure"),
        ({**SPEC_PLAN, "structures": ["array", "stack", "queue", "heap", "grid"]}, "structures"),
        ({**SPEC_PLAN, "pattern": None}, "needs a pattern"),
        ({**SPEC_PLAN, "time": None, "space": None}, "at least one complexity"),
        ({**SPEC_PLAN, "time": "O(n^2)"}, "time"),
    ],
)
async def test_invalid_plans_are_rejected_without_using_a_check(
    real_client: AsyncClient, plan: dict[str, Any], message: str
) -> None:
    attempt = await start(real_client, PLAIN)
    assert message in error(
        await check_plan(real_client, attempt["id"], plan), 422, "validation_error"
    )
    view = ok(await real_client.get(f"{API}/attempts/{attempt['id']}", headers=ME))
    assert view["checksLeft"] == 3


async def test_brute_force_and_not_sure_are_valid_answers(real_client: AsyncClient) -> None:
    attempt = await start(real_client, PLAIN)
    for pattern in ("brute_force", "not_sure"):
        ok(await check_plan(real_client, attempt["id"], {"pattern": pattern, "time": "Not sure"}))


async def test_plan_facts_first_check_and_plan_time(
    real_client: AsyncClient, engine: AsyncEngine
) -> None:
    attempt = await start(real_client, PLAIN)
    url = f"{API}/attempts/{attempt['id']}"
    ok(await real_client.patch(url, json={"activeSecondsDelta": 30}, headers=ME))
    first = ok(await check_plan(real_client, attempt["id"], SPEC_PLAN))["grade"]
    assert first["correct"] is False
    ok(await real_client.patch(url, json={"activeSecondsDelta": 45}, headers=ME))
    second = ok(await check_plan(real_client, attempt["id"], optimal_plan(PLAIN)))["grade"]
    assert second["correct"] is True
    row = await _attempt_row(engine, attempt["id"])
    assert (row["plan_first_correct"], row["plan_correct_seconds"]) == (False, 75)
    assert row["planned_first"] is True  # checked before any Run

    wrap = (await solve(real_client, PLAIN))["wrapUp"]
    assert wrap["planRightFirstTime"] is False
    assert wrap["timeSeconds"] == 75


async def test_plan_right_first_time(real_client: AsyncClient, engine: AsyncEngine) -> None:
    attempt = await start(real_client, PLAIN)
    ok(
        await real_client.patch(
            f"{API}/attempts/{attempt['id']}", json={"runsDelta": 2}, headers=ME
        )
    )
    assert ok(await check_plan(real_client, attempt["id"], optimal_plan(PLAIN)))["grade"]["correct"]
    row = await _attempt_row(engine, attempt["id"])
    assert (row["plan_first_correct"], row["plan_correct_seconds"]) == (True, 0)
    assert row["planned_first"] is False  # a Run came first
    wrap = (await solve(real_client, PLAIN))["wrapUp"]
    assert wrap["planRightFirstTime"] is True


async def test_plan_check_is_refused_once_the_attempt_ended(real_client: AsyncClient) -> None:
    attempt = await start(real_client, PLAIN)
    ok(
        await real_client.post(
            f"{API}/attempts/{attempt['id']}/end", json={"reason": "gave_up"}, headers=ME
        )
    )
    error(await check_plan(real_client, attempt["id"], SPEC_PLAN), 409, "conflict")


# ---------------------------------------------------------------- hint ladder (7.4)


async def test_rungs_open_strictly_in_order(real_client: AsyncClient) -> None:
    attempt = await start(real_client, PLAIN)
    message = error(await open_rung(real_client, attempt["id"], 2), 409, "rung_order")
    assert message == "Rungs open in order: open rung 1 first."
    first = ok(await open_rung(real_client, attempt["id"], 1))
    assert first == {"rung": 1, "clarify": problem_json(PLAIN)["hints"]["clarify"]}
    error(await open_rung(real_client, attempt["id"], 3), 409, "rung_order")
    second = ok(await open_rung(real_client, attempt["id"], 2))
    assert second["rung"] == 2
    view = ok(await real_client.get(f"{API}/attempts/{attempt['id']}", headers=ME))
    assert view["maxRung"] == 2
    assert view["openedRungs"] == [first, second]  # restored on reload, in order


async def test_reopening_an_open_rung_changes_nothing(
    real_client: AsyncClient, engine: AsyncEngine
) -> None:
    attempt = await start(real_client, PLAIN)
    first = ok(await open_rung(real_client, attempt["id"], 1))
    assert ok(await open_rung(real_client, attempt["id"], 1)) == first
    row = await _attempt_row(engine, attempt["id"])
    assert [entry["rung"] for entry in row["rungs_opened"]] == [1]
    assert row["max_rung"] == 1


@pytest.mark.parametrize("rung", [0, 7, "one"])
async def test_rung_must_be_1_to_6(real_client: AsyncClient, rung: object) -> None:
    attempt = await start(real_client, PLAIN)
    error(await open_rung(real_client, attempt["id"], rung), 422, "validation_error")  # type: ignore[arg-type]


async def test_every_rung_returns_its_content(real_client: AsyncClient) -> None:
    problem = problem_json(PLAIN)
    attempt = await start(real_client, PLAIN)
    bodies = [ok(await open_rung(real_client, attempt["id"], rung)) for rung in range(1, 7)]
    assert [body["rung"] for body in bodies] == [1, 2, 3, 4, 5, 6]
    assert bodies[1]["constraintReading"] == problem["constraintReading"]
    assert bodies[2]["patternId"] == "hashing"
    assert bodies[2]["reveal"]["twist"] == optimal(PLAIN)["twist"]
    assert [slot["id"] for slot in bodies[3]["slots"]] == [
        "setup",
        "loop",
        "update",
        "record",
        "return",
    ]
    assert bodies[4]["walkthrough"]["code"] == problem["solution"]["code"]
    assert bodies[5]["explanation"] == problem["solution"]["explanation"]
    assert "# viz:" not in bodies[5]["code"]
    view = ok(await real_client.get(f"{API}/attempts/{attempt['id']}", headers=ME))
    assert view["openedRungs"] == bodies
    assert view["maxRung"] == 6


async def test_hints_after_the_attempt_ended(real_client: AsyncClient) -> None:
    attempt = await start(real_client, PLAIN)
    ok(await open_rung(real_client, attempt["id"], 1))
    ok(await submit(real_client, attempt["id"], passing(PLAIN)))
    ok(await open_rung(real_client, attempt["id"], 1))  # an open rung can be read again
    error(await open_rung(real_client, attempt["id"], 2), 409, "conflict")


def _rung_texts(slug: str) -> dict[int, list[str]]:
    """Text only the given rung reveals."""
    problem = problem_json(slug)
    hints, solution = problem["hints"], problem["solution"]
    starter = {line.strip() for line in problem["starterCode"].splitlines()}
    code_lines = [
        line.strip()
        for line in solution["code"].splitlines()
        if line.strip() and line.strip() not in starter
    ]
    return {
        1: [hints["clarify"]],
        2: [problem["constraintReading"], *(s["meaning"] for s in problem["signals"])],
        3: [hints["approach"], hints["whyNot"], optimal(slug)["twist"]],
        4: list(hints["slots"].values()),
        5: ["# viz:", *code_lines],
        6: [solution["explanation"]],
    }


def _all_text(value: Any) -> str:
    """Every string in a parsed JSON body (keys too), so escaping cannot hide a leak."""
    if isinstance(value, str):
        return value
    if isinstance(value, list):
        return "\n".join(_all_text(item) for item in value)
    if isinstance(value, dict):
        return "\n".join(f"{key}\n{_all_text(item)}" for key, item in value.items())
    return ""


def _assert_hidden(
    response: Response, texts: dict[int, list[str]], rungs: range, where: str
) -> None:
    text = _all_text(response.json())
    for rung in rungs:
        for secret in texts[rung]:
            assert secret not in text, f"{where}: rung {rung} text leaked: {secret[:60]!r}"


async def test_no_rung_content_is_sent_early(real_client: AsyncClient) -> None:
    texts = _rung_texts(PLAIN)
    attempt = await start(real_client, PLAIN)
    url = f"{API}/attempts/{attempt['id']}"
    response = await real_client.get(url, headers=ME)
    _assert_hidden(response, texts, range(1, 7), "new attempt")
    wrong = {"pattern": "stack", "time": "O(n²)", "twist": "push onto a stack"}
    for check in (1, 2):
        response = await check_plan(real_client, attempt["id"], wrong)
        _assert_hidden(response, texts, range(1, 7), f"plan check {check}")
    for rung in range(1, 7):
        response = await open_rung(real_client, attempt["id"], rung)
        _assert_hidden(response, texts, range(rung + 1, 7), f"rung {rung}")
        view = await real_client.get(url, headers=ME)
        _assert_hidden(view, texts, range(rung + 1, 7), f"view after rung {rung}")
        shown = _all_text(view.json())
        for secret in texts[rung]:
            assert secret in shown, f"rung {rung} text missing: {secret[:60]!r}"


async def test_a_given_pattern_reveals_only_rungs_1_and_2(real_client: AsyncClient) -> None:
    texts = _rung_texts("valid-palindrome")
    response = await real_client.post(
        f"{API}/attempts", json={"slug": "valid-palindrome"}, headers=ME
    )
    _assert_hidden(response, texts, range(3, 7), "given pattern")


# ---------------------------------------------------------------- submit


async def test_submit_must_cover_every_test(real_client: AsyncClient) -> None:
    attempt = await start(real_client, PLAIN)
    results = passing(PLAIN)
    missing = [results.pop(), results.pop(0)]
    message = error(await submit(real_client, attempt["id"], results), 422, "validation_error")
    assert message == f"results: no result for test {missing[1]['id']}, {missing[0]['id']}."
    view = ok(await real_client.get(f"{API}/attempts/{attempt['id']}", headers=ME))
    assert (view["status"], view["lastResults"], view["code"]) == (
        "active",
        None,
        attempt["code"],
    )


async def test_failing_submit_keeps_the_attempt_open(
    real_client: AsyncClient, engine: AsyncEngine
) -> None:
    attempt = await start(real_client, PLAIN)
    results = passing(PLAIN)
    results[-1] = {**results[-1], "status": "fail", "got": [], "stdout": ""}
    results.append({"id": "c1", "status": "pass"})  # custom cases are ignored
    body = ok(await submit(real_client, attempt["id"], results, code="draft"))
    assert body == {"passed": False}
    view = ok(await real_client.get(f"{API}/attempts/{attempt['id']}", headers=ME))
    assert (view["status"], view["outcome"], view["code"]) == ("active", None, "draft")
    assert view["lastResults"] == results
    assert (await _attempt_row(engine, attempt["id"]))["submits"] == 1
    assert await db_rows(engine, "select id from review_items") == []
    assert (await _progress(engine, PLAIN) or {})["status"] == "attempted"


async def test_clean_solve(real_client: AsyncClient, engine: AsyncEngine) -> None:
    attempt = await start(real_client, PLAIN)
    ok(
        await real_client.patch(
            f"{API}/attempts/{attempt['id']}", json={"activeSecondsDelta": 90}, headers=ME
        )
    )
    before = _now()
    body = ok(await submit(real_client, attempt["id"], passing(PLAIN), code="solved code"))
    assert set(body) == {"passed", "outcome", "wrapUp"}
    assert (body["passed"], body["outcome"]) == (True, "solved_clean")

    item = await _review_item(engine, PLAIN)
    assert (item["reps"], item["interval_days"], item["resolve"], item["lapses"]) == (
        1,
        3.0,
        False,
        0,
    )
    assert item["ease"] == pytest.approx(2.5)
    assert close_to(item["due_at"], before + timedelta(days=3))
    assert (item["last_grade"], item["last_reviewed_at"]) == (None, None)

    wrap = body["wrapUp"]
    approach = optimal(PLAIN)
    assert wrap == {
        "patternId": "hashing",
        "patternName": "Hash map and counting",
        "twist": approach["twist"],
        "maxRung": 0,
        "planRightFirstTime": False,
        "timeSeconds": 90,
        "related": [
            {
                "slug": link["slug"],
                "title": problem_json(link["slug"])["title"],
                "relation": link["relation"],
                "status": "new",
            }
            for link in problem_json(PLAIN)["related"]
        ],
        "nextReviewAt": wrap["nextReviewAt"],
        "nextProblemSlug": "two-sum",
    }
    assert datetime.fromisoformat(wrap["nextReviewAt"]) == item["due_at"]

    progress = await _progress(engine, PLAIN)
    assert progress is not None
    assert (progress["status"], progress["best_rung"]) == ("solved", 0)
    assert close_to(progress["first_solved_at"], before)
    assert close_to(progress["last_attempt_at"], before)
    days = await db_rows(engine, "select day from activity_days")
    assert days == [{"day": before.date()}] or days == [{"day": _now().date()}]

    view = ok(await real_client.get(f"{API}/attempts/{attempt['id']}", headers=ME))
    assert (view["status"], view["outcome"], view["code"]) == (
        "finished",
        "solved_clean",
        "solved code",
    )
    row = await _attempt_row(engine, attempt["id"])
    assert close_to(row["finished_at"], before)
    error(await submit(real_client, attempt["id"], passing(PLAIN)), 409, "conflict")


@pytest.mark.parametrize(
    ("rungs", "outcome", "days", "resolve"),
    [
        (2, "solved_clean", 3, False),
        (3, "solved_with_help", 1, False),
        (5, "solved_with_help", 1, False),
        (6, "solved_with_solution", 1, True),
    ],
)
async def test_outcome_follows_the_max_rung(
    real_client: AsyncClient,
    engine: AsyncEngine,
    rungs: int,
    outcome: str,
    days: int,
    resolve: bool,
) -> None:
    before = _now()
    body = await solve(real_client, PLAIN, rungs=rungs)
    assert body["outcome"] == outcome
    assert body["wrapUp"]["maxRung"] == rungs
    item = await _review_item(engine, PLAIN)
    assert item["resolve"] is resolve
    assert item["interval_days"] == days
    assert close_to(item["due_at"], before + timedelta(days=days))
    assert (await _progress(engine, PLAIN) or {})["best_rung"] == rungs


async def test_best_rung_keeps_the_lowest_and_mastered_stays(
    real_client: AsyncClient, engine: AsyncEngine
) -> None:
    await solve(real_client, PLAIN, rungs=4)
    await solve(real_client, PLAIN, rungs=1)
    await solve(real_client, PLAIN, rungs=6)
    progress = await _progress(engine, PLAIN)
    assert progress is not None
    assert (progress["status"], progress["best_rung"]) == ("solved", 1)
    first_solved = progress["first_solved_at"]

    await db_execute(engine, "update problem_progress set status = 'mastered'")
    await solve(real_client, PLAIN)
    progress = await _progress(engine, PLAIN)
    assert progress is not None
    assert (progress["status"], progress["best_rung"]) == ("mastered", 0)
    assert progress["first_solved_at"] == first_solved


async def test_next_problem_follows_roadmap_order(real_client: AsyncClient) -> None:
    assert (await solve(real_client, "two-sum"))["wrapUp"]["nextProblemSlug"] == "valid-anagram"
    # Two hashing problems solved unlock two pointers and stack, but group-anagrams comes first.
    assert (await solve(real_client, "valid-anagram"))["wrapUp"][
        "nextProblemSlug"
    ] == "group-anagrams"
    wrap = (await solve(real_client, "group-anagrams"))["wrapUp"]
    assert wrap["nextProblemSlug"] == "valid-palindrome"
    assert {r["slug"]: r["status"] for r in wrap["related"]} == {
        "valid-anagram": "solved",
        "two-sum": "solved",
    }


async def test_wrap_up_skips_related_problems_without_a_page(
    engine: AsyncEngine, tmp_path: Any
) -> None:
    documents = fixture_documents()
    documents["problems/two-sum.json"]["related"].append(
        {"slug": "two-sum-iii", "relation": "Not written yet."}
    )
    application = create_app(make_settings(content_dir=write_documents(tmp_path, documents)))
    async with AsyncClient(transport=ASGITransport(app=application), base_url="http://t") as client:
        attempt = await start(client, "two-sum")
        results = [
            {"id": t["id"], "status": "pass"} for t in documents["problems/two-sum.json"]["tests"]
        ]
        body = ok(await submit(client, attempt["id"], results))
    await application.state.engine.dispose()
    assert [r["slug"] for r in body["wrapUp"]["related"]] == ["valid-anagram"]


# ---------------------------------------------------------------- end, restart, reviews


async def test_giving_up(real_client: AsyncClient, engine: AsyncEngine) -> None:
    attempt = await start(real_client, PLAIN)
    before = _now()
    url = f"{API}/attempts/{attempt['id']}/end"
    assert ok(await real_client.post(url, json={"reason": "gave_up"}, headers=ME)) == {
        "outcome": "gave_up"
    }
    view = ok(await real_client.get(f"{API}/attempts/{attempt['id']}", headers=ME))
    assert (view["status"], view["outcome"]) == ("finished", "gave_up")
    item = await _review_item(engine, PLAIN)
    assert (item["resolve"], item["reps"], item["interval_days"]) == (True, 0, 1.0)
    assert close_to(item["due_at"], before + timedelta(days=1))
    progress = await _progress(engine, PLAIN)
    assert progress is not None
    assert (progress["status"], progress["best_rung"], progress["first_solved_at"]) == (
        "attempted",
        None,
        None,
    )
    assert len(await db_rows(engine, "select day from activity_days")) == 1
    error(await real_client.post(url, json={"reason": "gave_up"}, headers=ME), 409, "conflict")


@pytest.mark.parametrize("body", [{}, {"reason": "bored"}])
async def test_end_needs_the_reason(real_client: AsyncClient, body: dict[str, Any]) -> None:
    attempt = await start(real_client, PLAIN)
    response = await real_client.post(f"{API}/attempts/{attempt['id']}/end", json=body, headers=ME)
    error(response, 422, "validation_error")


async def test_a_failure_resets_an_existing_review_item(
    real_client: AsyncClient, engine: AsyncEngine
) -> None:
    await solve(real_client, PLAIN)
    attempt = await start(real_client, PLAIN)
    before = _now()
    ok(
        await real_client.post(
            f"{API}/attempts/{attempt['id']}/end", json={"reason": "gave_up"}, headers=ME
        )
    )
    item = await _review_item(engine, PLAIN)
    assert (item["reps"], item["lapses"], item["interval_days"], item["resolve"]) == (
        0,
        1,
        1.0,
        True,
    )
    assert item["ease"] == pytest.approx(2.3)
    assert item["last_grade"] == "again"
    assert close_to(item["due_at"], before + timedelta(days=1))
    assert await db_rows(engine, "select id from review_logs") == []


async def test_a_success_leaves_a_scheduled_item_alone(
    real_client: AsyncClient, engine: AsyncEngine
) -> None:
    await solve(real_client, PLAIN, rungs=3)
    item = await _review_item(engine, PLAIN)
    await solve(real_client, PLAIN)
    assert await _review_item(engine, PLAIN) == item


async def test_a_re_solve_is_the_review_of_a_resolve_item(
    real_client: AsyncClient, engine: AsyncEngine
) -> None:
    attempt = await start(real_client, PLAIN)
    ok(
        await real_client.post(
            f"{API}/attempts/{attempt['id']}/end", json={"reason": "gave_up"}, headers=ME
        )
    )
    before = _now()
    body = await solve(real_client, PLAIN)
    item = await _review_item(engine, PLAIN)
    assert (item["resolve"], item["last_grade"], item["reps"]) == (False, "good", 1)
    assert 0.9 - 1e-6 <= item["interval_days"] <= 1.1 + 1e-6  # stored as float4
    assert datetime.fromisoformat(body["wrapUp"]["nextReviewAt"]) == item["due_at"]
    logs = await db_rows(engine, "select * from review_logs")
    assert len(logs) == 1
    log = logs[0]
    assert (log["grade"], log["interval_before"], log["interval_after"]) == (
        "good",
        1.0,
        item["interval_days"],
    )
    assert log["item_id"] == item["id"]
    assert log["answer"]["outcome"] == "solved_clean"
    assert close_to(log["created_at"], before)


async def test_start_over_abandons_the_attempt(
    real_client: AsyncClient, engine: AsyncEngine
) -> None:
    old = await start(real_client, "two-sum")
    ok(await real_client.patch(f"{API}/attempts/{old['id']}", json={"code": "messy"}, headers=ME))
    new = ok(await real_client.post(f"{API}/attempts/{old['id']}/restart", headers=ME))
    assert set(new) == ATTEMPT_KEYS
    assert new["id"] != old["id"]
    assert (new["status"], new["code"]) == ("active", problem_json("two-sum")["starterCode"])
    abandoned = ok(await real_client.get(f"{API}/attempts/{old['id']}", headers=ME))
    assert (abandoned["status"], abandoned["outcome"], abandoned["code"]) == (
        "abandoned",
        "abandoned",
        "messy",
    )
    assert (await start(real_client, "two-sum"))["id"] == new["id"]
    assert await db_rows(engine, "select id from review_items") == []
    assert await db_rows(engine, "select day from activity_days") == []
    # Changes to the abandoned attempt are refused.
    error(await open_rung(real_client, old["id"], 3), 409, "conflict")
    error(
        await real_client.post(
            f"{API}/attempts/{old['id']}/predictions",
            json={"predictions": [{"id": "p1", "correct": True}]},
            headers=ME,
        ),
        409,
        "conflict",
    )


async def test_start_over_after_solving_keeps_the_solve(real_client: AsyncClient) -> None:
    attempt = await start(real_client, PLAIN)
    ok(await submit(real_client, attempt["id"], passing(PLAIN)))
    new = ok(await real_client.post(f"{API}/attempts/{attempt['id']}/restart", headers=ME))
    assert new["id"] != attempt["id"]
    old = ok(await real_client.get(f"{API}/attempts/{attempt['id']}", headers=ME))
    assert (old["status"], old["outcome"]) == ("finished", "solved_clean")


async def test_activity_day_uses_the_profile_time_zone(
    real_client: AsyncClient, engine: AsyncEngine
) -> None:
    attempt = await start(real_client, PLAIN)
    zone = "Pacific/Kiritimati"  # UTC+14: usually already tomorrow
    await db_execute(engine, "update profiles set timezone = :z", z=zone)
    ok(await submit(real_client, attempt["id"], passing(PLAIN)))
    finished = (await _attempt_row(engine, attempt["id"]))["finished_at"]
    days = await db_rows(engine, "select day from activity_days")
    assert days == [{"day": finished.astimezone(ZoneInfo(zone)).date()}]
    assert isinstance(days[0]["day"], date)


# ---------------------------------------------------------------- predictions


async def test_predictions_keep_the_first_answer(
    real_client: AsyncClient, engine: AsyncEngine
) -> None:
    attempt = await start(real_client, PLAIN)
    url = f"{API}/attempts/{attempt['id']}/predictions"
    first = [{"id": "p1", "correct": True}, {"id": "p2", "correct": False}]
    assert ok(await real_client.post(url, json={"predictions": first}, headers=ME)) == {"ok": True}
    again = [{"id": "p1", "correct": False}, {"id": "p3", "correct": True}]
    ok(await real_client.post(url, json={"predictions": again}, headers=ME))
    row = await _attempt_row(engine, attempt["id"])
    assert row["predictions"] == [
        {"id": "p1", "correct": True},
        {"id": "p2", "correct": False},
        {"id": "p3", "correct": True},
    ]
    # After a solve the walkthrough can still report to the finished attempt.
    ok(await submit(real_client, attempt["id"], passing(PLAIN)))
    ok(
        await real_client.post(
            url, json={"predictions": [{"id": "p4", "correct": True}]}, headers=ME
        )
    )
    too_many = [{"id": f"p{n}", "correct": True} for n in range(51)]
    error(
        await real_client.post(url, json={"predictions": too_many}, headers=ME),
        422,
        "validation_error",
    )


def test_openapi_lists_the_m3_routes() -> None:
    """The OpenAPI schema is built lazily; the union and model types must convert."""
    application = create_app(make_settings(content_dir=REAL_CONTENT))
    paths = application.openapi()["paths"]
    assert {
        "/api/v1/attempts",
        "/api/v1/attempts/{attempt_id}",
        "/api/v1/attempts/{attempt_id}/plan",
        "/api/v1/attempts/{attempt_id}/hints",
        "/api/v1/attempts/{attempt_id}/submit",
        "/api/v1/attempts/{attempt_id}/end",
        "/api/v1/attempts/{attempt_id}/restart",
        "/api/v1/attempts/{attempt_id}/predictions",
        "/api/v1/problems/{slug}/walkthrough",
        "/api/v1/problems/{slug}/notes",
        "/api/v1/guest/problems/{slug}/plan",
        "/api/v1/guest/problems/{slug}/hints/{rung}",
        "/api/v1/guest/import",
    } <= set(paths)

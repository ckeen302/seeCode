"""Review endpoints (Sections 6.7, 11.3-11.5 and 16.2, signed in) on the real content/.

Covers auth, ownership (404), validation, the queue (due by the end of the user's day,
oldest first, at most 20, interleaved, stable on refetch), the grade rules, the
self-rating flow, scheduling with fixed randomness (M5 acceptance), re-solve items
answered in the Workspace, mastery, toolkit items and activity days.
"""

import random
from datetime import UTC, datetime, timedelta
from typing import Any

import pytest
from fastapi import FastAPI
from httpx import AsyncClient, Response
from sqlalchemy.ext.asyncio import AsyncEngine

from app.learning.activity import end_of_day
from app.learning.scheduling import ReviewState, schedule
from tests.api_helpers import (
    API,
    ME,
    OTHER,
    db_execute,
    db_rows,
    error,
    ok,
    passing,
    problem_json,
    solve,
    start,
    submit,
)
from tests.learning_helpers import (
    USER_ID,
    WRONG_PLAN,
    FixedRandom,
    add_item,
    review_item,
    right_plan,
    set_status,
    sign_in,
)

SOME_ID = "4a0b7a5e-3c1d-4e2f-9a8b-7c6d5e4f3a2b"
# two-sum: right pattern and time, nothing else: 0.625 with the twist left out.
BORDERLINE = {"pattern": "hashing", "structures": [], "time": "O(n)", "space": "O(1)", "twist": ""}
CARD_KEYS = {"slug", "summary", "examples", "constraints", "targets"}


def _now() -> datetime:
    return datetime.now(UTC)


def _ago(hours: float) -> datetime:
    return _now() - timedelta(hours=hours)


async def queue(client: AsyncClient, **params: Any) -> list[dict[str, Any]]:
    return ok(await client.get(f"{API}/review/queue", params=params, headers=ME))  # type: ignore[no-any-return]


async def answer(
    client: AsyncClient,
    item_id: Any,
    given: Any,
    seconds: float = 30.0,
    headers: dict[str, str] = ME,
) -> Response:
    return await client.post(
        f"{API}/review/{item_id}/answer",
        json={"answer": given, "seconds": seconds},
        headers=headers,
    )


async def rate(
    client: AsyncClient, item_id: Any, rating: str, headers: dict[str, str] = ME
) -> Response:
    return await client.post(
        f"{API}/review/{item_id}/rate", json={"rating": rating}, headers=headers
    )


def expected_after(
    item: dict[str, Any], grade: str, factor: float = 1.0
) -> tuple[int, float, float, int]:
    """(reps, ease, interval, lapses) the Section 11.4 function gives for a stored item."""
    state = ReviewState(
        due_at=item["due_at"],
        interval_days=item["interval_days"],
        ease=item["ease"],
        reps=item["reps"],
        lapses=item["lapses"],
    )
    schedule(state, grade, _now(), FixedRandom(factor))  # type: ignore[arg-type]
    return state.reps, state.ease, state.interval_days, state.lapses


def assert_scheduled(item: dict[str, Any], expected: tuple[int, float, float, int]) -> None:
    reps, ease, interval, lapses = expected
    assert item["reps"] == reps
    assert item["ease"] == pytest.approx(ease, abs=1e-5)
    assert item["interval_days"] == pytest.approx(interval, abs=1e-5)  # stored as float4
    assert item["lapses"] == lapses
    assert item["last_reviewed_at"] is not None
    assert item["due_at"] - item["last_reviewed_at"] == timedelta(days=interval)


# ---------------------------------------------------------------- auth, ownership, validation


@pytest.mark.parametrize(
    ("method", "path", "body"),
    [
        ("GET", "/review/queue", None),
        ("POST", f"/review/{SOME_ID}/answer", {"answer": {}, "seconds": 1}),
        ("POST", f"/review/{SOME_ID}/rate", {"rating": "good"}),
        ("GET", "/today", None),
        ("GET", "/stats", None),
    ],
)
async def test_review_today_and_stats_require_sign_in(
    real_client: AsyncClient, method: str, path: str, body: dict[str, Any] | None
) -> None:
    response = await real_client.request(method, f"{API}{path}", json=body)
    assert error(response, 401, "unauthorized") == "Sign in to continue."


async def test_another_users_item_is_not_found(
    real_client: AsyncClient, engine: AsyncEngine
) -> None:
    await sign_in(real_client)
    item_id = await add_item(engine, "problem_plan", "two-sum", _ago(1))
    await sign_in(real_client, OTHER)
    assert ok(await real_client.get(f"{API}/review/queue", headers=OTHER)) == []
    message = error(await answer(real_client, item_id, BORDERLINE, headers=OTHER), 404, "not_found")
    assert message == "Review item not found."
    error(await rate(real_client, item_id, "good", headers=OTHER), 404, "not_found")
    error(await answer(real_client, SOME_ID, BORDERLINE), 404, "not_found")
    error(await rate(real_client, SOME_ID, "good"), 404, "not_found")
    item = await review_item(engine, "problem_plan", "two-sum")
    assert (item["reps"], item["pending"], item["last_reviewed_at"]) == (0, None, None)


async def test_answers_and_ratings_are_validated(
    real_client: AsyncClient, engine: AsyncEngine
) -> None:
    await sign_in(real_client)
    item_id = await add_item(engine, "problem_plan", "two-sum", _ago(1))
    url = f"{API}/review/{item_id}/answer"
    for body in (
        {"answer": BORDERLINE},
        {"answer": BORDERLINE, "seconds": -1},
        {"answer": "hashing", "seconds": 3},
        {"seconds": 3},
    ):
        error(await real_client.post(url, json=body, headers=ME), 422, "validation_error")
    message = error(
        await answer(real_client, item_id, {**BORDERLINE, "structures": ["trie"]}),
        422,
        "validation_error",
    )
    assert message == "answer.structures: unknown structure 'trie'."
    error(await rate(real_client, item_id, "easy"), 422, "validation_error")
    error(
        await real_client.get(f"{API}/review/queue?limit=21", headers=ME), 422, "validation_error"
    )
    error(await answer(real_client, "not-a-uuid", BORDERLINE), 422, "validation_error")
    assert (await review_item(engine, "problem_plan", "two-sum"))["reps"] == 0


# ---------------------------------------------------------------- the queue


async def test_queue_cards(
    real_app: FastAPI, real_client: AsyncClient, engine: AsyncEngine
) -> None:
    await sign_in(real_client)
    problem_id = await add_item(engine, "problem_plan", "ransom-note", _ago(5))
    toolkit_id = await add_item(engine, "toolkit", "counter", _ago(4))
    cards = await queue(real_client)
    assert [card["itemId"] for card in cards] == [str(problem_id), str(toolkit_id)]

    problem_card = cards[0]
    assert set(problem_card) == {"itemId", "kind", "resolve", "problem", "hasWorkspace"}
    assert (problem_card["kind"], problem_card["resolve"]) == ("problem_plan", False)
    assert problem_card["hasWorkspace"] is False  # drill-only: nowhere to re-solve it
    assert set(problem_card["problem"]) == CARD_KEYS
    statement = problem_json("ransom-note")
    assert problem_card["problem"]["slug"] == "ransom-note"
    assert problem_card["problem"]["summary"] == statement["summary"]
    assert problem_card["problem"]["targets"] == statement["targets"]
    assert statement["title"] not in str(problem_card)

    toolkit_card = cards[1]
    assert set(toolkit_card) == {"itemId", "kind", "resolve", "toolkit"}
    assert toolkit_card["kind"] == "toolkit"
    prompt = toolkit_card["toolkit"]
    counter = real_app.state.content.toolkit_by_id["counter"]
    assert prompt["toolkitId"] == "counter"
    assert prompt["phrase"] in counter.phrases
    assert len(set(prompt["options"])) == 4
    assert counter.tool in prompt["options"]
    # Refetching shows the same phrase and options.
    assert await queue(real_client) == cards


async def test_queue_holds_items_due_by_the_end_of_the_users_day(
    real_client: AsyncClient, engine: AsyncEngine
) -> None:
    await sign_in(real_client)
    zone = "Pacific/Kiritimati"
    await db_execute(engine, "update profiles set timezone = :z", z=zone)
    end = end_of_day(_now(), zone)
    later_today = await add_item(engine, "problem_plan", "two-sum", end - timedelta(minutes=1))
    await add_item(engine, "problem_plan", "valid-anagram", end + timedelta(minutes=1))
    await add_item(engine, "problem_plan", "no-longer-in-content", _ago(1))
    await add_item(engine, "toolkit", "no-such-card", _ago(1))
    assert [card["itemId"] for card in await queue(real_client)] == [str(later_today)]


async def test_queue_is_oldest_first_and_interleaved(
    real_client: AsyncClient, engine: AsyncEngine
) -> None:
    await sign_in(real_client)
    due = [
        ("problem_plan", "two-sum"),  # hashing
        ("problem_plan", "valid-anagram"),  # hashing
        ("problem_plan", "group-anagrams"),  # hashing
        ("problem_plan", "valid-palindrome"),  # two pointers
        ("toolkit", "lower"),  # no pattern
        ("problem_plan", "valid-parentheses"),  # stack
    ]
    for hours, (kind, ref) in zip(range(60, 0, -10), due, strict=False):
        await add_item(engine, kind, ref, _ago(hours))
    cards = await queue(real_client)
    refs = [card["problem"]["slug"] if "problem" in card else "lower" for card in cards]
    assert refs == [
        "two-sum",
        "valid-palindrome",
        "valid-anagram",
        "lower",
        "group-anagrams",
        "valid-parentheses",
    ]


async def test_queue_holds_at_most_20_items(
    real_app: FastAPI, real_client: AsyncClient, engine: AsyncEngine
) -> None:
    await sign_in(real_client)
    slugs = [p.slug for p in real_app.state.content.problems_by_slug.values()][:25]
    for hours, slug in enumerate(slugs):
        await add_item(engine, "problem_plan", slug, _ago(100 - hours))  # first is oldest
    cards = await queue(real_client)
    assert len(cards) == 20
    assert {card["problem"]["slug"] for card in cards} == set(slugs[:20])
    five = await queue(real_client, limit=5)
    assert {card["problem"]["slug"] for card in five} == set(slugs[:5])


# ---------------------------------------------------------------- answering problem plans


async def test_a_quick_right_plan_is_easy(
    real_app: FastAPI, real_client: AsyncClient, engine: AsyncEngine
) -> None:
    await sign_in(real_client)
    real_app.state.rng = FixedRandom(1.0)
    item_id = await add_item(engine, "problem_plan", "two-sum", _ago(1))
    before = await review_item(engine, "problem_plan", "two-sum")
    result = ok(await answer(real_client, item_id, right_plan("two-sum"), seconds=12.0))
    assert set(result) == {
        "planGrade",
        "correct",
        "needsSelfRating",
        "grade",
        "nextDueAt",
        "signals",
        "title",
    }
    assert (result["correct"], result["needsSelfRating"], result["grade"]) == (True, False, "easy")
    assert result["title"] == "Two Sum"
    assert result["planGrade"]["reveal"]["patternId"] == "hashing"
    item = await review_item(engine, "problem_plan", "two-sum")
    assert_scheduled(item, expected_after(before, "easy"))
    assert (item["last_grade"], item["pending"]) == ("easy", None)
    assert datetime.fromisoformat(result["nextDueAt"]) == item["due_at"]

    logs = await db_rows(engine, "select * from review_logs")
    assert len(logs) == 1
    log = logs[0]
    assert (log["grade"], log["interval_before"], log["seconds"]) == ("easy", 1.0, 12.0)
    assert log["interval_after"] == pytest.approx(item["interval_days"])
    assert log["answer"]["pattern"] == "hashing"
    assert log["plan_grade"] == result["planGrade"]
    assert log["item_id"] == item["id"]
    assert len(await db_rows(engine, "select day from activity_days")) == 1
    # Rescheduled: no longer due today.
    assert await queue(real_client) == []
    message = error(await answer(real_client, item_id, right_plan("two-sum")), 409, "conflict")
    assert message == "This item is not due yet."


@pytest.mark.parametrize(
    ("plan", "seconds", "grade"),
    [
        ("right", 25.0, "easy"),
        ("right", 25.5, "good"),
        ("wrong", 5.0, "again"),
    ],
)
async def test_grades_move_due_at_by_the_schedule(
    real_app: FastAPI,
    real_client: AsyncClient,
    engine: AsyncEngine,
    plan: str,
    seconds: float,
    grade: str,
) -> None:
    """M5 acceptance: review grades move due_at by the scheduling function (fixed fuzz)."""
    await sign_in(real_client)
    real_app.state.rng = FixedRandom(1.1)
    item_id = await add_item(
        engine, "problem_plan", "valid-anagram", _ago(2), interval_days=3.0, reps=2
    )
    before = await review_item(engine, "problem_plan", "valid-anagram")
    given = right_plan("valid-anagram") if plan == "right" else WRONG_PLAN
    result = ok(await answer(real_client, item_id, given, seconds=seconds))
    assert (result["grade"], result["needsSelfRating"]) == (grade, False)
    item = await review_item(engine, "problem_plan", "valid-anagram")
    assert_scheduled(item, expected_after(before, grade, 1.1))
    assert datetime.fromisoformat(result["nextDueAt"]) == item["due_at"]


async def test_a_borderline_answer_waits_for_the_users_rating(
    real_app: FastAPI, real_client: AsyncClient, engine: AsyncEngine
) -> None:
    await sign_in(real_client)
    real_app.state.rng = FixedRandom(1.0)
    item_id = await add_item(engine, "problem_plan", "two-sum", _ago(1), interval_days=3.0, reps=1)
    before = await review_item(engine, "problem_plan", "two-sum")

    result = ok(await answer(real_client, item_id, BORDERLINE, seconds=40.0))
    assert set(result) == {"planGrade", "correct", "needsSelfRating", "signals", "title"}
    assert (result["correct"], result["needsSelfRating"]) == (False, True)
    assert result["planGrade"]["score"] == 0.625
    waiting = await review_item(engine, "problem_plan", "two-sum")
    assert (waiting["due_at"], waiting["reps"], waiting["last_grade"]) == (
        before["due_at"],
        1,
        None,
    )
    assert waiting["pending"]["answer"]["pattern"] == "hashing"
    assert waiting["pending"]["planGrade"] == result["planGrade"]
    assert waiting["pending"]["seconds"] == 40.0
    assert await db_rows(engine, "select id from review_logs") == []
    # Still due, still in the queue.
    assert [card["itemId"] for card in await queue(real_client)] == [str(item_id)]

    rated = ok(await rate(real_client, item_id, "good"))
    assert set(rated) == {"grade", "nextDueAt"}
    assert rated["grade"] == "good"
    item = await review_item(engine, "problem_plan", "two-sum")
    assert_scheduled(item, expected_after(before, "good"))
    assert (item["pending"], item["last_grade"]) == (None, "good")
    assert datetime.fromisoformat(rated["nextDueAt"]) == item["due_at"]
    logs = await db_rows(engine, "select * from review_logs")
    assert [(log["grade"], log["seconds"], log["interval_before"]) for log in logs] == [
        ("good", 40.0, 3.0)
    ]
    assert logs[0]["plan_grade"] == result["planGrade"]
    assert logs[0]["answer"]["space"] == "O(1)"

    message = error(await rate(real_client, item_id, "good"), 409, "conflict")
    assert message == "There is no answer waiting for a rating."


async def test_a_hard_rating(
    real_app: FastAPI, real_client: AsyncClient, engine: AsyncEngine
) -> None:
    await sign_in(real_client)
    real_app.state.rng = FixedRandom(0.9)
    item_id = await add_item(engine, "problem_plan", "two-sum", _ago(1), interval_days=10.0, reps=3)
    before = await review_item(engine, "problem_plan", "two-sum")
    assert ok(await answer(real_client, item_id, BORDERLINE))["needsSelfRating"] is True
    assert ok(await rate(real_client, item_id, "hard"))["grade"] == "hard"
    item = await review_item(engine, "problem_plan", "two-sum")
    assert_scheduled(item, expected_after(before, "hard", 0.9))
    assert item["interval_days"] == pytest.approx(10.8)  # 10 x 1.2 x 0.9


async def test_answering_again_replaces_a_waiting_answer(
    real_client: AsyncClient, engine: AsyncEngine
) -> None:
    await sign_in(real_client)
    item_id = await add_item(engine, "problem_plan", "two-sum", _ago(1))
    ok(await answer(real_client, item_id, BORDERLINE, seconds=50.0))
    result = ok(await answer(real_client, item_id, right_plan("two-sum"), seconds=60.0))
    assert result["grade"] == "good"
    assert (await review_item(engine, "problem_plan", "two-sum"))["pending"] is None
    error(await rate(real_client, item_id, "good"), 409, "conflict")


async def test_rating_without_an_answer_is_refused(
    real_client: AsyncClient, engine: AsyncEngine
) -> None:
    await sign_in(real_client)
    item_id = await add_item(engine, "problem_plan", "two-sum", _ago(1))
    error(await rate(real_client, item_id, "good"), 409, "conflict")
    assert (await review_item(engine, "problem_plan", "two-sum"))["reps"] == 0


async def test_a_drill_only_problem_can_be_reviewed(
    real_client: AsyncClient, engine: AsyncEngine
) -> None:
    await sign_in(real_client)
    item_id = await add_item(engine, "problem_plan", "ransom-note", _ago(1))
    result = ok(await answer(real_client, item_id, right_plan("ransom-note"), seconds=40))
    assert (result["grade"], result["title"]) == ("good", problem_json("ransom-note")["title"])


# ---------------------------------------------------------------- toolkit items


async def test_toolkit_items(
    real_app: FastAPI, real_client: AsyncClient, engine: AsyncEngine
) -> None:
    await sign_in(real_client)
    real_app.state.rng = FixedRandom(1.0)
    lower = await add_item(engine, "toolkit", "lower", _ago(2))
    zip_id = await add_item(engine, "toolkit", "zip", _ago(1), interval_days=4.0, reps=2)
    zip_before = await review_item(engine, "toolkit", "zip")
    card = real_app.state.content.toolkit_by_id["lower"]

    right = ok(await answer(real_client, lower, {"tool": ".lower()"}, seconds=4))
    assert right == {
        "correct": True,
        "needsSelfRating": False,
        "grade": "good",
        "nextDueAt": right["nextDueAt"],
        "tool": card.tool,
        "example": card.example,
    }
    item = await review_item(engine, "toolkit", "lower")
    assert (item["last_grade"], item["reps"]) == ("good", 1)

    wrong = ok(await answer(real_client, zip_id, {"tool": "enumerate()"}, seconds=9))
    assert (wrong["correct"], wrong["grade"]) == (False, "again")
    item = await review_item(engine, "toolkit", "zip")
    assert_scheduled(item, expected_after(zip_before, "again"))
    logs = await db_rows(
        engine, "select answer, plan_grade, grade from review_logs order by created_at"
    )
    assert logs == [
        {"answer": {"tool": ".lower()"}, "plan_grade": None, "grade": "good"},
        {"answer": {"tool": "enumerate()"}, "plan_grade": None, "grade": "again"},
    ]
    item_id = await add_item(engine, "toolkit", "join", _ago(1))
    message = error(await answer(real_client, item_id, {"choice": 2}), 422, "validation_error")
    assert message == "answer.tool: Field required"


# ---------------------------------------------------------------- re-solve items


async def test_a_re_solve_item_is_answered_in_the_workspace(
    real_client: AsyncClient, engine: AsyncEngine
) -> None:
    attempt = await start(real_client, "group-anagrams")
    url = f"{API}/attempts/{attempt['id']}/end"
    ok(await real_client.post(url, json={"reason": "gave_up"}, headers=ME))
    await db_execute(engine, "update review_items set due_at = now() - interval '1 hour'")
    item = await review_item(engine, "problem_plan", "group-anagrams")
    cards = await queue(real_client)
    assert [(card["itemId"], card["resolve"]) for card in cards] == [(str(item["id"]), True)]
    assert (cards[0]["problem"]["slug"], cards[0]["hasWorkspace"]) == ("group-anagrams", True)

    message = error(await answer(real_client, item["id"], BORDERLINE), 409, "conflict")
    assert message == "Solve this problem again in the Workspace to review it."

    attempt = await start(real_client, "group-anagrams")
    ok(await submit(real_client, attempt["id"], passing("group-anagrams")))
    item = await review_item(engine, "problem_plan", "group-anagrams")
    assert (item["resolve"], item["last_grade"], item["reps"]) == (False, "good", 1)
    logs = await db_rows(engine, "select grade, answer from review_logs")
    assert logs == [
        {"grade": "good", "answer": {"attemptId": attempt["id"], "outcome": "solved_clean"}}
    ]
    assert item["due_at"] > _now()


async def test_an_attempt_that_resets_an_item_drops_a_waiting_answer(
    real_client: AsyncClient, engine: AsyncEngine
) -> None:
    await sign_in(real_client)
    item_id = await add_item(engine, "problem_plan", "two-sum", _ago(1), interval_days=3.0, reps=2)
    ok(await answer(real_client, item_id, BORDERLINE))
    attempt = await start(real_client, "two-sum")
    url = f"{API}/attempts/{attempt['id']}/end"
    ok(await real_client.post(url, json={"reason": "gave_up"}, headers=ME))
    item = await review_item(engine, "problem_plan", "two-sum")
    assert (item["pending"], item["resolve"], item["last_grade"]) == (None, True, "again")
    error(await rate(real_client, item_id, "good"), 409, "conflict")


# ---------------------------------------------------------------- mastery (11.3)


async def _progress_status(engine: AsyncEngine, slug: str) -> str:
    rows = await db_rows(
        engine,
        "select status from problem_progress where user_id = :u and problem_slug = :s",
        u=USER_ID,
        s=slug,
    )
    return str(rows[0]["status"])


@pytest.mark.parametrize(
    ("rungs", "interval", "plan", "mastered"),
    [
        (0, 7.5, "right", True),  # solved clean, good review after a 7.5-day wait
        (0, 6.0, "borderline-good", True),  # self-rated good counts too
        (0, 3.0, "right", False),  # too short a wait
        (3, 7.5, "right", False),  # never solved clean
        (0, 7.5, "borderline-hard", False),  # hard is not good
    ],
)
async def test_a_good_review_after_six_days_masters_a_clean_solve(
    real_client: AsyncClient,
    engine: AsyncEngine,
    rungs: int,
    interval: float,
    plan: str,
    mastered: bool,
) -> None:
    await solve(real_client, "two-sum", rungs=rungs)
    await db_execute(
        engine,
        "update review_items set interval_days = :i, due_at = now() - interval '1 hour'",
        i=interval,
    )
    item = await review_item(engine, "problem_plan", "two-sum")
    if plan == "right":
        result = ok(await answer(real_client, item["id"], right_plan("two-sum"), seconds=40))
        assert result["grade"] == "good"
    else:
        assert ok(await answer(real_client, item["id"], BORDERLINE))["needsSelfRating"]
        ok(await rate(real_client, item["id"], plan.split("-")[1]))
    assert await _progress_status(engine, "two-sum") == ("mastered" if mastered else "solved")
    if mastered:
        body = ok(await real_client.get(f"{API}/content/problems", headers=ME))
        statuses = {row["slug"]: row["status"] for row in body}
        assert statuses["two-sum"] == "mastered"


async def test_mastery_needs_the_clean_solve_before_the_review(
    real_client: AsyncClient, engine: AsyncEngine
) -> None:
    await sign_in(real_client)
    item_id = await add_item(engine, "problem_plan", "valid-anagram", _ago(1), interval_days=7.0)
    await set_status(engine, "valid-anagram", "solved")  # e.g. imported, no clean attempt
    ok(await answer(real_client, item_id, right_plan("valid-anagram"), seconds=60))
    assert await _progress_status(engine, "valid-anagram") == "solved"


async def test_reviews_count_for_the_streak(real_client: AsyncClient, engine: AsyncEngine) -> None:
    await sign_in(real_client)
    item_id = await add_item(engine, "problem_plan", "two-sum", _ago(1))
    ok(await answer(real_client, item_id, BORDERLINE))
    days = await db_rows(engine, "select user_id from activity_days")
    assert days == [{"user_id": USER_ID}]


def test_openapi_lists_the_review_today_stats_and_me_routes(real_app: FastAPI) -> None:
    assert isinstance(real_app.state.rng, random.Random)
    assert real_app.state.supabase_admin is None  # no service role key in tests
    paths = real_app.openapi()["paths"]
    assert {
        "/api/v1/review/queue",
        "/api/v1/review/{item_id}/answer",
        "/api/v1/review/{item_id}/rate",
        "/api/v1/today",
        "/api/v1/stats",
        "/api/v1/me/export",
    } <= set(paths)

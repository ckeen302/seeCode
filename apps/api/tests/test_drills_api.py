"""Drill endpoints (Sections 6.6, 11.7 and 16.2, signed in) on the real content/ folder.

Covers auth, validation, ownership (404), the drill pool (unlocked patterns only, Workspace
and drill-only problems), cards that never carry answers, the run and repeat rules with
fixed randomness, the filter split, grading, review items left by misses (due tomorrow),
repeated answers, finishing (the summary and "Add missed to review"), and activity days.
"""

import json
import random
from collections import Counter
from datetime import UTC, datetime, timedelta
from typing import Any
from zoneinfo import ZoneInfo

import pytest
from fastapi import FastAPI
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncEngine

from app.content.store import ContentStore
from app.learning.drills import longest_run
from tests.api_helpers import API, ME, OTHER, close_to, db_execute, db_rows, error, ok, solve
from tests.learning_helpers import (
    USER_ID,
    WRONG_PLAN,
    add_item,
    answer,
    finish,
    review_item,
    review_items,
    right_plan,
    sign_in,
    start_drill,
    unlock_all,
)

RECOGNITION_KEYS = {"id", "mode", "slug", "summary", "examples", "constraints", "targets"}
TOOLKIT_KEYS = {"id", "mode", "toolkitId", "phrase", "options"}
SOME_ID = "4a0b7a5e-3c1d-4e2f-9a8b-7c6d5e4f3a2b"


def _now() -> datetime:
    return datetime.now(UTC)


def content_of(app: FastAPI) -> ContentStore:
    store: ContentStore = app.state.content
    return store


def pattern_of(app: FastAPI, slug: str) -> str:
    return content_of(app).problems_by_slug[slug].pattern_id


def pool_of(app: FastAPI, *patterns: str) -> set[str]:
    content = content_of(app)
    return {p.slug for pattern in patterns for p in content.all_problems_by_pattern[pattern]}


# ---------------------------------------------------------------- auth and validation


@pytest.mark.parametrize(
    ("method", "path", "body"),
    [
        ("POST", "/drills/sessions", {"mode": "recognition", "size": 10}),
        (
            "POST",
            f"/drills/sessions/{SOME_ID}/answers",
            {"cardId": "c1", "answer": {}, "seconds": 1},
        ),
        ("POST", f"/drills/sessions/{SOME_ID}/finish", None),
    ],
)
async def test_drills_require_sign_in(
    real_client: AsyncClient, method: str, path: str, body: dict[str, Any] | None
) -> None:
    response = await real_client.request(method, f"{API}{path}", json=body)
    assert error(response, 401, "unauthorized") == "Sign in to continue."


@pytest.mark.parametrize(
    ("body", "message"),
    [
        ({"mode": "speed", "size": 10}, "mode:"),
        ({"mode": "recognition", "size": 0}, "size:"),
        ({"mode": "recognition", "size": 31}, "size:"),
        ({"mode": "recognition"}, "size:"),
        ({"mode": "recognition", "size": 10, "patternFilter": "graphs"}, "patternFilter: unknown"),
        ({"mode": "recognition", "size": 10, "patternFilter": "stack"}, "patternFilter: this"),
        ({"mode": "toolkit", "size": 10, "patternFilter": "binary_search"}, "patternFilter: this"),
    ],
)
async def test_session_requests_are_validated(
    real_client: AsyncClient, body: dict[str, Any], message: str
) -> None:
    response = await real_client.post(f"{API}/drills/sessions", json=body, headers=ME)
    assert error(response, 422, "validation_error").startswith(message)


# ---------------------------------------------------------------- recognition sessions


async def test_a_new_users_pool_is_the_first_pattern(
    real_app: FastAPI, real_client: AsyncClient
) -> None:
    body = await start_drill(real_client, size=10)
    assert set(body) == {"sessionId", "cards"}
    slugs = [card["slug"] for card in body["cards"]]
    # Only hashing is unlocked: its Workspace and drill-only problems, each once.
    assert set(slugs) == pool_of(real_app, "hashing")
    assert len(slugs) == len(set(slugs)) == 10
    assert {card["slug"] for card in body["cards"]} & {"reverse-string", "two-sum-ii"} == set()
    assert [card["id"] for card in body["cards"]] == [f"c{n}" for n in range(1, 11)]


async def test_recognition_cards_never_carry_answers(
    real_app: FastAPI, real_client: AsyncClient, engine: AsyncEngine
) -> None:
    await sign_in(real_client)
    await unlock_all(engine)
    response = await real_client.post(
        f"{API}/drills/sessions", json={"mode": "recognition", "size": 30}, headers=ME
    )
    body = ok(response)
    content = content_of(real_app)
    for card in body["cards"]:
        assert set(card) == RECOGNITION_KEYS
        assert card["mode"] == "recognition"
        problem = content.problems_by_slug[card["slug"]]
        assert card["summary"] == problem.summary
        assert card["constraints"] == list(problem.constraints)
        assert card["targets"] == {"time": problem.targets.time, "space": problem.targets.space}
        assert [e["input"] for e in card["examples"]] == [e.input for e in problem.examples]
    raw = response.text
    for key in ("title", "patternId", "approaches", "signals", "twist", "hints", "solution"):
        assert f'"{key}"' not in raw
    for card in body["cards"]:
        title = content.problems_by_slug[card["slug"]].title
        assert title not in json.dumps(card), card["slug"]


@pytest.mark.parametrize("seed", range(8))
async def test_ten_card_sessions_follow_the_rules(
    real_app: FastAPI, real_client: AsyncClient, engine: AsyncEngine, seed: int
) -> None:
    """M5 acceptance: never the same pattern three times in a row, never a problem twice."""
    await sign_in(real_client)
    await unlock_all(engine)
    real_app.state.rng = random.Random(seed)
    for _ in range(3):
        cards = (await start_drill(real_client, size=10))["cards"]
        slugs = [card["slug"] for card in cards]
        assert len(slugs) == len(set(slugs)) == 10
        assert longest_run(pattern_of(real_app, slug) for slug in slugs) <= 2


async def test_a_pattern_filter_gives_70_percent(
    real_app: FastAPI, real_client: AsyncClient, engine: AsyncEngine
) -> None:
    await sign_in(real_client)
    await unlock_all(engine)
    real_app.state.rng = random.Random(1)
    for _ in range(5):
        cards = (await start_drill(real_client, size=10, pattern_filter="sliding_window"))["cards"]
        patterns = [pattern_of(real_app, card["slug"]) for card in cards]
        assert Counter(patterns)["sliding_window"] == 7
        assert longest_run(patterns) <= 2
        assert len({card["slug"] for card in cards}) == 10


async def test_the_same_seed_deals_the_same_session(
    real_app: FastAPI, real_client: AsyncClient, engine: AsyncEngine
) -> None:
    await sign_in(real_client)
    await unlock_all(engine)
    real_app.state.rng = random.Random(99)
    first = [c["slug"] for c in (await start_drill(real_client))["cards"]]
    real_app.state.rng = random.Random(99)
    assert [c["slug"] for c in (await start_drill(real_client))["cards"]] == first


async def test_a_pattern_with_solved_problems_is_drillable_before_it_unlocks(
    real_app: FastAPI, real_client: AsyncClient, engine: AsyncEngine
) -> None:
    await solve(real_client, "koko-eating-bananas")  # binary search, opened directly
    cards = (await start_drill(real_client, size=30, pattern_filter="binary_search"))["cards"]
    assert {pattern_of(real_app, c["slug"]) for c in cards} == {"binary_search", "hashing"}
    assert len(cards) == 21


async def test_session_row_records_the_cards(real_client: AsyncClient, engine: AsyncEngine) -> None:
    body = await start_drill(real_client, size=5)
    rows = await db_rows(engine, "select * from drill_sessions")
    assert len(rows) == 1
    row = rows[0]
    assert (row["mode"], row["size"], row["pattern_filter"], row["finished_at"]) == (
        "recognition",
        5,
        None,
        None,
    )
    assert row["cards"] == [{"id": c["id"], "slug": c["slug"]} for c in body["cards"]]
    assert row["add_missed"] is True


# ---------------------------------------------------------------- answering


async def test_a_right_answer(
    real_app: FastAPI, real_client: AsyncClient, engine: AsyncEngine
) -> None:
    body = await start_drill(real_client, size=3)
    card = body["cards"][0]
    plan = right_plan(card["slug"])
    feedback = ok(await answer(real_client, body["sessionId"], card["id"], plan, seconds=14.5))
    assert set(feedback) == {"correct", "planGrade", "signals", "title"}
    problem = content_of(real_app).problems_by_slug[card["slug"]]
    assert feedback["correct"] is True
    assert feedback["title"] == problem.title
    assert feedback["signals"] == [
        {"phrase": s.phrase, "meaning": s.meaning, "pointsTo": s.points_to} for s in problem.signals
    ]
    grade = feedback["planGrade"]
    assert (grade["approachId"], grade["score"], grade["correct"]) == ("optimal", 1.0, True)
    assert grade["reveal"]["patternId"] == problem.pattern_id
    assert await review_items(engine) == []

    rows = await db_rows(engine, "select * from drill_answers")
    assert len(rows) == 1
    row = rows[0]
    assert (row["mode"], row["problem_slug"], row["pattern_id"], row["toolkit_id"]) == (
        "recognition",
        card["slug"],
        problem.pattern_id,
        None,
    )
    assert (row["correct"], row["seconds"], row["overtime"]) == (True, 14.5, False)
    assert row["answer"]["pattern"] == plan["pattern"]
    assert row["grade"] == grade
    days = await db_rows(engine, "select day from activity_days")
    assert days == [{"day": _now().date()}] or days == [{"day": row["created_at"].date()}]


async def test_drill_grading_makes_the_twist_optional_and_never_nudges(
    real_client: AsyncClient,
) -> None:
    body = await start_drill(real_client, size=3)
    card = body["cards"][0]
    plan = {**right_plan(card["slug"]), "twist": ""}
    grade = ok(await answer(real_client, body["sessionId"], card["id"], plan))["planGrade"]
    assert (grade["score"], grade["correct"]) == (1.0, True)
    assert "feedback" not in grade["fields"]["twist"]

    card = body["cards"][1]
    grade = ok(await answer(real_client, body["sessionId"], card["id"], WRONG_PLAN))["planGrade"]
    assert grade["correct"] is False
    for field in ("pattern", "structures", "time", "space"):
        assert "nudge" not in grade["fields"][field]
    assert grade["reveal"] is not None
    assert "missing" in grade["fields"]["structures"]


async def test_a_miss_creates_a_review_item_due_tomorrow(
    real_client: AsyncClient, engine: AsyncEngine
) -> None:
    """M5 acceptance: missed drills create review items due tomorrow."""
    body = await start_drill(real_client, size=3)
    card = body["cards"][0]
    before = _now()
    feedback = ok(await answer(real_client, body["sessionId"], card["id"], WRONG_PLAN, 40, True))
    assert feedback["correct"] is False
    assert feedback["planGrade"]["score"] == 0.0
    item = await review_item(engine, "problem_plan", card["slug"])
    assert close_to(item["due_at"], before + timedelta(days=1))
    assert (item["interval_days"], item["reps"], item["lapses"], item["resolve"]) == (
        1.0,
        0,
        0,
        False,
    )
    assert item["last_grade"] is None
    row = (await db_rows(engine, "select * from drill_answers"))[0]
    assert (row["correct"], row["overtime"], row["seconds"]) == (False, True, 40.0)
    session = (await db_rows(engine, "select cards from drill_sessions"))[0]
    assert session["cards"][0] == {"id": "c1", "slug": card["slug"], "reviewCreated": True}


async def test_a_miss_leaves_an_existing_problem_item_alone(
    real_client: AsyncClient, engine: AsyncEngine
) -> None:
    await solve(real_client, "group-anagrams")  # item due in 3 days
    before = await review_item(engine, "problem_plan", "group-anagrams")
    for _ in range(4):  # until a session deals group-anagrams
        body = await start_drill(real_client, size=10)
        card = next((c for c in body["cards"] if c["slug"] == "group-anagrams"), None)
        if card is not None:
            break
    assert card is not None
    ok(await answer(real_client, body["sessionId"], card["id"], WRONG_PLAN))
    assert await review_item(engine, "problem_plan", "group-anagrams") == before
    session = (
        await db_rows(
            engine, "select cards from drill_sessions where id = :id", id=body["sessionId"]
        )
    )[0]
    assert all("reviewCreated" not in c for c in session["cards"])


async def test_asking_again_returns_the_first_feedback(
    real_client: AsyncClient, engine: AsyncEngine
) -> None:
    body = await start_drill(real_client, size=3)
    card = body["cards"][0]
    first = ok(await answer(real_client, body["sessionId"], card["id"], WRONG_PLAN))
    again = ok(await answer(real_client, body["sessionId"], card["id"], right_plan(card["slug"])))
    assert again == first
    assert len(await db_rows(engine, "select id from drill_answers")) == 1


async def test_answer_errors(real_client: AsyncClient, engine: AsyncEngine) -> None:
    body = await start_drill(real_client, size=3)
    session_id, card = body["sessionId"], body["cards"][0]
    url = f"{API}/drills/sessions/{session_id}/answers"

    assert error(await answer(real_client, session_id, "c99", WRONG_PLAN), 404, "not_found") == (
        "Drill card not found."
    )
    bad_structure = {**WRONG_PLAN, "structures": ["trie"]}
    message = error(
        await answer(real_client, session_id, card["id"], bad_structure), 422, "validation_error"
    )
    assert message == "answer.structures: unknown structure 'trie'."
    message = error(
        await answer(real_client, session_id, card["id"], {"pattern": "dp"}),
        422,
        "validation_error",
    )
    assert message == "answer.pattern: unknown pattern 'dp'."
    message = error(
        await answer(real_client, session_id, card["id"], {"time": "O(n^2)"}),
        422,
        "validation_error",
    )
    assert message.startswith("answer.time:")
    for payload in (
        {"cardId": card["id"], "answer": WRONG_PLAN, "seconds": -1},
        {"cardId": card["id"], "answer": WRONG_PLAN},
        {"cardId": card["id"], "answer": "plan", "seconds": 3},
        {"answer": WRONG_PLAN, "seconds": 3},
    ):
        error(await real_client.post(url, json=payload, headers=ME), 422, "validation_error")
    assert await db_rows(engine, "select id from drill_answers") == []

    unknown = f"{API}/drills/sessions/{SOME_ID}/answers"
    payload = {"cardId": "c1", "answer": WRONG_PLAN, "seconds": 3}
    assert error(await real_client.post(unknown, json=payload, headers=ME), 404, "not_found") == (
        "Drill session not found."
    )


async def test_another_users_session_is_not_found(
    real_client: AsyncClient, engine: AsyncEngine
) -> None:
    body = await start_drill(real_client, size=3)
    session_id, card = body["sessionId"], body["cards"][0]
    error(
        await answer(real_client, session_id, card["id"], WRONG_PLAN, headers=OTHER),
        404,
        "not_found",
    )
    error(await finish(real_client, session_id, headers=OTHER), 404, "not_found")
    assert await db_rows(engine, "select id from drill_answers") == []
    rows = await db_rows(engine, "select finished_at from drill_sessions")
    assert rows == [{"finished_at": None}]


async def test_a_finished_session_takes_no_new_answers(real_client: AsyncClient) -> None:
    body = await start_drill(real_client, size=3)
    session_id, cards = body["sessionId"], body["cards"]
    first = ok(await answer(real_client, session_id, cards[0]["id"], WRONG_PLAN))
    ok(await finish(real_client, session_id))
    message = error(
        await answer(real_client, session_id, cards[1]["id"], WRONG_PLAN), 409, "conflict"
    )
    assert message == "This drill session has ended."
    # A retry of an answer given before finishing still gets its feedback.
    assert ok(await answer(real_client, session_id, cards[0]["id"], WRONG_PLAN)) == first


# ---------------------------------------------------------------- toolkit sessions


async def test_toolkit_cards(real_app: FastAPI, real_client: AsyncClient) -> None:
    content = content_of(real_app)
    body = await start_drill(real_client, mode="toolkit", size=30)
    tools = {card.tool for card in content.toolkit}
    eligible = {c.id for c in content.toolkit if not c.patterns or "hashing" in c.patterns}
    ids = [card["toolkitId"] for card in body["cards"]]
    # A new user has hashing unlocked: the cards tagged with it, and untagged `cache`.
    assert set(ids) == eligible
    assert "cache" in ids
    assert len(ids) == len(set(ids))
    for card in body["cards"]:
        assert set(card) == TOOLKIT_KEYS
        toolkit = content.toolkit_by_id[card["toolkitId"]]
        assert card["phrase"] in toolkit.phrases
        assert len(card["options"]) == len(set(card["options"])) == 4
        assert toolkit.tool in card["options"]
        assert set(card["options"]) <= tools


async def test_toolkit_answers(
    real_app: FastAPI, real_client: AsyncClient, engine: AsyncEngine
) -> None:
    content = content_of(real_app)
    body = await start_drill(real_client, mode="toolkit", size=3)
    session_id, cards = body["sessionId"], body["cards"]
    right = content.toolkit_by_id[cards[0]["toolkitId"]]
    feedback = ok(await answer(real_client, session_id, cards[0]["id"], {"tool": right.tool}, 4))
    assert feedback == {"correct": True, "tool": right.tool, "example": right.example}
    by_id = ok(
        await answer(real_client, session_id, cards[1]["id"], {"tool": cards[1]["toolkitId"]})
    )
    assert by_id["correct"] is True
    assert await review_items(engine) == []

    missed = content.toolkit_by_id[cards[2]["toolkitId"]]
    before = _now()
    feedback = ok(await answer(real_client, session_id, cards[2]["id"], {"tool": "print()"}))
    assert feedback == {"correct": False, "tool": missed.tool, "example": missed.example}
    item = await review_item(engine, "toolkit", missed.id)
    assert close_to(item["due_at"], before + timedelta(days=1))
    assert (item["interval_days"], item["reps"]) == (1.0, 0)
    rows = await db_rows(engine, "select * from drill_answers order by created_at")
    assert [(r["mode"], r["toolkit_id"], r["problem_slug"], r["pattern_id"]) for r in rows] == [
        ("toolkit", card["toolkitId"], None, None) for card in cards
    ]
    assert rows[2]["answer"] == {"tool": "print()"}
    assert rows[2]["grade"] == {"correct": False}


async def test_toolkit_answer_needs_a_tool(real_client: AsyncClient) -> None:
    body = await start_drill(real_client, mode="toolkit", size=1)
    card = body["cards"][0]
    message = error(
        await answer(real_client, body["sessionId"], card["id"], {}), 422, "validation_error"
    )
    assert message == "answer.tool: Field required"


async def test_due_toolkit_cards_come_first_and_misses_reset_them(
    real_client: AsyncClient, engine: AsyncEngine
) -> None:
    await sign_in(real_client)
    now = _now()
    # Due items: zip (older) and split (tagged stack only, still due: it comes too).
    await add_item(engine, "toolkit", "split", now - timedelta(hours=1), interval_days=6.0, reps=3)
    await add_item(engine, "toolkit", "zip", now - timedelta(days=2), interval_days=6.0, reps=3)
    await add_item(engine, "toolkit", "lower", now + timedelta(days=3))  # not due
    body = await start_drill(real_client, mode="toolkit", size=5)
    ids = [card["toolkitId"] for card in body["cards"]]
    assert ids[:2] == ["zip", "split"]
    assert len(ids) == len(set(ids)) == 5

    ok(await answer(real_client, body["sessionId"], "c1", {"tool": "nope"}))
    item = await review_item(engine, "toolkit", "zip")
    assert (item["reps"], item["lapses"], item["interval_days"], item["last_grade"]) == (
        0,
        1,
        1.0,
        "again",
    )
    session = (await db_rows(engine, "select cards from drill_sessions"))[0]
    assert "reviewCreated" not in session["cards"][0]
    # A due card answered in a drill is its review.
    ok(await answer(real_client, body["sessionId"], "c2", {"tool": ".split()"}, seconds=6))
    item = await review_item(engine, "toolkit", "split")
    assert (item["reps"], item["last_grade"]) == (4, "good")
    logs = await db_rows(
        engine, "select grade, answer, seconds from review_logs order by created_at"
    )
    assert logs == [
        {"grade": "again", "answer": {"tool": "nope"}, "seconds": 10.0},
        {"grade": "good", "answer": {"tool": ".split()"}, "seconds": 6.0},
    ]


async def test_a_miss_on_a_card_not_yet_due_resets_it_without_a_review(
    real_client: AsyncClient, engine: AsyncEngine
) -> None:
    await sign_in(real_client)
    await add_item(engine, "toolkit", "zip", _now() + timedelta(days=5), interval_days=8.0, reps=3)
    body = await start_drill(real_client, mode="toolkit", size=30)
    card = next(c for c in body["cards"] if c["toolkitId"] == "zip")
    ok(await answer(real_client, body["sessionId"], card["id"], {"tool": "nope"}))
    item = await review_item(engine, "toolkit", "zip")
    assert (item["reps"], item["lapses"], item["interval_days"]) == (0, 1, 1.0)
    assert await db_rows(engine, "select id from review_logs") == []


async def test_a_toolkit_filter_keeps_the_patterns_cards(
    real_app: FastAPI, real_client: AsyncClient, engine: AsyncEngine
) -> None:
    content = content_of(real_app)
    await sign_in(real_client)
    await add_item(engine, "toolkit", "split", _now() - timedelta(hours=1))  # stack only
    await add_item(engine, "toolkit", "zip", _now() - timedelta(hours=2))  # hashing
    body = await start_drill(real_client, mode="toolkit", size=30, pattern_filter="hashing")
    ids = [card["toolkitId"] for card in body["cards"]]
    assert ids[0] == "zip"
    assert set(ids) == {card.id for card in content.toolkit if "hashing" in card.patterns}
    assert "cache" not in ids


async def test_add_missed_to_review_for_toolkit_cards(
    real_app: FastAPI, real_client: AsyncClient, engine: AsyncEngine
) -> None:
    content = content_of(real_app)
    body = await start_drill(real_client, mode="toolkit", size=2)
    session_id, cards = body["sessionId"], body["cards"]
    ok(await answer(real_client, session_id, "c1", {"tool": "nope"}))
    right = content.toolkit_by_id[cards[1]["toolkitId"]].tool
    ok(await answer(real_client, session_id, "c2", {"tool": right}))
    off = ok(await finish(real_client, session_id, {"addMissedToReview": False}))
    assert [miss["inReview"] for miss in off["missed"]] == [False]
    assert await review_items(engine) == []
    on = ok(await finish(real_client, session_id, {"addMissedToReview": True}))
    assert [miss["inReview"] for miss in on["missed"]] == [True]
    item = await review_item(engine, "toolkit", cards[0]["toolkitId"])
    assert (item["reps"], item["lapses"], item["interval_days"]) == (0, 0, 1.0)


# ---------------------------------------------------------------- finishing


async def test_finish_summarizes_a_recognition_session(
    real_app: FastAPI, real_client: AsyncClient, engine: AsyncEngine
) -> None:
    await sign_in(real_client)
    await unlock_all(engine)
    body = await start_drill(real_client, size=5)
    session_id, cards = body["sessionId"], body["cards"]
    content = content_of(real_app)
    plans = [
        right_plan(cards[0]["slug"]),  # all right, with a twist
        {**right_plan(cards[1]["slug"]), "twist": ""},  # right, no twist
        WRONG_PLAN,
    ]
    seconds = [10.0, 20.0, 45.0]
    for card, plan, spent in zip(cards, plans, seconds, strict=False):
        ok(await answer(real_client, session_id, card["id"], plan, spent, spent > 30))

    before = _now()
    summary = ok(await finish(real_client, session_id))
    assert set(summary) == {
        "sessionId",
        "mode",
        "size",
        "answered",
        "correct",
        "accuracy",
        "medianSeconds",
        "overtime",
        "fields",
        "patterns",
        "missed",
        "addMissedToReview",
        "startedAt",
        "finishedAt",
    }
    assert (summary["sessionId"], summary["mode"], summary["size"]) == (
        session_id,
        "recognition",
        5,
    )
    assert (summary["answered"], summary["correct"], summary["accuracy"]) == (3, 2, 0.6667)
    assert (summary["medianSeconds"], summary["overtime"]) == (20.0, 1)
    assert summary["fields"] == {
        "pattern": {"correct": 2, "total": 3},
        "structures": {"correct": 2, "total": 3},
        "time": {"correct": 2, "total": 3},
        "space": {"correct": 2, "total": 3},
        "twist": {"correct": 1, "total": 1},
    }
    tallies: dict[str, list[int]] = {}
    for card, right in zip(cards[:3], [True, True, False], strict=False):
        tally = tallies.setdefault(pattern_of(real_app, card["slug"]), [0, 0])
        tally[0] += 1
        tally[1] += right
    order = [p.id for p in content.patterns]
    assert summary["patterns"] == [
        {
            "patternId": pattern_id,
            "patternName": content.patterns_by_id[pattern_id].name,
            "answered": tallies[pattern_id][0],
            "correct": tallies[pattern_id][1],
        }
        for pattern_id in sorted(tallies, key=order.index)
    ]
    missed_slug = cards[2]["slug"]
    assert summary["missed"] == [
        {
            "cardId": "c3",
            "slug": missed_slug,
            "title": content.problems_by_slug[missed_slug].title,
            "patternId": pattern_of(real_app, missed_slug),
            "inReview": True,
        }
    ]
    assert summary["addMissedToReview"] is True
    assert close_to(datetime.fromisoformat(summary["finishedAt"]), before)

    # Finishing again changes nothing.
    again = ok(await finish(real_client, session_id))
    assert again == summary


async def test_add_missed_to_review_can_be_turned_off_and_on(
    real_app: FastAPI, real_client: AsyncClient, engine: AsyncEngine
) -> None:
    await solve(real_client, "two-sum")  # two-sum already has an item
    real_app.state.rng = random.Random(5)
    for _ in range(30):  # until a session deals two-sum
        body = await start_drill(real_client, size=4)
        slugs = [card["slug"] for card in body["cards"]]
        if "two-sum" in slugs:
            break
    assert "two-sum" in slugs
    session_id, cards = body["sessionId"], body["cards"]
    for card in cards:
        ok(await answer(real_client, session_id, card["id"], WRONG_PLAN))
    summary = ok(await finish(real_client, session_id))
    assert all(miss["inReview"] for miss in summary["missed"])
    count = len(await review_items(engine))

    off = ok(await finish(real_client, session_id, {"addMissedToReview": False}))
    assert off["addMissedToReview"] is False
    in_review = {miss["slug"]: miss["inReview"] for miss in off["missed"]}
    # Items this session created are gone; two-sum's own item stays.
    assert in_review == {slug: slug == "two-sum" for slug in slugs}
    assert [item["ref"] for item in await review_items(engine)] == ["two-sum"]
    assert count == 4

    on = ok(await finish(real_client, session_id, {"addMissedToReview": True}))
    assert on["addMissedToReview"] is True
    assert all(miss["inReview"] for miss in on["missed"])
    assert len(await review_items(engine)) == count
    assert ok(await finish(real_client, session_id)) == on


async def test_turning_off_keeps_items_that_were_reviewed(
    real_client: AsyncClient, engine: AsyncEngine
) -> None:
    body = await start_drill(real_client, size=2)
    session_id, cards = body["sessionId"], body["cards"]
    for card in cards:
        ok(await answer(real_client, session_id, card["id"], WRONG_PLAN))
    await db_execute(
        engine,
        "update review_items set last_reviewed_at = now() where ref = :r",
        r=cards[0]["slug"],
    )
    off = ok(await finish(real_client, session_id, {"addMissedToReview": False}))
    assert [miss["inReview"] for miss in off["missed"]] == [True, False]


async def test_toolkit_summary(real_app: FastAPI, real_client: AsyncClient) -> None:
    content = content_of(real_app)
    body = await start_drill(real_client, mode="toolkit", size=4)
    session_id, cards = body["sessionId"], body["cards"]
    ok(await answer(real_client, session_id, cards[0]["id"], {"tool": "nope"}, 3))
    right = content.toolkit_by_id[cards[1]["toolkitId"]].tool
    ok(await answer(real_client, session_id, cards[1]["id"], {"tool": right}, 5))
    summary = ok(await finish(real_client, session_id))
    assert (summary["mode"], summary["size"], summary["answered"], summary["correct"]) == (
        "toolkit",
        4,
        2,
        1,
    )
    assert (summary["accuracy"], summary["medianSeconds"]) == (0.5, 4.0)
    assert (summary["fields"], summary["patterns"]) == (None, [])
    toolkit = content.toolkit_by_id[cards[0]["toolkitId"]]
    assert summary["missed"] == [
        {
            "cardId": "c1",
            "toolkitId": toolkit.id,
            "phrase": cards[0]["phrase"],
            "tool": toolkit.tool,
            "inReview": True,
        }
    ]


async def test_an_empty_finish(real_client: AsyncClient) -> None:
    body = await start_drill(real_client, size=2)
    summary = ok(await finish(real_client, body["sessionId"]))
    assert (summary["answered"], summary["accuracy"], summary["medianSeconds"]) == (0, None, None)
    assert summary["missed"] == []
    assert summary["fields"]["pattern"] == {"correct": 0, "total": 0}
    error(await finish(real_client, SOME_ID), 404, "not_found")
    error(
        await finish(real_client, body["sessionId"], {"addMissedToReview": "x"}),
        422,
        "validation_error",
    )


async def test_drill_answers_count_for_the_streak_in_the_users_zone(
    real_client: AsyncClient, engine: AsyncEngine
) -> None:
    await sign_in(real_client)
    zone = "Pacific/Kiritimati"
    await db_execute(engine, "update profiles set timezone = :z", z=zone)
    body = await start_drill(real_client, size=1)
    ok(await answer(real_client, body["sessionId"], "c1", WRONG_PLAN))
    row = (await db_rows(engine, "select created_at from drill_answers"))[0]
    days = await db_rows(engine, "select user_id, day from activity_days")
    assert days == [
        {"user_id": USER_ID, "day": row["created_at"].astimezone(ZoneInfo(zone)).date()}
    ]


def test_openapi_lists_the_drill_routes(real_app: FastAPI) -> None:
    paths = real_app.openapi()["paths"]
    assert {
        "/api/v1/drills/sessions",
        "/api/v1/drills/sessions/{session_id}/answers",
        "/api/v1/drills/sessions/{session_id}/finish",
    } <= set(paths)

"""GET /stats (Section 6.8) on the real content/ folder: per-pattern progress, the weekly
charts, common plan misses, review retention, streaks and totals."""

from collections import Counter
from datetime import UTC, date, datetime, timedelta
from typing import Any

from fastapi import FastAPI
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncEngine

from app.content.store import ContentStore
from app.learning.activity import week_start
from tests.api_helpers import API, ME, db_execute, ok, open_rungs, solve, start
from tests.learning_helpers import (
    USER_ID,
    WRONG_PLAN,
    add_item,
    answer,
    right_plan,
    sign_in,
    start_drill,
)

STATS_KEYS = {
    "streak",
    "longestStreak",
    "totals",
    "patterns",
    "weeks",
    "commonMisses",
    "reviewRetention",
}
EMPTY_RUNGS = [0] * 7


async def stats(client: AsyncClient) -> dict[str, Any]:
    return ok(await client.get(f"{API}/stats", headers=ME))  # type: ignore[no-any-return]


def content_of(app: FastAPI) -> ContentStore:
    store: ContentStore = app.state.content
    return store


async def test_a_new_users_stats(real_app: FastAPI, real_client: AsyncClient) -> None:
    view = await stats(real_client)
    assert set(view) == STATS_KEYS
    content = content_of(real_app)
    assert view["totals"] == {
        "solved": 0,
        "mastered": 0,
        "problems": len(content.problems),
        "drills": 0,
        "reviews": 0,
        "activeDays": 0,
    }
    assert (view["streak"], view["longestStreak"]) == (0, 0)
    assert [row["patternId"] for row in view["patterns"]] == [p.id for p in content.patterns]
    assert view["patterns"][0] == {
        "patternId": "hashing",
        "patternName": "Hash map and counting",
        "state": "available",
        "solved": 0,
        "mastered": 0,
        "total": 3,
        "medianFirstRung": None,
        "drillAccuracy": None,
        "drillAnswers": 0,
    }
    assert {row["state"] for row in view["patterns"][1:]} == {"locked"}
    weeks = view["weeks"]
    assert len(weeks) == 8
    this_monday = week_start(datetime.now(UTC).date())
    assert [date.fromisoformat(w["weekStart"]) for w in weeks] == [
        this_monday - timedelta(weeks=back) for back in range(7, -1, -1)
    ]
    assert weeks[-1] == {
        "weekStart": this_monday.isoformat(),
        "activeDays": 0,
        "solved": 0,
        "drills": 0,
        "reviews": 0,
        "remembered": 0,
        "medianPlanSeconds": None,
        "firstAttemptRungs": EMPTY_RUNGS,
    }
    assert view["commonMisses"] == []
    assert view["reviewRetention"] == {"reviews": 0, "remembered": 0, "rate": None}


async def test_stats_after_some_work(
    real_app: FastAPI, real_client: AsyncClient, engine: AsyncEngine
) -> None:
    content = content_of(real_app)
    await solve(real_client, "two-sum")  # first attempt, max rung 0 (fading rungs are free)
    await solve(real_client, "two-sum", rungs=6)  # not a first attempt
    await solve(real_client, "valid-anagram", rungs=4)
    attempt = await start(real_client, "group-anagrams")
    await open_rungs(real_client, attempt["id"], 1, 2)
    url = f"{API}/attempts/{attempt['id']}/end"
    ok(await real_client.post(url, json={"reason": "gave_up"}, headers=ME))

    body = await start_drill(real_client, size=3, pattern_filter="hashing")
    cards = body["cards"]
    ok(await answer(real_client, body["sessionId"], "c1", right_plan(cards[0]["slug"]), 12.0))
    ok(await answer(real_client, body["sessionId"], "c2", right_plan(cards[1]["slug"]), 20.0))
    ok(await answer(real_client, body["sessionId"], "c3", WRONG_PLAN, 9.0))

    view = await stats(real_client)
    hashing = view["patterns"][0]
    assert (hashing["state"], hashing["solved"], hashing["total"]) == ("in_progress", 2, 3)
    assert hashing["medianFirstRung"] == 2.0  # first attempts: 0, 4 and 2 (given up)
    assert view["patterns"][1]["state"] == "available"  # two pointers unlocked
    results: dict[str, list[bool]] = {}
    for card, right in zip(cards, (True, True, False), strict=True):
        pattern_id = content.problems_by_slug[card["slug"]].pattern_id
        results.setdefault(pattern_id, []).append(right)
    assert results["hashing"]  # the filter sends 2 of 3 cards to hashing
    for row in view["patterns"]:
        given = results.get(row["patternId"], [])
        accuracy = round(sum(given) / len(given), 4) if given else None
        assert (row["drillAccuracy"], row["drillAnswers"]) == (accuracy, len(given))

    week = view["weeks"][-1]
    assert (week["activeDays"], week["solved"], week["drills"]) == (1, 2, 3)
    assert week["medianPlanSeconds"] == 16.0  # the two right drill answers
    assert week["firstAttemptRungs"] == [1, 0, 1, 0, 1, 0, 0]
    assert view["totals"] == {
        "solved": 2,
        "mastered": 0,
        "problems": len(content.problems),
        "drills": 3,
        "reviews": 0,
        "activeDays": 1,
    }
    assert (view["streak"], view["longestStreak"]) == (1, 1)

    wrong = content.problems_by_slug[cards[2]["slug"]].optimal
    assert wrong is not None
    expected = Counter({("structure", s): 1 for s in wrong.structures})
    expected[("time", wrong.time)] += 1
    expected[("space", wrong.space)] += 1
    misses = {(m["kind"], m["id"]): m["count"] for m in view["commonMisses"]}
    assert misses == dict(expected)
    labels = {m["id"]: m["label"] for m in view["commonMisses"]}
    for structure in wrong.structures:
        assert labels[structure] == content.structure_labels[structure]
    assert labels[wrong.time] in (f"{wrong.time} time", f"{wrong.time} space")


async def test_unrevealed_plan_checks_count_their_missing_structures(
    real_app: FastAPI, real_client: AsyncClient
) -> None:
    attempt = await start(real_client, "group-anagrams")
    plan = {**right_plan("group-anagrams"), "structures": []}
    response = await real_client.post(
        f"{API}/attempts/{attempt['id']}/plan", json={"plan": plan}, headers=ME
    )
    assert "missing" not in ok(response)["grade"]["fields"]["structures"]  # not revealed
    optimal = content_of(real_app).problems_by_slug["group-anagrams"].optimal
    assert optimal is not None
    view = await stats(real_client)
    assert view["commonMisses"] == [
        {
            "kind": "structure",
            "id": structure,
            "label": content_of(real_app).structure_labels[structure],
            "count": 1,
        }
        for structure in sorted(optimal.structures)
    ]


async def test_weeks_bucket_by_the_users_calendar(
    real_client: AsyncClient, engine: AsyncEngine
) -> None:
    body = await start_drill(real_client, size=3)
    for card in body["cards"]:
        ok(await answer(real_client, body["sessionId"], card["id"], WRONG_PLAN))
    await db_execute(
        engine,
        "update drill_answers set created_at = created_at - interval '21 days'"
        " where id = (select id from drill_answers order by created_at limit 1)",
    )
    await db_execute(
        engine,
        "update drill_answers set created_at = created_at - interval '70 days'"
        " where id = (select id from drill_answers order by created_at desc limit 1)",
    )
    weeks = (await stats(real_client))["weeks"]
    assert [w["drills"] for w in weeks] == [0, 0, 0, 0, 1, 0, 0, 1]
    assert (await stats(real_client))["totals"]["drills"] == 3


async def test_review_retention_and_streaks(real_client: AsyncClient, engine: AsyncEngine) -> None:
    await sign_in(real_client)
    now = datetime.now(UTC)
    good = await add_item(engine, "problem_plan", "two-sum", now - timedelta(hours=1))
    again = await add_item(engine, "problem_plan", "valid-anagram", now - timedelta(hours=1))
    for item_id, plan in ((good, right_plan("two-sum")), (again, WRONG_PLAN)):
        response = await real_client.post(
            f"{API}/review/{item_id}/answer",
            json={"answer": plan, "seconds": 40},
            headers=ME,
        )
        ok(response)
    today = datetime.now(UTC).date()
    for back in (1, 2, 5, 6, 7, 8):
        await db_execute(
            engine,
            "insert into activity_days (user_id, day) values (:u, :d) on conflict do nothing",
            u=USER_ID,
            d=today - timedelta(days=back),
        )
    view = await stats(real_client)
    assert view["reviewRetention"] == {"reviews": 2, "remembered": 1, "rate": 0.5}
    assert (view["streak"], view["longestStreak"]) == (3, 4)
    assert view["weeks"][-1]["reviews"] == 2
    assert view["weeks"][-1]["remembered"] == 1
    assert view["totals"]["reviews"] == 2
    assert view["totals"]["activeDays"] == 7

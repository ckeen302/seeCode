"""GET /today (Sections 6.2, 11.8 and 16.3) on the real content/ folder.

Section 26: Today shows the right cards for a new user, a user with reviews due, and a
user with an in-progress attempt. Also the drill card's rules, this week's numbers and
the streak in the user's time zone.
"""

from datetime import UTC, datetime, timedelta
from typing import Any
from zoneinfo import ZoneInfo

from fastapi import FastAPI
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncEngine

from tests.api_helpers import API, ME, db_execute, ok, open_rungs, solve, start
from tests.learning_helpers import (
    USER_ID,
    WRONG_PLAN,
    add_item,
    answer,
    right_plan,
    set_status,
    sign_in,
    start_drill,
)

TODAY_KEYS = {
    "greetingName",
    "streak",
    "reviewsDue",
    "reviewPatterns",
    "continue",
    "drill",
    "week",
    "start",
}


def _now() -> datetime:
    return datetime.now(UTC)


async def today(client: AsyncClient) -> dict[str, Any]:
    return ok(await client.get(f"{API}/today", headers=ME))  # type: ignore[no-any-return]


async def test_a_new_user_gets_the_start_card(real_client: AsyncClient) -> None:
    view = await today(real_client)
    assert set(view) == TODAY_KEYS
    assert view == {
        "greetingName": "Dev",
        "streak": 0,
        "reviewsDue": 0,
        "reviewPatterns": [],
        "continue": {
            "slug": "two-sum",
            "title": "Two Sum",
            "difficulty": "easy",
            "patternId": "hashing",
            "inProgress": False,
            "lastActiveAt": None,
        },
        "drill": {
            "patternId": "hashing",
            "patternName": "Hash map and counting",
            "reason": "You haven't drilled this pattern yet.",
        },
        "week": {"solved": 0, "drills": 0, "reviews": 0, "medianPlanSeconds": None},
        "start": {"patternId": "hashing", "patternName": "Hash map and counting"},
    }


async def test_a_user_with_reviews_due(real_client: AsyncClient, engine: AsyncEngine) -> None:
    await solve(real_client, "two-sum")
    attempt = await start(real_client, "valid-anagram")
    url = f"{API}/attempts/{attempt['id']}/end"
    ok(await real_client.post(url, json={"reason": "gave_up"}, headers=ME))
    await db_execute(engine, "update review_items set due_at = now() - interval '1 hour'")
    await add_item(engine, "problem_plan", "valid-palindrome", _now() - timedelta(minutes=5))
    await add_item(engine, "toolkit", "lower", _now() - timedelta(minutes=1))
    await add_item(engine, "problem_plan", "valid-parentheses", _now() + timedelta(days=3))

    view = await today(real_client)
    assert view["reviewsDue"] == 4
    assert view["reviewPatterns"] == ["hashing", "two_pointers_opposite"]
    assert view["start"] is None
    # two-sum is solved and valid-anagram was given up: the roadmap goes on there.
    assert (view["continue"]["slug"], view["continue"]["inProgress"]) == ("valid-anagram", False)
    assert view["week"]["solved"] == 1


async def test_a_user_with_an_attempt_in_progress(
    real_client: AsyncClient, engine: AsyncEngine
) -> None:
    await solve(real_client, "two-sum")
    attempt = await start(real_client, "group-anagrams")
    view = await today(real_client)
    card = view["continue"]
    assert {k: v for k, v in card.items() if k != "lastActiveAt"} == {
        "slug": "group-anagrams",
        "title": "Group Anagrams",
        "difficulty": "medium",
        "patternId": None,  # not solved yet: its pattern stays hidden
        "inProgress": True,
    }
    assert datetime.fromisoformat(card["lastActiveAt"]) == datetime.fromisoformat(
        attempt["updatedAt"]
    )
    assert view["start"] is None

    # The most recent active attempt wins; a solved problem shows its pattern.
    again = await start(real_client, "two-sum")
    ok(await real_client.patch(f"{API}/attempts/{again['id']}", json={"code": "x"}, headers=ME))
    card = (await today(real_client))["continue"]
    assert (card["slug"], card["patternId"], card["inProgress"]) == ("two-sum", "hashing", True)


async def test_an_attempt_idle_for_14_days_is_not_continued(
    real_client: AsyncClient, engine: AsyncEngine
) -> None:
    await start(real_client, "group-anagrams")
    await db_execute(engine, "update attempts set updated_at = now() - interval '15 days'")
    card = (await today(real_client))["continue"]
    assert (card["slug"], card["inProgress"]) == ("two-sum", False)


async def test_all_problems_solved_leaves_no_roadmap_card(
    real_app: FastAPI, real_client: AsyncClient, engine: AsyncEngine
) -> None:
    await sign_in(real_client)
    for problem in real_app.state.content.problems:
        await set_status(engine, problem.slug, "solved")
    assert (await today(real_client))["continue"] is None


async def test_the_drill_card_names_the_weakest_pattern(real_client: AsyncClient) -> None:
    body = await start_drill(real_client, size=3)
    cards = body["cards"]
    ok(await answer(real_client, body["sessionId"], cards[0]["id"], right_plan(cards[0]["slug"])))
    for card in cards[1:]:
        ok(await answer(real_client, body["sessionId"], card["id"], WRONG_PLAN))
    drill = (await today(real_client))["drill"]
    assert drill == {
        "patternId": "hashing",
        "patternName": "Hash map and counting",
        "reason": "You got 1 of your last 3 drills in this pattern right.",
    }


async def test_the_drill_card_falls_back_to_hints_on_attempts(real_client: AsyncClient) -> None:
    attempt = await start(real_client, "group-anagrams")
    await open_rungs(real_client, attempt["id"], 1, 3)
    drill = (await today(real_client))["drill"]
    assert drill == {
        "patternId": "hashing",
        "patternName": "Hash map and counting",
        "reason": "You needed hints on your last problem in this pattern.",
    }


async def test_this_weeks_numbers(real_client: AsyncClient, engine: AsyncEngine) -> None:
    await solve(real_client, "two-sum")
    await solve(real_client, "two-sum")  # the same problem counts once
    await solve(real_client, "valid-anagram")
    body = await start_drill(real_client, size=4)
    cards = body["cards"]
    for card, seconds in zip(cards[:2], (10.0, 30.0), strict=False):
        ok(
            await answer(
                real_client, body["sessionId"], card["id"], right_plan(card["slug"]), seconds
            )
        )
    ok(await answer(real_client, body["sessionId"], cards[2]["id"], WRONG_PLAN, 5.0))
    ok(
        await answer(
            real_client, body["sessionId"], cards[3]["id"], right_plan(cards[3]["slug"]), 50
        )
    )
    # An answer from 8 days ago is outside the week.
    await db_execute(
        engine,
        "update drill_answers set created_at = now() - interval '8 days' where seconds = 50",
    )
    week = (await today(real_client))["week"]
    assert week == {"solved": 2, "drills": 3, "reviews": 0, "medianPlanSeconds": 20.0}


async def test_the_median_plan_time_counts_first_attempts(real_client: AsyncClient) -> None:
    attempt = await start(real_client, "group-anagrams")
    ok(
        await real_client.patch(
            f"{API}/attempts/{attempt['id']}", json={"activeSecondsDelta": 75}, headers=ME
        )
    )
    plan = right_plan("group-anagrams")
    ok(
        await real_client.post(
            f"{API}/attempts/{attempt['id']}/plan", json={"plan": plan}, headers=ME
        )
    )
    assert (await today(real_client))["week"]["medianPlanSeconds"] == 75.0


async def test_the_streak_counts_days_in_the_users_zone(
    real_client: AsyncClient, engine: AsyncEngine
) -> None:
    await sign_in(real_client)
    zone = "America/Los_Angeles"
    await db_execute(engine, "update profiles set timezone = :z", z=zone)
    local_today = datetime.now(ZoneInfo(zone)).date()

    async def set_days(*days_ago: int) -> None:
        await db_execute(engine, "delete from activity_days")
        for back in days_ago:
            await db_execute(
                engine,
                "insert into activity_days (user_id, day) values (:u, :d)",
                u=USER_ID,
                d=local_today - timedelta(days=back),
            )

    await set_days(0, 1, 2, 4)
    assert (await today(real_client))["streak"] == 3
    await set_days(1, 2)  # nothing yet today: the streak is still alive
    assert (await today(real_client))["streak"] == 2
    await set_days(2, 3)
    assert (await today(real_client))["streak"] == 0


async def test_greeting_uses_the_first_name(real_client: AsyncClient) -> None:
    ok(await real_client.patch(f"{API}/me", json={"displayName": "Ada Lovelace"}, headers=ME))
    assert (await today(real_client))["greetingName"] == "Ada"
    ok(await real_client.patch(f"{API}/me", json={"displayName": None}, headers=ME))
    assert (await today(real_client))["greetingName"] == ""

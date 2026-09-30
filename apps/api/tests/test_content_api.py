"""Public content endpoints (Section 16.2), including the "no answers" guarantee (M1)."""

import json
import uuid
from pathlib import Path
from typing import Any

import pytest
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncEngine

import app.main as main_module
from app.content.store import ContentError, compute_content_version
from app.main import create_app
from tests.conftest import (
    DEV_USER,
    FIXTURE_CONTENT,
    create_auth_user,
    fixture_documents,
    make_settings,
    write_documents,
)

API = "/api/v1/content"
OTHER_USER = "00000000-0000-4000-8000-000000000002"
PROBLEM_PUBLIC_KEYS = {
    "slug",
    "title",
    "leetcodeUrl",
    "difficulty",
    "order",
    "summary",
    "examples",
    "constraints",
    "targets",
    "entry",
    "starterCode",
    "tests",
    "contentVersion",
}
AS_USER = {"X-Dev-User": DEV_USER}


async def _progress(
    engine: AsyncEngine, user: str, rows: dict[str, tuple[str, int | None]]
) -> None:
    """Sign the user up and give them problem_progress rows {slug: (status, best_rung)}."""
    await create_auth_user(engine, uuid.UUID(user))
    async with engine.begin() as conn:
        for slug, (status, best_rung) in rows.items():
            await conn.execute(
                text(
                    "insert into problem_progress"
                    " (user_id, problem_slug, status, best_rung, last_attempt_at)"
                    " values (:user, :slug, :status, :best_rung, '2026-09-01T10:00:00Z')"
                ),
                {"user": uuid.UUID(user), "slug": slug, "status": status, "best_rung": best_rung},
            )


def _answers(slug: str) -> list[str]:
    """Text that only the answer fields of a fixture problem contain."""
    problem = fixture_documents()[f"problems/{slug}.json"]
    texts = [problem["constraintReading"], problem["solution"]["code"], "# viz:"]
    texts += [approach["twist"] for approach in problem["approaches"]]
    texts += [signal["meaning"] for signal in problem["signals"]]
    texts += [problem["hints"][key] for key in ("clarify", "approach", "whyNot")]
    texts += list(problem["hints"]["slots"].values())
    texts += [related["relation"] for related in problem["related"]]
    texts += [event["say"] for event in problem["viz"]["events"]]
    return texts


# ---------------------------------------------------------------- GET /content/problems/{slug}


@pytest.mark.parametrize("headers", [{}, AS_USER])
async def test_problem_detail_never_includes_answers(
    client: AsyncClient, app: FastAPI, headers: dict[str, str]
) -> None:
    response = await client.get(f"{API}/problems/valid-palindrome", headers=headers)
    assert response.status_code == 200
    body = response.json()
    assert set(body) == PROBLEM_PUBLIC_KEYS
    for key in (
        "approaches",
        "signals",
        "hints",
        "solution",
        "viz",
        "constraintReading",
        "related",
    ):
        assert key not in body
    for answer in _answers("valid-palindrome"):
        assert answer not in response.text, answer
    assert body["contentVersion"] == app.state.content.version


async def test_problem_detail_includes_hidden_tests(client: AsyncClient) -> None:
    body = (await client.get(f"{API}/problems/two-sum")).json()
    assert body["entry"] == "twoSum"
    assert body["starterCode"].startswith("class Solution:")
    assert body["targets"] == {"time": "O(n)", "space": "O(n)"}
    assert [(t["id"], t["hidden"]) for t in body["tests"]] == [
        ("e1", False),
        ("e2", False),
        ("h1", True),
        ("h2", True),
        ("h3", True),
    ]
    assert body["tests"][2] == {
        "id": "h1",
        "args": [[-4, 7, 11, 3], -1],
        "expected": [0, 3],
        "hidden": True,
        "compare": "unordered",
    }
    assert body["examples"][1] == {"input": "nums = [6, 6], target = 12", "output": "[0, 1]"}


@pytest.mark.parametrize("slug", ["reverse-string", "does-not-exist"])
async def test_drill_only_and_unknown_problems_are_not_found(
    client: AsyncClient, slug: str
) -> None:
    response = await client.get(f"{API}/problems/{slug}")
    assert response.status_code == 404
    assert response.json() == {"error": {"code": "not_found", "message": "Problem not found."}}


# ---------------------------------------------------------------- GET /content/problems


async def test_problem_list_signed_out_hides_patterns(client: AsyncClient) -> None:
    response = await client.get(f"{API}/problems")
    assert response.status_code == 200
    items = response.json()
    assert [item["slug"] for item in items] == [
        "two-sum",
        "valid-anagram",
        "valid-palindrome",
        "binary-search",
    ]
    assert all(
        set(item) == {"slug", "title", "difficulty", "order", "status", "bestRung", "lastAttemptAt"}
        for item in items
    )
    assert all(item["status"] is None for item in items)
    for answer in _answers("two-sum"):
        assert answer not in response.text


async def test_problem_list_show_patterns(client: AsyncClient) -> None:
    items = (await client.get(f"{API}/problems", params={"showPatterns": "true"})).json()
    assert [item["patternId"] for item in items] == [
        "hashing",
        "hashing",
        "two_pointers_opposite",
        "binary_search",
    ]


async def test_problem_list_shows_patterns_the_user_solved(
    client: AsyncClient, engine: AsyncEngine
) -> None:
    await _progress(
        engine,
        DEV_USER,
        {
            "two-sum": ("solved", 2),
            "valid-anagram": ("attempted", None),
            "binary-search": ("mastered", 0),
            "reverse-string": ("solved", 1),  # drill-only: never listed
        },
    )
    await _progress(engine, OTHER_USER, {"valid-palindrome": ("solved", 1)})
    items = {
        item["slug"]: item for item in (await client.get(f"{API}/problems", headers=AS_USER)).json()
    }
    assert list(items) == ["two-sum", "valid-anagram", "valid-palindrome", "binary-search"]
    assert {slug: item.get("patternId") for slug, item in items.items()} == {
        "two-sum": "hashing",
        "valid-anagram": None,
        "valid-palindrome": None,  # solved by someone else
        "binary-search": "binary_search",
    }
    assert "patternId" not in items["valid-anagram"]
    assert {slug: item["status"] for slug, item in items.items()} == {
        "two-sum": "solved",
        "valid-anagram": "attempted",
        "valid-palindrome": "new",
        "binary-search": "mastered",
    }
    assert items["two-sum"]["bestRung"] == 2
    assert items["two-sum"]["lastAttemptAt"] == "2026-09-01T10:00:00Z"
    assert items["valid-palindrome"]["lastAttemptAt"] is None


async def test_optional_auth_still_rejects_a_bad_token(client: AsyncClient) -> None:
    response = await client.get(f"{API}/problems", headers={"Authorization": "Bearer nope"})
    assert response.status_code == 401


# ---------------------------------------------------------------- patterns


async def test_pattern_list(client: AsyncClient) -> None:
    body = (await client.get(f"{API}/patterns")).json()
    assert [(p["id"], p["problemCount"]) for p in body] == [
        ("hashing", 2),
        ("two_pointers_opposite", 1),
        ("binary_search", 1),
    ]
    assert set(body[0]) == {"id", "family", "name", "idea", "problemCount"}


async def test_pattern_detail_signed_out(client: AsyncClient) -> None:
    response = await client.get(f"{API}/patterns/two_pointers_opposite")
    assert response.status_code == 200
    body = response.json()
    assert set(body) == {
        "id",
        "family",
        "name",
        "idea",
        "explanation",
        "signals",
        "template",
        "slots",
        "variations",
        "mistakes",
        "demo",
        "toolkit",
        "toolkitCards",
        "problemCount",
        "state",
        "progress",
        "problems",
    }
    assert body["state"] == "available"
    assert body["progress"] is None
    assert body["demo"]["viz"]["pointers"][0] == {
        "var": "l",
        "into": "nums",
        "label": "l",
        "color": "a",
    }
    assert body["problems"] == [
        {
            "slug": "valid-palindrome",
            "title": "Valid Palindrome",
            "difficulty": "easy",
            "order": 4,
            "status": None,
        }
    ]


async def test_pattern_detail_shows_twists_of_solved_problems_only(
    client: AsyncClient, engine: AsyncEngine
) -> None:
    await _progress(
        engine, DEV_USER, {"two-sum": ("mastered", 1), "valid-anagram": ("attempted", 3)}
    )
    body = (await client.get(f"{API}/patterns/hashing", headers=AS_USER)).json()
    assert body["state"] == "in_progress"
    assert body["progress"] == {"solved": 1, "mastered": 1}
    two_sum, anagram = body["problems"]
    assert two_sum["twist"] == "Store each value's index; before storing x, look up target minus x."
    assert two_sum["status"] == "mastered"
    assert "twist" not in anagram
    assert anagram["status"] == "attempted"

    signed_out = (await client.get(f"{API}/patterns/hashing")).json()
    assert all("twist" not in problem for problem in signed_out["problems"])


async def test_unknown_pattern_is_not_found(client: AsyncClient) -> None:
    response = await client.get(f"{API}/patterns/stack")
    assert response.status_code == 404
    assert response.json() == {"error": {"code": "not_found", "message": "Pattern not found."}}


# ---------------------------------------------------------------- roadmap


async def test_roadmap_signed_out_is_all_available(client: AsyncClient) -> None:
    body = (await client.get(f"{API}/roadmap")).json()
    assert body["unlockRule"] == {"solvedInPrereq": 2}
    assert [(n["id"], n["state"], n["progress"]) for n in body["patterns"]] == [
        ("hashing", "available", None),
        ("two_pointers_opposite", "available", None),
        ("binary_search", "available", None),
    ]
    assert body["patterns"][2]["prereqs"] == ["two_pointers_opposite"]


async def test_roadmap_signed_in_follows_progress(client: AsyncClient, engine: AsyncEngine) -> None:
    fresh = (await client.get(f"{API}/roadmap", headers=AS_USER)).json()
    assert [n["state"] for n in fresh["patterns"]] == ["available", "locked", "locked"]
    assert fresh["patterns"][0]["progress"] == {"solved": 0, "mastered": 0}

    await _progress(
        engine,
        DEV_USER,
        {
            "two-sum": ("solved", 1),
            "valid-anagram": ("solved", 2),
            "valid-palindrome": ("solved", 0),
        },
    )
    body = (await client.get(f"{API}/roadmap", headers=AS_USER)).json()
    # two_pointers_opposite has one problem, so solving it unlocks binary_search.
    assert [n["state"] for n in body["patterns"]] == ["in_progress", "in_progress", "available"]
    assert [n["progress"] for n in body["patterns"]] == [
        {"solved": 2, "mastered": 0},
        {"solved": 1, "mastered": 0},
        {"solved": 0, "mastered": 0},
    ]


# ---------------------------------------------------------------- structures and toolkit


async def test_structures(client: AsyncClient) -> None:
    body = (await client.get(f"{API}/structures")).json()
    assert len(body) == 12
    assert body[0] == {"id": "array", "label": "Array / string"}


async def test_toolkit(client: AsyncClient) -> None:
    body = (await client.get(f"{API}/toolkit")).json()
    assert body[0] == {
        "id": "lower",
        "tool": ".lower()",
        "phrases": ["ignore letter case", "case-insensitive"],
        "example": "\"MiXeD\".lower()  # 'mixed'",
        "patterns": ["two_pointers_opposite"],
    }


# ---------------------------------------------------------------- app-wide behavior


@pytest.mark.parametrize(
    "path", ["/roadmap", "/patterns", "/patterns/hashing", "/structures", "/toolkit", "/problems"]
)
async def test_content_version_header_matches_the_loaded_content(
    client: AsyncClient, app: FastAPI, path: str
) -> None:
    response = await client.get(f"{API}{path}")
    assert response.status_code == 200
    assert response.headers["x-content-version"] == app.state.content.version
    assert app.state.content_version == compute_content_version(FIXTURE_CONTENT)


async def test_content_routes_are_rate_limited(engine: AsyncEngine) -> None:
    application = create_app(make_settings(rate_limit_per_minute=2))
    async with AsyncClient(transport=ASGITransport(app=application), base_url="http://t") as client:
        statuses = [(await client.get(f"{API}/structures")).status_code for _ in range(3)]
    await application.state.engine.dispose()
    assert statuses == [200, 200, 429]


def test_app_refuses_to_start_on_bad_content(tmp_path: Path) -> None:
    documents = fixture_documents()
    documents["problems/two-sum.json"]["approaches"][0]["id"] = "best"
    content_dir = write_documents(tmp_path, documents)
    with pytest.raises(ContentError) as caught:
        create_app(make_settings(content_dir=content_dir))
    assert 'approaches: exactly one approach must have id "optimal" (found 0)' in str(caught.value)


def test_app_refuses_to_start_without_content(tmp_path: Path) -> None:
    with pytest.raises(ContentError, match="content folder not found"):
        create_app(make_settings(content_dir=tmp_path / "missing"))


def test_uvicorn_app_attribute_is_built_on_first_access(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(main_module, "get_settings", make_settings)
    monkeypatch.delitem(vars(main_module), "app", raising=False)
    built = main_module.app
    assert isinstance(built, FastAPI)
    assert main_module.app is built  # cached after the first access
    assert built.state.content.version == compute_content_version(FIXTURE_CONTENT)
    with pytest.raises(AttributeError):
        _ = main_module.does_not_exist


def test_problem_public_json_round_trips(tmp_path: Path) -> None:
    """Hidden and visible tests survive JSON exactly, including null expectations."""
    documents = fixture_documents()
    test: dict[str, Any] = documents["problems/two-sum.json"]["tests"][4]
    test["expected"] = None
    application = create_app(make_settings(content_dir=write_documents(tmp_path, documents)))
    problem = application.state.content.problem_public("two-sum")
    body = json.loads(problem.model_dump_json(by_alias=True))
    assert body["tests"][4]["expected"] is None

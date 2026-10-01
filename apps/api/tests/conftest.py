"""Shared fixtures. Integration tests need Postgres; set TEST_DATABASE_URL to point at it.

The test database is wiped and migrated from scratch once per run (downgrade to base,
then upgrade to head), so it must be a database used only for tests.

Apps built here load the small content set in tests/fixtures/content, not the real
content/ folder, so authoring changes cannot break unrelated tests. test_real_content.py
checks the real folder.
"""

import json
import os
import time
import uuid
from collections.abc import AsyncIterator, Mapping
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from typing import Any

import jwt
import pytest
from alembic import command
from alembic.config import Config
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncEngine, create_async_engine

from app.config import API_DIR, REPO_ROOT, Settings, normalize_database_url
from app.content.validation import read_content_files
from app.main import create_app

TEST_DATABASE_URL = os.environ.get(
    "TEST_DATABASE_URL", "postgresql+asyncpg://seecode:seecode@localhost:5432/seecode_test"
)
SUPABASE_URL = "https://test-project.supabase.co"
ISSUER = f"{SUPABASE_URL}/auth/v1"
JWT_SECRET = "test-only-hs256-secret-of-at-least-32-bytes"
DEV_USER = "00000000-0000-4000-8000-000000000001"
FIXTURE_CONTENT = Path(__file__).resolve().parent / "fixtures" / "content"
REAL_CONTENT = REPO_ROOT / "content"


def make_settings(**overrides: Any) -> Settings:
    values: dict[str, Any] = {
        "env": "development",
        "auth_dev_bypass": True,
        "database_url": TEST_DATABASE_URL,
        "supabase_url": SUPABASE_URL,
        "supabase_jwt_secret": JWT_SECRET,
        "cors_origins": "http://localhost:3000",
        "content_dir": FIXTURE_CONTENT,
    }
    values.update(overrides)
    return Settings(_env_file=None, **values)  # type: ignore[call-arg]


def make_token(
    sub: uuid.UUID | str,
    *,
    key: Any = JWT_SECRET,
    algorithm: str = "HS256",
    headers: dict[str, Any] | None = None,
    **claims: Any,
) -> str:
    now = int(time.time())
    payload: dict[str, Any] = {
        "sub": str(sub),
        "aud": "authenticated",
        "iss": ISSUER,
        "iat": now,
        "exp": now + 3600,
        "role": "authenticated",
    }
    payload.update(claims)
    return jwt.encode(payload, key, algorithm=algorithm, headers=headers)


def _migrate_from_scratch() -> None:
    config = Config(str(API_DIR / "alembic.ini"))
    config.attributes["database_url"] = TEST_DATABASE_URL
    config.attributes["configure_logger"] = False
    command.downgrade(config, "base")
    command.upgrade(config, "head")


@pytest.fixture(scope="session")
def migrated_database() -> str:
    # Alembic's env.py calls asyncio.run(); keep it off the test event loop's thread.
    with ThreadPoolExecutor(max_workers=1) as pool:
        pool.submit(_migrate_from_scratch).result()
    return TEST_DATABASE_URL


@pytest.fixture(scope="session")
async def session_engine(migrated_database: str) -> AsyncIterator[AsyncEngine]:
    test_engine = create_async_engine(normalize_database_url(migrated_database))
    yield test_engine
    await test_engine.dispose()


@pytest.fixture
async def engine(session_engine: AsyncEngine) -> AsyncIterator[AsyncEngine]:
    """The test database; every table is emptied after the test (users cascade)."""
    yield session_engine
    async with session_engine.begin() as conn:
        await conn.execute(text("truncate auth.users, public.ai_cache cascade"))


@pytest.fixture
async def app(engine: AsyncEngine) -> AsyncIterator[FastAPI]:
    application = create_app(make_settings())
    yield application
    await application.state.engine.dispose()


@pytest.fixture
async def client(app: FastAPI) -> AsyncIterator[AsyncClient]:
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as test_client:
        yield test_client


@pytest.fixture
async def real_app(engine: AsyncEngine) -> AsyncIterator[FastAPI]:
    """An app serving the real content/ folder (attempt and guest tests)."""
    application = create_app(make_settings(content_dir=REAL_CONTENT))
    yield application
    await application.state.engine.dispose()


@pytest.fixture
async def real_client(real_app: FastAPI) -> AsyncIterator[AsyncClient]:
    async with AsyncClient(
        transport=ASGITransport(app=real_app), base_url="http://test"
    ) as test_client:
        yield test_client


async def create_auth_user(
    engine: AsyncEngine, user_id: uuid.UUID, metadata: dict[str, Any] | None = None
) -> None:
    """What Supabase does on sign-up: insert into auth.users (the trigger adds the profile)."""
    async with engine.begin() as conn:
        await conn.execute(
            text(
                "insert into auth.users (id, raw_user_meta_data) values (:id, cast(:meta as jsonb))"
            ),
            {"id": user_id, "meta": json.dumps(metadata or {})},
        )


# ---------------------------------------------------------------- content fixtures


def fixture_documents() -> dict[str, Any]:
    """A fresh parsed copy of the fixture content, by relative path, for tests to modify."""
    return {name: json.loads(raw) for name, raw in read_content_files(FIXTURE_CONTENT).items()}


def encode_documents(documents: Mapping[str, Any]) -> dict[str, bytes]:
    return {
        name: json.dumps(document, ensure_ascii=False).encode()
        for name, document in documents.items()
    }


def write_documents(root: Path, documents: Mapping[str, Any]) -> Path:
    """Write documents as a content folder under `root` and return it."""
    for name, raw in encode_documents(documents).items():
        path = root / name
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(raw)
    return root

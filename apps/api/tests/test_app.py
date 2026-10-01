"""App-wide conventions: health, error envelope, content version, CORS, body limit."""

from pathlib import Path

from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncEngine

from app.content.store import compute_content_version
from app.main import create_app
from tests.conftest import make_settings


async def test_health_reports_ok_and_content_version(client: AsyncClient, app: FastAPI) -> None:
    response = await client.get("/api/v1/health")
    assert response.status_code == 200
    assert response.json() == {"ok": True, "contentVersion": app.state.content_version}
    assert response.headers["x-content-version"] == app.state.content_version


async def test_unknown_route_uses_error_envelope(client: AsyncClient) -> None:
    response = await client.get("/api/v1/does-not-exist")
    assert response.status_code == 404
    assert response.json()["error"]["code"] == "not_found"
    assert "x-content-version" in response.headers


async def test_wrong_method_uses_error_envelope(client: AsyncClient) -> None:
    response = await client.delete("/api/v1/health")
    assert response.status_code == 405
    assert response.json()["error"]["code"] == "not_found"


async def test_request_validation_uses_error_envelope(engine: AsyncEngine) -> None:
    app = create_app(make_settings())

    @app.get("/api/v1/echo")
    async def echo(n: int) -> dict[str, int]:
        return {"n": n}

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.get("/api/v1/echo", params={"n": "abc"})
    await app.state.engine.dispose()
    assert response.status_code == 422
    body = response.json()["error"]
    assert body["code"] == "validation_error"
    assert body["message"].startswith("query.n:")


async def test_unhandled_error_keeps_envelope_and_headers(engine: AsyncEngine) -> None:
    app = create_app(make_settings())

    @app.get("/api/v1/boom")
    async def boom() -> None:
        raise RuntimeError("boom")

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.get("/api/v1/boom", headers={"Origin": "http://localhost:3000"})
    await app.state.engine.dispose()
    assert response.status_code == 500
    assert response.json() == {
        "error": {"code": "internal", "message": "Something went wrong. Please try again."}
    }
    assert response.headers["access-control-allow-origin"] == "http://localhost:3000"
    assert "x-content-version" in response.headers


async def test_cors_preflight_allows_web_origin_and_dev_header(client: AsyncClient) -> None:
    response = await client.options(
        "/api/v1/me",
        headers={
            "Origin": "http://localhost:3000",
            "Access-Control-Request-Method": "GET",
            "Access-Control-Request-Headers": "authorization,x-dev-user",
        },
    )
    assert response.status_code == 200
    assert response.headers["access-control-allow-origin"] == "http://localhost:3000"
    allowed = response.headers["access-control-allow-headers"].lower()
    assert "authorization" in allowed
    assert "x-dev-user" in allowed
    assert "x-content-version" in response.headers


async def test_cors_rejects_unknown_origin(client: AsyncClient) -> None:
    response = await client.get("/api/v1/health", headers={"Origin": "https://evil.example"})
    assert "access-control-allow-origin" not in response.headers


async def test_body_over_limit_is_rejected_by_content_length(client: AsyncClient) -> None:
    response = await client.post("/api/v1/health", content=b"x" * (200 * 1024 + 1))
    assert response.status_code == 413
    assert response.json()["error"]["code"] == "validation_error"


async def test_streamed_body_over_limit_is_rejected(engine: AsyncEngine) -> None:
    app = create_app(make_settings())

    @app.post("/api/v1/upload")
    async def upload(payload: dict[str, str]) -> dict[str, int]:
        return {"size": len(payload)}

    async def chunks():  # type: ignore[no-untyped-def]
        yield b'{"a": "'
        for _ in range(30):
            yield b"x" * 8192
        yield b'"}'

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.post(
            "/api/v1/upload", content=chunks(), headers={"Content-Type": "application/json"}
        )
    await app.state.engine.dispose()
    assert response.status_code == 413
    assert response.json()["error"]["code"] == "validation_error"


def test_openapi_docs_only_in_development() -> None:
    assert create_app(make_settings()).docs_url == "/api/v1/docs"
    production = create_app(make_settings(env="production", auth_dev_bypass=False))
    assert production.docs_url is None
    assert production.openapi_url is None


def test_content_version_is_stable_and_tracks_json_files(tmp_path: Path) -> None:
    empty = compute_content_version(tmp_path / "missing")
    assert empty == compute_content_version(tmp_path)
    (tmp_path / "problems").mkdir()
    (tmp_path / "problems" / "a.json").write_text('{"slug": "a"}')
    first = compute_content_version(tmp_path)
    assert first != empty
    assert first == compute_content_version(tmp_path)
    (tmp_path / "README.md").write_text("not content")
    assert compute_content_version(tmp_path) == first
    (tmp_path / "problems" / "a.json").write_text('{"slug": "b"}')
    assert compute_content_version(tmp_path) != first
    assert len(first) == 12

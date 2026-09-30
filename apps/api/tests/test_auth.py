"""Authentication: Supabase tokens (HS256 and JWKS), dev bypass, and /me."""

import json
import time
import uuid
from typing import Any

import jwt
import pytest
from cryptography.hazmat.primitives.asymmetric import ec
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient
from pydantic import ValidationError
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncEngine

from app.main import create_app
from tests.conftest import DEV_USER, create_auth_user, make_settings, make_token


async def _get_me(app: FastAPI, headers: dict[str, str]) -> Any:
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        return await client.get("/api/v1/me", headers=headers)


# ---------------------------------------------------------------- no credentials


async def test_me_requires_sign_in(client: AsyncClient) -> None:
    response = await client.get("/api/v1/me")
    assert response.status_code == 401
    assert response.json()["error"] == {"code": "unauthorized", "message": "Sign in to continue."}


async def test_non_bearer_scheme_is_rejected(client: AsyncClient) -> None:
    response = await client.get("/api/v1/me", headers={"Authorization": "Basic abc"})
    assert response.status_code == 401


# ---------------------------------------------------------------- dev bypass


async def test_dev_user_gets_a_profile(client: AsyncClient) -> None:
    response = await client.get("/api/v1/me", headers={"X-Dev-User": DEV_USER})
    assert response.status_code == 200
    body = response.json()
    assert body["id"] == DEV_USER
    assert body["displayName"] == "Dev user 0001"
    assert body["timezone"] == "UTC"
    assert body["settings"] == {}
    assert set(body) == {"id", "displayName", "timezone", "settings", "createdAt"}

    again = await client.get("/api/v1/me", headers={"X-Dev-User": DEV_USER})
    assert again.json() == body


async def test_dev_user_must_be_a_uuid(client: AsyncClient) -> None:
    response = await client.get("/api/v1/me", headers={"X-Dev-User": "not-a-uuid"})
    assert response.status_code == 401
    assert response.json()["error"]["message"] == "X-Dev-User must be a UUID."


async def test_dev_header_ignored_when_bypass_off(engine: AsyncEngine) -> None:
    app = create_app(make_settings(auth_dev_bypass=False))
    response = await _get_me(app, {"X-Dev-User": DEV_USER})
    await app.state.engine.dispose()
    assert response.status_code == 401


async def test_dev_header_ignored_in_production(engine: AsyncEngine) -> None:
    app = create_app(make_settings(env="production", auth_dev_bypass=False))
    response = await _get_me(app, {"X-Dev-User": DEV_USER})
    await app.state.engine.dispose()
    assert response.status_code == 401


def test_dev_bypass_refused_in_production() -> None:
    with pytest.raises(ValidationError, match="AUTH_DEV_BYPASS must be false"):
        make_settings(env="production", auth_dev_bypass=True)


# ---------------------------------------------------------------- HS256 (legacy secret)


async def test_supabase_user_sees_profile_made_by_trigger(
    client: AsyncClient, engine: AsyncEngine
) -> None:
    user_id = uuid.uuid4()
    await create_auth_user(engine, user_id, {"full_name": "Ada Lovelace", "name": "ada"})
    token = make_token(user_id, email="ada@example.com")
    response = await client.get("/api/v1/me", headers={"Authorization": f"Bearer {token}"})
    assert response.status_code == 200
    assert response.json()["displayName"] == "Ada Lovelace"


async def test_missing_profile_is_recreated_from_token(
    client: AsyncClient, engine: AsyncEngine
) -> None:
    user_id = uuid.uuid4()
    await create_auth_user(engine, user_id)
    async with engine.begin() as conn:
        await conn.execute(text("delete from public.profiles where id = :id"), {"id": user_id})
    token = make_token(user_id, user_metadata={"name": "Grace"})
    response = await client.get("/api/v1/me", headers={"Authorization": f"Bearer {token}"})
    assert response.status_code == 200
    assert response.json()["displayName"] == "Grace"


@pytest.mark.parametrize(
    ("description", "overrides"),
    [
        ("expired", {"exp": int(time.time()) - 3600}),
        ("wrong audience", {"aud": "anon"}),
        ("wrong issuer", {"iss": "https://other.supabase.co/auth/v1"}),
        ("not a uuid subject", {"sub": "user-123"}),
    ],
)
async def test_invalid_claims_are_rejected(
    client: AsyncClient, description: str, overrides: dict[str, Any]
) -> None:
    sub = overrides.pop("sub", uuid.uuid4())
    token = make_token(sub, **overrides)
    response = await client.get("/api/v1/me", headers={"Authorization": f"Bearer {token}"})
    assert response.status_code == 401, description
    assert response.json()["error"]["code"] == "unauthorized"


async def test_wrong_signature_is_rejected(client: AsyncClient) -> None:
    token = make_token(uuid.uuid4(), key="some-other-secret-that-is-32-bytes-long")
    response = await client.get("/api/v1/me", headers={"Authorization": f"Bearer {token}"})
    assert response.status_code == 401


async def test_unsigned_token_is_rejected(client: AsyncClient) -> None:
    now = int(time.time())
    claims = {"sub": str(uuid.uuid4()), "aud": "authenticated", "exp": now + 60}
    token = jwt.encode(claims, key=None, algorithm="none")
    response = await client.get("/api/v1/me", headers={"Authorization": f"Bearer {token}"})
    assert response.status_code == 401


async def test_missing_expiry_is_rejected(client: AsyncClient) -> None:
    claims = {"sub": str(uuid.uuid4()), "aud": "authenticated", "iss": "x"}
    token = jwt.encode(claims, "test-only-hs256-secret-of-at-least-32-bytes", algorithm="HS256")
    response = await client.get("/api/v1/me", headers={"Authorization": f"Bearer {token}"})
    assert response.status_code == 401


async def test_tokens_rejected_when_supabase_not_configured(engine: AsyncEngine) -> None:
    app = create_app(make_settings(supabase_url=None, supabase_jwt_secret=None))
    response = await _get_me(app, {"Authorization": f"Bearer {make_token(uuid.uuid4())}"})
    await app.state.engine.dispose()
    assert response.status_code == 401
    assert response.json()["error"]["message"] == "Sign-in is not configured on this server."


# ---------------------------------------------------------------- JWKS (asymmetric keys)


@pytest.fixture
def signing_key(monkeypatch: pytest.MonkeyPatch) -> ec.EllipticCurvePrivateKey:
    """An ES256 key served as the project's JWKS (no network)."""
    private_key = ec.generate_private_key(ec.SECP256R1())
    jwk = json.loads(jwt.algorithms.ECAlgorithm.to_jwk(private_key.public_key()))
    jwk.update({"kid": "test-key", "alg": "ES256", "use": "sig"})
    monkeypatch.setattr(jwt.PyJWKClient, "fetch_data", lambda self: {"keys": [jwk]})
    return private_key


async def test_es256_token_verified_with_jwks(
    engine: AsyncEngine, signing_key: ec.EllipticCurvePrivateKey
) -> None:
    user_id = uuid.uuid4()
    await create_auth_user(engine, user_id, {"name": "Katherine"})
    app = create_app(make_settings(supabase_jwt_secret=None))
    token = make_token(user_id, key=signing_key, algorithm="ES256", headers={"kid": "test-key"})
    response = await _get_me(app, {"Authorization": f"Bearer {token}"})
    await app.state.engine.dispose()
    assert response.status_code == 200
    assert response.json()["displayName"] == "Katherine"


async def test_unknown_key_id_is_rejected(
    engine: AsyncEngine, signing_key: ec.EllipticCurvePrivateKey
) -> None:
    app = create_app(make_settings(supabase_jwt_secret=None))
    token = make_token(uuid.uuid4(), key=signing_key, algorithm="ES256", headers={"kid": "other"})
    response = await _get_me(app, {"Authorization": f"Bearer {token}"})
    await app.state.engine.dispose()
    assert response.status_code == 401


async def test_hs256_token_rejected_when_only_jwks_is_configured(
    engine: AsyncEngine, signing_key: ec.EllipticCurvePrivateKey
) -> None:
    app = create_app(make_settings(supabase_jwt_secret=None))
    response = await _get_me(app, {"Authorization": f"Bearer {make_token(uuid.uuid4())}"})
    await app.state.engine.dispose()
    assert response.status_code == 401


async def test_unreachable_jwks_is_a_server_error(
    engine: AsyncEngine, monkeypatch: pytest.MonkeyPatch
) -> None:
    def unreachable(self: jwt.PyJWKClient) -> Any:
        raise jwt.PyJWKClientConnectionError("down")

    monkeypatch.setattr(jwt.PyJWKClient, "fetch_data", unreachable)
    key = ec.generate_private_key(ec.SECP256R1())
    app = create_app(make_settings(supabase_jwt_secret=None))
    token = make_token(uuid.uuid4(), key=key, algorithm="ES256", headers={"kid": "k"})
    response = await _get_me(app, {"Authorization": f"Bearer {token}"})
    await app.state.engine.dispose()
    assert response.status_code == 503
    assert response.json()["error"]["code"] == "internal"

"""Request authentication (Sections 16.1, 20, 22.1).

Signed-in requests carry `Authorization: Bearer <Supabase access token>`. The token is
verified for signature, `exp`, `aud = authenticated` and the project's issuer.
Asymmetric keys come from the project's JWKS; legacy projects can use the HS256 secret.

Local development can set AUTH_DEV_BYPASS=true: with ENV=development the API then
accepts `X-Dev-User: <uuid>` instead of a token.
"""

import asyncio
import json
import uuid
from dataclasses import dataclass
from typing import Annotated, Any, cast

import jwt
from fastapi import Depends, Request
from sqlalchemy import text
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import Settings
from app.db import get_session
from app.errors import ApiError
from app.models import Profile

AUDIENCE = "authenticated"
ASYMMETRIC_ALGORITHMS = frozenset({"ES256", "RS256", "EdDSA"})
CLOCK_SKEW_SECONDS = 10
_KNOWN_PROFILES_MAX = 50_000
_NOT_RESOLVED = object()


@dataclass(frozen=True, slots=True)
class AuthUser:
    id: uuid.UUID
    email: str | None = None
    name: str | None = None
    is_dev: bool = False


def _unauthorized(
    message: str = "Your session is invalid or has expired. Sign in again.",
) -> ApiError:
    return ApiError(401, "unauthorized", message)


class TokenVerifier:
    def __init__(self, settings: Settings) -> None:
        base = settings.supabase_url.rstrip("/") if settings.supabase_url else None
        # Supabase puts `<project URL>/auth/v1` in the `iss` claim.
        self.issuer = f"{base}/auth/v1" if base else None
        jwks_url = settings.supabase_jwks_url or (
            f"{self.issuer}/.well-known/jwks.json" if self.issuer else None
        )
        self._jwks = (
            jwt.PyJWKClient(jwks_url, cache_keys=True, lifespan=600, timeout=5)
            if jwks_url
            else None
        )
        self._secret = settings.supabase_jwt_secret

    @property
    def configured(self) -> bool:
        return self.issuer is not None

    async def verify(self, token: str) -> dict[str, Any]:
        if not self.configured:
            raise _unauthorized("Sign-in is not configured on this server.")
        try:
            algorithm = jwt.get_unverified_header(token).get("alg")
        except jwt.PyJWTError as exc:
            raise _unauthorized() from exc

        key: Any
        if algorithm == "HS256" and self._secret:
            key = self._secret
        elif algorithm in ASYMMETRIC_ALGORITHMS and self._jwks is not None:
            try:
                # The JWKS fetch is blocking I/O (cached after the first call).
                signing_key = await asyncio.to_thread(self._jwks.get_signing_key_from_jwt, token)
            except jwt.PyJWKClientConnectionError as exc:
                raise ApiError(
                    503, "internal", "Could not verify your session right now. Try again."
                ) from exc
            except jwt.PyJWTError as exc:
                raise _unauthorized() from exc
            key = signing_key.key
        else:
            raise _unauthorized()

        try:
            claims: dict[str, Any] = jwt.decode(
                token,
                key,
                algorithms=[algorithm],
                audience=AUDIENCE,
                issuer=self.issuer,
                leeway=CLOCK_SKEW_SECONDS,
                options={"require": ["exp", "sub", "aud", "iss"]},
            )
        except jwt.PyJWTError as exc:
            raise _unauthorized() from exc
        return claims


def user_from_claims(claims: dict[str, Any]) -> AuthUser:
    try:
        user_id = uuid.UUID(str(claims["sub"]))
    except (KeyError, ValueError) as exc:
        raise _unauthorized() from exc
    metadata = claims.get("user_metadata")
    name = None
    if isinstance(metadata, dict):
        name = metadata.get("full_name") or metadata.get("name")
    email = claims.get("email")
    return AuthUser(
        id=user_id,
        email=email if isinstance(email, str) else None,
        name=name if isinstance(name, str) else None,
    )


def dev_user(raw: str) -> AuthUser:
    try:
        user_id = uuid.UUID(raw)
    except ValueError as exc:
        raise _unauthorized("X-Dev-User must be a UUID.") from exc
    return AuthUser(id=user_id, name=f"Dev user {user_id.hex[-4:]}", is_dev=True)


async def _authenticate(request: Request) -> AuthUser | None:
    settings: Settings = request.app.state.settings
    authorization = request.headers.get("authorization")
    if authorization:
        scheme, _, token = authorization.partition(" ")
        if scheme.lower() != "bearer" or not token.strip():
            raise _unauthorized("Send the access token as `Authorization: Bearer <token>`.")
        verifier: TokenVerifier = request.app.state.token_verifier
        return user_from_claims(await verifier.verify(token.strip()))

    raw_dev_user = request.headers.get("x-dev-user")
    if raw_dev_user and settings.dev_bypass_enabled:
        return dev_user(raw_dev_user.strip())
    return None


async def resolve_auth(request: Request) -> AuthUser | None:
    """Authenticate once per request; later calls reuse the result (or the same error)."""
    cached = getattr(request.state, "auth_result", _NOT_RESOLVED)
    if cached is not _NOT_RESOLVED:
        if isinstance(cached, ApiError):
            raise cached
        return cast(AuthUser | None, cached)
    try:
        user = await _authenticate(request)
    except ApiError as exc:
        request.state.auth_result = exc
        raise
    request.state.auth_result = user
    return user


async def ensure_profile(request: Request, session: AsyncSession, user: AuthUser) -> None:
    """Make sure the profile row exists (normally created by the auth.users trigger).

    Dev users have no Supabase account, so they are added to the local `auth.users`
    first; the trigger then creates the profile exactly as it does for real sign-ups.
    """
    known: set[uuid.UUID] = request.app.state.known_profiles
    if user.id in known:
        return
    if user.is_dev:
        await session.execute(
            text(
                "insert into auth.users (id, raw_user_meta_data) "
                "values (:id, cast(:meta as jsonb)) on conflict (id) do nothing"
            ),
            {"id": user.id, "meta": json.dumps({"full_name": user.name})},
        )
    await session.execute(
        pg_insert(Profile)
        .values(id=user.id, display_name=user.name)
        .on_conflict_do_nothing(index_elements=[Profile.id])
    )
    await session.commit()
    if len(known) >= _KNOWN_PROFILES_MAX:
        known.clear()
    known.add(user.id)


async def optional_user(request: Request) -> AuthUser | None:
    return await resolve_auth(request)


async def get_current_user(
    request: Request, session: Annotated[AsyncSession, Depends(get_session)]
) -> AuthUser:
    user = await resolve_auth(request)
    if user is None:
        raise _unauthorized("Sign in to continue.")
    await ensure_profile(request, session, user)
    return user


# Section 16.1 calls this dependency `current_user`; Section 14 calls it `get_current_user`.
current_user = get_current_user

CurrentUser = Annotated[AuthUser, Depends(get_current_user)]
OptionalUser = Annotated[AuthUser | None, Depends(optional_user)]

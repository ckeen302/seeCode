"""App factory: settings, database, middleware, error envelope and routers."""

import logging
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import APIRouter, Depends, FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.auth import TokenVerifier
from app.config import Settings, get_settings
from app.content.store import compute_content_version
from app.db import create_engine, create_sessionmaker
from app.errors import install_error_handlers
from app.middleware import (
    BodySizeLimitMiddleware,
    ContentVersionMiddleware,
    UnhandledErrorMiddleware,
)
from app.ratelimit import TokenBucketLimiter, rate_limit
from app.routers import health, me

API_PREFIX = "/api/v1"


def create_app(settings: Settings | None = None) -> FastAPI:
    settings = settings or get_settings()
    engine = create_engine(settings)

    @asynccontextmanager
    async def lifespan(_: FastAPI) -> AsyncIterator[None]:
        yield
        await engine.dispose()

    is_dev = settings.env == "development"
    app = FastAPI(
        title="SeeCode API",
        version="0.1.0",
        lifespan=lifespan,
        docs_url=f"{API_PREFIX}/docs" if is_dev else None,
        redoc_url=None,
        openapi_url=f"{API_PREFIX}/openapi.json" if is_dev else None,
    )
    app.state.settings = settings
    app.state.engine = engine
    app.state.sessionmaker = create_sessionmaker(engine)
    app.state.content_version = compute_content_version(settings.content_dir)
    app.state.token_verifier = TokenVerifier(settings)
    app.state.rate_limiter = TokenBucketLimiter(settings.rate_limit_per_minute)
    app.state.known_profiles = set()

    install_error_handlers(app)

    # The last middleware added is the outermost.
    app.add_middleware(BodySizeLimitMiddleware)
    app.add_middleware(UnhandledErrorMiddleware)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origin_list,
        allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
        allow_headers=["Authorization", "Content-Type", "X-Dev-User"],
        expose_headers=["X-Content-Version"],
        max_age=600,
    )
    app.add_middleware(ContentVersionMiddleware, version=app.state.content_version)

    api = APIRouter(prefix=API_PREFIX)
    api.include_router(health.router)  # not rate limited: host health checks poll it
    api.include_router(me.router, dependencies=[Depends(rate_limit)])
    app.include_router(api)

    logging.getLogger("seecode.api").info(
        "SeeCode API ready (env=%s, content=%s, dev_bypass=%s)",
        settings.env,
        app.state.content_version,
        settings.dev_bypass_enabled,
    )
    return app


app = create_app()

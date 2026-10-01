from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncEngine

from app.main import create_app
from app.ratelimit import TokenBucketLimiter
from tests.conftest import make_settings


class FakeClock:
    def __init__(self) -> None:
        self.now = 1000.0

    def __call__(self) -> float:
        return self.now


def test_bucket_allows_capacity_then_blocks() -> None:
    clock = FakeClock()
    limiter = TokenBucketLimiter(per_minute=120, clock=clock)
    assert all(limiter.allow("ip:1") for _ in range(120))
    assert not limiter.allow("ip:1")
    assert limiter.allow("ip:2"), "buckets are per key"


def test_bucket_refills_at_the_per_minute_rate() -> None:
    clock = FakeClock()
    limiter = TokenBucketLimiter(per_minute=120, clock=clock)
    for _ in range(120):
        limiter.allow("user:a")
    assert not limiter.allow("user:a")
    assert limiter.retry_after_seconds("user:a") == 1
    clock.now += 0.5  # 120/min = 2 tokens per second
    assert limiter.allow("user:a")
    assert not limiter.allow("user:a")
    clock.now += 60
    assert sum(limiter.allow("user:a") for _ in range(200)) == 120, "never above capacity"


def test_idle_buckets_are_pruned_without_changing_behavior() -> None:
    clock = FakeClock()
    limiter = TokenBucketLimiter(per_minute=60, clock=clock)
    for i in range(10_001):
        limiter.allow(f"ip:{i}")
    clock.now += 61
    limiter.allow("ip:new")
    limiter.allow("ip:newer")
    assert len(limiter._buckets) <= 2


async def test_api_returns_rate_limited_envelope(engine: AsyncEngine) -> None:
    app = create_app(make_settings(rate_limit_per_minute=3))
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        headers = {"X-Dev-User": "00000000-0000-4000-8000-000000000001"}
        statuses = [(await client.get("/api/v1/me", headers=headers)).status_code for _ in range(3)]
        limited = await client.get("/api/v1/me", headers=headers)
        other_user = await client.get(
            "/api/v1/me", headers={"X-Dev-User": "00000000-0000-4000-8000-000000000002"}
        )
        health = [(await client.get("/api/v1/health")).status_code for _ in range(10)]
    await app.state.engine.dispose()
    assert statuses == [200, 200, 200]
    assert limited.status_code == 429
    assert limited.json()["error"]["code"] == "rate_limited"
    assert int(limited.headers["retry-after"]) >= 1
    assert other_user.status_code == 200, "each user has their own bucket"
    assert set(health) == {200}, "health checks are never limited"


async def test_guests_are_limited_per_ip(engine: AsyncEngine) -> None:
    app = create_app(make_settings(rate_limit_per_minute=2))
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        statuses = [(await client.get("/api/v1/me")).status_code for _ in range(3)]
    await app.state.engine.dispose()
    assert statuses == [401, 401, 429]

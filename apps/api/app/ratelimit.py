"""In-process token bucket: 120 requests/minute per user, per IP for guests (Section 16.1)."""

import math
import time
from collections.abc import Callable

from fastapi import Request

from app.auth import resolve_auth
from app.errors import ApiError

_PRUNE_ABOVE = 10_000


class TokenBucketLimiter:
    def __init__(self, per_minute: int, clock: Callable[[], float] = time.monotonic) -> None:
        self.capacity = float(per_minute)
        self.refill_per_second = per_minute / 60.0
        self.clock = clock
        self._buckets: dict[str, tuple[float, float]] = {}  # key -> (tokens, last update)

    def allow(self, key: str) -> bool:
        now = self.clock()
        tokens, updated = self._buckets.get(key, (self.capacity, now))
        tokens = min(self.capacity, tokens + (now - updated) * self.refill_per_second)
        allowed = tokens >= 1.0
        self._buckets[key] = (tokens - 1.0 if allowed else tokens, now)
        if len(self._buckets) > _PRUNE_ABOVE:
            self._prune(now)
        return allowed

    def retry_after_seconds(self, key: str) -> int:
        tokens, _ = self._buckets.get(key, (self.capacity, 0.0))
        return max(1, math.ceil((1.0 - tokens) / self.refill_per_second))

    def _prune(self, now: float) -> None:
        # A bucket idle for a full minute has refilled, so forgetting it changes nothing.
        full_after = self.capacity / self.refill_per_second
        self._buckets = {
            key: value for key, value in self._buckets.items() if now - value[1] < full_after
        }


def client_ip(request: Request) -> str:
    # uvicorn --proxy-headers fills this from X-Forwarded-For behind a trusted proxy.
    return request.client.host if request.client else "unknown"


async def rate_limit(request: Request) -> None:
    limiter: TokenBucketLimiter = request.app.state.rate_limiter
    try:
        user = await resolve_auth(request)
    except ApiError:
        user = None  # the route's own auth dependency reports the 401
    key = f"user:{user.id}" if user else f"ip:{client_ip(request)}"
    if not limiter.allow(key):
        raise ApiError(
            429,
            "rate_limited",
            "Too many requests. Please wait a moment and try again.",
            headers={"Retry-After": str(limiter.retry_after_seconds(key))},
        )

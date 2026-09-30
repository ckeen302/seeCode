"""Pure ASGI middleware: content-version header, request size limit, last-resort error handler."""

import logging

from starlette.datastructures import Headers, MutableHeaders
from starlette.exceptions import HTTPException as StarletteHTTPException
from starlette.types import ASGIApp, Message, Receive, Scope, Send

from app.errors import error_response

logger = logging.getLogger("seecode.api")

MAX_BODY_BYTES = 200 * 1024  # Section 20: request bodies <= 200 KB


class ContentVersionMiddleware:
    """Adds `X-Content-Version` to every HTTP response (Section 16.1)."""

    def __init__(self, app: ASGIApp, version: str) -> None:
        self.app = app
        self.version = version

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        async def send_with_header(message: Message) -> None:
            if message["type"] == "http.response.start":
                MutableHeaders(scope=message)["X-Content-Version"] = self.version
            await send(message)

        await self.app(scope, receive, send_with_header)


class BodyTooLarge(StarletteHTTPException):
    def __init__(self) -> None:
        super().__init__(status_code=413, detail="Request body is too large.")


class BodySizeLimitMiddleware:
    """Rejects request bodies over `max_bytes`, by Content-Length or while streaming."""

    def __init__(self, app: ASGIApp, max_bytes: int = MAX_BODY_BYTES) -> None:
        self.app = app
        self.max_bytes = max_bytes

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        declared = Headers(scope=scope).get("content-length")
        if declared is not None and declared.isdigit() and int(declared) > self.max_bytes:
            response = error_response(413, "validation_error", "Request body is too large.")
            await response(scope, receive, send)
            return

        received = 0

        async def limited_receive() -> Message:
            nonlocal received
            message = await receive()
            if message["type"] == "http.request":
                received += len(message.get("body", b""))
                if received > self.max_bytes:
                    # An HTTPException, so FastAPI's body parsing re-raises it unchanged
                    # and the handler in errors.py renders the envelope.
                    raise BodyTooLarge()
            return message

        await self.app(scope, limited_receive, send)


class UnhandledErrorMiddleware:
    """Turns unexpected exceptions into the `internal` error envelope.

    Starlette's own handler for 500s sits outside all user middleware, so its
    responses would miss the CORS and content-version headers. This one sits inside.
    """

    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        response_started = False

        async def tracking_send(message: Message) -> None:
            nonlocal response_started
            if message["type"] == "http.response.start":
                response_started = True
            await send(message)

        try:
            await self.app(scope, receive, tracking_send)
        except Exception:
            logger.exception("Unhandled error on %s %s", scope.get("method"), scope.get("path"))
            if response_started:
                raise
            response = error_response(500, "internal", "Something went wrong. Please try again.")
            await response(scope, receive, send)

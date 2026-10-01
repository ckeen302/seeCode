"""Error envelope `{"error": {"code", "message"}}` and its exception handlers (Section 16.1)."""

from collections.abc import Mapping
from typing import Literal

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

ErrorCode = Literal[
    "unauthorized",
    "forbidden",
    "not_found",
    "validation_error",
    "conflict",
    "rung_order",
    "plan_checks_exhausted",
    "rate_limited",
    "ai_unavailable",
    "internal",
]

_CODE_BY_STATUS: dict[int, ErrorCode] = {
    400: "validation_error",
    401: "unauthorized",
    403: "forbidden",
    404: "not_found",
    405: "not_found",
    409: "conflict",
    413: "validation_error",
    422: "validation_error",
    429: "rate_limited",
}


class ApiError(Exception):
    """Raise from any route or dependency to return the standard error envelope."""

    def __init__(
        self,
        status_code: int,
        code: ErrorCode,
        message: str,
        headers: dict[str, str] | None = None,
    ) -> None:
        super().__init__(message)
        self.status_code = status_code
        self.code = code
        self.message = message
        self.headers = headers


def error_response(
    status_code: int, code: ErrorCode, message: str, headers: Mapping[str, str] | None = None
) -> JSONResponse:
    return JSONResponse(
        {"error": {"code": code, "message": message}}, status_code=status_code, headers=headers
    )


def code_for_status(status_code: int) -> ErrorCode:
    if status_code in _CODE_BY_STATUS:
        return _CODE_BY_STATUS[status_code]
    return "internal" if status_code >= 500 else "validation_error"


async def _api_error(_: Request, exc: Exception) -> JSONResponse:
    assert isinstance(exc, ApiError)
    return error_response(exc.status_code, exc.code, exc.message, exc.headers)


async def _http_error(_: Request, exc: Exception) -> JSONResponse:
    assert isinstance(exc, StarletteHTTPException)
    message = exc.detail if isinstance(exc.detail, str) else "Request failed."
    return error_response(exc.status_code, code_for_status(exc.status_code), message, exc.headers)


async def _validation_error(_: Request, exc: Exception) -> JSONResponse:
    assert isinstance(exc, RequestValidationError)
    errors = exc.errors()
    message = "Invalid request."
    if errors:
        first = errors[0]
        parts = list(first.get("loc", ()))
        if parts and parts[0] == "body":  # the request body itself, not a field named "body"
            parts = parts[1:]
        location = ".".join(str(part) for part in parts)
        message = f"{location}: {first.get('msg', 'invalid value')}" if location else message
    return error_response(422, "validation_error", message)


def install_error_handlers(app: FastAPI) -> None:
    app.add_exception_handler(ApiError, _api_error)
    app.add_exception_handler(StarletteHTTPException, _http_error)
    app.add_exception_handler(RequestValidationError, _validation_error)

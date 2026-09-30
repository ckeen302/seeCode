import uuid
from datetime import datetime
from typing import Any

from app.schemas import CamelModel


class HealthView(CamelModel):
    ok: bool
    content_version: str


class ProfileView(CamelModel):
    """`Profile` in Section 16.2. The spec names the type without listing fields."""

    id: uuid.UUID
    display_name: str | None
    timezone: str
    settings: dict[str, Any]
    created_at: datetime

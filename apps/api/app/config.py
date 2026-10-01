"""Application settings, read from environment variables (Section 22.2)."""

from functools import lru_cache
from pathlib import Path
from typing import Literal

from pydantic import model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict
from sqlalchemy.engine import make_url

API_DIR = Path(__file__).resolve().parent.parent
REPO_ROOT = API_DIR.parent.parent


class Settings(BaseSettings):
    # Real environment variables win over the repo-root `.env`, which wins over `apps/api/.env`.
    model_config = SettingsConfigDict(
        env_file=(REPO_ROOT / ".env", API_DIR / ".env"),
        env_file_encoding="utf-8",
        env_ignore_empty=True,
        extra="ignore",
    )

    env: Literal["development", "production"] = "development"
    database_url: str = "postgresql+asyncpg://seecode:seecode@localhost:5432/seecode"
    supabase_url: str | None = None
    supabase_jwks_url: str | None = None
    supabase_jwt_secret: str | None = None
    supabase_service_role_key: str | None = None
    llm_provider: str | None = None
    llm_api_key: str | None = None
    llm_model: str | None = None
    ai_daily_limit: int = 40
    cors_origins: str = "http://localhost:3000"
    sentry_dsn: str | None = None
    auth_dev_bypass: bool = False

    # Not in Section 22.2; overridable for tests and unusual layouts.
    content_dir: Path = REPO_ROOT / "content"
    rate_limit_per_minute: int = 120

    @model_validator(mode="after")
    def _refuse_dev_bypass_in_production(self) -> "Settings":
        if self.auth_dev_bypass and self.env == "production":
            raise ValueError("AUTH_DEV_BYPASS must be false when ENV=production")
        return self

    @property
    def dev_bypass_enabled(self) -> bool:
        return self.auth_dev_bypass and self.env == "development"

    @property
    def cors_origin_list(self) -> list[str]:
        return [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]

    @property
    def sqlalchemy_database_url(self) -> str:
        return normalize_database_url(self.database_url)


def normalize_database_url(url: str) -> str:
    """Use the asyncpg driver for any Postgres URL, as copied from a provider dashboard.

    Accepts `postgres://` and `postgresql://` and translates libpq's `sslmode` query
    parameter to asyncpg's `ssl`.
    """
    parsed = make_url(url)
    if parsed.drivername in ("postgres", "postgresql"):
        parsed = parsed.set(drivername="postgresql+asyncpg")
    if "sslmode" in parsed.query:
        query = dict(parsed.query)
        query["ssl"] = query.pop("sslmode")
        parsed = parsed.set(query=query)
    return parsed.render_as_string(hide_password=False)


@lru_cache
def get_settings() -> Settings:
    return Settings()

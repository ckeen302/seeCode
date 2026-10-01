import pytest

from app.config import Settings, normalize_database_url


@pytest.mark.parametrize(
    ("given", "expected"),
    [
        (
            "postgresql+asyncpg://u:p@localhost:5432/db",
            "postgresql+asyncpg://u:p@localhost:5432/db",
        ),
        ("postgresql://u:p@host:5432/db", "postgresql+asyncpg://u:p@host:5432/db"),
        ("postgres://u:p@host/db", "postgresql+asyncpg://u:p@host/db"),
        (
            "postgresql://u:p@host/db?sslmode=require",
            "postgresql+asyncpg://u:p@host/db?ssl=require",
        ),
        ("postgresql://u:p%40ss@host/db", "postgresql+asyncpg://u:p%40ss@host/db"),
    ],
)
def test_database_urls_use_asyncpg(given: str, expected: str) -> None:
    assert normalize_database_url(given) == expected


def test_cors_origins_are_split_and_trimmed() -> None:
    settings = Settings(_env_file=None, cors_origins=" http://a.test, https://b.test ,")  # type: ignore[call-arg]
    assert settings.cors_origin_list == ["http://a.test", "https://b.test"]


def test_empty_environment_values_count_as_unset(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("SUPABASE_URL", "")
    monkeypatch.setenv("AI_DAILY_LIMIT", "")
    settings = Settings(_env_file=None)  # type: ignore[call-arg]
    assert settings.supabase_url is None
    assert settings.ai_daily_limit == 40


def test_dev_bypass_needs_development_env() -> None:
    settings = Settings(_env_file=None, env="development", auth_dev_bypass=True)  # type: ignore[call-arg]
    assert settings.dev_bypass_enabled
    off = Settings(_env_file=None, env="development", auth_dev_bypass=False)  # type: ignore[call-arg]
    assert not off.dev_bypass_enabled

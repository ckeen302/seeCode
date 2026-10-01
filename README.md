# SeeCode

SeeCode teaches you how to approach any coding-interview problem: see the pattern, plan the
solution, then code it, with visual walkthroughs and spaced review so it sticks.

- **Spec:** [`docs/SPEC.md`](docs/SPEC.md) is the single source of truth.
- **Decisions:** [`docs/DECISIONS.md`](docs/DECISIONS.md) logs every choice the spec leaves open.
- **Status:** milestones **M0 (scaffold)** and **M1 (content system)** of the build plan in
  Section 23 of the spec are done; next is M2 (runner and basic Workspace).

## Try it in your browser

[![Open in GitHub Codespaces](https://github.com/codespaces/badge.svg)](https://codespaces.new/ckeen302/seeCode)

GitHub Codespaces runs everything (Postgres, the API and the web app) on GitHub's machines,
so nothing gets installed on your computer. Click the button, then **Create codespace**. The
first start takes a few minutes. Then the site opens in a new browser tab. If it doesn't, open
the **Ports** tab and click the globe icon next to port 3000. Sign in with a dev user.
Personal GitHub accounts include free Codespaces hours each month, and a codespace stops by
itself after 30 idle minutes.

## Layout

```text
apps/web     Next.js 16 app (React 19, TypeScript, Tailwind v4, shadcn/ui on Radix)
apps/api     FastAPI app (Python 3.12, SQLAlchemy 2 async, Alembic, uv)
content/     Learning content as JSON, served by the API (see content/README.md)
scripts/     Content validator and formatter, database helpers
docs/        Spec and decision log
```

## Local setup

Prerequisites: Node 22.12+ (or 24 LTS), pnpm 10, Python 3.12, [uv](https://docs.astral.sh/uv/),
and Postgres 16 (Docker, or a local install).

```bash
cp .env.example .env              # local defaults; dev sign-in is on
pnpm install                      # web dependencies
(cd apps/api && uv sync)          # API dependencies

docker compose up -d db           # Postgres 16 on :5432 (also creates seecode_test)
(cd apps/api && uv run alembic upgrade head)

uv run --project apps/api python scripts/validate_content.py   # the API starts only on valid content
```

Run the two apps in separate terminals:

```bash
(cd apps/api && uv run uvicorn app.main:app --reload --port 8000)   # http://localhost:8000/api/v1/health
pnpm dev                                                              # http://localhost:3000
```

The API loads `content/` once at startup. When you edit content, restart it, or start it
with `--reload --reload-dir . --reload-dir ../../content --reload-include '*.json'` so it
reloads (and revalidates) on every save.

Open <http://localhost:3000/login> and pick a user under **Developer sign-in**. Dev sign-in
(`AUTH_DEV_BYPASS`) needs no accounts or keys and only works with `ENV=development`; the
API refuses to start if it is on in production. Google and GitHub sign-in need a Supabase
project (see `.env.example`).

Using a local Postgres install instead of Docker: create a `seecode` role (password
`seecode`) that owns the databases `seecode` and `seecode_test`, or point `DATABASE_URL`
at your own database.

## Checks

```bash
# Content, from the repo root: every Section 10.7 rule, including running each reference
# solution against its tests (content/README.md explains the rules), then the JSON layout
uv run --project apps/api python scripts/validate_content.py
uv run --project apps/api python scripts/format_content.py --check

# API, plus the content scripts and the shared test harness (needs Postgres; the test
# database is rebuilt from scratch on every run)
cd apps/api
uv run ruff check . ../../scripts ../web/public/py
uv run ruff format --check . ../../scripts ../web/public/py
uv run mypy app ../../scripts ../web/public/py/harness.py
uv run pytest

# Web
pnpm lint && pnpm typecheck && pnpm test && pnpm build

# End to end (Playwright + axe; starts the API and web app if they aren't running)
pnpm --filter web exec playwright install chromium   # once
pnpm e2e
```

CI runs the same checks on every pull request (`.github/workflows/ci.yml`).

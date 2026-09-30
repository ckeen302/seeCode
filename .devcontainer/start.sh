#!/usr/bin/env bash
# Starts SeeCode in a codespace ("postAttachCommand" in devcontainer.json): pulls the
# latest commits, migrates the database, builds the web app when the code has changed,
# then runs the API (port 8000, internal) and the web app (port 3000). The web server
# forwards /api/v1/* to the API, so the browser only needs port 3000.
set -euo pipefail
self="$(cd "$(dirname "$0")" && pwd)/$(basename "$0")"
cd "$(dirname "$self")/.."

OPEN_HINT="If no tab opened, open the PORTS tab below and click the globe icon next to port 3000."

if curl -fsS -o /dev/null http://127.0.0.1:3000/ 2>/dev/null; then
  echo "SeeCode is already running. $OPEN_HINT"
  exit 0
fi

# Fast-forward to the latest version of the branch (skipped when files were edited
# locally), then restart this script from the updated copy.
if [ "${1:-}" != "--updated" ]; then
  if git diff --quiet 2>/dev/null && git diff --cached --quiet 2>/dev/null \
    && git rev-parse --abbrev-ref --symbolic-full-name '@{u}' >/dev/null 2>&1; then
    echo "Getting the latest version..."
    git pull --ff-only --quiet || echo "Could not update; starting the version already here."
  fi
  exec bash "$self" --updated
fi

export NEXT_PUBLIC_API_URL=/api/v1
export API_PROXY_TARGET=http://127.0.0.1:8000

# Quick no-ops unless the dependencies changed.
pnpm install --frozen-lockfile
(cd apps/api && uv sync --frozen)

echo "Preparing the database..."
(cd apps/api && uv run alembic upgrade head)

# Rebuild when the checked-out commit changed (always, if git can't tell).
head="$(git rev-parse HEAD 2>/dev/null || true)"
stamp=apps/web/.next/seecode-build-head
if [ -z "$head" ] || [ "$(cat "$stamp" 2>/dev/null || true)" != "$head" ]; then
  echo "Building the web app (takes a minute or two)..."
  pnpm build
  if [ -n "$head" ]; then echo "$head" > "$stamp"; fi
fi

(cd apps/api && exec .venv/bin/uvicorn app.main:app --host 127.0.0.1 --port 8000) &
api_pid=$!
trap 'kill "$api_pid" 2>/dev/null || true' EXIT

echo
echo "SeeCode is starting and opens in a new browser tab. $OPEN_HINT"
echo "Sign in with a dev user on the login page."
echo
pnpm start

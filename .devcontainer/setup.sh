#!/usr/bin/env bash
# Installs dependencies. Runs when the codespace is created or its content changes
# ("updateContentCommand" in devcontainer.json).
set -euo pipefail
cd "$(dirname "$0")/.."

# Local defaults: dev sign-in on, database at localhost:5432 (the db service).
[ -f .env ] || cp .env.example .env

pnpm install --frozen-lockfile
(cd apps/api && uv sync --frozen)

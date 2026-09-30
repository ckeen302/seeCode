# Decisions

One line per decision: date · decision · reason. Newest at the bottom.
Anything that departs from or fills a gap in `docs/SPEC.md` is recorded here.

- 2026-09-30 · Spec moved to `docs/SPEC.md` · Matches Section 14 and the owner's request.
- 2026-09-30 · TypeScript pinned to 6.0.x, not 7.0 · `typescript-eslint` supports `<6.1`, and TS 7 (native compiler) lacks the JS API that Next's build type-check and typescript-eslint use.
- 2026-09-30 · ESLint pinned to 9.x, not 10 · `eslint-config-next` bundles plugins (react, jsx-a11y, import) whose peer range stops at ESLint 9.
- 2026-09-30 · uv 0.12.x and Python 3.12 (system interpreter) · Latest stable uv; Python 3.12 per Sections 22.1 and 22.4.
- 2026-09-30 · Plain Postgres has no `auth` schema, so migration 001 creates a minimal stand-in (`auth.users`, `auth.uid()`) only when `auth` is missing; its downgrade removes the stand-in only if it created it · The same foreign keys, profile trigger and RLS policies then work on Supabase, docker compose, CI and the cloud dev box.
- 2026-09-30 · RLS policies use `(select auth.uid())`; RLS is also enabled on `alembic_version` · Supabase's recommended form (evaluated once per query, same meaning as Section 15); keeps Supabase's security advisor clean.
- 2026-09-30 · The auth dependency is exported as both `get_current_user` and `current_user` · Section 14 and Section 16.1 name it differently.
- 2026-09-30 · Token issuer checked as `<SUPABASE_URL>/auth/v1`; JWKS URL defaults to `<issuer>/.well-known/jwks.json`; the HS256 secret is still accepted · That is the `iss` value Supabase issues (Section 20 says "issuer = project URL"); new Supabase projects sign with asymmetric keys.
- 2026-09-30 · Dev bypass adds the dev user to `auth.users` (local stand-in) so the profile trigger runs; display name "Dev user <last 4 hex digits>" · Exercises the same path as a real sign-up.
- 2026-09-30 · Signed-in requests make sure the profile row exists, creating it from token claims if the trigger never ran · Every user table references `profiles`; a missing row would break all writes.
- 2026-09-30 · `Profile` JSON is `{id, displayName, timezone, settings, createdAt}` · Section 16.2 names the type without fields; `placement` (v2) is left out.
- 2026-09-30 · Generic HTTP errors map to Section 16.1 codes: 400/413/422 → `validation_error`, 405 → `not_found`, other 5xx → `internal`; an unreachable JWKS endpoint is 503 `internal` · The code list has no entries for these; a Supabase network blip should not look like a sign-out.
- 2026-09-30 · Rate limit runs on every router except `/health` · Host health checks poll `/health` constantly.
- 2026-09-30 · Optional settings beyond Section 22.2: `CONTENT_DIR`, `RATE_LIMIT_PER_MINUTE` (default 120), and `TEST_DATABASE_URL` for tests · Defaults match the spec; tests need to override them.
- 2026-09-30 · `DATABASE_URL` accepts `postgres://` / `postgresql://` URLs and `sslmode=`, converted to the asyncpg form · The Supabase connection string can be pasted as shown.
- 2026-09-30 · OpenAPI docs at `/api/v1/docs` only when `ENV=development` · No reason to publish them in production.
- 2026-09-30 · API Dockerfile is two-stage, built from the repo root, defaults `ENV=production`, sets `FORWARDED_ALLOW_IPS=*`, runs as a non-root user · Keeps uv and caches out of the image (324 MB vs 513 MB); per-IP rate limits need real client IPs behind the host's proxy.
- 2026-09-30 · Library extras: `uvicorn[standard]`, `pyjwt[crypto]` (brings `cryptography`), `hatchling` as build backend · uvicorn's fast loop/parser; ES256/RS256 verification; lets uv install `app` as a package that `scripts/` can import.
- 2026-09-30 · Content version = first 12 hex chars of SHA-256 over every `content/**/*.json` (path + bytes) · Section 16.1 asks for "a hash of the content/ folder"; the content README does not change it.
- 2026-09-30 · docker compose also creates a `seecode_test` database · The API test suite rebuilds it from scratch on every run.
- 2026-09-30 · M0 `validate_content.py` only checks that JSON parses · The full Section 10.7 rules belong to M1; CI runs the script from M0 on.

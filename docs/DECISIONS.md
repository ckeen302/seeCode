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
- 2026-09-30 · pnpm 10.34 (latest 10.x), not 12 · Vercel supports pnpm up to 10 without an experimental Corepack setting.
- 2026-09-30 · React 19.3.0 · Matches the React canary that Next 16.3.7 bundles for the App Router.
- 2026-09-30 · Next.js 16 conventions: `proxy.ts` (formerly middleware) refreshes the Supabase session and gates routes; `pnpm lint` runs ESLint and Prettier directly (`next lint` was removed); `typecheck` runs `next typegen` first · Required by Next 16.
- 2026-09-30 · Tailwind v4 maps tokens with `@theme inline` in `styles/globals.css` (v4's replacement for `theme.extend.colors`); the default palette, font sizes, weights, radii and shadows are reset so only Section 18 tokens exist · Class names match the spec (`bg-surface`, `text-muted`).
- 2026-09-30 · The 18.2 type scale uses Tailwind's size names: xs 12/16, sm 13/20, base 15/24, lg 17/26, xl 20/28, 2xl 24/32, 3xl 32/40 · shadcn components and class merging work without custom config.
- 2026-09-30 · Radii: `rounded-md` 6 px (inputs, chips, buttons), `rounded-lg` 10 px (cards, panels, dialogs), `rounded-full` pills · Section 18.3 is silent on buttons; they follow inputs.
- 2026-09-30 · Two tokens beyond 18.1: `--on-accent` (text on accent; dark in the dark theme per 18.4, white in light) and `--popover-shadow` (18.3's dark value; lighter in the light theme) · Needed for primary buttons and popovers.
- 2026-09-30 · shadcn/ui components come from the CLI (Radix base, Nova preset) and are rewritten to the spec tokens; the CLI is not a dependency and its Radix state variants are copied into globals.css · shadcn's own `--muted`/`--accent` mean different things than the spec's; the CLI package pulls in ts-morph, Babel and more just to ship one CSS file.
- 2026-09-30 · Libraries that come with shadcn/ui: `radix-ui`, `cmdk` (Command, ⌘K), `class-variance-authority`, `cn` (shadcn's clsx + tailwind-merge replacement), `tw-animate-css` (dialog and popover transitions) · Part of the Section 13 shadcn/ui choice.
- 2026-09-30 · Test companions: `vite` + `@vitejs/plugin-react` (Vitest's React transform), `jsdom`, `@testing-library/dom`, `@testing-library/jest-dom`, `@testing-library/user-event`, `@axe-core/playwright` · Standard partners of the Section 21 tools.
- 2026-09-30 · One root `.env` for both apps: the API reads it through pydantic-settings; `next.config.ts` loads it with Node's `process.loadEnvFile` (real environment variables win) · Section 22.1 copies one `.env.example`; no extra dependency.
- 2026-09-30 · `NEXT_PUBLIC_AUTH_DEV_BYPASS` (web) shows the dev user switcher; the chosen dev user lives in the `seecode-dev-user` cookie so proxy.ts can gate routes · Section 22.1 asks for a switcher but lists only the API variable.
- 2026-09-30 · `NEXT_PUBLIC_SUPABASE_ANON_KEY` holds the Supabase anon key or its newer "publishable" key · Keeps the spec's variable name; Supabase renamed the key type and both work.
- 2026-09-30 · Theme (`seecode:theme`: dark, light or system) and sidebar collapse (`seecode:sidebar`) are stored in localStorage and applied by an inline `<head>` script before paint · Next 16's documented flash-free pattern; Settings (M6) will also save the theme to the profile.
- 2026-09-30 · Theme switcher sits in the sidebar footer (cycles dark → light → system) until Settings exists · M0 asks for a switcher; Settings is M6.
- 2026-09-30 · The ⌘K palette is mounted app-wide and its hotkey listens in the capture phase · Section 17.4 says "anywhere"; capture phase keeps it working inside widgets that stop key events (dialogs now, Monaco from M2).
- 2026-09-30 · `?` shortcut-help dialog deferred to M2/M3 · Only ⌘K exists in M0.
- 2026-09-30 · Links to pages the proxy would redirect for the current visitor (private pages while signed out, `/` while signed in) are not prefetched (`AppLink`) · Next.js answers a redirected segment prefetch with a 404, which filled the browser console with errors.
- 2026-09-30 · Placeholder pages stand in for routes of later milestones; Today already greets the user by name from `/me` · Sidebar links need targets; the greeting shows `/me` working end to end.
- 2026-09-30 · TanStack Query key `["me", userId]` for the profile · Section 17.1 has no key for `/me`; including the user id refetches when users switch.
- 2026-09-30 · CI runs on pull requests and pushes to `main` (not every branch push) and also builds the API Docker image · Avoids duplicate runs per PR commit; the image build keeps the API deployable.
- 2026-09-30 · Dependabot and the high-severity audit gate (Section 20) wait for M9 · Launch requirements outside M0's task list; avoids automated PR noise early on.
- 2026-09-30 · Playwright can use a preinstalled Chromium through `PW_CHROMIUM_PATH`; CI installs its own · The cloud dev box ships an older Chromium and cannot download browsers.
- 2026-09-30 · Note for M9: the CSP (Section 20) must allow the inline theme script by nonce or hash · Otherwise the flash-free theme bootstrap breaks.

## Open questions (waiting on the owner)

- Section 18.1 requires ≥ 4.5:1 text contrast and ≥ 3:1 for UI borders, but `--border` measures 1.2–1.35:1 in both themes, and in the light theme `--good`, `--close`, `--accent-2` and `--error` measure 3.2–4.4:1 as text (`--muted` on `--surface-2` is 4.39:1). M0 uses the exact spec values; M0 screens avoid the failing combinations.
- M0 acceptance "Sign-in with GitHub works against a Supabase dev project" needs a Supabase project, a GitHub OAuth app, and a web URL the owner's browser can reach (the cloud dev box is not reachable).

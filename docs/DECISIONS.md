# Decisions

One line per decision: date · decision · reason. Newest at the bottom.
Anything that departs from or fills a gap in `docs/SPEC.md` is recorded here.

- 2026-09-30 · Spec moved to `docs/SPEC.md` · Matches Section 14 and the owner's request.
- 2026-09-30 · TypeScript pinned to 6.0.x, not 7.0 · `typescript-eslint` supports `<6.1`, and TS 7 (native compiler) lacks the JS API that Next's build type-check and typescript-eslint use.
- 2026-09-30 · ESLint pinned to 9.x, not 10 · `eslint-config-next` bundles plugins (react, jsx-a11y, import) whose peer range stops at ESLint 9.
- 2026-09-30 · uv 0.12.x and Python 3.12 (system interpreter) · Latest stable uv; Python 3.12 per Sections 22.1 and 22.4.

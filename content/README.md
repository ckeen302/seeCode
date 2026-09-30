# Content

Learning content as JSON, versioned in Git (Section 10 of `docs/SPEC.md`). The API loads
and validates it at startup (every Section 10.7 rule except rule 7, which runs code),
refuses to start on errors, and serves it without answers; the web app never reads these
files directly.

All problem text is written in our own words. Never paste text from LeetCode or any other
site (Section 10.8), and use our own test inputs.

## Check your changes

```bash
uv run --project apps/api python scripts/validate_content.py [content_dir] [--timeout S]
uv run --project apps/api python scripts/format_content.py [content_dir] [--check]
```

The validator prints every error and warning with its file and JSON path and exits 1 on
any error. It runs all Section 10.7 rules, including rule 7: each problem's
`solution.code` must pass all of its tests through `apps/web/public/py/harness.py`, the
same harness the browser uses (one subprocess per problem, 10 s timeout). Pattern demos
must run without raising. It also traces every walkthrough the way the Section 8.2 tracer
will (on the problem's visible tests, or on the demo's `args`): an event `when` or `say`,
or a predict `answerWhen`, that raises is an error. Warnings never fail the check. CI runs
it on every pull request, and the API test suite checks this folder too
(`apps/api/tests/test_real_content.py`).

The formatter rewrites the JSON in the layout below; `--check` only reports, and CI runs it.

The API loads this folder once at startup, so restart it after an edit, or run it with
`uv run uvicorn app.main:app --reload --reload-dir . --reload-dir ../../content
--reload-include '*.json'` (from `apps/api`) to reload on every save. A content error then
stops the reload with the same messages.

## Layout

2-space indent, UTF-8 characters kept as they are (`O(n²)`, `≥`, `log₂`), and any object
or list that fits in 100 columns (with its indent, key and trailing comma) on one line.
A longer list of numbers fills its lines; any other longer object or list gets one item
per line. Strings are never split.

## Files

| File | Holds |
|---|---|
| `patterns.json` | Array of patterns (10.2) |
| `roadmap.json` | `{patterns: [{id, x, y, prereqs}], unlockRule: {solvedInPrereq}}` (10.3) |
| `structures.json` | Array of `{id, label}`: the Plan card structure options (10.4) |
| `toolkit.json` | Array of `{id, tool, phrases, example, patterns}` (10.5) |
| `problems/<slug>.json` | One problem; the file name equals its `slug` (10.6) |

No other JSON files are allowed here. Keys are camelCase exactly as in Section 10;
unknown keys, duplicate keys, `NaN` and type coercion (`"4"` for `4`) are errors.

## Conventions the validator enforces

- **Ids.** Pattern, structure, toolkit and approach ids are `snake_case`; slugs are
  `kebab-case`. Ids are unique within their file.
- **Patterns.** Exactly five slots, in this order: `setup`, `loop`, `update`, `record`,
  `return` (each with its own `label` and `prompt`). The template marks each slot with a
  comment (`# SETUP` ...) once; a missing or repeated one is a warning. `demo` is
  `{code, entry, args, viz}`: `code` defines `class Solution` with the `entry` method, and
  its viz events point at `# viz:<name>` markers in `code`. `toolkit` lists exactly the
  toolkit cards tagged with the pattern.
- **Toolkit.** A phrase (ignoring case) belongs to one card only: a toolkit drill needs
  exactly one right card per phrase.
- **Lists of ids** (`structures`, `solution.toolkit`, a pattern's `toolkit`, a card's
  `patterns`, roadmap `prereqs`) have no duplicates.
- **Roadmap.** Lists every pattern once; `prereqs` name other roadmap ids and form no cycle.
- **Problems.** `order` is unique across all problems. A Workspace problem's `order` is
  its number in the Section 24.2 table (1-15); drill-only problems are numbered from 101
  in the order of the 24.2 drill-only table (Contains Duplicate 101, Ransom Note 102, ...,
  Capacity To Ship Packages Within D Days 130). `difficulty` is `easy`, `medium` or
  `hard`. Complexities (`targets`, approach `time`/`space`) are one of `O(1)`,
  `O(log n)`, `O(n)`, `O(n log n)`, `O(n²)`, `O(2ⁿ)` (Unicode ² and ⁿ).
- **Approaches.** 1 to 3; exactly one has `id: "optimal"`. `patternId` is a pattern id or
  `brute_force`; `structures` (1 to 4) are structure ids. `acceptedAs: "suboptimal"`
  needs a `note` and is not allowed on the optimal approach.
- **Signals.** Each `phrase` appears word for word (ignoring case) in `summary` or in one
  of the `constraints`, as whole words: punctuation may touch it, but not a letter, digit
  or underscore ("sorted array" does not match "unsorted array"). No leading or trailing
  spaces. `pointsTo` is a pattern id, `toolkit:<id>` or `structure:<id>`.
- **Hints.** `hints.slots` has exactly the five slot ids as keys.
- **Solution and starter code.** Both define `class Solution` with the `entry` method.
  Code may use the harness prelude without importing it: everything from `typing` and
  `collections`, plus `heapq`, `bisect`, `math`, `itertools` and `functools`.
- **Viz.** Every `events[].at` marker exists as `# viz:<name>` in `solution.code`; event
  ids are unique; at most 3 `predict` points, each `atEvent` naming an event; `index` and
  `value` predictions need `var`, `yesno` needs `answerWhen`. Every variable the config
  names (`primary`, pointers, window, range, roles, confirmed) appears in the code.
  Pointer colors are `a` to `d`. Keys that don't apply may be left out; `window`, `range`
  and `confirmed` may also be `null`.
- **Markers.** One `# viz:` marker per line (the tracer only sees the first), on a line
  that runs code inside a function: the tracer never stops on a comment-only line, an
  `else:` or a `def` line. A line event fires before its line runs, so narration on
  `x = ...  # viz:m` sees the old `x` (or none, the first time).
- **Narration and conditions.** `say` is an f-string template (`"s[{l}] is {s[l]!r}"`);
  `when` and `answerWhen` are Python expressions. They must parse and may read only the
  code's own variables (never `self`) plus `len`, and `repr` in `say`.
- **Tests.** `{id, args, expected, hidden, compare?}` with unique ids, at least 2 visible
  and 3 hidden. `compare` is `exact` (default), `unordered`, `unordered_nested` or `float`;
  set it per test when order does not matter.
- **Related.** Each `slug` is another problem's slug, not its own and not a drill-only
  problem's. A slug with no file yet is a warning, since problems are written over several
  milestones; the link stays hidden until the file exists.
- **Drill-only problems** (`"drillOnly": true`) need no `entry`, `starterCode`, `tests`,
  `solution`, `hints` or `viz`, and never appear in the Problems list or the Workspace.

Warnings point at likely mistakes but do not block: a `summary` longer than 450
characters, a template without one of its `# SETUP` ... `# RETURN` comments (or with one
twice), two roadmap nodes at the same `x`/`y`, a problem `patternId` that differs from its
optimal approach's, a related slug with no problem file yet, and a viz event that never
fires or a predict point never reached on the inputs the walkthrough is traced on.

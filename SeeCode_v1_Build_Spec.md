# SeeCode v1 — Build Specification

# 0. How to use this document

This is the complete build specification for **SeeCode**, a web app that teaches people how to approach coding-interview problems. It is written to be handed to an AI coding agent (or a developer) as the single source of truth.

**Rules for the builder (read first):**

1. Build in the milestone order in Section 23. Do not start a milestone until the previous one meets its acceptance criteria.
2. When this spec gives an exact name (file, route, table, column, type, event, CSS token), use it exactly.
3. When this spec is silent, choose the simplest option that fits the principles in Section 1.4, and write the decision in `docs/DECISIONS.md` (one line: date, decision, reason).
4. Never copy problem text from LeetCode or any other site into the repository or database. All problem content is written in our own words (Section 10.6).
5. Python is the only language users write. Do not add other languages.
6. User code always runs in the browser (Pyodide). Never execute user code on the server.
7. The AI features must never output solution code. Every AI response is validated before it is shown (Section 12).
8. Keep dependencies to the list in Section 13. Adding a library requires a line in `docs/DECISIONS.md`.
9. Every milestone ends with: tests passing in CI, the app deployable, and the acceptance checklist ticked.

**Document map:**

| # | Section | What it answers |
|---|---|---|
| 1 | Product overview | What we are building and why |
| 2 | Core concepts | The vocabulary used everywhere else |
| 3 | Scope | What is in v1, v2, and out of scope |
| 4 | User journeys | How people move through the product |
| 5 | Information architecture | Pages and routes |
| 6 | Screen specifications | What every screen contains and how it behaves |
| 7 | The Workspace | The main problem-solving screen in detail |
| 8 | Visualization system | Tracer, frames, renderers, walkthroughs, predict mode |
| 9 | Code execution | Pyodide worker, test harness, timeouts |
| 10 | Content system | File formats, full example, authoring rules |
| 11 | Learning engine | Grading, mastery, spaced review, drills, Today |
| 12 | AI features | What the LLM does, prompts, validation, cost limits |
| 13 | Architecture & tech stack | Components and libraries |
| 14 | Repository structure | Every folder and key file |
| 15 | Data model | Database tables, indexes, security policies |
| 16 | API specification | Every endpoint with request and response |
| 17 | Frontend architecture | State, data fetching, components, types |
| 18 | Design system | Colors, type, spacing, components, motion, keyboard |
| 19 | Analytics | Events to track |
| 20 | Security & privacy | Auth, limits, data handling |
| 21 | Testing | Unit, integration, end-to-end, content tests |
| 22 | DevOps | Local setup, environment variables, CI, deployment |
| 23 | Build plan | Milestones, tasks, acceptance criteria |
| 24 | Starter content | The first 5 patterns and 15 problems |
| 25 | v2 roadmap | What comes after v1 |
| 26 | Final QA checklist | Definition of done for v1 |

# 1. Product overview

## 1.1 One-line pitch

**SeeCode teaches you how to approach any coding-interview problem: see the pattern, plan the solution, then code it, with visual walkthroughs and spaced review so it sticks.**

## 1.2 The problem

Getting interview-ready needs five skills:

| Skill | Description | How existing sites train it |
|---|---|---|
| Know the toolkit | Patterns, data structures, Python tools | Well (videos, articles) |
| Recognize | Pick the right approach for an unseen problem | Barely (implicitly, by grinding) |
| Execute | Write correct code: loop bounds, invariants, edge cases | By repetition |
| Retain | Still know it weeks later | Not at all |
| Perform | Explain the approach, take hints, manage time | Weakly |

Popular sites (NeetCode, LeetCode, AlgoMonster) are mostly passive: watch or read a solution, then copy it. Understanding a solution you are shown is a different skill from producing one, so learners feel ready but freeze on new problems and forget old ones.

## 1.3 The solution in four ideas

1. **Pattern + twist.** Every problem is taught as a known pattern plus one twist (for example: *Valid Palindrome = two pointers from both ends + skip non-alphanumeric characters*). Pattern pages show the template, its variations, and every problem as pattern + twist. This builds a connected map instead of isolated problems.
2. **Plan first, then a hint ladder.** In the Workspace, the user fills a short **Plan card** (pattern, data structures, target complexity, the twist) and codes. When stuck, they pull on a **hint ladder** whose rungs are the steps of expert thinking: clarify → signals → approach → plan → walkthrough → solution. How far down the ladder they go is the skill signal.
3. **Recognition drills.** A fast mode: read a problem, fill the Plan card in 30 seconds, get instant feedback, next. About 30 reps in 15 minutes, mixing patterns on purpose.
4. **Daily review.** Solved problems come back on a spaced schedule; the user rebuilds the plan in 60 seconds. The home page ("Today") always shows one clear next step.

Visual **walkthroughs** replace video explanations: step through the reference solution on real data, with narration, pattern overlays (pointers, windows, search ranges) and a **predict mode** that pauses and asks what happens next.

## 1.4 Product principles

Every design decision must follow these, in this order:

1. **Attempt before help.** The user always tries first; help is pulled, never pushed.
2. **Help in layers, never a dead end.** There is always a next hint; the full solution is the last rung, not the first.
3. **Recall beats recognition.** Ask the user to produce (plan, predict, recall) before showing.
4. **Mix and space.** Practice mixes patterns; reviews return at growing intervals.
5. **Show why, not just what.** Every visual step has a one-line reason.
6. **One obvious next step.** Every screen has a single primary action.
7. **Calm and fast.** Dark, quiet UI; no clutter; keyboard-first; nothing blocks on the network if it can be avoided.
8. **Free core.** Everything in v1 is free for users.

## 1.5 Target users

| User | Need | What they use most |
|---|---|---|
| CS student seeking internships | A path from zero to interview-ready | Roadmap, Workspace, walkthroughs |
| New grad or career switcher | Pattern recognition fast | Drills, pattern pages |
| Working engineer re-prepping | Quick refresh | Review, drills |

## 1.6 North-star metric

**Time to a correct plan on an unseen problem** (median seconds, per user, measured in drills and first attempts). If it goes down over time, the product works. Supporting metrics: share of first attempts solved with max hint rung ≤ 2, review retention rate, 7-day return rate.

# 2. Core concepts (glossary)

Use these exact terms in code, UI copy and docs.

| Term | Definition | Code name |
|---|---|---|
| **Pattern** | A reusable approach with a code template, e.g. "Two pointers (opposite ends)" | `Pattern`, `pattern_id` |
| **Pattern family** | A group of related patterns, e.g. "Two pointers" contains "opposite ends" and "same direction" | `family` |
| **Twist** | The one change a problem makes to its pattern, written in one line | `twist` |
| **Problem** | One practice problem, authored by us, with a link to its LeetCode page | `Problem`, `slug` |
| **Approach** | One valid way to solve a problem (pattern + structures + complexity + twist). A problem has 1–3 approaches; one is marked `optimal` | `Approach` |
| **Plan card** | The user's short plan: pattern, data structures, target time, target space, twist | `PlanCard` |
| **Structure** | A data structure option in the Plan card (hash map, stack, heap…) | `structure_id` |
| **Hint ladder** | Six rungs of help, revealed in order | `HintRung` 1–6 |
| **Signals** | Phrases in the problem and constraints that point to an approach | `signals` |
| **Walkthrough** | Step-by-step visualization of the reference solution on an example | `Walkthrough` |
| **Trace** | The list of recorded steps (frames) from running code with the tracer | `Trace`, `Frame` |
| **Predict mode** | Walkthrough pauses and asks the user to predict the next value | `predict` |
| **Attempt** | One session of working a problem in the Workspace | `Attempt` |
| **Drill** | A 30-second recognition rep: problem statement → Plan card, no coding | `DrillAnswer` |
| **Toolkit card** | A phrase → Python tool flashcard ("case-insensitive" → `.lower()`) | `ToolkitCard` |
| **Review item** | Something scheduled for spaced review (a problem plan or a toolkit card) | `ReviewItem` |
| **Mastery** | Status of a problem or pattern based on hint depth and reviews | `mastery` |
| **Today** | The home page: reviews due, next problem, weak-spot drill | `/today` |

# 3. Scope

## 3.1 v1 (build this)

- Sign in with Google or GitHub (Supabase Auth); guest mode for trying one problem without an account.
- 5 patterns, 15 problems, 25 toolkit cards (Section 24).
- **Today** page, **Roadmap** page, **Pattern** pages, **Problems** list.
- **Workspace**: problem panel, Monaco editor, Plan card, hint ladder (6 rungs), tests panel, walkthrough tab, "Trace my code" tab.
- **Visualization**: tracer in Pyodide, renderers for arrays/strings, 2D grids, hash maps, sets, stacks, queues, scalars; pattern overlays for pointers, windows and search ranges; narration; predict mode; timeline with event markers.
- **Drills**: recognition drills and toolkit cards.
- **Review**: spaced review of solved problems and toolkit cards.
- **Stats** page: per-pattern progress, hint depth over time, weakest areas.
- AI: twist check on Plan cards, and "Nudge me" on a failing test (Socratic, no code).
- Rule-based mastery and spaced repetition.
- Desktop-first. Today, Drills and Review must also work on phones (≥ 375 px). The Workspace shows a "Use a larger screen" notice below 900 px.

## 3.2 v2 (design for it, do not build)

- Trace diff: compare the user's failing trace with the reference trace and point to the first divergence.
- Placement test on sign-up.
- Readiness score per pattern from a knowledge-tracing model.
- Trained signal model: problem text → likely patterns and highlighted phrases, for any pasted problem.
- Mock interview mode (timed, explain-first, graded rubric).
- Trees, linked lists, graphs and their renderers; more patterns (BFS/DFS, heaps, intervals, DP, backtracking).
- Daily shareable challenge.

## 3.3 Out of scope

Other programming languages, video content, payments, a mobile app, a Chrome extension, social features, copying any third-party problem text.

# 4. User journeys

## 4.1 First visit

1. Landing page → "Try a problem" (no account) opens the Workspace for *Valid Palindrome* in guest mode.
2. Guest completes it (or not). A banner offers "Save your progress" → sign in.
3. After sign-in, the guest attempt is uploaded and the user lands on **Today**.

## 4.2 Daily session (signed in)

1. **Today** shows up to three cards in this order: *Reviews due* (if any), *Continue your roadmap* (next problem), *5-minute drill* (weakest pattern).
2. The user does reviews (≈ 1 minute each), then one Workspace problem (15–40 minutes), then a drill (5 minutes).
3. Streak increments when the user completes at least one review, drill or problem in a calendar day (user's local time zone).

## 4.3 Solving a problem

1. Open problem → Workspace. Problem panel on the left, editor in the middle, coach panel on the right.
2. The user fills the Plan card (optional but encouraged: "Plan first" badge on the attempt) and presses **Check plan**. Feedback appears per field.
3. The user codes, runs visible tests (`Run`), and submits (`Submit` runs all tests).
4. When stuck, the user opens the next hint rung. Rungs open strictly in order.
5. On success: a **Wrap-up** panel shows the pattern + twist, related problems, the walkthrough link, and schedules the first review.
6. On giving up: rung 6 shows the solution; the attempt is recorded as `solved_with_solution` and scheduled for review sooner.

## 4.4 Learning a new pattern

1. Roadmap → pattern node → **Pattern page**: template, looping animation, "the idea in one sentence," variations, problems list (each with its twist, hidden until solved or until the user clicks "Show twist").
2. "Start" opens the pattern's first problem in the Workspace with the Plan card's pattern field pre-filled (worked-example fading, Section 11.6).

# 5. Information architecture

| Route | Page | Auth | Notes |
|---|---|---|---|
| `/` | Landing | Public | Redirects to `/today` if signed in |
| `/login` | Sign in | Public | Google, GitHub |
| `/today` | Today | Signed in | Home |
| `/roadmap` | Roadmap | Public (progress needs sign-in) | Pattern graph |
| `/patterns/[patternId]` | Pattern page | Public | |
| `/problems` | Problem list | Public | Filters |
| `/p/[slug]` | Workspace | Public (guest mode) | Main screen |
| `/drills` | Drill picker | Signed in | |
| `/drills/session` | Drill session | Signed in | Query: `?mode=recognition|toolkit&pattern=` |
| `/review` | Review session | Signed in | |
| `/stats` | Your progress | Signed in | |
| `/settings` | Settings | Signed in | Name, theme, sound, reduced motion, delete account |
| `/about` | About the method | Public | Explains pattern + twist and the learning science |

Global layout: a left sidebar (collapsible, 64 px collapsed / 220 px expanded) with Today, Roadmap, Problems, Drills, Review (with due count badge), Stats; bottom: Settings, profile. `⌘K` opens a command palette to jump to any problem or pattern. The Workspace hides the sidebar by default to maximize space.


# 6. Screen specifications

Every screen must define four states: **loading** (skeletons, never spinners for more than 300 ms of layout), **empty**, **error** (message + retry button), and **ready**. The specs below describe the ready state and any special empty states.

## 6.1 Landing (`/`)

- Header: logo "SeeCode", links (Roadmap, Problems, About), "Sign in" button.
- Hero: headline "Learn to see the approach, not memorize the answer." Subline: "Plan it, visualize it, remember it. Free." Primary button **Try a problem** (→ `/p/valid-palindrome`), secondary **Sign in**.
- Demo strip: an auto-playing, muted walkthrough of Valid Palindrome rendered with the real walkthrough component (not a video), with a "Pause" control.
- Three feature blocks: *Pattern + twist*, *Plan, then hints*, *Review that sticks*. Each: icon, 1-line title, 2-line description.
- Footer: About, GitHub link (if open source), privacy note ("Your code runs in your browser").

## 6.2 Today (`/today`)

Header: "Good morning, {firstName}" (time-aware), streak chip (🔥 not allowed; use a small flame icon from lucide), date.

Cards, in this order, only those that apply:

| Card | Shows when | Content | Primary action |
|---|---|---|---|
| Reviews due | `reviewsDue > 0` | Count, estimated minutes (count × 1 min), pattern chips of due items | **Start review** → `/review` |
| Continue your roadmap | Always (unless all problems mastered) | Next problem title, pattern chip, difficulty, "Last time: …" if in progress | **Open** → `/p/[slug]` |
| 5-minute drill | User has ≥ 1 unlocked pattern | Weakest pattern name, reason ("You needed hints on 3 of your last 4 sliding-window problems") | **Start drill** → `/drills/session?mode=recognition&pattern=…` |
| This week | Always | Mini stats: problems solved, drills done, reviews done, median plan time | Link → `/stats` |

Empty state (new user): a single card "Start with your first pattern: Hash map" → pattern page.

## 6.3 Roadmap (`/roadmap`)

- A left-to-right graph of patterns (nodes) with prerequisite edges (Section 24.1 defines the graph). Render with plain SVG/React (no graph library).
- Node shows: pattern name, progress ring (solved / total problems), state color: `locked` (muted, lock icon), `available` (outline), `in_progress` (accent outline), `mastered` (filled accent + check).
- Clicking a node opens its Pattern page. Locked nodes show a tooltip: "Unlocks after you solve 2 problems in {prereq}."
- Signed-out users see all nodes as `available` with no progress and a "Sign in to track progress" banner.

## 6.4 Pattern page (`/patterns/[patternId]`)

Sections, top to bottom:

1. **Header:** pattern name, family, state badge, progress ("2 of 3 solved"), **Start / Continue** button.
2. **The idea:** one sentence (`pattern.idea`), then 2–4 short paragraphs (`pattern.explanation`, markdown).
3. **When to reach for it (signals):** a list of signal phrases with one-line meanings (`pattern.signals`).
4. **Template:** the Python template (`pattern.template`) in a read-only code block, with each slot marked by a comment (`# SETUP`, `# LOOP`, `# UPDATE`, `# RECORD`, `# RETURN`). Hovering a slot highlights its description in a side list.
5. **See it move:** a looping mini-walkthrough of the template on a small example (`pattern.demo`), using the same visualization component, autoplay at 1 step / 700 ms, pausable.
6. **Variations:** cards for each variation (`pattern.variations`): name, one line, which problems use it.
7. **Problems:** a table: title, difficulty, status, **twist** (hidden behind "Show twist" until solved), related-to column (e.g. "Two Sum + sorted input").
8. **Common mistakes:** bullet list (`pattern.mistakes`), e.g. "Using `<=` instead of `<` in the loop condition."
9. **Python toolkit for this pattern:** the toolkit cards tagged with this pattern.

## 6.5 Problems list (`/problems`)

- Table columns: status icon, title, pattern (hidden until solved or toggle "Show patterns" is on; default off to avoid spoiling recognition), difficulty, best hint rung (as 1–6 dots), last attempted.
- Filters: difficulty, status (new / attempted / solved / mastered), pattern (only when "Show patterns" is on). Search by title.
- Sorting: default by roadmap order.

## 6.6 Drills (`/drills` and `/drills/session`)

**Picker (`/drills`):** two big options: **Recognition** ("Read the problem, plan it in 30 seconds") and **Toolkit** ("Match phrases to Python tools"). Optional pattern filter for recognition (default: mixed across unlocked patterns). Session length selector: 10 / 20 / 30 cards (default 10).

**Recognition session:**

- Top bar: progress (e.g. 3 / 10), timer ring (30 s per card; the timer is visible but does not auto-submit; after 30 s it turns amber and records `overtime: true`).
- Left (60%): problem title hidden (to avoid recall-by-name), summary, examples, constraints, targets.
- Right (40%): compact Plan card (pattern, structures, time, space; twist optional in drills).
- `Enter` submits. Feedback view: each field green/amber; the correct plan; the **signal phrases highlighted** in the statement with their meaning; the twist line. Button **Next** (`Enter`).
- End screen: accuracy by field, median time, patterns missed, "Add missed to review" (on by default: missed drills create review items).

**Toolkit session:** a card shows a phrase (e.g. "ignore letter case"); the user types the tool (autocomplete over the toolkit tool list) or picks from 4 options after 10 s; instant feedback with a one-line usage example (`"Aa".lower() == "aa"`).

## 6.7 Review (`/review`)

- Queue of due items (max 20 per session; default 10), ordered by due date then interleaved so the same pattern never appears twice in a row when avoidable.
- **Problem-plan item:** shows the problem (title hidden), the user fills the Plan card (60 s soft timer), gets feedback exactly like a drill, then rates themselves only if the automatic grade is borderline (Section 11.5). Offers "Re-solve in Workspace" (optional).
- **Toolkit item:** same as a toolkit drill card.
- End screen: done count, next review dates summary ("3 items tomorrow, 5 next week").

## 6.8 Stats (`/stats`)

- Per-pattern table: problems solved / total, median max-rung on first attempts, drill accuracy (last 30), mastery state.
- Chart: median plan time per week (line), last 8 weeks.
- Chart: distribution of max hint rung on first attempts per week (stacked bars, rungs 0–6).
- "Your common misses": top 5 structures or complexity targets most often missed in plans, with counts.
- Charts use Recharts with the design tokens (Section 18).

## 6.9 Settings (`/settings`)

Display name, theme (dark / light / system; default dark), sound effects (default off), reduced motion (default: follow system), drill timer on/off, "Export my data" (JSON download from `/api/v1/me/export`), "Delete account" (confirm dialog, calls `DELETE /api/v1/me`).

# 7. The Workspace (`/p/[slug]`)

The Workspace is the most important screen. It must feel like a focused IDE.

## 7.1 Layout

Three resizable columns (library: `react-resizable-panels`), sizes remembered in localStorage:

```text
┌ ◂ Back · Two Pointers · Valid Palindrome (Easy)            ⌘K  ⚙  Avatar ┐
├──────────────────┬──────────────────────────────────────┬────────────────┤
│ PROBLEM (30%)    │ EDITOR (46%)                         │ COACH (24%)    │
│                  │ class Solution:                      │ PLAN CARD      │
│ Summary          │     def isPalindrome(self, s):       │  Pattern   ▾   │
│ Examples         │         ...                          │  Structures ▾  │
│ Constraints      │                                      │  Time      ▾   │
│ Targets          │                                      │  Space     ▾   │
│                  │                                      │  Twist  _____  │
│ (signals appear  │                                      │  [Check plan]  │
│  highlighted     ├──────────────────────────────────────┤                │
│  after rung 2)   │ Tests │ Walkthrough │ Trace my code  │ HINT LADDER    │
│                  │ (bottom panel, 40% of middle height) │  1 Clarify  ○  │
│ LeetCode link ↗  │                                      │  2 Signals  ○  │
│                  │ [Run ⌘↵]              [Submit ⌘⇧↵]   │  3 Approach ○  │
│                  │                                      │  4 Plan     ○  │
│                  │                                      │  5 Walkthru ○  │
│                  │                                      │  6 Solution ○  │
└──────────────────┴──────────────────────────────────────┴────────────────┘
```

- Minimum widths: problem 260 px, editor 420 px, coach 280 px. Below 900 px total width, show the "Use a larger screen" notice with a link to drills.
- The bottom panel of the middle column is collapsible (`⌘J`), resizable vertically.
- The top bar shows the pattern name only after the attempt ends (solved or rung 3 opened), otherwise "Problem" to avoid spoiling recognition. The breadcrumb reads "Problems · Valid Palindrome" until then.

## 7.2 Problem panel

- Title, difficulty chip, "Open on LeetCode ↗" link (new tab).
- `summary` (markdown), `examples` (each: input, output, optional explanation), `constraints` (list), `targets` (time and space, shown as mono chips "O(n) time", "O(1) space").
- After rung 2 opens: each `signals[].phrase` occurrence in the summary/constraints is wrapped in a highlight (`<mark>`, color by the pattern it points to). Hovering a highlight shows its `meaning`.
- Notes box at the bottom: free-text notes saved per user per problem (debounced 800 ms to `PUT /problems/{slug}/notes`).

## 7.3 Plan card

Fields (all optional, but **Check plan** requires at least pattern and one complexity):

| Field | Control | Options source |
|---|---|---|
| Pattern | Combobox (type to filter) | All patterns in `patterns.json`, plus "Brute force", plus "Not sure" |
| Structures | Multi-select chips (max 4) | `structures.json` (Section 10.4) |
| Time | Select | `O(1)`, `O(log n)`, `O(n)`, `O(n log n)`, `O(n²)`, `O(2ⁿ)`, `Not sure` |
| Space | Select | `O(1)`, `O(log n)`, `O(n)`, `O(n²)`, `Not sure` |
| Twist | Text input, max 140 chars | Free text; placeholder "What's different about this problem?" |

Behavior:

- **Check plan** (`⌘⏎` when focus is in the card) sends the plan to `POST /attempts/{id}/plan`. Response shows per-field feedback: ✓ green, "close" amber, ✗ gray-amber with a one-line nudge (never the answer before rung 3). Twist feedback comes from the AI check (Section 12.2) and shows "Checking…" up to 3 s.
- The user may check the plan at most **3 times** per attempt. After the third check, or after rung 3 opens, the correct plan is revealed in the card (read-only overlay with the reference values).
- If the user presses Run before checking a plan, show a one-time dismissible tip: "Planning first helps it stick. Check your plan?" with buttons Check plan / Skip. Record `plan_skipped: true` if they skip.
- A plan checked before the first Run marks the attempt `planned_first: true`.

## 7.4 Hint ladder

Six rungs, opened strictly in order with a confirm-free click (no modal), each rendered as an accordion item in the coach panel. Opening a rung calls `POST /attempts/{id}/hints` with the rung number and returns that rung's content (content for rung N is not sent to the client before rung N is opened).

| Rung | Name | Content (from problem JSON) | Display |
|---|---|---|---|
| 1 | Clarify | `hints.clarify`: 1–2 questions + a tiny example worked by hand | Text |
| 2 | Signals | `signals[]` (phrase, meaning, points_to) and `constraintReading` (e.g. "n ≤ 2·10⁵ → O(n) or O(n log n)") | Highlights appear in the problem panel; list in coach panel |
| 3 | Approach | `hints.approach`: the pattern, why it fits, and `whyNot` (why the tempting alternative is worse) | Text + pattern chip linking to the pattern page |
| 4 | Plan | The pattern template with `hints.slots` filled in plain English for this problem | Slot list; button "Insert as comments" puts them into the editor at the cursor |
| 5 | Walkthrough | Opens the Walkthrough tab (Section 8) on the first example | Focuses bottom panel |
| 6 | Solution | `solution.code`, `solution.explanation`, `solution.toolkit` (callouts like "`.isalnum()` checks letter or digit") | Code block with Copy button disabled for 10 s ("Try typing it yourself") |

- Rung 5 is available at any time **after a successful submit** without counting as a hint ("See it run"). Before success, opening it counts as rung 5.
- The **max rung** of the attempt is stored and drives mastery (Section 11).
- A "Nudge me" button appears under the Tests panel when a submitted test fails (Section 12.3). It does not count as a rung but is capped (Section 12.5).

## 7.5 Tests panel

- Visible tests listed as cases: `Case 1`, `Case 2`… each showing input args, expected, actual (after run), stdout (collapsed if empty), and status (pass/fail/error/timeout).
- **Run** runs visible tests. **Submit** runs visible + hidden tests; for hidden failures show only the first failing hidden case's input, expected and actual (label it "Hidden case").
- A custom case editor: "+ Case" lets the user type args as JSON (validated) and run them; expected is computed by running the reference solution (only allowed after rung 6 or after solving; otherwise expected is left blank and only actual is shown).
- Errors show the Python traceback, with line numbers mapped to the editor; clicking the line jumps there.

## 7.6 Walkthrough tab

Defined fully in Section 8. Contains: input selector (examples + the user's custom cases), the visualization canvas, narration line, timeline with event markers, controls (step back, play/pause, step forward, speed 0.5×/1×/2×), the reference code with the current line highlighted, variables panel, and a **Predict mode** toggle (default on for the first walkthrough of each problem).

## 7.7 Trace my code tab

Runs the tracer on the **user's own code** with the selected input and renders it with the automatic renderers (no narration or events, since those are authored for the reference solution). Useful for debugging. Uses the same timeline and controls. Available at any time; does not count as a hint.

## 7.8 Wrap-up panel (after a successful Submit)

Slides over the coach panel:

- "Solved" with time taken, max rung used, and whether the plan was right first time.
- **Pattern + twist** card: "Two pointers (opposite ends) + skip non-alphanumeric characters."
- **Related problems** (`related[]`): each with the shared pattern and how its twist differs.
- **See it run** (opens Walkthrough), **Next problem** (roadmap order), **Back to Today**.
- A line: "We'll bring this back for review in 1 day."

## 7.9 Saving and resuming

- Code, plan, open rungs, and custom cases are saved to localStorage on every change (key `seecode:attempt:{slug}`) and synced to the API every 10 s while dirty (`PATCH /attempts/{id}`) and on page hide.
- Opening a problem with an unfinished attempt resumes it. The problem header offers "Start over" (creates a new attempt; old one is marked `abandoned`).
- An attempt is **finished** when Submit passes all tests, or when the user clicks "End attempt" (after rung 6 or anytime via menu).


# 8. Visualization system

Visualizations are generated by **running real Python** in the browser with a tracer, then rendering the recorded frames. There are no pre-rendered animations.

## 8.1 Pipeline

1. **Trace:** the Pyodide worker runs code under `sys.settrace`, recording a `Frame` at each line and return event of the solution's own code.
2. **Annotate:** for walkthroughs of the reference solution, the tracer also evaluates the problem's `viz.events` conditions and `viz.narration` templates at each frame, attaching tags and a narration string.
3. **Layout:** the renderer maps each variable to a visual block based on its type and the problem's `viz` config (which variables are pointers into which array, which list is a stack, and so on).
4. **Play:** the timeline steps through frames; blocks animate between frames with Framer Motion (`layout` animations, 180 ms).

## 8.2 Tracer (Python, runs inside Pyodide)

File: `apps/web/public/py/tracer.py` (loaded into Pyodide at worker start).

```python
import sys, json, re

MAX_STEPS = 3000
MAX_ITEMS = 64
MAX_STR = 200

class StepLimit(Exception):
    pass

def snap(v, depth=0):
    """Convert a Python value into a JSON-safe description."""
    if depth > 3:
        return {"t": "trunc"}
    if v is None or isinstance(v, (bool, int, float)):
        return {"t": "prim", "v": v}
    if isinstance(v, str):
        return {"t": "str", "v": v[:MAX_STR], "n": len(v)}
    cls = type(v).__name__
    if cls == "deque":
        items = list(v)
        return {"t": "deque", "v": [snap(x, depth + 1) for x in items[:MAX_ITEMS]], "n": len(items)}
    if isinstance(v, (list, tuple)):
        return {"t": "list", "v": [snap(x, depth + 1) for x in v[:MAX_ITEMS]], "n": len(v), "cls": cls}
    if isinstance(v, dict):
        items = list(v.items())[:MAX_ITEMS]
        return {"t": "dict", "v": [[snap(k, depth + 1), snap(x, depth + 1)] for k, x in items],
                "n": len(v), "cls": cls}
    if isinstance(v, (set, frozenset)):
        items = sorted(v, key=repr)[:MAX_ITEMS]
        return {"t": "set", "v": [snap(x, depth + 1) for x in items], "n": len(v)}
    return {"t": "obj", "v": repr(v)[:80], "cls": cls}

def marker_lines(code):
    """Map '# viz:<name>' comments to line numbers."""
    out = {}
    for i, line in enumerate(code.splitlines(), start=1):
        m = re.search(r"#\s*viz:([a-zA-Z0-9_]+)", line)
        if m:
            out.setdefault(m.group(1), []).append(i)
    return out

def fmt(template, env):
    """Evaluate a narration template like 's[{l}] is {s[l]!r}' against local variables."""
    try:
        return eval("f" + repr(template), {"__builtins__": {"repr": repr, "len": len}}, env)
    except Exception:
        return None

def run_traced(code, entry, args, viz=None):
    viz = viz or {}
    markers = marker_lines(code)
    events = viz.get("events", [])
    steps = []

    def depth_of(frame):
        d, f = 0, frame
        while f is not None:
            if f.f_code.co_filename == "<solution>":
                d += 1
            f = f.f_back
        return d

    def tracer(frame, event, arg):
        if frame.f_code.co_filename != "<solution>":
            return None
        if event == "call":
            return tracer
        if event not in ("line", "return"):
            return tracer
        if len(steps) >= MAX_STEPS:
            raise StepLimit()
        env = {k: v for k, v in frame.f_locals.items() if k != "self"}
        tags, say = [], None
        for ev in events:
            lines = markers.get(ev.get("at", ""), [])
            if ev.get("at") and frame.f_lineno not in lines:
                continue
            cond = ev.get("when")
            try:
                ok = True if not cond else bool(eval(cond, {"__builtins__": {"len": len}}, env))
            except Exception:
                ok = False
            if ok:
                tags.append(ev["id"])
                if say is None and ev.get("say"):
                    say = fmt(ev["say"], env)
        step = {
            "line": frame.f_lineno,
            "event": event,
            "func": frame.f_code.co_name,
            "depth": depth_of(frame),
            "locals": {k: snap(v) for k, v in env.items()},
            "tags": tags,
        }
        if say:
            step["say"] = say
        if event == "return":
            step["ret"] = snap(arg)
        steps.append(step)
        return tracer

    ns = {}
    exec(compile(code, "<solution>", "exec"), ns)
    sol = ns["Solution"]()
    result, error, truncated = None, None, False
    sys.settrace(tracer)
    try:
        result = getattr(sol, entry)(*args)
    except StepLimit:
        truncated = True
    except Exception as e:
        error = f"{type(e).__name__}: {e}"
    finally:
        sys.settrace(None)
    return json.dumps({"steps": steps, "result": snap(result), "error": error,
                       "truncated": truncated})
```

**Important semantics:**

- A `line` event fires **before** that line runs. The frame's locals show the state just before the highlighted line executes. The UI must label the highlighted line "about to run."
- `return` events carry the returned value in `ret`.
- Recursion depth comes from `depth`; the call-stack view (v2) uses it. In v1, the variables panel shows only the deepest frame at each step.
- If the trace hits `MAX_STEPS`, show "Showing the first 3,000 steps" and keep the partial trace.
- The tracer only runs for walkthroughs and "Trace my code," never for normal test runs (tracing is slow).

## 8.3 Frame format (TypeScript)

```ts
type Snap =
  | { t: "prim"; v: number | boolean | null }
  | { t: "str"; v: string; n: number }
  | { t: "list"; v: Snap[]; n: number; cls: "list" | "tuple" }
  | { t: "deque"; v: Snap[]; n: number }
  | { t: "dict"; v: [Snap, Snap][]; n: number; cls: string }   // dict, Counter, defaultdict
  | { t: "set"; v: Snap[]; n: number }
  | { t: "obj"; v: string; cls: string }
  | { t: "trunc" };

interface Frame {
  line: number;
  event: "line" | "return";
  func: string;
  depth: number;
  locals: Record<string, Snap>;
  tags: string[];      // event ids that fired at this step
  say?: string;        // narration for this step
  ret?: Snap;
}

interface Trace {
  steps: Frame[];
  result: Snap;
  error: string | null;
  truncated: boolean;
}
```

## 8.4 The `viz` config (in each problem's JSON)

```json
"viz": {
  "primary": "s",
  "pointers": [
    { "var": "l", "into": "s", "label": "l", "color": "a" },
    { "var": "r", "into": "s", "label": "r", "color": "b" }
  ],
  "window": null,
  "range": null,
  "roles": { "stack": [], "queue": [], "hidden": [] },
  "confirmed": { "into": "s", "outside": ["l", "r"] },
  "events": [
    { "id": "skip_l", "at": "skip_l", "label": "skip",
      "say": "s[{l}] is {s[l]!r}, not a letter or digit, so l moves right" },
    { "id": "skip_r", "at": "skip_r", "label": "skip",
      "say": "s[{r}] is {s[r]!r}, not a letter or digit, so r moves left" },
    { "id": "compare", "at": "compare", "label": "compare",
      "say": "Compare {s[l].lower()!r} and {s[r].lower()!r}" },
    { "id": "mismatch", "at": "compare", "when": "s[l].lower() != s[r].lower()",
      "label": "mismatch", "say": "They differ, so it is not a palindrome" },
    { "id": "done", "at": "done", "label": "return", "say": "Pointers met: every pair matched" }
  ],
  "predict": [
    { "atEvent": "skip_l", "occurrence": 1, "ask": "Where will l point next?", "var": "l", "kind": "index" },
    { "atEvent": "compare", "occurrence": 3, "ask": "Will these two characters match?", "kind": "yesno",
      "answerWhen": "s[l].lower() == s[r].lower()" }
  ]
}
```

Field meanings:

| Field | Meaning |
|---|---|
| `primary` | The main data variable; drawn largest, at the top |
| `pointers[]` | Integer variables drawn as arrows under cells of the `into` array. `color`: `a`–`d` maps to pointer colors in the design system |
| `window` | `{ "into": "s", "start": "l", "end": "r", "inclusive": true }` draws a shaded bracket over cells start..end |
| `range` | `{ "into": "nums", "lo": "lo", "hi": "hi", "mid": "mid" }` for binary search: cells outside lo..hi dimmed, mid marked |
| `roles.stack` | List variable names drawn as a vertical stack (top at top) |
| `roles.queue` | List/deque variable names drawn as a horizontal queue (front at left) |
| `roles.hidden` | Variables never shown |
| `confirmed` | Cells outside the given pointers are tinted "confirmed" (shows the invariant) |
| `events[]` | Named moments. `at` = marker name in the reference code (`# viz:<name>`), optional `when` condition, `label` for the timeline, optional `say` narration template |
| `predict[]` | Predict-mode pauses (max 3 per walkthrough). `kind`: `index` (click a cell; answer = value of `var` at the next step), `yesno` (answer = `answerWhen` evaluated at this step), `value` (type a value; answer = `var` at the next step) |

The reference solution carries the markers:

```python
class Solution:
    def isPalindrome(self, s: str) -> bool:
        l, r = 0, len(s) - 1
        while l < r:
            while l < r and not s[l].isalnum():
                l += 1  # viz:skip_l
            while l < r and not s[r].isalnum():
                r -= 1  # viz:skip_r
            if s[l].lower() != s[r].lower():  # viz:compare
                return False
            l += 1
            r -= 1
        return True  # viz:done
```

Predict answers for `index`/`value` kinds are computed from the **next step where the variable changes**, not simply the next frame. For `yesno`, the tracer must evaluate `answerWhen` at that frame; add it to the frame as `predictAnswer` by treating it as an extra event condition (implementation detail: include predict conditions in the events list with ids `predict:<n>`).

## 8.5 Renderers

Each renderer is a React component in `apps/web/components/viz/`. All use design tokens and animate with Framer Motion `layout` + `AnimatePresence`.

| Component | Draws | Rules |
|---|---|---|
| `ArrayStrip` | `list` of primitives, `str` | Cells 40×40 px, index under each cell, wraps to rows of `floor(width / 44)`. Pointer arrows (from `viz.pointers`) under the index row, labeled, colored. Dimmed cells: outside `range`. Tinted cells: `confirmed`. Changed cells flash (accent border, 300 ms) |
| `WindowBracket` | overlay on `ArrayStrip` | Shaded rounded rect over start..end, label "window = N" above |
| `SearchRange` | overlay on `ArrayStrip` | Cells outside lo..hi at 35% opacity; `mid` cell outlined; labels lo/mid/hi |
| `Grid` | `list` of `list` | Cells 32×32, row/col indexes; pointer pairs (v2) |
| `HashMapTable` | `dict` (incl. Counter, defaultdict) | Two-column table key → value; new keys slide in; changed values flash; class name shown as caption (e.g. "Counter") |
| `SetChips` | `set` | Chips in insertion-agnostic sorted order; new chips pop in |
| `StackColumn` | lists in `roles.stack` | Vertical, top item at top, push/pop animate |
| `QueueStrip` | `deque`, lists in `roles.queue` | Horizontal, front at left |
| `ScalarRow` | primitives not used as pointers | Name = value chips in the variables panel |
| `ObjectChip` | `obj` | Shows `repr` text |

Automatic mapping when no `viz` config exists (used by "Trace my code"): `str`/list-of-primitives → `ArrayStrip`; list-of-lists → `Grid`; dict → `HashMapTable`; set → `SetChips`; deque → `QueueStrip`; primitives → `ScalarRow`. Integer locals whose value is a valid index into exactly one visible array and whose name is in `{i, j, k, l, r, lo, hi, mid, left, right, start, end, fast, slow, p, q}` are drawn as pointers into that array automatically.

## 8.6 Walkthrough UI

```text
┌ Input: [Example 1 ▾]   Predict mode ●   Speed 1× ▾ ────────────────────┐
│ s                                                                     │
│ [R][a][c][e][ ][c][a][r][!]                                           │
│  0  1  2  3  4  5  6  7  8                                            │
│  ▲l                    ▲r                                             │
│                                                                       │
│ "Compare 'r' and 'r'"                                   (narration)   │
│                                                                       │
│ ◂  ▶/❚❚  ▸   ●──●─────●──────●────◆─────●─────────────●  step 7 / 31  │
│              skip   compare  skip   compare        return             │
├──────────────────────────────────────┬────────────────────────────────┤
│ reference code, current line ▶       │ variables: l=0  r=7            │
└──────────────────────────────────────┴────────────────────────────────┘
```

- **Timeline:** a scrubber with one tick per step; event steps get labeled markers (from `label`), mismatch/return markers use the accent-2 color. Clicking a marker jumps there. Keyboard: `←` / `→` step, `Space` play/pause, `Home`/`End`.
- **Narration:** shows `say` of the current step; if absent, shows the last narration faded (so text doesn't flicker on every line step).
- **Playback modes:** "Every line" (all frames) or "Key moments" (only frames with tags; default).
- **Predict mode:** when playback reaches a predict point, it pauses and shows the question as a banner over the canvas. For `index`, cells of the relevant array become clickable; for `yesno`, two buttons; for `value`, an input. After answering: correct → green check, continue; wrong → show the right answer with the relevant cell highlighted, continue on `Enter`. Results are sent in the attempt (`predictions: [{id, correct}]`).
- **Inputs:** the input selector lists the problem's examples and the user's custom cases; changing it re-traces.

## 8.7 Performance budgets

- Trace generation for problems in v1: < 300 ms for example inputs on a mid-range laptop.
- Rendering: 60 fps while playing at 2×; arrays up to 64 cells; beyond 64, show the first 64 with "+N more."
- Traces are memoized per (code hash, input) in memory.

# 9. Code execution

## 9.1 Worker architecture

- File: `apps/web/lib/runner/pyodide.worker.ts` (a module worker bundled by Next.js).
- On creation, it loads Pyodide from the jsDelivr CDN at a **pinned version** (`NEXT_PUBLIC_PYODIDE_VERSION`, set to the latest stable release at build time; verify on pyodide.org), then loads `harness.py` and `tracer.py` from `/py/`.
- The main thread wrapper `apps/web/lib/runner/runner.ts` exposes:

```ts
interface Runner {
  ready(): Promise<void>;
  runTests(req: { code: string; entry: string; tests: TestCase[]; compare?: CompareMode }): Promise<TestResult[]>;
  trace(req: { code: string; entry: string; args: unknown[]; viz?: VizConfig }): Promise<Trace>;
  status: "loading" | "ready" | "busy" | "crashed";
}
```

- A single worker instance is created when the Workspace mounts (or earlier on hover of a problem link, to warm up). It's kept alive across problems.
- **Timeouts:** tests 5 s total per Run/Submit; trace 4 s. On timeout, the main thread calls `worker.terminate()`, marks running tests as `timeout`, and creates a new worker (status `loading` until ready).
- Messages are typed: `{ id, type: "runTests" | "trace", payload }` → `{ id, ok, data | error }`.

## 9.2 Test harness (Python)

File: `apps/web/public/py/harness.py`.

```python
import json, copy, io, contextlib, traceback, time

def _normalize(v):
    if isinstance(v, tuple):
        return [_normalize(x) for x in v]
    if isinstance(v, list):
        return [_normalize(x) for x in v]
    return v

def _equal(got, expected, mode):
    got = _normalize(got)
    if mode == "unordered":
        return sorted(map(json.dumps, got)) == sorted(map(json.dumps, expected))
    if mode == "unordered_nested":
        norm = lambda xs: sorted(json.dumps(sorted(x)) for x in xs)
        return norm(got) == norm(expected)
    if mode == "float":
        return abs(got - expected) < 1e-6
    return got == expected

def run_tests(code, entry, tests_json, mode="exact"):
    tests = json.loads(tests_json)
    ns = {}
    try:
        exec(compile(code, "<solution>", "exec"), ns)
        sol = ns["Solution"]()
        fn = getattr(sol, entry)
    except Exception:
        err = traceback.format_exc(limit=3)
        return json.dumps([{"status": "error", "error": err} for _ in tests])
    out = []
    for t in tests:
        buf = io.StringIO()
        start = time.perf_counter()
        try:
            with contextlib.redirect_stdout(buf):
                got = fn(*copy.deepcopy(t["args"]))
            ok = _equal(got, t["expected"], t.get("compare", mode))
            out.append({"status": "pass" if ok else "fail", "got": _normalize(got),
                        "stdout": buf.getvalue()[:4000],
                        "ms": round((time.perf_counter() - start) * 1000, 2)})
        except Exception:
            out.append({"status": "error", "error": traceback.format_exc(limit=3),
                        "stdout": buf.getvalue()[:4000]})
    return json.dumps(out)
```

- `TestCase` = `{ id: string; args: unknown[]; expected: unknown; hidden: boolean; compare?: "exact" | "unordered" | "unordered_nested" | "float" }`.
- `TestResult` = `{ id; status: "pass" | "fail" | "error" | "timeout"; got?; stdout?; error?; ms? }`.
- Tracebacks: map `File "<solution>", line N` to editor line N and show a clickable link.
- User code may `import` standard-library modules (`collections`, `heapq`, `bisect`, `math`, `itertools`, `functools`, `string`, `re`). `typing` names (`List`, `Optional`, `Dict`) must be pre-imported in the namespace: prepend `from typing import *\nfrom collections import *\nimport heapq, bisect, math, itertools, functools` to every run and offset line numbers accordingly (store the offset constant `PRELUDE_LINES`).

## 9.3 Security notes

- The code runs in the user's own browser tab in a worker; it cannot reach our servers except through normal network requests that the worker cannot authenticate (no tokens are passed to the worker).
- Hidden tests are shipped to the client. This is accepted: SeeCode is a learning tool, not a contest. Do not present results as "verified" anywhere.


# 10. Content system

All learning content lives as JSON files in `content/`, versioned in Git. The API loads and validates them at startup; the web app never reads them directly (so answers are not exposed before hints are opened).

## 10.1 Files

```text
content/
├─ patterns.json        # pattern definitions, templates, signals, variations
├─ roadmap.json         # pattern order and prerequisites
├─ structures.json      # options for the Plan card "Structures" field
├─ toolkit.json         # phrase → Python tool cards
└─ problems/
   ├─ two-sum.json
   ├─ valid-palindrome.json
   └─ ...               # one file per problem, file name = slug
```

## 10.2 `patterns.json`

```json
[
  {
    "id": "two_pointers_opposite",
    "family": "two_pointers",
    "name": "Two pointers (opposite ends)",
    "idea": "Start one pointer at each end and move them toward each other, so each step rules out work.",
    "explanation": "Markdown, 2-4 short paragraphs...",
    "signals": [
      { "phrase": "sorted array", "meaning": "Moving a pointer changes the sum or value in a known direction." },
      { "phrase": "reads the same forward and backward", "meaning": "Compare the two ends and move inward." },
      { "phrase": "O(1) extra space", "meaning": "No copies or maps: work in place with indexes." }
    ],
    "template": "def solve(arr):\n    l, r = 0, len(arr) - 1  # SETUP\n    while l < r:  # LOOP\n        # UPDATE: move l or r based on a comparison\n        ...\n        # RECORD: update the answer if needed\n    return ...  # RETURN\n",
    "slots": [
      { "id": "setup", "label": "Setup", "prompt": "Where do the pointers start?" },
      { "id": "loop", "label": "Loop", "prompt": "When do you stop?" },
      { "id": "update", "label": "Update", "prompt": "What decides which pointer moves?" },
      { "id": "record", "label": "Record", "prompt": "When do you save or check the answer?" },
      { "id": "return", "label": "Return", "prompt": "What do you return?" }
    ],
    "variations": [
      { "name": "Pair sum on sorted input", "line": "Move l up if the sum is too small, r down if too big." },
      { "name": "Symmetry check", "line": "Compare both ends; skip characters that don't count." },
      { "name": "Fixed element + pair", "line": "Loop over one element, run two pointers on the rest." }
    ],
    "mistakes": [
      "Using l <= r when the middle element should not be compared with itself.",
      "Forgetting to move a pointer after a match, causing an infinite loop."
    ],
    "demo": {
      "code": "class Solution:\n    def demo(self, nums, target):\n        l, r = 0, len(nums) - 1\n        while l < r:\n            s = nums[l] + nums[r]  # viz:sum\n            if s == target:\n                return [l, r]\n            if s < target:\n                l += 1\n            else:\n                r -= 1\n        return []\n",
      "entry": "demo",
      "args": [[1, 3, 4, 6, 8, 11], 10],
      "viz": { "primary": "nums", "pointers": [{ "var": "l", "into": "nums", "label": "l", "color": "a" }, { "var": "r", "into": "nums", "label": "r", "color": "b" }], "events": [{ "id": "sum", "at": "sum", "label": "sum", "say": "{nums[l]} + {nums[r]} = {nums[l] + nums[r]}" }] }
    },
    "toolkit": ["lower", "isalnum"]
  }
]
```

## 10.3 `roadmap.json`

```json
{
  "patterns": [
    { "id": "hashing",               "x": 0, "y": 1, "prereqs": [] },
    { "id": "two_pointers_opposite", "x": 1, "y": 0, "prereqs": ["hashing"] },
    { "id": "stack",                 "x": 1, "y": 2, "prereqs": ["hashing"] },
    { "id": "sliding_window",        "x": 2, "y": 0, "prereqs": ["two_pointers_opposite"] },
    { "id": "binary_search",         "x": 2, "y": 2, "prereqs": ["two_pointers_opposite"] }
  ],
  "unlockRule": { "solvedInPrereq": 2 }
}
```

`x`/`y` are grid positions for the Roadmap SVG (column, row). A pattern unlocks when the user has solved `solvedInPrereq` problems in **each** prerequisite.

## 10.4 `structures.json`

```json
[
  { "id": "array",       "label": "Array / string" },
  { "id": "hash_map",    "label": "Hash map (dict)" },
  { "id": "hash_set",    "label": "Hash set" },
  { "id": "counter",     "label": "Counter / frequency array" },
  { "id": "stack",       "label": "Stack" },
  { "id": "queue",       "label": "Queue / deque" },
  { "id": "heap",        "label": "Heap" },
  { "id": "sorted",      "label": "Sorted array (sort first)" },
  { "id": "grid",        "label": "2D grid" },
  { "id": "linked_list", "label": "Linked list" },
  { "id": "tree",        "label": "Tree" },
  { "id": "graph",       "label": "Graph" }
]
```

## 10.5 `toolkit.json`

```json
[
  { "id": "lower", "tool": ".lower()", "phrases": ["case-insensitive", "ignore letter case", "uppercase and lowercase are the same"],
    "example": "\"AbC\".lower()  # 'abc'", "patterns": ["two_pointers_opposite", "hashing"] },
  { "id": "isalnum", "tool": ".isalnum()", "phrases": ["ignore non-alphanumeric characters", "only letters and digits count"],
    "example": "\"a\".isalnum(), \",\".isalnum()  # True, False", "patterns": ["two_pointers_opposite"] }
]
```

The full list of 25 cards is in Section 24.3.

## 10.6 Problem file (full example: `valid-palindrome.json`)

```json
{
  "slug": "valid-palindrome",
  "title": "Valid Palindrome",
  "leetcodeUrl": "https://leetcode.com/problems/valid-palindrome/",
  "difficulty": "easy",
  "patternId": "two_pointers_opposite",
  "order": 4,
  "summary": "You get a string `s`. Decide whether it reads the same forward and backward once you ignore letter case and drop every character that is not a letter or digit.",
  "examples": [
    { "input": "s = \"Race car!\"", "output": "true", "explanation": "Keeping letters and digits and lowercasing gives \"racecar\"." },
    { "input": "s = \"ab\"", "output": "false" }
  ],
  "constraints": ["1 ≤ len(s) ≤ 2·10⁵", "s contains printable ASCII characters"],
  "targets": { "time": "O(n)", "space": "O(1)" },
  "entry": "isPalindrome",
  "starterCode": "class Solution:\n    def isPalindrome(self, s: str) -> bool:\n        pass\n",

  "approaches": [
    {
      "id": "optimal",
      "patternId": "two_pointers_opposite",
      "structures": ["array"],
      "time": "O(n)",
      "space": "O(1)",
      "twist": "Skip characters that are not letters or digits, and compare in lowercase.",
      "twistKeywords": [["skip", "ignore", "filter"], ["alnum", "alphanumeric", "letter", "digit", "punctuation"]]
    },
    {
      "id": "clean_reverse",
      "patternId": "brute_force",
      "structures": ["array"],
      "time": "O(n)",
      "space": "O(n)",
      "twist": "Build a cleaned lowercase copy and compare it with its reverse.",
      "twistKeywords": [["clean", "filter", "copy", "new string"], ["reverse", "[::-1]"]],
      "acceptedAs": "suboptimal",
      "note": "Works, but uses O(n) extra space. The target is O(1)."
    }
  ],

  "signals": [
    { "phrase": "reads the same forward and backward", "meaning": "Compare characters from both ends.", "pointsTo": "two_pointers_opposite" },
    { "phrase": "ignore letter case", "meaning": "Compare with .lower().", "pointsTo": "toolkit:lower" },
    { "phrase": "not a letter or digit", "meaning": "Skip these with .isalnum().", "pointsTo": "toolkit:isalnum" }
  ],
  "constraintReading": "len(s) up to 2·10⁵ means O(n) or O(n log n). The O(1) space target rules out building a cleaned copy.",

  "hints": {
    "clarify": "Does a space count? Does 'A' equal 'a'? Try \"No, on!\" by hand: what are the only characters that matter?",
    "approach": "Two pointers from both ends. Compare the characters they point at and move inward, skipping characters that don't count. Why not clean and reverse? It works, but it builds a second string, so it uses O(n) space.",
    "whyNot": "A hash map doesn't help: order matters here, not counts.",
    "slots": {
      "setup": "l at 0, r at the last index.",
      "loop": "Keep going while l < r.",
      "update": "Move l right past non-alphanumeric characters; move r left the same way.",
      "record": "Compare s[l].lower() with s[r].lower(); if they differ, stop with False.",
      "return": "If the loop finishes, return True."
    }
  },

  "solution": {
    "code": "class Solution:\n    def isPalindrome(self, s: str) -> bool:\n        l, r = 0, len(s) - 1\n        while l < r:\n            while l < r and not s[l].isalnum():\n                l += 1  # viz:skip_l\n            while l < r and not s[r].isalnum():\n                r -= 1  # viz:skip_r\n            if s[l].lower() != s[r].lower():  # viz:compare\n                return False\n            l += 1\n            r -= 1\n        return True  # viz:done\n",
    "explanation": "Each pointer moves inward at most n times in total, so the time is O(n). Only two integers are stored, so the space is O(1).",
    "toolkit": ["isalnum", "lower"]
  },

  "viz": { "...": "see Section 8.4 for the full object" },

  "tests": [
    { "id": "e1", "args": ["Race car!"], "expected": true, "hidden": false },
    { "id": "e2", "args": ["ab"], "expected": false, "hidden": false },
    { "id": "h1", "args": [" "], "expected": true, "hidden": true },
    { "id": "h2", "args": ["0P"], "expected": false, "hidden": true },
    { "id": "h3", "args": [".,"], "expected": true, "hidden": true },
    { "id": "h4", "args": ["No lemon, no melon"], "expected": true, "hidden": true }
  ],

  "related": [
    { "slug": "two-sum-ii", "relation": "Same pointers from both ends, but moved by comparing a sum to a target." },
    { "slug": "three-sum", "relation": "Adds an outer loop around two pointers." }
  ]
}
```

## 10.7 Content validation

`scripts/validate_content.py` (run in CI and at API startup; the API refuses to start on errors) checks:

1. Every file matches the Pydantic models in `apps/api/app/content/models.py` (Section 16.4 lists them).
2. `slug` equals the file name; slugs and ids are unique.
3. Every `patternId`, `structures` id and toolkit id exists.
4. Every `signals[].phrase` appears word for word in `summary` or `constraints` (case-insensitive).
5. Exactly one approach has `id: "optimal"`.
6. `hints.slots` has a value for every slot of the approach's pattern.
7. `solution.code` passes **all** tests when run with the harness (the validator runs Python locally, not Pyodide).
8. Every `# viz:<name>` marker referenced by `viz.events[].at` exists in `solution.code`.
9. At least 2 visible and 3 hidden tests.
10. Warn (not fail) if `summary` is longer than 450 characters.

## 10.8 Authoring rules

- Write `summary`, `examples` and `constraints` **in your own words**. Do not paste text from LeetCode or any other site. Keep the same input/output meaning and constraints, rephrased. Link to the original via `leetcodeUrl`.
- Test inputs must be our own. Do not copy example inputs verbatim from LeetCode; use different strings or numbers.
- The twist is one sentence, starting with a verb when possible ("Skip…", "Sort first…", "Search on the answer…").
- Hints never contain code except identifiers in backticks. Rung 4 slots are plain English.
- `constraintReading` must connect the constraint to a complexity and to a conclusion ("…rules out O(n²)").


# 11. Learning engine

All rules in this section are deterministic and live in the API (`apps/api/app/learning/`). The web app displays results; it never computes grades.

## 11.1 Plan grading

Input: the user's `PlanCard` and the problem's `approaches`. Output: a `PlanGrade`.

**Per-field scoring for one approach `A`:**

| Field | `correct` | `close` | `wrong` |
|---|---|---|---|
| pattern | `plan.pattern == A.patternId` | same `family` as A's pattern | otherwise, or "Not sure" |
| structures | every A structure present and ≤ 1 extra | ≥ half of A's structures present | otherwise |
| time | exact match | — | otherwise, or "Not sure" |
| space | exact match | — | otherwise, or "Not sure" |
| twist | all `twistKeywords` groups matched (any word of each group appears, case-insensitive) | ≥ 1 group matched | none matched, or empty |

The AI twist check (Section 12.2) runs after the keyword check and **replaces** the twist result when it returns in time (≤ 3 s). Empty twist is `wrong` without calling the AI.

**Field scores:** correct = 1, close = 0.5, wrong = 0. **Weights:** pattern 0.35, structures 0.20, time 0.15, space 0.10, twist 0.20. In drills, twist is optional: if empty, drop its weight and renormalize.

**Choosing the approach:** compute the score for every approach; pick the highest; on a tie prefer `optimal`. If the chosen approach has `acceptedAs: "suboptimal"`, cap the pattern field at `close` and attach the approach's `note` ("Works, but uses O(n) extra space…").

**Result:**

```json
{
  "approachId": "optimal",
  "score": 0.85,
  "correct": true,
  "fields": {
    "pattern": { "result": "correct" },
    "structures": { "result": "correct", "missing": [], "extra": [] },
    "time": { "result": "correct" },
    "space": { "result": "wrong", "nudge": "Check the space target in the problem." },
    "twist": { "result": "close", "feedback": "Right idea about skipping. What about letter case?", "source": "ai" }
  },
  "reveal": null
}
```

`correct` is true when pattern and time are `correct` and `score ≥ 0.8`.

**Nudges** (shown for `wrong`/`close` fields before rung 3 opens; never the answer):

| Field | Nudge |
|---|---|
| pattern | "Look at the targets ({targets.time}, {targets.space}). Which approach reaches them?" |
| structures (missing) | "You may be missing a structure. What do you need to look things up or remember?" |
| structures (extra) | "Do you need everything you picked? Try it without {first extra label}." |
| time | "Check the input size in the constraints. What does it allow?" |
| space | "Check the space target in the problem." |
| twist | AI feedback, or "Say what this problem does differently from the plain pattern." |

`reveal` is filled with the optimal approach (pattern, structures, time, space, twist) when: it is the third check in this attempt, or rung ≥ 3 is open, or it is a drill or review answer (drills and reviews always reveal after answering).

## 11.2 Attempt outcomes

| Outcome | Condition |
|---|---|
| `solved_clean` | Submit passed all tests and `maxRung ≤ 2` |
| `solved_with_help` | Submit passed and `3 ≤ maxRung ≤ 5` |
| `solved_with_solution` | Submit passed and `maxRung = 6` |
| `gave_up` | User ended the attempt without passing |
| `abandoned` | Replaced by "Start over," or no activity for 14 days |

Time spent = sum of active intervals (tab visible and input within the last 2 minutes), tracked client-side and sent with each sync.

## 11.3 Mastery

**Problem status:** `new` → `attempted` → `solved` → `mastered`.

- `solved`: any attempt with outcome `solved_*`.
- `mastered`: an attempt with outcome `solved_clean`, **and** a later review of that problem graded `good` or `easy` at an interval of ≥ 6 days.

**Pattern state:**

- `locked`: a prerequisite pattern has fewer than `unlockRule.solvedInPrereq` solved problems.
- `available`: unlocked, nothing solved.
- `in_progress`: ≥ 1 problem solved.
- `mastered`: ≥ 2 problems mastered (or all, if the pattern has fewer than 2).

Signed-out users: all patterns `available`.

## 11.4 Review items and scheduling

A `review_item` is created or updated:

| Trigger | Kind | First due |
|---|---|---|
| Attempt `solved_clean` | `problem_plan` | +3 days |
| Attempt `solved_with_help` | `problem_plan` | +1 day |
| Attempt `solved_with_solution` or `gave_up` | `problem_plan` with `resolve: true` | +1 day |
| Drill answer not `correct` | `problem_plan` (if none exists) | +1 day |
| Toolkit drill miss | `toolkit` | +1 day |

If an item already exists, a new failure resets it (grade `again`).

**Grades** from a review answer:

- `easy`: plan `correct` and answered in ≤ 25 s.
- `good`: plan `correct`.
- borderline (`0.5 ≤ score < 0.8`): ask the user "How did that feel?" with **Hard** / **Good** buttons; use their choice.
- `again`: `score < 0.5`.

**Scheduling** (SM-2 variant; `apps/api/app/learning/scheduling.py`):

```python
from datetime import datetime, timedelta, timezone
import random

MAX_INTERVAL = 180.0

def schedule(item, grade: str, now: datetime | None = None):
    now = now or datetime.now(timezone.utc)
    if grade == "again":
        item.reps = 0
        item.lapses += 1
        item.ease = max(1.3, item.ease - 0.20)
        item.interval_days = 1.0
    else:
        item.reps += 1
        if item.reps == 1:
            base = 1.0
        elif item.reps == 2:
            base = 3.0
        else:
            base = item.interval_days * item.ease
        if grade == "hard":
            item.ease = max(1.3, item.ease - 0.15)
            base = max(1.0, item.interval_days * 1.2)
        elif grade == "easy":
            item.ease = min(3.0, item.ease + 0.15)
            base *= 1.3
        item.interval_days = min(MAX_INTERVAL, round(base * random.uniform(0.9, 1.1), 1))
    item.due_at = now + timedelta(days=item.interval_days)
    item.last_grade = grade
    item.last_reviewed_at = now
    return item
```

Defaults: `ease = 2.5`, `reps = 0`, `lapses = 0`, `interval_days = 0`. Items with `resolve: true` show **Re-solve in Workspace** as the primary action; the review then counts when that attempt ends (`solved_clean` → `good`; other solved → `hard`; not solved → `again`).

## 11.5 Review queue

- `GET /review/queue` returns items with `due_at ≤ end of today` (user's time zone), oldest due first, max 20.
- Interleave: reorder so no two consecutive items share a pattern when possible (greedy: pick the oldest item whose pattern differs from the previous).

## 11.6 Worked-example fading (Workspace)

For the first problem of each pattern (`order` lowest in that pattern) and only on the user's first attempt:

- The Plan card's pattern field is pre-filled with the pattern and marked "Given."
- Rung 1 (Clarify) and rung 2 (Signals) are open from the start and **do not** count toward `maxRung`.
- The Pattern page link is shown in the coach panel.

For the second problem of the pattern: nothing pre-filled, but rung 1 is free. From the third problem on: no support.

## 11.7 Drills

**Drill pool:** every problem (full or `drillOnly`, Section 24.2) whose pattern is unlocked for the user. Drill-only problems exist so recognition practice has variety without full content.

**Recognition card selection** (per session of N cards):

1. For each unlocked pattern `p`, compute `weakness(p) = 1 − accuracy of the last 20 drill answers in p` (use 0.5 when fewer than 3 answers).
2. Weight each candidate problem: `w = 1 + 2·weakness(pattern) + (1 if never drilled by this user) − (0.8 if drilled in the last 24 h)`, floored at 0.1.
3. Sample without replacement by weight, with constraints: no pattern three times in a row; no problem twice in a session. If a `pattern` filter is set, 70% of cards come from that pattern and 30% from others (interleaving stays on).
4. Every drill answer is graded with Section 11.1 (twist optional) and stored in `drill_answers`.

**Toolkit card selection:** cards due for review first, then cards tagged with unlocked patterns, weighted by miss rate.

## 11.8 Today composition

```text
reviewsDue      = count(review_items where due_at <= end of today)
continueProblem = unfinished attempt (most recent) if any,
                  else first problem by roadmap order in an unlocked pattern with status != solved/mastered
weakPattern     = unlocked pattern with the highest weakness (min 3 drill answers),
                  else the pattern of the most recent attempt with maxRung >= 3
weeklyStats     = problems solved, drills done, reviews done, median plan time (last 7 days)
streak          = consecutive days (user tz) with >= 1 finished attempt, drill session or review
```

## 11.9 Placement (v2 hook)

Store nothing extra in v1, but keep `profiles.placement` (jsonb, nullable) so v2 can add a placement test without a migration.

# 12. AI features

The LLM is used for exactly two things in v1. Everything else is rule-based, so the product works when the AI is unavailable.

## 12.1 Provider wrapper

`apps/api/app/ai/client.py` exposes one async function:

```python
async def complete_json(system: str, user: str, schema: type[BaseModel],
                        timeout_s: float = 6.0) -> BaseModel | None:
    ...
```

- Provider and model come from `LLM_PROVIDER` and `LLM_MODEL`. Implement one provider with `httpx` against its HTTP API; keep the interface so others can be added.
- Ask for JSON only; parse with the Pydantic `schema`. On parse failure or validation failure (Section 12.4), retry once with the note "Return only valid JSON matching the schema." On second failure or timeout, return `None`.
- Temperature 0.2. Max output tokens 200.

## 12.2 Twist check

Called from plan grading when the twist is non-empty.

**System prompt:**

```text
You are grading one line written by a student who is planning a solution to a coding
interview problem. The line should state the "twist": what this problem changes about
the standard pattern. Compare the student's twist with the reference twist.

Rules:
- Judge meaning, not wording. Synonyms and different phrasing are fine.
- "correct": captures the key idea of the reference twist.
- "close": partly right or missing one important part.
- "wrong": misses the key idea or describes a different approach.
- feedback: one sentence, at most 25 words, phrased as a question or a nudge when not
  correct. Never include code. Never state the reference twist outright.
Return JSON only: {"result": "correct" | "close" | "wrong", "feedback": "..."}
```

**User message:**

```text
Problem summary: {summary}
Pattern: {pattern name of chosen approach}
Reference twist: {approach.twist}
Student twist: {plan.twist}
```

**Cache:** key = `sha256(slug + "|" + approachId + "|" + normalize(twist))` where `normalize` lowercases, trims, collapses whitespace and strips punctuation. Stored in `ai_cache` with no expiry (invalidate by including `content_version` in the key; bump it when a problem's twist changes).

## 12.3 Nudge me (failing test)

Shown under the Tests panel after a failed Submit or Run. Sends the user's code, the failing case (args, expected, got or error), the problem summary, the optimal approach, and the user's max rung.

**System prompt:**

```text
You are a coding-interview coach. The student's Python solution fails a test.
Help them find the bug themselves.

Rules:
- Reply with ONE short question or observation (max 30 words) that points at where to look.
- Refer to line numbers or variable names from their code.
- Never write code, never give the fix, never paste a corrected line.
- If the approach itself is wrong, say which part of the plan to revisit, not the answer.
Return JSON only: {"nudge": "...", "line": <line number or null>}
```

The UI shows the nudge and, when `line` is set, highlights that line in the editor for 3 s.

## 12.4 Output validation

Before any AI text is shown, reject it (treat as failure) if it matches any of:

- a code fence (```` ``` ````),
- the regex `\b(def|class|return|import|lambda)\b`,
- the regex `^\s{4,}\S` on any line (indented code),
- more than 40 words.

## 12.5 Limits and cost control

- Per user per day: 40 AI calls total (`AI_DAILY_LIMIT`). Counted in `ai_usage`. When exceeded: twist uses keyword grading only; Nudge me shows "Daily nudges used up. Try the hint ladder."
- Guests: no AI calls (keyword twist grading only; Nudge me hidden).
- Nudge me: max 3 per attempt.
- Log every call: user id, feature, latency ms, cached (bool), success (bool). Never log the user's code in production logs.


# 13. Architecture & tech stack

## 13.1 Architecture

```text
                        ┌───────────────────────────── Browser ─────────────────────────────┐
                        │  Next.js app (React, TypeScript)                                   │
                        │   ├─ UI (pages, Workspace, drills, review)                         │
                        │   ├─ Monaco editor                                                 │
                        │   └─ Web Worker: Pyodide  ── harness.py (tests) ── tracer.py (viz) │
                        └───────┬──────────────────────────────────────────┬─────────────────┘
                                │ HTTPS + JWT (JSON)                       │ OAuth
                                ▼                                          ▼
                 ┌──────────────────────────────┐              ┌──────────────────────┐
                 │ FastAPI (Python)             │  verify JWT  │ Supabase Auth        │
                 │  ├─ content loader + models  │◄────────────►│ (Google, GitHub)     │
                 │  ├─ learning engine          │              └──────────────────────┘
                 │  ├─ AI client + cache        │──► LLM provider (HTTP)
                 │  └─ routers /api/v1/...      │
                 └──────────────┬───────────────┘
                                │ SQL (asyncpg)
                                ▼
                 ┌──────────────────────────────┐
                 │ Postgres (Supabase)          │
                 └──────────────────────────────┘
```

- **Content** ships inside the API container (the `content/` folder is copied in at build time).
- **User code never reaches the server.** Only attempt metadata, code snapshots (for resume) and plans are stored.
- **Static pages** (landing, about, pattern pages without progress) are rendered by Next.js; the API provides content through public endpoints that exclude answers.

## 13.2 Tech stack

Use the latest stable version of each at project start; pin exact versions in lockfiles.

| Area | Choice | Purpose / notes |
|---|---|---|
| Web framework | **Next.js** (App Router) + **React** + **TypeScript** (strict) | Pages, routing, server components for public pages |
| Styling | **Tailwind CSS** + CSS variables for tokens | Section 18 tokens in `globals.css` |
| UI primitives | **shadcn/ui** (Radix under the hood) | Dialog, Popover, Command (⌘K), Tabs, Accordion, Tooltip, Select |
| Icons | **lucide-react** | One icon set only |
| Editor | **@monaco-editor/react** | Python mode; theme from tokens |
| Layout panels | **react-resizable-panels** | Workspace columns |
| Animation | **Framer Motion** | Visualization and small transitions |
| Charts | **Recharts** | Stats page only |
| Client state | **Zustand** | Workspace store, walkthrough player |
| Server state | **TanStack Query** | API calls, caching, retries |
| Forms/validation | **zod** | API response validation and form schemas |
| Python in browser | **Pyodide** (pinned, jsDelivr CDN) | Tests and tracing |
| Auth client | **@supabase/supabase-js**, **@supabase/ssr** | Sign-in, session |
| API | **FastAPI**, **Pydantic v2**, **uvicorn** | Typed endpoints |
| ORM + migrations | **SQLAlchemy 2** (async) + **asyncpg** + **Alembic** | Database access |
| Auth verification | **PyJWT** with JWKS (or HS256 secret) | Verify Supabase access tokens |
| HTTP client | **httpx** | LLM calls |
| Settings | **pydantic-settings** | Env config |
| Database + Auth | **Supabase** (Postgres + Auth) | Free tier to start |
| Analytics | **PostHog** (JS) | Section 19 |
| Errors | **Sentry** (web + API) | |
| Web tests | **Vitest** + **Testing Library**, **Playwright** | Unit + end-to-end |
| API tests | **pytest**, **pytest-asyncio**, **httpx.AsyncClient** | |
| Lint/format | **ESLint**, **Prettier**, **Ruff** (lint + format), **mypy** (API) | |
| Package managers | **pnpm** (web, workspace), **uv** (Python) | |
| CI | **GitHub Actions** | Section 22 |
| Hosting | **Vercel** (web), **Render** or **Google Cloud Run** (API, Docker), **Supabase** (DB) | Free tiers at start |

# 14. Repository structure

A monorepo managed with pnpm workspaces (web) and uv (API).

```text
seecode/
├─ README.md
├─ docs/
│  ├─ SPEC.md                    # this document (markdown copy)
│  └─ DECISIONS.md               # one line per decision
├─ content/                      # Section 10
├─ scripts/
│  ├─ validate_content.py
│  └─ new_problem.py             # scaffolds content/problems/<slug>.json
├─ apps/
│  ├─ web/
│  │  ├─ app/
│  │  │  ├─ layout.tsx           # providers, fonts, theme
│  │  │  ├─ page.tsx             # landing
│  │  │  ├─ login/page.tsx
│  │  │  ├─ auth/callback/route.ts
│  │  │  ├─ (app)/layout.tsx     # sidebar shell
│  │  │  ├─ (app)/today/page.tsx
│  │  │  ├─ (app)/roadmap/page.tsx
│  │  │  ├─ (app)/patterns/[patternId]/page.tsx
│  │  │  ├─ (app)/problems/page.tsx
│  │  │  ├─ (app)/drills/page.tsx
│  │  │  ├─ (app)/drills/session/page.tsx
│  │  │  ├─ (app)/review/page.tsx
│  │  │  ├─ (app)/stats/page.tsx
│  │  │  ├─ (app)/settings/page.tsx
│  │  │  ├─ p/[slug]/page.tsx    # Workspace (no sidebar)
│  │  │  └─ about/page.tsx
│  │  ├─ components/
│  │  │  ├─ shell/               # Sidebar, CommandPalette, TopBar
│  │  │  ├─ today/               # ReviewDueCard, ContinueCard, DrillCard, WeekCard
│  │  │  ├─ roadmap/             # RoadmapGraph, PatternNode
│  │  │  ├─ pattern/             # PatternHeader, TemplateBlock, VariationCard
│  │  │  ├─ workspace/
│  │  │  │  ├─ Workspace.tsx
│  │  │  │  ├─ ProblemPanel.tsx
│  │  │  │  ├─ EditorPanel.tsx
│  │  │  │  ├─ BottomPanel.tsx   # tabs: Tests, Walkthrough, Trace
│  │  │  │  ├─ TestsPanel.tsx
│  │  │  │  ├─ CoachPanel.tsx
│  │  │  │  ├─ PlanCard.tsx
│  │  │  │  ├─ HintLadder.tsx
│  │  │  │  └─ WrapUp.tsx
│  │  │  ├─ viz/
│  │  │  │  ├─ WalkthroughPlayer.tsx
│  │  │  │  ├─ Timeline.tsx
│  │  │  │  ├─ Canvas.tsx        # picks renderers
│  │  │  │  ├─ ArrayStrip.tsx  WindowBracket.tsx  SearchRange.tsx  Grid.tsx
│  │  │  │  ├─ HashMapTable.tsx  SetChips.tsx  StackColumn.tsx  QueueStrip.tsx
│  │  │  │  ├─ VariablesPanel.tsx  CodeView.tsx  PredictBanner.tsx
│  │  │  ├─ drills/              # DrillSession, DrillFeedback, ToolkitCard
│  │  │  ├─ review/              # ReviewSession
│  │  │  ├─ stats/
│  │  │  └─ ui/                  # shadcn components
│  │  ├─ lib/
│  │  │  ├─ api/client.ts        # typed fetch with auth header
│  │  │  ├─ api/schemas.ts       # zod schemas mirroring Section 16
│  │  │  ├─ runner/pyodide.worker.ts
│  │  │  ├─ runner/runner.ts
│  │  │  ├─ viz/layout.ts        # maps Frame -> renderer props
│  │  │  ├─ supabase/client.ts  supabase/server.ts
│  │  │  ├─ analytics.ts
│  │  │  └─ keyboard.ts
│  │  ├─ stores/
│  │  │  ├─ workspace.ts
│  │  │  └─ player.ts
│  │  ├─ public/py/harness.py  public/py/tracer.py
│  │  ├─ styles/globals.css
│  │  └─ tests/                  # vitest + playwright
│  └─ api/
│     ├─ pyproject.toml
│     ├─ Dockerfile
│     ├─ alembic/
│     ├─ app/
│     │  ├─ main.py              # app factory, CORS, routers, startup content load
│     │  ├─ config.py
│     │  ├─ db.py                # engine, session dependency
│     │  ├─ auth.py              # get_current_user, optional_user
│     │  ├─ models/              # SQLAlchemy tables (Section 15)
│     │  ├─ content/
│     │  │  ├─ models.py         # Pydantic content models
│     │  │  └─ store.py          # loads + indexes content, public views
│     │  ├─ learning/
│     │  │  ├─ plan_grading.py
│     │  │  ├─ outcomes.py
│     │  │  ├─ mastery.py
│     │  │  ├─ scheduling.py
│     │  │  ├─ drills.py
│     │  │  └─ today.py
│     │  ├─ ai/
│     │  │  ├─ client.py
│     │  │  ├─ twist_check.py
│     │  │  ├─ nudge.py
│     │  │  └─ guard.py          # output validation
│     │  ├─ routers/             # me, content, attempts, drills, review, today, stats
│     │  └─ schemas/             # Pydantic request/response models
│     └─ tests/
├─ .github/workflows/ci.yml
├─ package.json  pnpm-workspace.yaml
└─ .env.example
```

# 15. Data model

Postgres on Supabase. All tables live in the `public` schema. Timestamps are `timestamptz`. IDs are UUIDs unless noted. Create them with Alembic migrations.

```sql
create table profiles (
  id            uuid primary key references auth.users(id) on delete cascade,
  display_name  text,
  timezone      text not null default 'UTC',
  settings      jsonb not null default '{}'::jsonb,   -- theme, sound, reducedMotion, drillTimer
  placement     jsonb,                               -- v2
  created_at    timestamptz not null default now()
);

create table attempts (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references profiles(id) on delete cascade,
  problem_slug     text not null,
  content_version  text not null,
  status           text not null default 'active',   -- active | finished | abandoned
  outcome          text,                             -- solved_clean | solved_with_help | solved_with_solution | gave_up | abandoned
  code             text not null default '',
  plan             jsonb,                            -- last PlanCard
  plan_checks      int not null default 0,
  plan_grade       jsonb,                            -- last PlanGrade
  planned_first    boolean not null default false,
  plan_skipped     boolean not null default false,
  max_rung         int not null default 0,           -- 0..6
  rungs_opened     jsonb not null default '[]'::jsonb, -- [{rung, at}]
  free_rungs       int[] not null default '{}',      -- rungs given by fading (not counted)
  runs             int not null default 0,
  submits          int not null default 0,
  last_results     jsonb,                            -- last TestResult[]
  predictions      jsonb not null default '[]'::jsonb, -- [{id, correct}]
  nudges_used      int not null default 0,
  active_seconds   int not null default 0,
  started_at       timestamptz not null default now(),
  finished_at      timestamptz,
  updated_at       timestamptz not null default now()
);
create index attempts_user_problem on attempts (user_id, problem_slug, started_at desc);
create unique index attempts_one_active on attempts (user_id, problem_slug) where status = 'active';

create table problem_progress (
  user_id        uuid not null references profiles(id) on delete cascade,
  problem_slug   text not null,
  status         text not null default 'new',        -- new | attempted | solved | mastered
  best_rung      int,                                 -- lowest max_rung among solved attempts
  first_solved_at timestamptz,
  last_attempt_at timestamptz,
  primary key (user_id, problem_slug)
);

create table drill_sessions (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references profiles(id) on delete cascade,
  mode        text not null,                          -- recognition | toolkit
  pattern_filter text,
  size        int not null,
  started_at  timestamptz not null default now(),
  finished_at timestamptz
);

create table drill_answers (
  id           uuid primary key default gen_random_uuid(),
  session_id   uuid not null references drill_sessions(id) on delete cascade,
  user_id      uuid not null references profiles(id) on delete cascade,
  mode         text not null,                         -- recognition | toolkit
  problem_slug text,                                  -- recognition
  pattern_id   text,                                  -- pattern of the optimal approach
  toolkit_id   text,                                  -- toolkit
  answer       jsonb not null,                        -- PlanCard or {tool}
  grade        jsonb not null,                        -- PlanGrade or {correct}
  correct      boolean not null,
  seconds      real not null,
  overtime     boolean not null default false,
  created_at   timestamptz not null default now()
);
create index drill_answers_user_pattern on drill_answers (user_id, pattern_id, created_at desc);

create table review_items (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references profiles(id) on delete cascade,
  kind             text not null,                     -- problem_plan | toolkit
  ref              text not null,                     -- problem slug or toolkit id
  resolve          boolean not null default false,
  due_at           timestamptz not null,
  interval_days    real not null default 0,
  ease             real not null default 2.5,
  reps             int not null default 0,
  lapses           int not null default 0,
  last_grade       text,
  last_reviewed_at timestamptz,
  created_at       timestamptz not null default now(),
  unique (user_id, kind, ref)
);
create index review_items_due on review_items (user_id, due_at);

create table review_logs (
  id           uuid primary key default gen_random_uuid(),
  item_id      uuid not null references review_items(id) on delete cascade,
  user_id      uuid not null references profiles(id) on delete cascade,
  grade        text not null,
  interval_before real not null,
  interval_after  real not null,
  answer       jsonb,
  plan_grade   jsonb,
  seconds      real,
  created_at   timestamptz not null default now()
);

create table notes (
  user_id      uuid not null references profiles(id) on delete cascade,
  problem_slug text not null,
  body         text not null default '',
  updated_at   timestamptz not null default now(),
  primary key (user_id, problem_slug)
);

create table activity_days (
  user_id uuid not null references profiles(id) on delete cascade,
  day     date not null,                               -- in the user's time zone
  primary key (user_id, day)
);

create table ai_cache (
  key        text primary key,
  feature    text not null,                           -- twist | nudge
  response   jsonb not null,
  created_at timestamptz not null default now()
);

create table ai_usage (
  id         bigserial primary key,
  user_id    uuid references profiles(id) on delete set null,
  feature    text not null,
  cached     boolean not null,
  success    boolean not null,
  latency_ms int not null,
  created_at timestamptz not null default now()
);
create index ai_usage_user_day on ai_usage (user_id, created_at);
```

**Profile creation:** a Postgres trigger on `auth.users` insert creates the `profiles` row (display name from OAuth metadata `full_name` or `name`).

**Row Level Security:** enable RLS on every table above. Policy for each user-owned table: `using (user_id = auth.uid())` for select/insert/update/delete (`id = auth.uid()` for `profiles`). `ai_cache` and `ai_usage`: no client access (service role only). The API connects with the service-role connection string and enforces ownership in queries; RLS protects against any direct client access.

**Retention:** attempts keep only the latest `code`; no history of code versions in v1.


# 16. API specification

## 16.1 Conventions

- Base path: `/api/v1`. JSON only. Field names in **camelCase** in JSON (use Pydantic `alias_generator=to_camel`, `populate_by_name=True`).
- Auth: `Authorization: Bearer <Supabase access token>`. `auth.py` provides `current_user` (401 if missing/invalid) and `optional_user`.
- Errors: HTTP status + body `{"error": {"code": "string", "message": "human readable"}}`. Codes: `unauthorized`, `forbidden`, `not_found`, `validation_error`, `conflict`, `rung_order`, `plan_checks_exhausted`, `rate_limited`, `ai_unavailable`, `internal`.
- Every response includes header `X-Content-Version` (hash of the `content/` folder computed at startup).
- CORS: allow origins from `CORS_ORIGINS`.
- Rate limit (in-process token bucket per user, per IP for guests): 120 requests/minute; 429 with `rate_limited`.

## 16.2 Endpoints

### Health and me

| Method | Path | Auth | Request | Response |
|---|---|---|---|---|
| GET | `/health` | — | — | `{ "ok": true, "contentVersion": "..." }` |
| GET | `/me` | user | — | `Profile` |
| PATCH | `/me` | user | `{ displayName?, timezone?, settings? }` | `Profile` |
| GET | `/me/export` | user | — | JSON of all the user's rows |
| DELETE | `/me` | user | — | `204`; deletes profile (cascade) and the auth user via Supabase admin API |

### Content (public)

| Method | Path | Auth | Response |
|---|---|---|---|
| GET | `/content/roadmap` | optional | `RoadmapView` (patterns with position, prereqs, and per-user `state`/`progress` when signed in) |
| GET | `/content/patterns` | — | `PatternSummary[]` |
| GET | `/content/patterns/{patternId}` | optional | `PatternView` (full pattern + its problems; each problem's `twist` included only if the user solved it) |
| GET | `/content/structures` | — | `Structure[]` |
| GET | `/content/toolkit` | — | `ToolkitCard[]` |
| GET | `/content/problems` | optional | `ProblemListItem[]` (`patternId` only when solved by the user or `?showPatterns=true`) |
| GET | `/content/problems/{slug}` | optional | `ProblemPublic` (never includes approaches, signals, hints, solution or viz) |

### Attempts (signed in)

| Method | Path | Request | Response |
|---|---|---|---|
| POST | `/attempts` | `{ slug }` | `AttemptView` — resumes the active attempt or creates one; includes `fading` |
| GET | `/attempts/{id}` | — | `AttemptView` |
| PATCH | `/attempts/{id}` | `{ code?, activeSecondsDelta?, runsDelta?, lastResults? }` | `{ ok: true, updatedAt }` |
| POST | `/attempts/{id}/plan` | `{ plan: PlanCard }` | `{ grade: PlanGrade, checksLeft }` |
| POST | `/attempts/{id}/hints` | `{ rung: 1..6 }` | `HintContent` for that rung; 409 `rung_order` if not the next rung |
| POST | `/attempts/{id}/submit` | `{ code, results: TestResult[] }` | `{ passed, outcome?, wrapUp? }` |
| POST | `/attempts/{id}/end` | `{ reason: "gave_up" }` | `{ outcome }` |
| POST | `/attempts/{id}/restart` | — | new `AttemptView` (old marked `abandoned`) |
| POST | `/attempts/{id}/nudge` | `{ code, caseId, args, expected, got?, error? }` | `{ nudge, line }` or 429/503 |
| POST | `/attempts/{id}/predictions` | `{ predictions: [{ id, correct }] }` | `{ ok: true }` |
| GET | `/problems/{slug}/walkthrough` | — | `WalkthroughPayload` (only if solved by the user; otherwise use rung 5) |
| GET / PUT | `/problems/{slug}/notes` | `{ body }` | `{ body, updatedAt }` |

`submit` trusts the client-reported results (tests run in the browser). `passed` = every visible and hidden test id for the problem is present with status `pass`. The server recomputes nothing but validates that all test ids are covered.

### Guest mode (no auth)

| Method | Path | Request | Response |
|---|---|---|---|
| POST | `/guest/problems/{slug}/plan` | `{ plan, checkNumber }` | `{ grade }` (keyword twist grading only) |
| GET | `/guest/problems/{slug}/hints/{rung}` | — | `HintContent` |
| POST | `/guest/import` (auth required) | `{ attempts: GuestAttempt[] }` | `{ imported }` — called after sign-in; creates finished attempts and review items |

Guest attempts are stored only in localStorage (`seecode:guest:attempts`).

### Drills

| Method | Path | Request | Response |
|---|---|---|---|
| POST | `/drills/sessions` | `{ mode, patternFilter?, size }` | `{ sessionId, cards: DrillCard[] }` |
| POST | `/drills/sessions/{id}/answers` | `{ cardId, answer, seconds, overtime }` | `DrillFeedback` |
| POST | `/drills/sessions/{id}/finish` | — | `DrillSummary` |

### Review, Today, Stats

| Method | Path | Request | Response |
|---|---|---|---|
| GET | `/review/queue` | — | `ReviewCard[]` |
| POST | `/review/{itemId}/answer` | `{ answer, seconds }` | `{ planGrade?, correct?, needsSelfRating, grade?, nextDueAt? }` |
| POST | `/review/{itemId}/rate` | `{ rating: "hard" \| "good" }` | `{ grade, nextDueAt }` |
| GET | `/today` | — | `TodayView` |
| GET | `/stats` | — | `StatsView` |

## 16.3 Key types (TypeScript view of the JSON)

```ts
type Difficulty = "easy" | "medium" | "hard";
type Complexity = "O(1)" | "O(log n)" | "O(n)" | "O(n log n)" | "O(n²)" | "O(2ⁿ)" | "Not sure";

interface ProblemPublic {
  slug: string; title: string; leetcodeUrl: string; difficulty: Difficulty; order: number;
  summary: string; examples: { input: string; output: string; explanation?: string }[];
  constraints: string[]; targets: { time: Complexity; space: Complexity };
  entry: string; starterCode: string;
  tests: { id: string; args: unknown[]; expected: unknown; hidden: boolean; compare?: string }[];
  contentVersion: string;
}

interface PlanCard {
  pattern: string | null;        // pattern id, "brute_force" or "not_sure"
  structures: string[];          // structure ids, max 4
  time: Complexity | null;
  space: Complexity | null;
  twist: string;                 // max 140 chars
}

type FieldResult = "correct" | "close" | "wrong";
interface PlanGrade {
  approachId: string; score: number; correct: boolean;
  fields: {
    pattern: { result: FieldResult; nudge?: string };
    structures: { result: FieldResult; missing?: string[]; extra?: string[]; nudge?: string };
    time: { result: FieldResult; nudge?: string };
    space: { result: FieldResult; nudge?: string };
    twist: { result: FieldResult; feedback?: string; source: "keywords" | "ai" };
  };
  note?: string;                 // suboptimal approach note
  reveal: null | { patternId: string; structures: string[]; time: Complexity; space: Complexity; twist: string };
}

type HintContent =
  | { rung: 1; clarify: string }
  | { rung: 2; signals: { phrase: string; meaning: string; pointsTo: string }[]; constraintReading: string }
  | { rung: 3; patternId: string; approach: string; whyNot: string }
  | { rung: 4; patternId: string; slots: { id: string; label: string; text: string }[] }
  | { rung: 5; walkthrough: WalkthroughPayload }
  | { rung: 6; code: string; explanation: string; toolkit: ToolkitCard[] };

interface WalkthroughPayload {
  code: string; entry: string; viz: VizConfig;
  inputs: { label: string; args: unknown[] }[];   // from visible tests/examples
}

interface AttemptView {
  id: string; slug: string; status: "active" | "finished" | "abandoned";
  code: string; plan: PlanCard | null; planGrade: PlanGrade | null; checksLeft: number;
  maxRung: number; openedRungs: HintContent[];     // content of rungs already opened (for resume)
  fading: { givenPattern: string | null; freeRungs: number[] };
  lastResults: TestResult[] | null; activeSeconds: number; outcome: string | null;
}

interface WrapUp {
  patternId: string; patternName: string; twist: string; maxRung: number;
  planRightFirstTime: boolean; timeSeconds: number;
  related: { slug: string; title: string; relation: string; status: string }[];
  nextReviewAt: string; nextProblemSlug: string | null;
}

type DrillCard =
  | { id: string; mode: "recognition"; slug: string; summary: string;
      examples: ProblemPublic["examples"]; constraints: string[]; targets: ProblemPublic["targets"] }
  | { id: string; mode: "toolkit"; toolkitId: string; phrase: string; options: string[] };

interface DrillFeedback {
  correct: boolean;
  planGrade?: PlanGrade;         // recognition (reveal always filled)
  signals?: { phrase: string; meaning: string; pointsTo: string }[];
  title?: string;                // revealed after answering
  tool?: string; example?: string; // toolkit
}

interface ReviewCard {
  itemId: string; kind: "problem_plan" | "toolkit"; resolve: boolean;
  problem?: Omit<DrillCard & { mode: "recognition" }, "id" | "mode">;
  toolkit?: { toolkitId: string; phrase: string; options: string[] };
}

interface TodayView {
  greetingName: string; streak: number; reviewsDue: number; reviewPatterns: string[];
  continue: { slug: string; title: string; difficulty: Difficulty; patternId: string | null; inProgress: boolean } | null;
  drill: { patternId: string; patternName: string; reason: string } | null;
  week: { solved: number; drills: number; reviews: number; medianPlanSeconds: number | null };
}
```

## 16.4 Content models (Pydantic, `apps/api/app/content/models.py`)

Mirror Section 10 exactly: `Pattern`, `PatternSignal`, `Slot`, `Variation`, `Demo`, `Roadmap`, `RoadmapNode`, `Structure`, `ToolkitCard`, `Problem`, `Example`, `Approach`, `Signal`, `Hints`, `Solution`, `VizConfig` (with `Pointer`, `Window`, `Range`, `Roles`, `Confirmed`, `VizEvent`, `Predict`), `TestCase`, `Related`. `Problem` has `drillOnly: bool = False`; when true, `tests`, `solution`, `hints`, `viz`, `starterCode`, `entry` are optional and the problem never appears in the Problems list or Workspace.

## 16.5 Example: checking a plan

Request:

```http
POST /api/v1/attempts/7b1e.../plan
Authorization: Bearer eyJ...
Content-Type: application/json

{ "plan": { "pattern": "two_pointers_opposite", "structures": ["array"],
            "time": "O(n)", "space": "O(n)",
            "twist": "skip punctuation and spaces" } }
```

Response `200`:

```json
{
  "grade": {
    "approachId": "optimal", "score": 0.8, "correct": true,
    "fields": {
      "pattern": { "result": "correct" },
      "structures": { "result": "correct", "missing": [], "extra": [] },
      "time": { "result": "correct" },
      "space": { "result": "wrong", "nudge": "Check the space target in the problem." },
      "twist": { "result": "close", "feedback": "Good on skipping. Does 'A' equal 'a' here?", "source": "ai" }
    },
    "reveal": null
  },
  "checksLeft": 2
}
```

# 17. Frontend architecture

## 17.1 Data flow

- **Server components** render public pages (landing, about, pattern pages without progress) by calling the API from the server with `fetch` and `revalidate: 3600`.
- **Client components** use TanStack Query for signed-in data. Query keys: `["today"]`, `["roadmap"]`, `["pattern", id]`, `["problems"]`, `["problem", slug]`, `["attempt", slug]`, `["review-queue"]`, `["stats"]`.
- All API responses are parsed with zod schemas (`lib/api/schemas.ts`); a parse failure throws and is reported to Sentry.
- The API client adds the Supabase access token from the current session and refreshes it on 401 once.

## 17.2 Workspace store (`stores/workspace.ts`, Zustand)

```ts
interface WorkspaceState {
  slug: string;
  attemptId: string | null;          // null in guest mode
  problem: ProblemPublic | null;
  code: string;
  dirty: boolean;
  plan: PlanCard;
  planGrade: PlanGrade | null;
  checksLeft: number;
  openedRungs: HintContent[];
  maxRung: number;
  results: TestResult[] | null;
  running: "idle" | "run" | "submit";
  bottomTab: "tests" | "walkthrough" | "trace";
  customCases: { id: string; args: unknown[] }[];
  solved: boolean;
  wrapUp: WrapUp | null;
  // actions
  setCode(code: string): void;
  setPlan(patch: Partial<PlanCard>): void;
  checkPlan(): Promise<void>;
  openRung(rung: number): Promise<void>;
  run(): Promise<void>;
  submit(): Promise<void>;
  end(): Promise<void>;
}
```

Sync rules: see Section 7.9. The store persists `code`, `plan`, `customCases` to localStorage per slug.

## 17.3 Walkthrough player store (`stores/player.ts`)

```ts
interface PlayerState {
  trace: Trace | null;
  viz: VizConfig | null;
  index: number;                     // current step
  playing: boolean;
  speed: 0.5 | 1 | 2;
  mode: "key" | "all";               // key moments vs every line
  predictOn: boolean;
  pendingPredict: PredictPoint | null;
  predictions: { id: string; correct: boolean }[];
  load(trace: Trace, viz: VizConfig | null): void;
  step(delta: 1 | -1): void;
  seek(index: number): void;
  toggle(): void;
  answerPredict(value: unknown): void;
}
```

Playback interval: 700 ms / speed. In `key` mode, `step` moves to the next frame with non-empty `tags` (or the last frame).

## 17.4 Keyboard map (global, `lib/keyboard.ts`)

| Keys | Where | Action |
|---|---|---|
| `⌘K` / `Ctrl K` | Anywhere | Command palette |
| `⌘↵` | Workspace | Run |
| `⌘⇧↵` | Workspace | Submit |
| `⌘J` | Workspace | Toggle bottom panel |
| `⌘⇧P` | Workspace | Focus Plan card |
| `⌘⇧H` | Workspace | Open next hint rung |
| `Space`, `←`, `→` | Walkthrough focused | Play/pause, step |
| `Enter` | Drill/Review | Submit / next |
| `1`–`4` | Toolkit card | Pick option |
| `?` | Anywhere | Shortcut help dialog |

On Windows/Linux, `⌘` = `Ctrl`. Never override browser shortcuts other than these.


# 18. Design system

**Feel:** calm, focused, tactile. Dark by default, closer to Linear or a code editor than to a busy course site. One primary action per screen. Color carries meaning, never decoration.

## 18.1 Color tokens

Define as CSS variables in `styles/globals.css` under `:root` (light) and `[data-theme="dark"]` (dark, default). Tailwind maps them via `theme.extend.colors` (e.g. `bg-surface`, `text-muted`).

| Token | Dark | Light | Use |
|---|---|---|---|
| `--bg` | `#0D0F12` | `#FAFAF9` | Page background |
| `--surface` | `#15181D` | `#FFFFFF` | Panels, cards |
| `--surface-2` | `#1C2027` | `#F3F4F6` | Inputs, hover, code blocks |
| `--border` | `#262B33` | `#E5E7EB` | Dividers, card borders |
| `--text` | `#E8EAED` | `#111827` | Main text |
| `--muted` | `#9AA1AC` | `#6B7280` | Secondary text |
| `--accent` | `#7C8CFF` | `#4F5BD5` | Primary actions, focus rings, current step |
| `--accent-2` | `#F2A65A` | `#C26A1B` | Mismatch, "return", attention |
| `--good` | `#4CC38A` | `#1F9D63` | Correct, pass |
| `--close` | `#E5B454` | `#B7791F` | Close, partially right |
| `--wrong` | `#8B93A1` | `#6B7280` | Wrong (neutral gray; never red for learning feedback) |
| `--error` | `#F06A6A` | `#D64545` | Code errors and failed tests only |
| `--ptr-a` | `#7C8CFF` | `#4F5BD5` | Pointer 1 (l, lo, i) |
| `--ptr-b` | `#F2A65A` | `#C26A1B` | Pointer 2 (r, hi, j) |
| `--ptr-c` | `#4CC38A` | `#1F9D63` | Pointer 3 (mid) |
| `--ptr-d` | `#D57BE0` | `#A33BB0` | Pointer 4 |
| `--window` | `rgba(124,140,255,0.14)` | `rgba(79,91,213,0.10)` | Sliding window shade |
| `--confirmed` | `rgba(76,195,138,0.14)` | `rgba(31,157,99,0.10)` | Invariant cells |
| `--signal` | `rgba(229,180,84,0.22)` | `rgba(183,121,31,0.16)` | Signal highlights in text |

Text contrast must be ≥ 4.5:1 for body text and ≥ 3:1 for large text and UI borders. Verify with an automated check (Section 21).

## 18.2 Typography

- **Inter** (UI text) and **JetBrains Mono** (code, complexity chips, visualization cells), loaded with `next/font`.
- Scale (px / line-height): 12/16 (caption), 13/20 (secondary), 15/24 (body), 17/26 (lead), 20/28 (h3), 24/32 (h2), 32/40 (h1). Weights: 400, 500, 600.
- Complexity values always in mono: `O(n log n)`.

## 18.3 Spacing, shape, elevation

- 4 px grid. Common gaps: 8, 12, 16, 24, 32.
- Radius: 6 px inputs and chips, 10 px cards and panels, 999 px pills.
- Borders 1 px `--border`. No drop shadows except popovers/dialogs (`0 8px 24px rgba(0,0,0,0.35)` dark).
- Focus ring: 2 px `--accent` outline with 2 px offset on every interactive element.

## 18.4 Core components

| Component | Spec |
|---|---|
| Button | Heights 32 (sm) / 36 (md). Variants: primary (accent bg, dark text in dark theme), secondary (surface-2), ghost, danger. Shows keyboard hint on the right when it has one (e.g. "Run ⌘↵") |
| Chip | Pill, 24 px high, mono or sans. Pattern chips use a 6 px color dot per pattern family |
| FieldResult badge | Icon + label: check (good), half-circle (close), dash (wrong) |
| Card | Surface, 10 px radius, 16–24 px padding, title 15/600 |
| HintRung | Accordion row: number circle, name, state (locked, available, opened); opened rungs keep content visible |
| PlanCard | Compact form: labels 12/500 muted, controls 32 px high, Check plan button full width |
| Timeline | 6 px track, 2 px ticks, event markers 10 px diamonds with labels under them |
| Viz cell | 40×40, 6 px radius, mono 16 px, border `--border`; states: normal, dimmed (35% opacity), confirmed (tint), changed (accent border flash 300 ms), pointed (pointer arrow below) |
| Toast | Bottom-right, 4 s, used only for sync/network problems |

## 18.5 Motion

- Default transition 150 ms ease-out for UI; visualization layout transitions 180 ms spring (stiffness 400, damping 32).
- Correct plan field: a 200 ms scale 0.96→1 on the badge. No confetti.
- Respect `prefers-reduced-motion` and the Settings toggle: disable layout animations and autoplay; walkthrough steps swap instantly.

## 18.6 Responsiveness

- Breakpoints: 640, 900, 1200, 1440.
- Sidebar collapses to icons below 1200, hides behind a menu button below 900.
- Workspace needs ≥ 900 px (Section 7.1). Today, Drills, Review, Pattern pages and Problems work from 375 px.

## 18.7 Copy and tone

Plain, short, encouraging, never judgmental. Say "Not quite" instead of "Wrong," "Try a nudge" instead of "You failed." Use "you." No exclamation marks except on solve ("Solved."). Sentence case everywhere.

## 18.8 Accessibility

- All functionality works with keyboard only; visible focus everywhere.
- Visualization: each step has an `aria-live="polite"` region reading the narration; cells have `aria-label` like "index 3, value 'e', pointer l".
- Color is never the only signal: badges have icons, pointers have text labels.
- Monaco: enable its accessibility mode toggle in Settings.

# 19. Analytics

PostHog, identified by user id (guests: anonymous id). Do not send code, notes or free-text twists. Events:

| Event | Properties |
|---|---|
| `problem_opened` | slug, guest |
| `plan_checked` | slug, checkNumber, score, correct, planned_first |
| `hint_opened` | slug, rung, secondsSinceStart |
| `tests_run` | slug, kind (run/submit), passed, failed |
| `attempt_finished` | slug, outcome, maxRung, activeSeconds |
| `walkthrough_played` | slug, source (rung5/after_solve/pattern_demo), steps_viewed |
| `prediction_answered` | slug, predictId, correct |
| `nudge_requested` | slug, success |
| `drill_session_finished` | mode, size, accuracy, medianSeconds |
| `review_session_finished` | items, againCount |
| `signup` | provider |
| `today_card_clicked` | card |

# 20. Security & privacy

- **Auth:** Supabase OAuth (Google, GitHub). Access tokens verified on every API request (signature, `exp`, `aud = authenticated`, issuer = project URL).
- **Authorization:** every query on user data filters by `user_id = current_user.id`. Attempt, drill session and review item ids from another user return 404.
- **Input limits:** code ≤ 50 KB; twist ≤ 140 chars; notes ≤ 10 KB; custom case args ≤ 10 KB; request bodies ≤ 200 KB.
- **Rate limits:** Section 16.1 and AI limits in Section 12.5.
- **Secrets:** only in environment variables; `.env` files git-ignored; `.env.example` committed.
- **Headers (web):** strict CSP allowing self, the API origin, Supabase, PostHog, Sentry, and `cdn.jsdelivr.net` (Pyodide); `worker-src 'self' blob:`; `script-src` must allow `'wasm-unsafe-eval'` for Pyodide.
- **Privacy:** user code stays in the browser except the latest code snapshot for resume and the code sent with Nudge me. State this on the About page. "Export my data" and "Delete account" in Settings.
- **Dependencies:** Dependabot enabled; CI fails on high-severity advisories in production dependencies.

# 21. Testing

| Layer | Tool | Must cover |
|---|---|---|
| Content | `scripts/validate_content.py` in CI | All rules in Section 10.7; every solution passes its tests |
| API unit | pytest | Plan grading (all field cases, approach selection, suboptimal cap, reveal rules), outcomes, mastery, scheduling (each grade, bounds), drill selection constraints, Today composition, AI guard regexes |
| API integration | pytest + a Postgres test database (Docker service in CI) | Every endpoint: auth required, ownership (other user → 404), rung order (409), plan check limit, submit coverage check, review flow including self-rating |
| Web unit | Vitest + Testing Library | PlanCard states, HintLadder order, TestsPanel rendering, player store stepping and key-moment mode, `viz/layout.ts` automatic mapping |
| Runner | Vitest in a browser environment (Playwright component or headless) | Harness compare modes, timeout recovery (infinite loop), traceback line mapping, tracer semantics on 3 sample programs |
| End-to-end | Playwright | Guest solves Valid Palindrome; sign-in (mocked Supabase) and import; full Workspace flow with plan → hint → run → submit → wrap-up; drill session of 5 cards; review session with a borderline self-rating |
| Accessibility | `@axe-core/playwright` | No serious violations on Today, Workspace, Drills, Review |
| Visual | Playwright screenshots of the walkthrough canvas for Valid Palindrome step 0, 5 and last | Catch rendering regressions |

Coverage targets: API learning module ≥ 90% lines; overall API ≥ 80%; web logic modules (`stores/`, `lib/`) ≥ 80%.

# 22. DevOps

## 22.1 Local setup

```bash
# prerequisites: Node LTS, pnpm, Python 3.12, uv, Docker (for a local Postgres) or a Supabase project
git clone <repo> seecode && cd seecode
cp .env.example .env            # fill values (Section 22.2)
pnpm install                    # web deps
cd apps/api && uv sync && cd ../..

# database
docker compose up -d db         # local Postgres 16 on 5432 (compose file in repo root)
cd apps/api && uv run alembic upgrade head && cd ../..

# validate content
uv run --project apps/api python scripts/validate_content.py

# run
pnpm --filter web dev           # http://localhost:3000
cd apps/api && uv run uvicorn app.main:app --reload --port 8000
```

For local auth, either point at a Supabase dev project or set `AUTH_DEV_BYPASS=true` (API accepts a header `X-Dev-User: <uuid>`; only allowed when `ENV=development`; the web app shows a dev user switcher).

## 22.2 Environment variables

| Variable | App | Example / notes |
|---|---|---|
| `NEXT_PUBLIC_API_URL` | web | `http://localhost:8000/api/v1` |
| `NEXT_PUBLIC_SUPABASE_URL` | web | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | web | Public anon key |
| `NEXT_PUBLIC_PYODIDE_VERSION` | web | Latest stable at build time, e.g. `0.xx.y` |
| `NEXT_PUBLIC_POSTHOG_KEY`, `NEXT_PUBLIC_POSTHOG_HOST` | web | Analytics |
| `NEXT_PUBLIC_SENTRY_DSN` | web | Errors |
| `ENV` | api | `development` / `production` |
| `DATABASE_URL` | api | `postgresql+asyncpg://...` |
| `SUPABASE_URL` | api | For JWKS and admin calls |
| `SUPABASE_JWT_SECRET` or `SUPABASE_JWKS_URL` | api | Token verification |
| `SUPABASE_SERVICE_ROLE_KEY` | api | Only for account deletion |
| `LLM_PROVIDER`, `LLM_API_KEY`, `LLM_MODEL` | api | A small, fast, low-cost model |
| `AI_DAILY_LIMIT` | api | `40` |
| `CORS_ORIGINS` | api | `http://localhost:3000,https://seecode.io` |
| `SENTRY_DSN` | api | Errors |
| `AUTH_DEV_BYPASS` | api | `false` in production (startup fails if true and `ENV=production`) |

## 22.3 CI (`.github/workflows/ci.yml`)

On every push and pull request:

1. **content:** `validate_content.py`.
2. **api:** `ruff check`, `ruff format --check`, `mypy app`, `pytest` (with a Postgres 16 service container).
3. **web:** `pnpm lint`, `pnpm typecheck` (`tsc --noEmit`), `pnpm test` (Vitest), `pnpm build`.
4. **e2e:** start API (dev auth bypass, test DB) and web (`next start`), run Playwright + axe.

Merges to `main` require all jobs green.

## 22.4 Deployment

| Piece | Host | Setup |
|---|---|---|
| Web | Vercel | Project root `apps/web`; env vars from 22.2; production branch `main` |
| API | Render (Docker web service) or Google Cloud Run | `apps/api/Dockerfile` (python:3.12-slim, uv install, copy `content/`, run `uvicorn app.main:app --host 0.0.0.0 --port $PORT --proxy-headers`); health check `/api/v1/health`; run `alembic upgrade head` as a pre-deploy command |
| Database/Auth | Supabase | Enable Google and GitHub providers; redirect URL `https://<domain>/auth/callback`; apply migrations from CI or pre-deploy |
| Domain | Registrar | Root → Vercel; `api.` → API host |

Free tiers are enough to start. Note that some free API hosts sleep when idle; the web app should show "Waking up the server…" if the first API call takes over 3 s.


# 23. Build plan

Ten milestones, in order. Estimated total: 10–12 weeks for one developer part-time (about 15 h/week), faster with an AI agent. Content authoring (M8) can run alongside from M3 on.

## M0 — Scaffold (week 1)

Tasks:

- Monorepo with pnpm workspace and uv; `apps/web` (Next.js, TS strict, Tailwind, shadcn/ui init) and `apps/api` (FastAPI app factory, config, db session, health route).
- Docker compose with Postgres 16; Alembic initialized; migration 001 with all tables from Section 15; profile trigger; RLS policies.
- Supabase Auth wiring: login page, OAuth callback route, session in web; `auth.py` verification in API; dev bypass.
- Design tokens (Section 18) in `globals.css`, fonts, theme switcher, app shell with sidebar and ⌘K palette (empty results for now).
- CI workflow with all jobs (e2e job may run a smoke test only).

Acceptance:

- [ ] `pnpm dev` and `uvicorn` run; `/api/v1/health` returns ok.
- [ ] Sign-in with GitHub works against a Supabase dev project; `/me` returns the profile.
- [ ] CI is green on `main`.

## M1 — Content system (week 2)

Tasks:

- Pydantic content models (16.4), `store.py` loader with indexes by slug/pattern, content version hash.
- `validate_content.py` implementing every rule in 10.7.
- Author `patterns.json` (5 patterns), `roadmap.json`, `structures.json`, and three full problems: `two-sum`, `valid-palindrome`, `binary-search`.
- Public content endpoints (Section 16.2) with the "no answers" guarantee.

Acceptance:

- [ ] Validator passes and fails correctly on a broken fixture (add a test with a deliberately broken problem file).
- [ ] `GET /content/problems/valid-palindrome` contains no `approaches`, `signals`, `hints`, `solution` or `viz`.

## M2 — Runner and basic Workspace (weeks 2–3)

Tasks:

- Pyodide worker, `runner.ts`, `harness.py` with compare modes, prelude, timeouts and restart.
- Workspace layout (7.1) with Problem panel, Monaco editor (Python, token theme), bottom panel with Tests tab, Run/Submit.
- Guest mode: localStorage attempt, Run/Submit fully client-side.

Acceptance:

- [ ] Correct solutions pass; wrong ones fail with expected vs actual; syntax errors map to editor lines.
- [ ] `while True: pass` stops after 5 s with "Time limit exceeded," and the next Run works.
- [ ] First Run after page load completes within 1 s when Pyodide has finished loading.

## M3 — Attempts, Plan card, hint ladder, wrap-up (weeks 3–4)

Tasks:

- Attempts API (create/resume, patch sync, plan, hints, submit, end, restart), outcomes (11.2), `problem_progress` updates, review item creation (11.4).
- Plan grading (11.1) with keyword twist grading (AI comes in M7).
- PlanCard, HintLadder (rungs 1–4 and 6; rung 5 placeholder until M4), WrapUp, resume logic, fading (11.6).
- Guest endpoints and `/guest/import` after sign-in.

Acceptance:

- [ ] Rungs open only in order; reloading the page restores opened rungs, code and plan.
- [ ] Plan check limit (3) enforced; reveal appears after third check or rung 3.
- [ ] Submitting a passing solution with `maxRung ≤ 2` sets outcome `solved_clean` and creates a review item due in 3 days.
- [ ] Guest progress imports after sign-in.

## M4 — Visualization (weeks 5–6)

Tasks:

- `tracer.py`, `runner.trace()`, frame types, `viz/layout.ts` (config-driven and automatic mapping).
- Renderers: ArrayStrip (with pointers, confirmed, dimmed), WindowBracket, SearchRange, HashMapTable, SetChips, StackColumn, QueueStrip, VariablesPanel, CodeView.
- WalkthroughPlayer with timeline markers, narration, key-moments mode, speed, keyboard, predict mode.
- Hint rung 5 and "See it run" after solving; "Trace my code" tab; pattern page demo component.

Acceptance:

- [ ] Valid Palindrome walkthrough shows l/r arrows, skips, compares, the mismatch marker on a non-palindrome input, and narration on every key moment.
- [ ] Predict mode pauses at configured points, accepts answers, and records results.
- [ ] Binary Search walkthrough dims eliminated halves and marks mid.
- [ ] Trace my code renders any user solution for the 3 problems without config.
- [ ] 60 fps playback at 2× on a mid-range laptop (Chrome performance panel).

## M5 — Drills and review (weeks 6–7)

Tasks:

- Drill sessions API and selection (11.7), recognition and toolkit sessions UI, end screens.
- Review queue, answer and rate endpoints, scheduling (11.4), interleaving (11.5), Review UI including "Re-solve in Workspace."
- `activity_days` updates for streaks.

Acceptance:

- [ ] A 10-card recognition session never shows the same pattern three times in a row and never repeats a problem.
- [ ] Missed drills create review items due tomorrow.
- [ ] Review grades move `due_at` according to the scheduling function (unit-tested with fixed randomness).

## M6 — Pages (weeks 7–8)

Tasks:

- Today (11.8), Roadmap SVG graph with states, Pattern pages (6.4), Problems list with filters, Stats (charts), Settings (including export and delete), About page, Landing with live demo strip.

Acceptance:

- [ ] A brand-new user sees the single "Start with your first pattern" card.
- [ ] Locked patterns unlock after 2 solves in each prerequisite.
- [ ] Twists on pattern pages are hidden until the problem is solved.

## M7 — AI features (week 8)

Tasks:

- `ai/client.py`, `twist_check.py`, `nudge.py`, `guard.py`, cache, usage logging and limits (Section 12).
- Plug the twist check into plan grading with a 3 s budget; "Nudge me" UI with line highlight.

Acceptance:

- [ ] Twist checks return in ≤ 3 s or fall back to keywords without an error shown to the user.
- [ ] Guard rejects any response containing code (unit tests with sample bad outputs).
- [ ] A repeated twist hits the cache (no provider call, verified in `ai_usage.cached`).
- [ ] Daily limit enforced.

## M8 — Content completion (weeks 3–9, alongside)

Tasks:

- Remaining 12 full problems, 30 drill-only problems, 25 toolkit cards (Section 24), all written in our own words and passing the validator.
- Every full problem has a `viz` config with at least 3 events and 1–3 predict points.

Acceptance:

- [ ] Validator green; each full problem manually played through once (plan → each rung → solve → walkthrough).

## M9 — Polish and launch (weeks 9–10)

Tasks:

- Accessibility pass (axe clean, keyboard-only walkthrough), reduced motion, empty/error/loading states everywhere, copy review (18.7).
- PostHog events (19), Sentry, performance checks (Pyodide preloading on problem-link hover), CSP headers.
- Production deploys (22.4), custom domain, `.env` in hosts.
- Test with 5 real users: each does 3 problems, 1 drill, 1 review; fix the top 5 issues.

Acceptance: the full checklist in Section 26.

# 24. Starter content

## 24.1 Patterns

| Order | id | Name | Family | Idea (one line) |
|---|---|---|---|---|
| 1 | `hashing` | Hash map and counting | hashing | Trade memory for speed: remember what you've seen so lookups are O(1). |
| 2 | `two_pointers_opposite` | Two pointers (opposite ends) | two_pointers | Move pointers inward from both ends so each step rules out work. |
| 3 | `stack` | Stack | stack | Keep unresolved items on a stack; each new item resolves what's on top. |
| 4 | `sliding_window` | Sliding window | two_pointers | Grow a window on the right, shrink it on the left while it breaks a rule. |
| 5 | `binary_search` | Binary search | binary_search | Halve the search space each step by checking the middle. |

Roadmap edges: hashing → two pointers, hashing → stack, two pointers → sliding window, two pointers → binary search (Section 10.3).

## 24.2 Problems

**Full problems (Workspace):** write summaries, examples and tests in our own words.

| # | slug | Title | Pattern | Diff. | Twist | Key toolkit |
|---|---|---|---|---|---|---|
| 1 | `two-sum` | Two Sum | hashing | Easy | Store each value's index; before storing x, look up target − x. | `enumerate`, dict |
| 2 | `valid-anagram` | Valid Anagram | hashing | Easy | Compare the character counts of both strings. | `Counter` |
| 3 | `group-anagrams` | Group Anagrams | hashing | Medium | Group words under a shared key: the sorted word or its 26 letter counts. | `defaultdict(list)`, `sorted`, `ord` |
| 4 | `valid-palindrome` | Valid Palindrome | two_pointers_opposite | Easy | Skip characters that are not letters or digits, and compare in lowercase. | `.isalnum()`, `.lower()` |
| 5 | `two-sum-ii` | Two Sum II (sorted input) | two_pointers_opposite | Medium | Sorted input: move l up if the sum is too small, r down if too big. | — |
| 6 | `three-sum` | 3Sum | two_pointers_opposite | Medium | Sort, fix one number, run two pointers on the rest, and skip duplicates. | `sort` |
| 7 | `valid-parentheses` | Valid Parentheses | stack | Easy | Push openers; each closer must match the top of the stack. | dict of pairs |
| 8 | `evaluate-rpn` | Evaluate Reverse Polish Notation | stack | Medium | Numbers go on the stack; an operator pops two and pushes the result. | `int()` truncation toward zero |
| 9 | `daily-temperatures` | Daily Temperatures | stack | Medium | Keep a stack of indexes with falling temperatures; a warmer day resolves all colder ones on top. | `enumerate` |
| 10 | `best-time-to-buy-sell-stock` | Best Time to Buy and Sell Stock | sliding_window | Easy | Track the lowest price so far; the best sale is today minus that low. | `min`, `max` |
| 11 | `longest-substring-no-repeat` | Longest Substring Without Repeating Characters | sliding_window | Medium | Shrink from the left while the new character is already in the window. | `set` |
| 12 | `longest-repeating-replacement` | Longest Repeating Character Replacement | sliding_window | Medium | The window is valid while its length minus its top letter count is at most k. | `Counter` / 26 counts |
| 13 | `binary-search` | Binary Search | binary_search | Easy | Compare the middle with the target and discard half. | `//` |
| 14 | `search-insert-position` | Search Insert Position | binary_search | Easy | When the target is missing, lo ends where it should be inserted. | `bisect_left` |
| 15 | `koko-eating-bananas` | Koko Eating Bananas | binary_search | Medium | Binary search on the eating speed; test each speed with a sum of ceilings. | `math.ceil` |

**Drill-only problems** (`drillOnly: true`; need summary, constraints, targets, approaches, signals). Six per pattern:

| Pattern | Problems |
|---|---|
| hashing | Contains Duplicate; Ransom Note; Isomorphic Strings; Top K Frequent Elements; Longest Consecutive Sequence; Majority Element |
| two_pointers_opposite | Container With Most Water; Reverse String; Squares of a Sorted Array; Valid Palindrome II; 3Sum Closest; Boats to Save People |
| stack | Min Stack; Next Greater Element I; Remove All Adjacent Duplicates in String; Baseball Game; Asteroid Collision; Largest Rectangle in Histogram |
| sliding_window | Maximum Average Subarray I; Minimum Size Subarray Sum; Permutation in String; Find All Anagrams in a String; Max Consecutive Ones III; Fruit Into Baskets |
| binary_search | Search a 2D Matrix; Find Minimum in Rotated Sorted Array; Search in Rotated Sorted Array; First Bad Version; Sqrt(x); Capacity To Ship Packages Within D Days |

## 24.3 Toolkit cards (25)

| id | Tool | Phrases it answers |
|---|---|---|
| `lower` | `.lower()` | case-insensitive; ignore letter case |
| `isalnum` | `.isalnum()` | ignore non-alphanumeric; only letters and digits count |
| `isalpha_isdigit` | `.isalpha()`, `.isdigit()` | only letters; only digits |
| `ord_chr` | `ord()`, `chr()` | lowercase English letters only; shift letters by k |
| `counter` | `Counter` | frequency; same characters; count occurrences |
| `most_common` | `Counter.most_common(k)` | k most frequent |
| `defaultdict_list` | `defaultdict(list)` | group items by a key |
| `set_ops` | `set()`, `in` | seen before; duplicates; unique |
| `sorted_key` | `sorted(x, key=...)` | sort by a property; order by start time |
| `enumerate` | `enumerate()` | need the index and the value |
| `zip` | `zip()` | compare two sequences position by position |
| `heapq` | `heapq.heappush/heappop` | repeatedly take the smallest; running minimum |
| `nlargest` | `heapq.nlargest(k, x)` | k largest / top k |
| `bisect_left` | `bisect.bisect_left()` | insert position in a sorted array; first index ≥ x |
| `deque` | `collections.deque` | queue; process level by level; pop from the front |
| `inf` | `float('inf')` | minimum/maximum so far (initial value) |
| `divmod` | `divmod()`, `%`, `//` | digits of a number; quotient and remainder |
| `reverse_slice` | `s[::-1]` | reverse; read backward |
| `join` | `"".join()` | build a string from pieces |
| `split` | `.split()` | words in a sentence; tokens |
| `ceil` | `math.ceil()` / `-(-a // b)` | round up; hours needed at speed k |
| `cache` | `@functools.cache` | same subproblem repeats; memoize |
| `min_max_key` | `min(x, key=...)`, `max(x, key=...)` | the item with the smallest/largest property |
| `any_all` | `any()`, `all()` | at least one / every item satisfies |
| `int_trunc` | `int(a / b)` | division truncating toward zero |

# 25. v2 roadmap (design notes)

| Feature | Approach |
|---|---|
| **Trace diff** | On a failing input, trace the user's code and the reference. Align steps by loop iteration using shared variable names (or a user-confirmed mapping), then report the first step where a mapped variable differs ("At iteration 3, your `l` is 2; it should be 4"). |
| **Placement test** | 12 recognition cards across patterns + 2 short problems; sets initial pattern states and skips mastered basics. |
| **Readiness score** | Bayesian Knowledge Tracing per pattern using drill answers, first-attempt max rung, and review grades; show as a percentage with a confidence band. |
| **Signal model** | Fine-tune a small text encoder (multi-label: problem text → patterns) on authored + user drill data; add token attributions to highlight phrases; export to ONNX and run in the browser for any pasted problem. Report top-3 accuracy and per-pattern F1. |
| **Mock interview** | 35-minute timer, must submit a Plan card and a spoken or typed explanation before coding, hints cost points, rubric-based feedback at the end. |
| **More patterns** | BFS/DFS on grids and graphs, heaps, intervals, prefix sums, backtracking, 1D/2D DP; tree and linked-list renderers with `TreeNode`/`ListNode` builders in the harness. |

# 26. Final QA checklist (definition of done for v1)

- [ ] All 15 full problems solvable end to end; each walkthrough plays with narration and predict points.
- [ ] 30 drill-only problems and 25 toolkit cards pass validation and appear in drills.
- [ ] Guest can solve a problem and import progress after sign-in.
- [ ] Plan grading, hint ladder order, outcomes, mastery and scheduling match Sections 11.1–11.6 (unit tests).
- [ ] Today shows correct cards for: new user, user with reviews due, user with an in-progress attempt.
- [ ] Roadmap unlocking works; twists hidden until solved.
- [ ] AI features respect the guard, cache and limits; product works with `LLM_API_KEY` unset (keyword fallback, Nudge me hidden).
- [ ] No problem text copied from any external site (manual review of every summary).
- [ ] Infinite loops never freeze the page; runner recovers.
- [ ] Keyboard-only flow works for Workspace, Drills, Review; axe shows no serious issues.
- [ ] Lighthouse (landing, Today): performance ≥ 90, accessibility ≥ 95.
- [ ] CI green; production deploy healthy; Sentry receives a test error from web and API.
- [ ] Export and delete account work.
- [ ] 5 external users completed the test script; top issues fixed.



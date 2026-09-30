# NeetCode parity plan

The owner's goal (2026-09-30): SeeCode must do everything NeetCode does, 10× better for
learners, and stay free. `docs/SPEC.md` v1 covers the first 5 of NeetCode's 18 topics
(15 Workspace problems, 30 drill-only problems). This plan extends it to every topic and
the full 150-problem list without changing how SeeCode teaches: pattern + twist, Plan card,
hint ladder, walkthroughs, drills and spaced review apply to every new problem.

We match features, not content. Every statement, hint, walkthrough and test is written in
our own words (Section 10.8); problems link to LeetCode as NeetCode's do.

## 1. Feature parity map

| NeetCode | SeeCode | Status |
|---|---|---|
| Roadmap of topics with prerequisites | Roadmap graph with unlocking (6.3, 11.3) | M6 |
| Problem lists (Blind 75, NeetCode 150) with filters and progress | Problems list with filters, statuses and list presets (Blind 75, NeetCode 150, all) | M6 + P5 |
| In-browser editor with Run and Submit | Workspace with Pyodide, tests panel, custom cases | M2 |
| Video explanation per problem | Interactive walkthrough per problem, with narration and predict mode | M4 + phases |
| Written solution | Hint ladder ending in the solution (rung 6) | M3 |
| Account and progress | Supabase sign-in, attempts, mastery | M0/M3 |
| Paid courses (DS&A basics) | Pattern pages with template, variations, demo and toolkit cards | M6 |
| Nothing | Plan card, recognition drills, spaced review, Today, stats, AI nudges | M3–M7 |
| Many languages | Python first; JavaScript next (runs in the browser for free) | Later |

## 2. Topics and patterns

Each NeetCode topic maps to one or more SeeCode patterns. New pattern ids use the v1
conventions (snake_case id, family, five slots `setup/loop/update/record/return`).

| Topic | Patterns (id → family) |
|---|---|
| Arrays & hashing | `hashing` → hashing (v1), `prefix_scan` → arrays |
| Two pointers | `two_pointers_opposite` → two_pointers (v1) |
| Sliding window | `sliding_window` → two_pointers (v1) |
| Stack | `stack` → stack (v1; monotonic stack is a variation) |
| Binary search | `binary_search` → binary_search (v1; search on the answer is a variation) |
| Linked list | `linked_list` → linked_list, `fast_slow` → two_pointers |
| Trees | `tree_dfs` → trees, `tree_bfs` → trees, `bst` → trees |
| Tries | `trie` → trees |
| Heap / priority queue | `heap` → heap (two heaps and k-way merge are variations) |
| Backtracking | `backtracking` → backtracking |
| Graphs | `graph_traversal` → graphs, `topological_sort` → graphs, `union_find` → graphs |
| Advanced graphs | `shortest_path` → graphs, `min_spanning_tree` → graphs |
| 1-D DP | `dp_1d` → dp |
| 2-D DP | `dp_2d` → dp |
| Greedy | `greedy` → greedy |
| Intervals | `intervals` → intervals |
| Math & geometry | `matrix` → math, `math` → math |
| Bit manipulation | `bits` → bits |

Roadmap (prerequisites; a pattern unlocks after 2 solves in each prerequisite, as in v1):

```text
hashing ─┬─ two_pointers_opposite ─┬─ sliding_window
         │                         ├─ binary_search ── bst
         │                         └─ linked_list ── fast_slow
         ├─ stack
         └─ prefix_scan
linked_list ─ tree_dfs ─┬─ tree_bfs ── graph_traversal ─┬─ topological_sort
                        ├─ bst                          ├─ union_find
                        ├─ trie                         └─ shortest_path ── min_spanning_tree
                        ├─ heap ─┬─ intervals
                        │        └─ greedy
                        └─ backtracking ─ dp_1d ─ dp_2d
matrix, math, bits: after hashing (independent tracks)
```

## 3. Problem list

Target: every problem of the NeetCode 150 list as a full Workspace problem, plus
drill-only problems so each pattern has at least 6 extra recognition cards. v1 content
already covers 14 of the 150 as Workspace problems and 10 more as drill-only problems;
drill-only problems that are on the list are upgraded to full problems.

Phases (each phase: pattern entries + roadmap update, full problems, drill-only problems,
the renderers the phase needs, a content review pass):

| Phase | Topics | New full problems (approx.) |
|---|---|---|
| P1 | Finish topics 1–5 (arrays & hashing, two pointers, sliding window, stack, binary search) | 20 |
| P2 | Linked list, fast/slow pointers, trees (DFS, BFS, BST), tries | 29 |
| P3 | Heap, backtracking, intervals, greedy | 30 |
| P4 | Graphs, advanced graphs | 19 |
| P5 | 1-D DP, 2-D DP, math & geometry, bit manipulation; list presets | 38 |

Total: 136 new Workspace problems, which with the 14 already built makes the full 150.

## 4. Engine changes

These change the content model, the harness, the validator and the tracer. Each lands with
tests before any content uses it.

1. **Typed parameters.** A problem may declare `io`:
   `{ "params": [{ "name": "head", "type": "list_node" }, ...], "returns": "list_node", "inPlace": "matrix" }`.
   Types: `json` (default), `list_node` (JSON list ↔ singly linked list), `tree_node`
   (level-order list with `null` ↔ binary tree), `random_list` (`[val, randomIndex]` pairs),
   `graph_node` (adjacency list ↔ `Node` graph). `inPlace` names a parameter whose value
   after the call is compared instead of the return value. The prelude defines `ListNode`,
   `TreeNode` and `Node` like LeetCode's, so pasted code works.
2. **Design problems.** `kind: "design"` (Min Stack, LRU Cache, Trie, Median Finder…):
   `entry` is the class name and each test is a list of calls
   `{ "ops": [["LRUCache", 2], ["put", 1, 1], ["get", 1]], "expected": [null, null, 1] }`.
3. **Checkers.** `compare: "checker"` runs the problem's `checker` code,
   `def check(args, got) -> bool`, for problems with many valid answers (topological
   orders, any valid itinerary, serialize/deserialize round trips).
4. **Complexities.** Add `O(n³)`, `O(n·m)`, `O(k log n)`, `O(V + E)` and `O(E log V)` to
   the Complexity values and the Plan card (open question in `DECISIONS.md` covers
   `O(n³)`).
5. **Tracer.** Snapshots of node objects keep identity (`{t: "node", id, cls, val, next /
   left / right}`), so variables holding nodes draw as labeled arrows and shared nodes
   draw once; recursion depth and the call stack are recorded for trees and backtracking.

## 5. New renderers

`LinkedList` (boxes and arrows, pointer labels such as `prev`, `curr`, `slow`, `fast`,
`dummy`), `BinaryTree` (tidy layout, current node, visited path, call stack), `Graph`
(nodes and edges, visited and frontier colors, queue), `Grid` (visited marks, `r, c`
pointers), `Heap` (array and tree views together), `DpTable` (1-D row or 2-D table,
current cell, the cells it reads), `Intervals` (a number line), `Bits` (binary digits of
integers), `RecursionTree` (backtracking decisions with pruned branches). They follow
Section 18 (tokens, motion, 60 fps at 2×) and Section 18.8 (accessible labels).

## 6. Order of work

1. Finish the v1 engine: M2 (runner, Workspace), M3 (attempts, Plan card, hints, wrap-up),
   M4 (walkthroughs), M5 (drills, review), M6 (pages), M7 (AI, free tiers only).
2. Engine changes 4.1–4.4 (small, mostly harness and validator), then P1.
3. Tracer change 4.5 with the `LinkedList` and `BinaryTree` renderers, then P2.
4. P3, P4, P5 with their renderers.
5. M9 polish and deploy can happen any time after M6; the owner decides when.

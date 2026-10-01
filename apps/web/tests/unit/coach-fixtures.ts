import { vi } from "vitest"

import type { AttemptApi } from "@/lib/api/attempts"
import type {
  AttemptView,
  HintContent,
  HintOf,
  PlanGrade,
  WalkthroughPayload,
  WrapUp,
} from "@/lib/api/schemas"
import type { StorageLike } from "@/lib/workspace/storage"

import { PALINDROME } from "./fixtures"

// Shared data for the coach (Plan card, hint ladder, wrap-up) tests.

export class MemoryStorage implements StorageLike {
  items = new Map<string, string>()
  getItem(key: string) {
    return this.items.get(key) ?? null
  }
  setItem(key: string, value: string) {
    this.items.set(key, value)
  }
  removeItem(key: string) {
    this.items.delete(key)
  }
}

export const ATTEMPT_ID = "7b1e0000-0000-4000-8000-000000000001"

export function attemptView(patch: Partial<AttemptView> = {}): AttemptView {
  return {
    id: ATTEMPT_ID,
    slug: PALINDROME.slug,
    status: "active",
    code: PALINDROME.starterCode,
    plan: null,
    planGrade: null,
    checksLeft: 3,
    maxRung: 0,
    openedRungs: [],
    fading: { givenPattern: null, freeRungs: [] },
    lastResults: null,
    activeSeconds: 0,
    outcome: null,
    runs: 0,
    plannedFirst: false,
    planSkipped: false,
    startedAt: "2026-09-30T11:00:00Z",
    updatedAt: "2026-09-30T11:00:00Z",
    ...patch,
  }
}

export const REVEAL = {
  patternId: "two_pointers_opposite",
  structures: ["array"],
  time: "O(n)",
  space: "O(1)",
  twist: "Skip characters that are not letters or digits, and compare in lowercase.",
} as const

export function grade(patch: Partial<PlanGrade> = {}): PlanGrade {
  return {
    approachId: "optimal",
    score: 0.8,
    correct: true,
    fields: {
      pattern: { result: "correct" },
      structures: { result: "correct", missing: [], extra: [] },
      time: { result: "correct" },
      space: { result: "wrong", nudge: "Check the space target in the problem." },
      twist: {
        result: "close",
        feedback: "Say what this problem does differently from the plain pattern.",
        source: "keywords",
      },
    },
    reveal: null,
    ...patch,
  }
}

export const WALKTHROUGH: WalkthroughPayload = {
  code: "class Solution:\n    def isPalindrome(self, s: str) -> bool:\n        return True  # viz: done\n",
  kind: "function",
  entry: "isPalindrome",
  viz: {
    primary: "s",
    pointers: [],
    roles: { stack: [], queue: [], hidden: [] },
    events: [{ id: "done", at: "done", label: "Done" }],
    predict: [],
  },
  inputs: [
    { label: "Example 1", args: ["Top spot!"] },
    { label: "Example 2", args: ["Top 2 spot"] },
  ],
}

export const HINTS: { [R in HintContent["rung"]]: HintOf<R> } = {
  1: { rung: 1, clarify: "Does a space count? Try **No, on!** by hand." },
  2: {
    rung: 2,
    signals: [
      {
        phrase: "reads the same forward and backward",
        meaning: "Mirrored pairs: check from both ends inward.",
        pointsTo: "two_pointers_opposite",
      },
      { phrase: "letter case", meaning: "Lowercase both.", pointsTo: "toolkit:lower" },
    ],
    constraintReading: "n ≤ 2·10⁵ → O(n) or O(n log n)",
  },
  3: {
    rung: 3,
    patternId: "two_pointers_opposite",
    approach: "Two pointers from opposite ends.",
    whyNot: "A reversed copy takes O(n) space.",
    reveal: { ...REVEAL, structures: [...REVEAL.structures] },
  },
  4: {
    rung: 4,
    patternId: "two_pointers_opposite",
    slots: [
      { id: "setup", label: "Place the pointers", text: "Put `l` on the first index." },
      { id: "loop", label: "Stop condition", text: "While `l` is left of `r`." },
    ],
  },
  5: { rung: 5, walkthrough: WALKTHROUGH },
  6: {
    rung: 6,
    code: "class Solution:\n    def isPalindrome(self, s):\n        return True\n",
    explanation: "Each round moves a pointer.",
    toolkit: [
      {
        id: "lower",
        tool: ".lower()",
        phrases: ["ignore letter case"],
        example: '"AbC".lower()',
        patterns: ["two_pointers_opposite"],
      },
    ],
  },
}

export const WRAP_UP: WrapUp = {
  patternId: "two_pointers_opposite",
  patternName: "Two pointers (opposite ends)",
  twist: "Skip characters that are not letters or digits, and compare in lowercase.",
  maxRung: 0,
  planRightFirstTime: true,
  timeSeconds: 754,
  related: [
    {
      slug: "two-sum-ii",
      title: "Two Sum II",
      relation: "Same pointers, a sum decides which moves.",
      status: "new",
    },
  ],
  nextReviewAt: "2026-10-03T12:00:00Z",
  nextProblemSlug: "two-sum-ii",
}

/** An AttemptApi whose every call is a mock; `start` answers a fresh attempt. */
export function fakeApi<O extends Partial<AttemptApi>>(overrides: O = {} as O) {
  const api = {
    start: vi.fn(async () => attemptView()),
    get: vi.fn(async () => attemptView()),
    patch: vi.fn(async () => ({ ok: true, updatedAt: "2026-09-30T12:00:00Z" })),
    checkPlan: vi.fn(async () => ({ grade: grade(), checksLeft: 2 })),
    openRung: vi.fn(async (_id: string, rung: number) => HINTS[rung as 1]),
    submit: vi.fn(async () => ({
      passed: true,
      outcome: "solved_clean" as const,
      wrapUp: WRAP_UP,
    })),
    end: vi.fn(async () => ({ outcome: "gave_up" as const })),
    restart: vi.fn(async () =>
      attemptView({ id: "7b1e0000-0000-4000-8000-000000000002", startedAt: "2026-09-30T12:00:00Z" })
    ),
    walkthrough: vi.fn(async () => WALKTHROUGH),
    guestCheckPlan: vi.fn(async () => ({ grade: grade() })),
    guestHint: vi.fn(async (_slug: string, rung: number) => HINTS[rung as 1]),
    ...overrides,
  }
  return api
}

/** What `GET /content/...` answers in component tests. */
export const CONTENT: Record<string, unknown> = {
  "/content/patterns": [
    {
      id: "hashing",
      family: "hashing",
      name: "Hash map and counting",
      idea: "Remember what you've seen.",
      problemCount: 1,
    },
    {
      id: "two_pointers_opposite",
      family: "two_pointers",
      name: "Two pointers (opposite ends)",
      idea: "Walk inward.",
      problemCount: 1,
    },
  ],
  "/content/structures": [
    { id: "array", label: "Array / string" },
    { id: "hash_map", label: "Hash map (dict)" },
    { id: "hash_set", label: "Hash set" },
    { id: "stack", label: "Stack" },
    { id: "queue", label: "Queue / deque" },
  ],
  "/content/toolkit": [
    {
      id: "lower",
      tool: ".lower()",
      phrases: ["ignore letter case"],
      example: '"AbC".lower()',
      patterns: [],
    },
  ],
  "/content/problems": [
    {
      slug: "valid-palindrome",
      title: "Valid Palindrome",
      difficulty: "easy",
      order: 4,
      status: null,
      bestRung: null,
      lastAttemptAt: null,
    },
    {
      slug: "two-sum-ii",
      title: "Two Sum II",
      difficulty: "medium",
      order: 5,
      status: null,
      bestRung: null,
      lastAttemptAt: null,
    },
  ],
}

/** Stubs `fetch` with CONTENT plus `extra` (path → body, or a function of the request). */
export function stubApi(
  extra: Record<string, unknown | ((init?: RequestInit) => Response | Promise<Response>)> = {}
) {
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    const path = new URL(url).pathname.replace(/^\/api\/v1/, "")
    const answer = path in extra ? extra[path] : CONTENT[path]
    if (typeof answer === "function") return (answer as (init?: RequestInit) => Response)(init)
    return new Response(JSON.stringify(answer ?? { error: { code: "not_found", message: "" } }), {
      status: answer === undefined ? 404 : 200,
      headers: { "Content-Type": "application/json" },
    })
  })
  vi.stubGlobal("fetch", fetchMock)
  return fetchMock
}

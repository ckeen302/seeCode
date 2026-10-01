import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { render } from "@testing-library/react"
import { vi } from "vitest"

import { TooltipProvider } from "@/components/ui/tooltip"

export const USER_ID = "00000000-0000-4000-8000-000000000001"

export interface Call {
  method: string
  path: string
  body: unknown
}

type Handler = (call: Call) => unknown | Response

/**
 * Stubs fetch with routes keyed "METHOD /path" (path without /api/v1 and query). A handler's
 * return value is sent as JSON with status 200 (or returned as is when it is a Response).
 */
export function stubApi(routes: Record<string, Handler | unknown>) {
  const calls: Call[] = []
  const fetch = vi.fn(async (input: string, init?: RequestInit) => {
    const url = new URL(input, "http://localhost")
    const path = url.pathname.replace(/^\/api\/v1/, "")
    const method = init?.method ?? "GET"
    const body = typeof init?.body === "string" ? JSON.parse(init.body) : undefined
    const call = { method, path, body }
    calls.push(call)
    const key = `${method} ${path}`
    if (!(key in routes)) {
      return new Response(JSON.stringify({ error: { code: "not_found", message: key } }), {
        status: 404,
      })
    }
    const route = routes[key]
    const result = typeof route === "function" ? (route as Handler)(call) : route
    if (result instanceof Response) return result
    return new Response(result === undefined ? null : JSON.stringify(result), {
      status: result === undefined ? 204 : 200,
      headers: { "Content-Type": "application/json" },
    })
  })
  vi.stubGlobal("fetch", fetch)
  return { fetch, calls }
}

export function renderWithClient(ui: React.ReactElement) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  return {
    client,
    ...render(
      <QueryClientProvider client={client}>
        <TooltipProvider>{ui}</TooltipProvider>
      </QueryClientProvider>
    ),
  }
}

export const PATTERNS = [
  {
    id: "hashing",
    family: "hashing",
    name: "Hash map and counting",
    idea: "Remember what you've seen.",
    problemCount: 3,
  },
  {
    id: "two_pointers_opposite",
    family: "two_pointers",
    name: "Two pointers (opposite ends)",
    idea: "Move inward.",
    problemCount: 3,
  },
]

export const STRUCTURES = [
  { id: "hash_map", label: "Hash map (dict)" },
  { id: "hash_set", label: "Hash set" },
  { id: "counter", label: "Counter / frequency array" },
]

export const PROFILE = {
  id: USER_ID,
  displayName: "Ada Lovelace",
  timezone: "UTC",
  settings: {},
  createdAt: "2026-09-01T00:00:00Z",
}

export const PROBLEM_CARD = {
  slug: "valid-anagram",
  summary: "Decide whether `t` has the same letters in any order as `s`.",
  examples: [{ input: 's = "ab", t = "ba"', output: "true" }],
  constraints: ["lowercase English letters"],
  targets: { time: "O(n)", space: "O(1)" },
}

export function planGrade(correct: boolean, score = correct ? 1 : 0.25) {
  const result = correct ? "correct" : "wrong"
  return {
    approachId: "optimal",
    score,
    correct,
    fields: {
      pattern: { result: "correct" },
      structures: { result, extra: [] },
      time: { result: "correct" },
      space: { result },
      twist: { result: "wrong", source: "keywords" },
    },
    reveal: {
      patternId: "hashing",
      structures: ["counter"],
      time: "O(n)",
      space: "O(1)",
      twist: "Count each letter and compare.",
    },
  }
}

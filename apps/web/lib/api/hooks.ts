// TanStack Query hooks for API data (Section 17.1).
import { queryOptions, useQuery } from "@tanstack/react-query"
import { z } from "zod"

import { ApiError, createApiClient } from "@/lib/api/client"
import {
  PatternSummarySchema,
  ProblemListItemSchema,
  ProblemPublicSchema,
  ProfileSchema,
} from "@/lib/api/schemas"
import { getAuthHeaders, refreshSession, useAuth } from "@/lib/auth/session"
import { env } from "@/lib/env"

export const api = createApiClient({
  baseUrl: env.apiUrl,
  getHeaders: getAuthHeaders,
  refreshAuth: refreshSession,
})

/** Retry network and server errors once; never retry 4xx answers. */
export function shouldRetry(failureCount: number, error: unknown): boolean {
  if (error instanceof ApiError && error.status < 500) return false
  return failureCount < 1
}

// Content changes only with a deploy, so problem details and patterns stay fresh for an hour.
const CONTENT_STALE_MS = 60 * 60_000

/** A Workspace problem without answers (`GET /content/problems/{slug}`), key ["problem", slug]. */
export function problemQuery(slug: string) {
  return queryOptions({
    queryKey: ["problem", slug],
    queryFn: () => api.get(`/content/problems/${encodeURIComponent(slug)}`, ProblemPublicSchema),
    staleTime: CONTENT_STALE_MS,
  })
}

/** Every Workspace problem in roadmap order, with per-user status (key ["problems"]). */
export const problemsQuery = queryOptions({
  queryKey: ["problems"],
  queryFn: () => api.get("/content/problems", z.array(ProblemListItemSchema)),
})

/** Pattern names for the ⌘K palette (key ["patterns"]). */
export const patternsQuery = queryOptions({
  queryKey: ["patterns"],
  queryFn: () => api.get("/content/patterns", z.array(PatternSummarySchema)),
  staleTime: CONTENT_STALE_MS,
})

export function useProblem(slug: string) {
  return useQuery(problemQuery(slug))
}

export function useProblems({ enabled = true }: { enabled?: boolean } = {}) {
  return useQuery({ ...problemsQuery, enabled })
}

export function usePatterns({ enabled = true }: { enabled?: boolean } = {}) {
  return useQuery({ ...patternsQuery, enabled })
}

/** The signed-in user's profile (`GET /me`). Keyed by user so switching users refetches. */
export function useMe() {
  const auth = useAuth()
  const userId = auth.status === "signed_in" ? auth.user.id : null
  return useQuery({
    queryKey: ["me", userId],
    queryFn: () => api.get("/me", ProfileSchema),
    enabled: userId !== null,
    staleTime: 5 * 60_000,
  })
}

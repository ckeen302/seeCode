// TanStack Query hooks for API data (Section 17.1).
import { queryOptions, useQuery } from "@tanstack/react-query"
import { z } from "zod"

import { ApiError, createApiClient } from "@/lib/api/client"
import {
  PatternSummarySchema,
  ProblemListItemSchema,
  ProblemPublicSchema,
  ProfileSchema,
  StructureSchema,
  ToolkitCardSchema,
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

/** Plan card "Structures" options (key ["structures"]). */
export const structuresQuery = queryOptions({
  queryKey: ["structures"],
  queryFn: () => api.get("/content/structures", z.array(StructureSchema)),
  staleTime: CONTENT_STALE_MS,
})

/** Toolkit cards, for signal targets and rung 6 callouts (key ["toolkit"]). */
export const toolkitQuery = queryOptions({
  queryKey: ["toolkit"],
  queryFn: () => api.get("/content/toolkit", z.array(ToolkitCardSchema)),
  staleTime: CONTENT_STALE_MS,
})

/**
 * Every problem with its pattern (`?showPatterns=true`, key ["problems", "patterns"]). Only
 * for naming the pattern of an attempt that already ended (Section 7.1).
 */
export const problemPatternsQuery = queryOptions({
  queryKey: ["problems", "patterns"],
  queryFn: () => api.get("/content/problems?showPatterns=true", z.array(ProblemListItemSchema)),
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

export function useStructures() {
  return useQuery(structuresQuery)
}

export function useToolkit({ enabled = true }: { enabled?: boolean } = {}) {
  return useQuery({ ...toolkitQuery, enabled })
}

export function useProblemPatterns({ enabled = true }: { enabled?: boolean } = {}) {
  return useQuery({ ...problemPatternsQuery, enabled })
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

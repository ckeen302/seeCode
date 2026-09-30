// TanStack Query hooks for API data (Section 17.1).
import { useQuery } from "@tanstack/react-query"

import { ApiError, createApiClient } from "@/lib/api/client"
import { ProfileSchema } from "@/lib/api/schemas"
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

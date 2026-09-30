// Warm-up (Section 9.1): hovering or focusing a problem link starts loading Python, the
// editor and the problem itself, so the Workspace opens ready to run.
import type { QueryClient } from "@tanstack/react-query"

import { problemQuery } from "@/lib/api/hooks"
import { preloadMonaco } from "@/lib/editor/monaco"
import { warmUpRunner } from "@/lib/runner/runner"

/** Section 7.1: below this width the Workspace shows a "Use a larger screen" notice. */
export const WORKSPACE_MIN_WIDTH = 900
export const WIDE_SCREEN_QUERY = `(min-width: ${WORKSPACE_MIN_WIDTH}px)`

function wideScreen(): boolean {
  return typeof window !== "undefined" && window.matchMedia(WIDE_SCREEN_QUERY).matches
}

/** Phones never load Python: they get the notice instead of the Workspace. */
export function warmUpWorkspace(slug?: string, queryClient?: QueryClient): void {
  if (!wideScreen()) return
  warmUpRunner()
  preloadMonaco()
  if (slug && queryClient) void queryClient.prefetchQuery(problemQuery(slug))
}

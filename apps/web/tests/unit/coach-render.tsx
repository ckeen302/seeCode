import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { render } from "@testing-library/react"
import { act } from "react"

import { TooltipProvider } from "@/components/ui/tooltip"
import { EMPTY_PLAN } from "@/lib/workspace/plan"
import { workspaceStore, type WorkspaceState } from "@/stores/workspace"

import { PALINDROME } from "./fixtures"

// Rendering helpers for the coach components: providers, and the shared Workspace store set
// to a ready, signed-in attempt.

// Radix Select and Popover use pointer capture, which jsdom lacks.
Element.prototype.hasPointerCapture ??= () => false
Element.prototype.releasePointerCapture ??= () => {}
Element.prototype.setPointerCapture ??= () => {}

export function renderWithProviders(ui: React.ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <TooltipProvider delayDuration={0}>{ui}</TooltipProvider>
    </QueryClientProvider>
  )
}

const initial = workspaceStore.getState()

/** A ready, active, signed-in attempt of Valid Palindrome, plus `patch`. */
export function setWorkspace(patch: Partial<WorkspaceState> = {}) {
  act(() => {
    workspaceStore.setState(
      {
        ...initial,
        slug: PALINDROME.slug,
        problem: PALINDROME,
        code: PALINDROME.starterCode,
        mode: "user",
        guest: false,
        coach: "ready",
        attemptId: "7b1e0000-0000-4000-8000-000000000001",
        attemptStatus: "active",
        plan: EMPTY_PLAN,
        ...patch,
      },
      true
    )
  })
}

export function resetWorkspace() {
  act(() => workspaceStore.setState(initial, true))
}

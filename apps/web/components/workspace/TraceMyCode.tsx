"use client"

import { useMemo } from "react"

import { WalkthroughPlayer } from "@/components/viz/WalkthroughPlayer"
import { Skeleton } from "@/components/ui/skeleton"
import { customInputs, traceMinePayload } from "@/lib/viz/payloads"
import { useWorkspace } from "@/stores/workspace"

/**
 * The Trace my code tab (Section 7.7): the learner's own editor code, traced on the visible
 * tests (and their custom cases) with the automatic renderers. It is built from the public
 * problem alone, so it works before any hint and never touches the reference solution.
 */
export function TraceMyCode() {
  const problem = useWorkspace((state) => state.problem)
  const code = useWorkspace((state) => state.code)
  const customCases = useWorkspace((state) => state.customCases)
  const payload = useMemo(() => (problem ? traceMinePayload(problem) : null), [problem])
  const extraInputs = useMemo(
    () => (problem ? customInputs(problem, customCases) : []),
    [problem, customCases]
  )
  if (!payload) {
    return (
      <div className="flex flex-col gap-2 px-4 py-4" aria-busy="true">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-40 w-full" />
      </div>
    )
  }
  return (
    <div className="flex min-h-full flex-col gap-3">
      <p className="text-sm text-muted">
        Your code, one line at a time, on the examples
        {extraInputs.length ? " and your custom cases" : ""}. It follows your edits and never counts
        as a hint.
      </p>
      <WalkthroughPlayer
        key={problem?.slug}
        payload={payload}
        userCode={code}
        extraInputs={extraInputs}
      />
    </div>
  )
}

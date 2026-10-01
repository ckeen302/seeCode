"use client"

import { useSyncExternalStore } from "react"

import { getRunner } from "@/lib/runner/runner"
import type { RunnerStatus } from "@/lib/runner/types"
import { cn } from "@/lib/utils"

const LABELS: Record<RunnerStatus, string> = {
  loading: "Loading Python…",
  ready: "Python ready",
  busy: "Running…",
  crashed: "Python stopped",
}

const DOTS: Record<RunnerStatus, string> = {
  loading: "bg-muted animate-pulse",
  ready: "bg-good",
  busy: "bg-accent animate-pulse",
  crashed: "bg-error",
}

export function useRunnerStatus(): RunnerStatus {
  const runner = getRunner()
  return useSyncExternalStore(runner.subscribe, runner.getStatus, () => "loading")
}

/**
 * Where Python is at, announced politely to screen readers. Each Run flips the status to
 * busy and back; the Tests panel already announces runs, so the live text skips that flip.
 */
export function RunnerStatusBadge({ className }: { className?: string }) {
  const status = useRunnerStatus()
  return (
    <span
      data-runner-status={status}
      className={cn("inline-flex items-center gap-1.5 text-xs text-muted", className)}
    >
      <span aria-hidden className={cn("size-1.5 rounded-full", DOTS[status])} />
      <span aria-hidden>{LABELS[status]}</span>
      <span role="status" className="sr-only">
        {LABELS[status === "busy" ? "ready" : status]}
      </span>
    </span>
  )
}

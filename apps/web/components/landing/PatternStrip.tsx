"use client"

import { ArrowRightIcon } from "lucide-react"
import Link from "next/link"

import { Skeleton } from "@/components/ui/skeleton"
import { usePatterns } from "@/lib/api/hooks"
import { familyColor } from "@/lib/workspace/plan"

/** The patterns in roadmap order, each linking to its public pattern page. */
export function PatternStrip() {
  const patterns = usePatterns()
  if (patterns.isPending) {
    return (
      <div
        className="grid grid-cols-1 gap-3 min-[640px]:grid-cols-2 min-[900px]:grid-cols-3"
        aria-hidden
      >
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-28 rounded-lg" />
        ))}
      </div>
    )
  }
  if (patterns.isError || !patterns.data.length) return null
  return (
    <ol className="grid grid-cols-1 gap-3 min-[640px]:grid-cols-2 min-[900px]:grid-cols-3">
      {patterns.data.map((pattern, index) => (
        <li key={pattern.id}>
          <Link
            href={`/patterns/${pattern.id}`}
            className="group flex h-full flex-col gap-2 rounded-lg border border-border bg-surface p-4 transition-colors hover:border-muted"
          >
            <span className="flex items-center gap-2 text-xs text-muted">
              <span className="font-mono">{String(index + 1).padStart(2, "0")}</span>
              <span
                aria-hidden
                className="size-1.5 rounded-full"
                style={{ backgroundColor: familyColor(pattern.family) }}
              />
              {pattern.problemCount} problems
            </span>
            <span className="flex items-center justify-between gap-2 font-semibold">
              {pattern.name}
              <ArrowRightIcon
                aria-hidden
                className="size-4 text-muted transition-transform group-hover:translate-x-0.5"
              />
            </span>
            <span className="text-sm text-muted">{pattern.idea}</span>
          </Link>
        </li>
      ))}
    </ol>
  )
}

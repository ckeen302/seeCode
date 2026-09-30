"use client"

import { RotateCwIcon } from "lucide-react"
import { useMemo, useSyncExternalStore } from "react"

import { DifficultyChip } from "@/components/problems/DifficultyChip"
import { ProblemLink } from "@/components/problems/ProblemLink"
import { ProblemStatusIcon, furtherStatus } from "@/components/problems/ProblemStatusIcon"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { useProblems } from "@/lib/api/hooks"
import type { ProblemListItem, ProblemStatus } from "@/lib/api/schemas"
import { browserStorage, localStatus } from "@/lib/workspace/storage"

function subscribeStorage(listener: () => void): () => void {
  window.addEventListener("storage", listener)
  return () => window.removeEventListener("storage", listener)
}

/**
 * What this browser knows about each problem (`seecode:attempt:{slug}`), as a JSON string so
 * the snapshot compares by value. The attempt sync (M3) makes the API the source of truth.
 */
function useLocalStatuses(slugs: string[]): Record<string, ProblemStatus> {
  const key = slugs.join(",")
  const snapshot = useSyncExternalStore(
    subscribeStorage,
    () => {
      const storage = browserStorage()
      const statuses: Record<string, ProblemStatus> = {}
      for (const slug of key ? key.split(",") : []) {
        const status = localStatus(storage, slug)
        if (status) statuses[slug] = status
      }
      return JSON.stringify(statuses)
    },
    () => "{}"
  )
  return useMemo(() => JSON.parse(snapshot) as Record<string, ProblemStatus>, [snapshot])
}

function ProblemRow({ item, status }: { item: ProblemListItem; status: ProblemStatus }) {
  return (
    <tr className="group relative border-t border-border first:border-t-0 hover:bg-surface-2">
      <td className="w-12 py-3 pl-4">
        <ProblemStatusIcon status={status} />
      </td>
      <td className="py-3 pr-3">
        <ProblemLink
          slug={item.slug}
          className="font-medium outline-none after:absolute after:inset-0 after:rounded-lg focus-visible:after:outline-2 focus-visible:after:outline-offset-[-2px] focus-visible:after:outline-accent"
        >
          {item.title}
        </ProblemLink>
      </td>
      <td className="w-28 py-3 pr-4 text-right">
        <DifficultyChip difficulty={item.difficulty} />
      </td>
    </tr>
  )
}

/** Section 6.5, basic: every Workspace problem in roadmap order (filters arrive in M6). */
export function ProblemsList() {
  const query = useProblems()
  const items = useMemo(
    () => [...(query.data ?? [])].sort((a, b) => a.order - b.order),
    [query.data]
  )
  const local = useLocalStatuses(items.map((item) => item.slug))

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold tracking-tight">Problems</h1>
        <p className="text-muted">
          Every problem in roadmap order. Patterns stay hidden until you solve a problem, so you
          practice spotting them yourself.
        </p>
      </div>

      {query.isPending ? (
        <div className="flex flex-col gap-2" aria-busy="true" aria-label="Loading problems">
          {[0, 1, 2, 3].map((index) => (
            <Skeleton key={index} className="h-12 w-full" />
          ))}
        </div>
      ) : query.isError ? (
        <div
          role="alert"
          className="flex flex-col items-start gap-3 rounded-lg border border-border bg-surface p-5"
        >
          <p className="font-medium">We couldn&apos;t load the problems.</p>
          <p className="text-sm text-muted">Check your connection, then try again.</p>
          <Button variant="secondary" size="sm" onClick={() => void query.refetch()}>
            <RotateCwIcon />
            Try again
          </Button>
        </div>
      ) : items.length === 0 ? (
        <p className="rounded-lg border border-border bg-surface p-5 text-muted">
          No problems yet.
        </p>
      ) : (
        <div className="overflow-hidden rounded-lg border border-border bg-surface">
          <table className="w-full border-collapse text-left">
            <caption className="sr-only">Problems, in roadmap order</caption>
            <thead className="sr-only">
              <tr>
                <th scope="col">Status</th>
                <th scope="col">Title</th>
                <th scope="col">Difficulty</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <ProblemRow
                  key={item.slug}
                  item={item}
                  status={furtherStatus(item.status, local[item.slug])}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

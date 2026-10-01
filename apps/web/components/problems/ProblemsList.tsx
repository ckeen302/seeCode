"use client"

import { EyeIcon, EyeOffIcon, RotateCwIcon, SearchIcon, XIcon } from "lucide-react"
import { useId, useMemo, useState, useSyncExternalStore } from "react"

import { PatternChip } from "@/components/patterns/PatternChip"
import { DifficultyChip } from "@/components/problems/DifficultyChip"
import { ProblemLink } from "@/components/problems/ProblemLink"
import {
  ProblemStatusIcon,
  STATUS_LABELS,
  furtherStatus,
} from "@/components/problems/ProblemStatusIcon"
import { formatRelative } from "@/components/stats/format"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { useProblemPatterns, useProblems, usePatterns } from "@/lib/api/hooks"
import type { Difficulty, PatternSummary, ProblemListItem, ProblemStatus } from "@/lib/api/schemas"
import { cn } from "@/lib/utils"
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

// "Show patterns" is a per-browser convenience (off by default so recognition stays honest).
const SHOW_PATTERNS_KEY = "seecode:problems:show-patterns"
const showPatternsListeners = new Set<() => void>()

function readShowPatterns(): boolean {
  try {
    return window.localStorage.getItem(SHOW_PATTERNS_KEY) === "true"
  } catch {
    return false
  }
}

function writeShowPatterns(value: boolean): void {
  try {
    window.localStorage.setItem(SHOW_PATTERNS_KEY, String(value))
  } catch {
    // Storage blocked: the toggle lasts for this page only.
  }
  showPatternsListeners.forEach((listener) => listener())
}

function useShowPatterns(): [boolean, (value: boolean) => void] {
  const [fallback, setFallback] = useState<boolean | null>(null)
  const stored = useSyncExternalStore(
    (listener) => {
      showPatternsListeners.add(listener)
      return () => showPatternsListeners.delete(listener)
    },
    readShowPatterns,
    () => false
  )
  return [
    fallback ?? stored,
    (value) => {
      setFallback(value)
      writeShowPatterns(value)
    },
  ]
}

export interface ProblemFilters {
  query: string
  difficulty: Difficulty | "all"
  status: ProblemStatus | "all"
  pattern: string
}

export const NO_FILTERS: ProblemFilters = {
  query: "",
  difficulty: "all",
  status: "all",
  pattern: "",
}

export interface ProblemRowData {
  item: ProblemListItem
  status: ProblemStatus
  patternId: string | null
}

/** Section 6.5 filters: title search, difficulty, status and (with patterns shown) pattern. */
export function filterProblems(
  rows: readonly ProblemRowData[],
  filters: ProblemFilters,
  showPatterns: boolean
): ProblemRowData[] {
  const query = filters.query.trim().toLowerCase()
  return rows.filter(
    (row) =>
      (!query || row.item.title.toLowerCase().includes(query)) &&
      (filters.difficulty === "all" || row.item.difficulty === filters.difficulty) &&
      (filters.status === "all" || row.status === filters.status) &&
      (!showPatterns || !filters.pattern || row.patternId === filters.pattern)
  )
}

function RungDots({ rung }: { rung: number | null }) {
  if (rung === null) return <span className="text-sm text-muted">–</span>
  return (
    <span className="inline-flex items-center gap-1" title={`Best: hint rung ${rung} of 6`}>
      {Array.from({ length: 6 }, (_, i) => (
        <span
          key={i}
          aria-hidden
          className={cn("size-1.5 rounded-full", i < rung ? "bg-accent-2" : "bg-border")}
        />
      ))}
      <span className="sr-only">
        {rung === 0 ? "Solved without hints" : `Best: hint rung ${rung} of 6`}
      </span>
    </span>
  )
}

function ProblemRow({
  row,
  pattern,
  showPatternColumn,
}: {
  row: ProblemRowData
  pattern: PatternSummary | undefined
  showPatternColumn: boolean
}) {
  const { item, status } = row
  const last = formatRelative(item.lastAttemptAt)
  return (
    <tr className="group relative border-t border-border first:border-t-0 hover:bg-surface-2">
      <td className="w-12 py-3 pl-4">
        {/* A block, so the cell centers it on the title (inline, it sat on the baseline). */}
        <ProblemStatusIcon status={status} className="flex" />
      </td>
      <td className="py-3 pr-3">
        <ProblemLink
          slug={item.slug}
          className="font-medium outline-none after:absolute after:inset-0 after:rounded-lg focus-visible:after:outline-2 focus-visible:after:outline-offset-[-2px] focus-visible:after:outline-accent"
        >
          {item.title}
        </ProblemLink>
      </td>
      {showPatternColumn ? (
        <td className="hidden py-3 pr-3 min-[640px]:table-cell">
          {pattern ? (
            <PatternChip name={pattern.name} family={pattern.family} />
          ) : (
            <span className="text-sm text-muted">Hidden</span>
          )}
        </td>
      ) : null}
      <td className="w-28 py-3 pr-4">
        <DifficultyChip difficulty={item.difficulty} />
      </td>
      <td className="hidden w-28 py-3 pr-4 min-[900px]:table-cell">
        <RungDots rung={item.bestRung} />
      </td>
      <td className="hidden w-32 py-3 pr-4 text-sm text-muted min-[900px]:table-cell">
        {last ?? "–"}
      </td>
    </tr>
  )
}

const selectClass = "h-9 rounded-md border border-border bg-surface px-2 text-sm"

/** Section 6.5: every Workspace problem in roadmap order, with filters and progress. */
export function ProblemsList() {
  const query = useProblems()
  const [showPatterns, setShowPatterns] = useShowPatterns()
  const revealed = useProblemPatterns({ enabled: showPatterns })
  const patterns = usePatterns()
  const [filters, setFilters] = useState<ProblemFilters>(NO_FILTERS)
  const ids = { search: useId(), difficulty: useId(), status: useId(), pattern: useId() }

  const items = useMemo(
    () => [...(query.data ?? [])].sort((a, b) => a.order - b.order),
    [query.data]
  )
  const local = useLocalStatuses(items.map((item) => item.slug))
  const revealedById = useMemo(
    () => new Map((revealed.data ?? []).map((row) => [row.slug, row.patternId ?? null])),
    [revealed.data]
  )
  const rows: ProblemRowData[] = items.map((item) => ({
    item,
    status: furtherStatus(item.status, local[item.slug]),
    // Solved problems always show their pattern; others only with "Show patterns" on.
    patternId: item.patternId ?? (showPatterns ? (revealedById.get(item.slug) ?? null) : null),
  }))
  const visible = filterProblems(rows, filters, showPatterns)
  const showPatternColumn = showPatterns || rows.some((row) => row.patternId)
  const patternById = new Map((patterns.data ?? []).map((p) => [p.id, p]))
  const filtered = JSON.stringify(filters) !== JSON.stringify(NO_FILTERS)
  const solvedCount = rows.filter((r) => r.status === "solved" || r.status === "mastered").length
  const set = <K extends keyof ProblemFilters>(key: K, value: ProblemFilters[K]) =>
    setFilters((current) => ({ ...current, [key]: value }))

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold tracking-tight">Problems</h1>
        <p className="text-muted">
          Every problem in roadmap order. Patterns stay hidden until you solve a problem, so you
          practice spotting them yourself.
        </p>
      </div>

      <div
        role="search"
        aria-label="Filter problems"
        className="flex flex-wrap items-end gap-3 rounded-lg border border-border bg-surface p-3"
      >
        <div className="flex min-w-48 flex-1 flex-col gap-1">
          <label htmlFor={ids.search} className="text-xs text-muted">
            Search
          </label>
          <div className="relative">
            <SearchIcon
              aria-hidden
              className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted"
            />
            <input
              id={ids.search}
              type="search"
              value={filters.query}
              onChange={(event) => set("query", event.target.value)}
              placeholder="Problem title"
              className="h-9 w-full rounded-md border border-border bg-bg pr-2 pl-8 text-sm placeholder:text-muted"
            />
          </div>
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor={ids.difficulty} className="text-xs text-muted">
            Difficulty
          </label>
          <select
            id={ids.difficulty}
            value={filters.difficulty}
            onChange={(event) =>
              set("difficulty", event.target.value as ProblemFilters["difficulty"])
            }
            className={selectClass}
          >
            <option value="all">All</option>
            <option value="easy">Easy</option>
            <option value="medium">Medium</option>
            <option value="hard">Hard</option>
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor={ids.status} className="text-xs text-muted">
            Status
          </label>
          <select
            id={ids.status}
            value={filters.status}
            onChange={(event) => set("status", event.target.value as ProblemFilters["status"])}
            className={selectClass}
          >
            <option value="all">All</option>
            {(["new", "attempted", "solved", "mastered"] as const).map((status) => (
              <option key={status} value={status}>
                {STATUS_LABELS[status]}
              </option>
            ))}
          </select>
        </div>
        {showPatterns ? (
          <div className="flex flex-col gap-1">
            <label htmlFor={ids.pattern} className="text-xs text-muted">
              Pattern
            </label>
            <select
              id={ids.pattern}
              value={filters.pattern}
              onChange={(event) => set("pattern", event.target.value)}
              className={selectClass}
            >
              <option value="">All</option>
              {(patterns.data ?? []).map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
        ) : null}
        <Button
          variant="ghost"
          aria-pressed={showPatterns}
          onClick={() => {
            if (showPatterns) set("pattern", "")
            setShowPatterns(!showPatterns)
          }}
          className="text-muted aria-pressed:text-text"
        >
          {showPatterns ? <EyeIcon /> : <EyeOffIcon />}
          Show patterns
        </Button>
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
        <>
          <p className="text-sm text-muted" aria-live="polite">
            {filtered
              ? `${visible.length} of ${items.length} problems`
              : `${items.length} problems · ${solvedCount} solved`}
          </p>
          {visible.length === 0 ? (
            <div className="flex flex-col items-start gap-3 rounded-lg border border-border bg-surface p-5">
              <p className="font-medium">No problems match these filters.</p>
              <Button variant="secondary" size="sm" onClick={() => setFilters(NO_FILTERS)}>
                <XIcon />
                Clear filters
              </Button>
            </div>
          ) : (
            <div className="overflow-hidden rounded-lg border border-border bg-surface">
              <table className="w-full border-collapse text-left">
                <caption className="sr-only">Problems, in roadmap order</caption>
                <thead>
                  <tr className="border-b border-border text-xs text-muted">
                    <th scope="col" className="py-2 pl-4 font-medium">
                      <span className="sr-only">Status</span>
                    </th>
                    <th scope="col" className="py-2 pr-3 font-medium">
                      Title
                    </th>
                    {showPatternColumn ? (
                      <th
                        scope="col"
                        className="hidden py-2 pr-3 font-medium min-[640px]:table-cell"
                      >
                        Pattern
                      </th>
                    ) : null}
                    <th scope="col" className="py-2 pr-4 font-medium">
                      Difficulty
                    </th>
                    <th scope="col" className="hidden py-2 pr-4 font-medium min-[900px]:table-cell">
                      Best hint rung
                    </th>
                    <th scope="col" className="hidden py-2 pr-4 font-medium min-[900px]:table-cell">
                      Last attempt
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {visible.map((row) => (
                    <ProblemRow
                      key={row.item.slug}
                      row={row}
                      showPatternColumn={showPatternColumn}
                      pattern={row.patternId ? patternById.get(row.patternId) : undefined}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  )
}

"use client"

// The public walkthrough gallery (/viz): every Workspace problem, each playable as its
// walkthrough. Signed out works: the list is `GET /content/problems` and each walkthrough is
// the guest hint rung 5 (`GET /guest/problems/{slug}/hints/5`), both public.
// `?p=<slug>` (or `?problem=<slug>`) picks a problem; `?pattern=<id>` plays that pattern's demo
// (`GET /content/patterns/{id}`, public) instead.
import Link from "next/link"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { useQuery } from "@tanstack/react-query"
import { useMemo } from "react"
import { ArrowRightIcon, RotateCwIcon } from "lucide-react"

import { DifficultyChip } from "@/components/problems/DifficultyChip"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { WalkthroughPlayer } from "@/components/viz/WalkthroughPlayer"
import { api, shouldRetry, useProblems } from "@/lib/api/hooks"
import { usePattern } from "@/lib/api/patterns"
import { WalkthroughHintSchema, type ProblemListItem } from "@/lib/api/schemas"
import { cn } from "@/lib/utils"
import { demoPayload } from "@/lib/viz/payloads"

const CONTENT_STALE_MS = 60 * 60_000

/** The walkthrough of a problem, from the public rung-5 hint (key ["walkthrough", slug]). */
export function walkthroughQuery(slug: string) {
  return {
    queryKey: ["walkthrough", slug],
    queryFn: async () =>
      (await api.get(`/guest/problems/${encodeURIComponent(slug)}/hints/5`, WalkthroughHintSchema))
        .walkthrough,
    staleTime: CONTENT_STALE_MS,
    retry: shouldRetry,
  }
}

function ProblemButton({
  item,
  active,
  href,
}: {
  item: ProblemListItem
  active: boolean
  href: string
}) {
  return (
    <Link
      href={href}
      scroll={false}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex items-center justify-between gap-2 rounded-md px-2.5 py-2 text-sm transition-colors",
        active
          ? "bg-surface-2 font-medium text-text"
          : "text-muted hover:bg-surface-2 hover:text-text"
      )}
    >
      <span className="truncate">{item.title}</span>
      <DifficultyChip difficulty={item.difficulty} className="h-5 px-2" />
    </Link>
  )
}

function Player({ item }: { item: ProblemListItem }) {
  const walkthrough = useQuery(walkthroughQuery(item.slug))
  return (
    <section aria-labelledby="walkthrough-title" className="flex min-w-0 flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <h2 id="walkthrough-title" className="truncate text-xl font-semibold">
            {item.title}
          </h2>
          <DifficultyChip difficulty={item.difficulty} />
        </div>
        <Button asChild size="sm" variant="secondary">
          <Link href={`/p/${item.slug}`}>
            Solve it <ArrowRightIcon />
          </Link>
        </Button>
      </div>
      {walkthrough.isPending ? (
        <div className="flex flex-col gap-3" aria-label="Loading the walkthrough" role="status">
          <Skeleton className="h-8 w-2/3" />
          <Skeleton className="h-40 w-full" />
          <Skeleton className="h-6 w-1/2" />
        </div>
      ) : walkthrough.isError ? (
        <div
          role="alert"
          className="flex items-center gap-3 rounded-lg border border-border p-4 text-sm"
        >
          <span className="flex-1">Could not load this walkthrough.</span>
          <Button size="sm" variant="secondary" onClick={() => void walkthrough.refetch()}>
            <RotateCwIcon /> Try again
          </Button>
        </div>
      ) : (
        <WalkthroughPlayer key={item.slug} payload={walkthrough.data} />
      )}
    </section>
  )
}

/** The problem a gallery URL asks for: `?p=` or `?problem=` (null: the first problem). */
export function selectedSlug(params: Pick<URLSearchParams, "get">): string | null {
  return params.get("p") ?? params.get("problem")
}

function PatternDemo({ patternId }: { patternId: string }) {
  const pattern = usePattern(patternId)
  const demo = pattern.data?.demo
  const payload = useMemo(() => (demo ? demoPayload(demo) : null), [demo])
  return (
    <section aria-labelledby="walkthrough-title" className="flex min-w-0 flex-col gap-4">
      {pattern.isError ? (
        <div
          role="alert"
          className="flex items-center gap-3 rounded-lg border border-border p-4 text-sm"
        >
          <span className="flex-1">Could not load this pattern&apos;s demo.</span>
          <Button size="sm" variant="secondary" onClick={() => void pattern.refetch()}>
            <RotateCwIcon /> Try again
          </Button>
        </div>
      ) : !pattern.data || !payload ? (
        <div className="flex flex-col gap-3" aria-label="Loading the demo" role="status">
          <Skeleton className="h-8 w-2/3" />
          <Skeleton className="h-40 w-full" />
        </div>
      ) : (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 id="walkthrough-title" className="truncate text-xl font-semibold">
              {pattern.data.name}: the template at work
            </h2>
            <Button asChild size="sm" variant="secondary">
              <Link href={`/patterns/${encodeURIComponent(patternId)}`}>
                Pattern page <ArrowRightIcon />
              </Link>
            </Button>
          </div>
          <WalkthroughPlayer key={patternId} payload={payload} predictDefault={false} />
        </>
      )}
    </section>
  )
}

export function WalkthroughGallery() {
  const problems = useProblems()
  const params = useSearchParams()
  const pathname = usePathname()
  const router = useRouter()
  const items = problems.data ?? []
  const slug = selectedSlug(params)
  const patternId = params.get("pattern")
  const found = items.find((item) => item.slug === slug) ?? null
  // A pattern demo takes the stage unless a problem was asked for too.
  const showPattern = patternId !== null && found === null
  const current = found ?? (showPattern ? null : (items[0] ?? null))
  const hrefOf = (item: ProblemListItem) => `${pathname}?p=${encodeURIComponent(item.slug)}`

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-3xl font-semibold tracking-tight">Walkthroughs</h1>
        <p className="text-muted">
          Watch each solution run on real input, one step at a time. Turn on predict mode to guess
          the next move before you see it.
        </p>
      </header>
      {problems.isPending ? (
        <div
          className="grid gap-6 min-[900px]:grid-cols-[220px_minmax(0,1fr)]"
          role="status"
          aria-label="Loading problems"
        >
          <Skeleton className="h-80" />
          <Skeleton className="h-80" />
        </div>
      ) : problems.isError ? (
        <div
          role="alert"
          className="flex items-center gap-3 rounded-lg border border-border p-4 text-sm"
        >
          <span className="flex-1">Could not load the problems.</span>
          <Button size="sm" variant="secondary" onClick={() => void problems.refetch()}>
            <RotateCwIcon /> Try again
          </Button>
        </div>
      ) : (
        <div className="grid gap-6 min-[900px]:grid-cols-[220px_minmax(0,1fr)]">
          <nav aria-label="Problems" className="min-w-0">
            <label className="flex flex-col gap-1 text-xs font-medium text-muted min-[900px]:hidden">
              Problem
              <select
                value={current?.slug ?? ""}
                onChange={(event) => {
                  const item = items.find(
                    (candidate) => candidate.slug === event.currentTarget.value
                  )
                  if (item) router.replace(hrefOf(item), { scroll: false })
                }}
                className="h-9 rounded-md border border-border bg-surface-2 px-2 text-sm text-text"
              >
                {current ? null : (
                  <option value="" disabled>
                    Choose a problem
                  </option>
                )}
                {items.map((item) => (
                  <option key={item.slug} value={item.slug}>
                    {item.title}
                  </option>
                ))}
              </select>
            </label>
            <ul className="hidden flex-col gap-0.5 min-[900px]:flex">
              {items.map((item) => (
                <li key={item.slug}>
                  <ProblemButton
                    item={item}
                    active={item.slug === current?.slug}
                    href={hrefOf(item)}
                  />
                </li>
              ))}
            </ul>
          </nav>
          {showPattern ? (
            <PatternDemo patternId={patternId} />
          ) : current ? (
            <Player item={current} />
          ) : (
            <p className="text-muted">No problems yet.</p>
          )}
        </div>
      )}
    </div>
  )
}

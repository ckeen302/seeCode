"use client"

import { ArrowRightIcon, CircleCheckIcon, ListChecksIcon } from "lucide-react"
import Link from "next/link"

import { ProblemLink } from "@/components/problems/ProblemLink"
import { Button } from "@/components/ui/button"
import { useProblems } from "@/lib/api/hooks"
import { useWorkspace } from "@/stores/workspace"

/** The next Workspace problem in roadmap order, if any. */
function useNextProblem(slug: string) {
  const problems = useProblems()
  const list = [...(problems.data ?? [])].sort((a, b) => a.order - b.order)
  const index = list.findIndex((item) => item.slug === slug)
  return index >= 0 ? (list[index + 1] ?? null) : null
}

function SolvedCard({ slug }: { slug: string }) {
  const hiddenCount = useWorkspace(
    (state) => state.problem?.tests.filter((test) => test.hidden).length ?? 0
  )
  const next = useNextProblem(slug)
  return (
    <section
      aria-labelledby="solved-title"
      className="flex flex-col gap-3 rounded-lg border border-border border-l-2 border-l-good bg-bg p-4"
    >
      <div className="flex items-center gap-2">
        <CircleCheckIcon aria-hidden className="size-5 text-good" />
        <h3 id="solved-title" className="text-lg font-semibold">
          Solved.
        </h3>
      </div>
      <p className="text-sm text-muted">
        Every test passed, including {hiddenCount} hidden {hiddenCount === 1 ? "one" : "ones"}. The
        full wrap-up, with the pattern and twist, arrives in the next update.
      </p>
      <div className="flex flex-wrap gap-2">
        {next ? (
          // A long title ("Longest Substring Without Repeating Characters") is cut short
          // instead of pushing the button out of the card; the link text keeps it whole.
          <Button asChild size="sm" className="max-w-full min-w-0">
            <ProblemLink slug={next.slug} title={`Next: ${next.title}`}>
              <span className="truncate">Next: {next.title}</span>
              <ArrowRightIcon />
            </ProblemLink>
          </Button>
        ) : null}
        <Button asChild size="sm" variant="secondary">
          <Link href="/problems">
            <ListChecksIcon />
            All problems
          </Link>
        </Button>
      </div>
    </section>
  )
}

/**
 * The coach column (Section 7.1). M3 brings the Plan card, the hint ladder and the wrap-up;
 * for now it holds a short note and the "Solved." state.
 */
export function CoachPanel() {
  const slug = useWorkspace((state) => state.slug)
  const solved = useWorkspace((state) => state.solved)

  return (
    <aside aria-label="Coach" className="flex h-full flex-col gap-4 overflow-y-auto bg-surface p-4">
      <h2 className="text-xs font-medium tracking-wide text-muted uppercase">Coach</h2>
      {solved ? <SolvedCard slug={slug} /> : null}
      <section
        aria-labelledby="plan-first-title"
        className="flex flex-col gap-2 rounded-lg border border-border bg-bg p-4"
      >
        <h3 id="plan-first-title" className="text-base font-semibold">
          Plan first
        </h3>
        <p className="text-sm text-muted">
          The Plan card and the hint ladder arrive in the next update. Until then, plan before you
          code: which pattern fits, which data structures you need, and the time and space you are
          aiming for.
        </p>
      </section>
    </aside>
  )
}

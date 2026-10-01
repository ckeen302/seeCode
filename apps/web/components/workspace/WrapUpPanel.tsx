"use client"

import {
  ArrowRightIcon,
  CalendarClockIcon,
  CircleCheckIcon,
  HouseIcon,
  LogInIcon,
  PlayIcon,
  XIcon,
} from "lucide-react"
import { motion } from "motion/react"
import Link from "next/link"
import { useEffect, useRef } from "react"

import { ProblemLink } from "@/components/problems/ProblemLink"
import { ProblemStatusIcon } from "@/components/problems/ProblemStatusIcon"
import { Button } from "@/components/ui/button"
import { usePatterns, useProblems } from "@/lib/api/hooks"
import type { ProblemListItem } from "@/lib/api/schemas"
import { familyColor, patternName } from "@/lib/workspace/plan"
import { OUTCOME_COPY, formatDuration, hintsUsed, reviewLine } from "@/lib/workspace/wrapup"
import { useWorkspace, workspaceStore, type WrapUpView } from "@/stores/workspace"

// The wrap-up (Section 7.8): slides over the coach panel after a passing Submit. It names
// what to remember (pattern + twist), lists related problems, and offers the walkthrough,
// the next problem, and Today.

/** The problem after `slug` in roadmap order (guests: the API names it for signed-in users). */
export function nextInOrder(
  problems: readonly ProblemListItem[] | undefined,
  slug: string
): ProblemListItem | null {
  const list = [...(problems ?? [])].sort((a, b) => a.order - b.order)
  const index = list.findIndex((item) => item.slug === slug)
  return index >= 0 ? (list[index + 1] ?? null) : null
}

/** "Two pointers (opposite ends) + skip characters that are not letters or digits." */
function lowerFirst(text: string): string {
  return /^[A-Z][a-z]/.test(text) ? text[0].toLowerCase() + text.slice(1) : text
}

function Stat({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3 px-3 py-1.5">
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="text-right text-sm font-medium">{children}</dd>
    </div>
  )
}

export function WrapUpPanel({ wrapUp, now = new Date() }: { wrapUp: WrapUpView; now?: Date }) {
  const slug = useWorkspace((state) => state.slug)
  const patterns = usePatterns()
  const problems = useProblems()
  const headingRef = useRef<HTMLHeadingElement>(null)

  // The panel takes focus when it slides in, so the result is announced and reachable.
  useEffect(() => {
    headingRef.current?.focus({ preventScroll: true })
  }, [])

  const name = wrapUp.patternName ?? patternName(wrapUp.patternId, patterns.data)
  const family = patterns.data?.find((item) => item.id === wrapUp.patternId)?.family ?? null
  const next = wrapUp.guest
    ? nextInOrder(problems.data, slug)
    : wrapUp.nextProblemSlug
      ? (problems.data?.find((item) => item.slug === wrapUp.nextProblemSlug) ?? {
          slug: wrapUp.nextProblemSlug,
          title: "Next problem",
        })
      : null

  return (
    <motion.div
      initial={{ x: 24, opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      exit={{ x: 24, opacity: 0 }}
      transition={{ duration: 0.2, ease: "easeOut" }}
      className="absolute inset-0 z-10 flex flex-col overflow-y-auto bg-surface"
    >
      <section aria-labelledby="wrap-up-title" className="flex flex-col gap-4 p-4">
        <div className="flex items-start gap-2">
          <CircleCheckIcon aria-hidden className="mt-0.5 size-6 shrink-0 text-good" />
          <div className="flex min-w-0 flex-1 flex-col">
            <h2
              id="wrap-up-title"
              ref={headingRef}
              tabIndex={-1}
              className="text-xl font-semibold outline-none"
            >
              Solved.
            </h2>
            <p className="text-sm text-muted">
              {wrapUp.outcome
                ? OUTCOME_COPY[wrapUp.outcome]
                : "Every test passed, the hidden ones too."}
            </p>
          </div>
          <Button
            variant="ghost"
            size="icon-sm"
            className="-mt-1 -mr-1 text-muted hover:text-text"
            aria-label="Close the wrap-up"
            onClick={() => workspaceStore.getState().setWrapUpOpen(false)}
          >
            <XIcon />
          </Button>
        </div>

        <dl className="flex flex-col divide-y divide-border rounded-md bg-surface-2">
          <Stat label="Time">{formatDuration(wrapUp.timeSeconds)}</Stat>
          <Stat label="Hints">{hintsUsed(wrapUp.maxRung)}</Stat>
          <Stat label="Plan">
            {wrapUp.planRightFirstTime ? "Right first time" : "Not first time"}
          </Stat>
        </dl>

        {name || wrapUp.twist ? (
          <section
            aria-labelledby="wrap-up-remember"
            className="flex flex-col gap-2 rounded-lg border border-border border-l-2 border-l-accent bg-bg p-3"
          >
            <h3 id="wrap-up-remember" className="text-xs font-medium text-muted">
              What to remember
            </h3>
            <p className="text-base leading-6">
              {name ? (
                <span className="inline-flex items-center gap-1.5 font-semibold">
                  <span
                    aria-hidden
                    className="size-1.5 rounded-full"
                    style={{ backgroundColor: familyColor(family) }}
                  />
                  {name}
                </span>
              ) : null}
              {name && wrapUp.twist ? <span className="text-muted"> + </span> : null}
              {wrapUp.twist ? <span>{name ? lowerFirst(wrapUp.twist) : wrapUp.twist}</span> : null}
            </p>
            {wrapUp.patternId && wrapUp.patternId !== "brute_force" ? (
              <Link
                href={`/patterns/${wrapUp.patternId}`}
                className="w-fit text-xs text-muted underline-offset-2 hover:text-text hover:underline"
              >
                More on this pattern
              </Link>
            ) : null}
          </section>
        ) : null}

        {wrapUp.related.length > 0 ? (
          <section aria-labelledby="wrap-up-related" className="flex flex-col gap-2">
            <h3 id="wrap-up-related" className="text-xs font-medium text-muted">
              Related problems
            </h3>
            <ul className="flex flex-col gap-2">
              {wrapUp.related.map((item) => (
                <li key={item.slug} className="flex gap-2 text-sm">
                  <ProblemStatusIcon status={item.status} className="mt-0.5" />
                  <div className="flex min-w-0 flex-col">
                    <ProblemLink slug={item.slug} className="font-medium hover:underline">
                      {item.title}
                    </ProblemLink>
                    <span className="text-xs text-muted">{item.relation}</span>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        <p className="flex items-start gap-2 text-sm">
          <CalendarClockIcon aria-hidden className="mt-0.5 size-4 shrink-0 text-muted" />
          {wrapUp.nextReviewAt
            ? reviewLine(wrapUp.nextReviewAt, now)
            : "Sign in and we'll bring this back for review, right when it's about to fade."}
        </p>

        <div className="flex flex-col gap-2">
          {next ? (
            <Button asChild className="w-full min-w-0">
              <ProblemLink slug={next.slug}>
                <span className="truncate">Next: {next.title}</span>
                <ArrowRightIcon />
              </ProblemLink>
            </Button>
          ) : null}
          <div className="grid grid-cols-2 gap-2">
            <Button
              variant="secondary"
              onClick={() => void workspaceStore.getState().showWalkthrough()}
            >
              <PlayIcon />
              See it run
            </Button>
            {wrapUp.guest ? (
              <Button asChild variant="secondary">
                <Link href="/login">
                  <LogInIcon />
                  Save progress
                </Link>
              </Button>
            ) : (
              <Button asChild variant="secondary">
                <Link href="/today">
                  <HouseIcon />
                  Back to Today
                </Link>
              </Button>
            )}
          </div>
        </div>
      </section>
    </motion.div>
  )
}

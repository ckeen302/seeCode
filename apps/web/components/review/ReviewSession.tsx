"use client"

import { useQueryClient } from "@tanstack/react-query"
import {
  ArrowRightIcon,
  CalendarCheckIcon,
  CheckCircle2Icon,
  HammerIcon,
  RotateCcwIcon,
  SkipForwardIcon,
  ZapIcon,
} from "lucide-react"
import Link from "next/link"
import { useState } from "react"

import { useNumberKeys } from "@/components/drills/keys"
import { PlanQuestion, type PlanFeedback } from "@/components/drills/PlanQuestion"
import { ProblemStatement } from "@/components/drills/ProblemStatement"
import { SessionProgress } from "@/components/drills/DrillSession"
import { ToolkitQuestion, type ToolkitFeedback } from "@/components/drills/ToolkitQuestion"
import { playAnswerSound } from "@/components/drills/sound"
import { ProblemLink } from "@/components/problems/ProblemLink"
import { plural } from "@/components/stats/format"
import {
  EmptyState,
  ErrorState,
  LoadingState,
  PageHeader,
  RequireAuth,
  SignedOutState,
} from "@/components/today/PageStates"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Kbd } from "@/components/ui/kbd"
import { drillSessionHref } from "@/lib/api/drills"
import { useSettings } from "@/lib/api/profile"
import {
  REVIEW_SESSION_SIZE,
  answerReview,
  rateReview,
  summarizeNextDue,
  useReviewQueue,
  type ReviewAnswerResult,
  type ReviewCard,
} from "@/lib/api/review"
import type { PlanCard } from "@/lib/api/schemas"

/** Section 6.7: a 60-second soft timer for problem-plan reviews. */
export const REVIEW_SECONDS = 60
/** Toolkit reviews use the drill card's 30 seconds. */
const TOOLKIT_SECONDS = 30

export function formatDue(iso: string, now: Date = new Date()): string {
  const [line] = summarizeNextDue([iso], now)
  return line.replace(/^1 item /, "")
}

function SelfRating({
  onRate,
  busy,
}: {
  onRate: (rating: "hard" | "good") => void
  busy: boolean
}) {
  useNumberKeys(2, (index) => onRate(index === 0 ? "hard" : "good"), !busy)
  return (
    <div
      className="flex flex-col gap-3 rounded-lg border border-accent/50 p-4"
      role="group"
      aria-labelledby="self-rating"
    >
      <p id="self-rating" className="text-sm font-medium">
        Close call. How did that feel?
      </p>
      <div className="grid grid-cols-2 gap-2">
        <Button variant="secondary" onClick={() => onRate("hard")} disabled={busy}>
          Hard
          <Kbd>1</Kbd>
        </Button>
        <Button variant="secondary" onClick={() => onRate("good")} disabled={busy}>
          Good
          <Kbd>2</Kbd>
        </Button>
      </div>
      <p className="text-xs text-muted">Hard brings it back sooner.</p>
    </div>
  )
}

function ResolveItem({
  item,
  onSkip,
  progress,
}: {
  item: ReviewCard
  onSkip: () => void
  progress: React.ReactNode
}) {
  return (
    <div className="grid grid-cols-1 gap-6 min-[900px]:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
      <section
        aria-label="Problem"
        className="flex flex-col gap-4 self-start rounded-lg border border-border bg-surface p-5"
      >
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-sm font-medium text-muted">Solve this one again</h2>
          {progress}
        </div>
        {item.problem ? <ProblemStatement card={item.problem} /> : null}
      </section>
      <section className="flex flex-col gap-4 rounded-lg border border-border bg-surface p-5">
        <div className="flex items-center gap-2">
          <HammerIcon aria-hidden className="size-4 text-accent" />
          <h2 className="text-base font-semibold">Re-solve in the Workspace</h2>
        </div>
        <p className="text-sm text-muted">
          Last time you needed the solution, so this review is a fresh solve. It counts when you
          finish the problem, however it goes.
        </p>
        {item.problem && item.hasWorkspace !== false ? (
          <Button asChild>
            <ProblemLink slug={item.problem.slug}>
              Re-solve in Workspace
              <ArrowRightIcon />
            </ProblemLink>
          </Button>
        ) : null}
        <Button variant="secondary" onClick={onSkip}>
          <SkipForwardIcon />
          Skip for now
        </Button>
      </section>
    </div>
  )
}

interface Answered {
  result: ReviewAnswerResult
  nextDueAt: string | null
}

function Session({ items, remaining }: { items: ReviewCard[]; remaining: number }) {
  const settings = useSettings()
  const queryClient = useQueryClient()
  const [index, setIndex] = useState(0)
  const [answered, setAnswered] = useState<Answered | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [dueDates, setDueDates] = useState<string[]>([])
  const [done, setDone] = useState(0)
  const [skipped, setSkipped] = useState(0)
  const [finished, setFinished] = useState(false)
  const item = items[index]

  const refreshAfterward = () => {
    for (const key of ["today", "stats"]) void queryClient.invalidateQueries({ queryKey: [key] })
  }

  const advance = () => {
    setAnswered(null)
    setError(null)
    if (index + 1 >= items.length) {
      setFinished(true)
      refreshAfterward()
    } else setIndex(index + 1)
  }

  const submit = async (answer: PlanCard | { tool: string }, seconds: number) => {
    setBusy(true)
    setError(null)
    try {
      const result = await answerReview(item.itemId, { answer, seconds })
      if (settings.sound) playAnswerSound(result.correct)
      setAnswered({ result, nextDueAt: result.nextDueAt ?? null })
      if (!result.needsSelfRating) {
        setDone((d) => d + 1)
        if (result.nextDueAt) setDueDates((dates) => [...dates, result.nextDueAt as string])
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Couldn't check that answer.")
    } finally {
      setBusy(false)
    }
  }

  const rate = async (rating: "hard" | "good") => {
    if (!answered) return
    setBusy(true)
    setError(null)
    try {
      const result = await rateReview(item.itemId, rating)
      setAnswered({
        result: { ...answered.result, needsSelfRating: false, grade: result.grade },
        nextDueAt: result.nextDueAt,
      })
      setDone((d) => d + 1)
      setDueDates((dates) => [...dates, result.nextDueAt])
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Couldn't save your rating.")
    } finally {
      setBusy(false)
    }
  }

  if (finished) {
    const lines = summarizeNextDue(dueDates)
    return (
      <div className="flex flex-col gap-6">
        <EmptyState
          icon={CalendarCheckIcon}
          title={done ? `${plural(done, "review")} done.` : "Session over"}
          actions={
            <>
              {remaining > 0 ? (
                <Button
                  onClick={() => void queryClient.invalidateQueries({ queryKey: ["review-queue"] })}
                >
                  <RotateCcwIcon />
                  Review {remaining} more
                </Button>
              ) : null}
              <Button asChild variant={remaining > 0 ? "secondary" : "primary"}>
                <Link href="/today">
                  Back to Today
                  <ArrowRightIcon />
                </Link>
              </Button>
            </>
          }
        >
          {lines.length ? (
            <>
              <p>Coming back: {lines.join(", ")}.</p>
              <p className="mt-1">Each review you get right pushes the next one further out.</p>
            </>
          ) : (
            <p>{skipped ? `${plural(skipped, "item")} left for later.` : null}</p>
          )}
        </EmptyState>
      </div>
    )
  }

  const progress = <SessionProgress index={index} total={items.length} />
  const last = index + 1 >= items.length
  const nextLabel = last ? "Finish" : "Next"
  const result = answered?.result ?? null
  const dueNote =
    answered?.nextDueAt && !result?.needsSelfRating ? (
      <p className="flex items-center gap-2 text-sm text-muted" role="status">
        <CheckCircle2Icon aria-hidden className="size-4 text-good" />
        Next review {formatDue(answered.nextDueAt)}.
      </p>
    ) : null

  return (
    <div className="flex flex-col gap-5">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-base font-semibold">Review</h1>
        <span className="text-sm text-muted">{plural(done, "done", "done")}</span>
      </header>
      {error ? (
        <p role="alert" className="rounded-md border border-error/40 px-3 py-2 text-sm text-error">
          {error}
        </p>
      ) : null}
      {item.kind === "toolkit" && item.toolkit ? (
        <>
          <ToolkitQuestion
            key={item.itemId}
            prompt={item.toolkit}
            limit={TOOLKIT_SECONDS}
            timer={settings.drillTimer}
            feedback={result as ToolkitFeedback | null}
            submitting={busy}
            onSubmit={(tool, seconds) => void submit({ tool }, seconds)}
            onNext={advance}
            nextLabel={nextLabel}
            progress={progress}
          />
          <div className="mx-auto w-full max-w-2xl">{dueNote}</div>
        </>
      ) : item.resolve ? (
        <ResolveItem
          key={item.itemId}
          item={item}
          progress={progress}
          onSkip={() => {
            setSkipped((s) => s + 1)
            advance()
          }}
        />
      ) : item.problem ? (
        <PlanQuestion
          key={item.itemId}
          card={item.problem}
          limit={REVIEW_SECONDS}
          timer={settings.drillTimer}
          feedback={result as PlanFeedback | null}
          submitting={busy}
          onSubmit={(plan, seconds) => void submit(plan, seconds)}
          onNext={advance}
          nextLabel={nextLabel}
          canGoNext={!result?.needsSelfRating}
          progress={progress}
          afterFeedback={
            result?.needsSelfRating ? (
              <SelfRating onRate={(rating) => void rate(rating)} busy={busy} />
            ) : (
              dueNote
            )
          }
        />
      ) : (
        <Card className="flex flex-col items-start gap-3">
          <p className="text-sm text-muted">This item can&apos;t be shown.</p>
          <Button variant="secondary" size="sm" onClick={advance}>
            Skip
          </Button>
        </Card>
      )}
    </div>
  )
}

function Queue() {
  const queue = useReviewQueue()
  if (queue.isPending) return <LoadingState label="Loading your reviews" rows={1} />
  if (queue.isError) {
    return (
      <ErrorState
        title="We couldn't load your reviews"
        error={queue.error}
        onRetry={() => void queue.refetch()}
      />
    )
  }
  if (queue.data.length === 0) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader
          title="Review"
          description="Solved problems and missed drill cards come back on a schedule, so they stick."
        />
        <EmptyState
          icon={CalendarCheckIcon}
          title="All caught up"
          actions={
            <>
              <Button asChild>
                <Link href={drillSessionHref({ mode: "recognition", size: 10 })}>
                  <ZapIcon />
                  Do a quick drill
                </Link>
              </Button>
              <Button asChild variant="secondary">
                <Link href="/today">Back to Today</Link>
              </Button>
            </>
          }
        >
          <p>
            Nothing is due today. When you solve a problem or miss a drill card, it comes back here:
            first after a day or three, then at growing intervals.
          </p>
        </EmptyState>
      </div>
    )
  }
  const items = queue.data.slice(0, REVIEW_SESSION_SIZE)
  return (
    <Session
      key={queue.dataUpdatedAt}
      items={items}
      remaining={Math.max(0, queue.data.length - items.length)}
    />
  )
}

// Review (Sections 6.7, 11.4 and 11.5).
export function ReviewSession() {
  return (
    <RequireAuth
      loadingLabel="Loading your reviews"
      signedOut={
        <SignedOutState
          title="Review"
          icon={RotateCcwIcon}
          pitch="Spaced review brings back what you solved, right before you'd forget it."
        />
      }
    >
      <Queue />
    </RequireAuth>
  )
}

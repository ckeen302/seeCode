"use client"

import { ArrowRightIcon, CheckCircle2Icon, CircleDotDashedIcon, LoaderIcon } from "lucide-react"
import { useEffect, useRef, useState } from "react"

import { useEnterKey } from "@/components/drills/keys"
import { PlanForm } from "@/components/drills/PlanForm"
import { ProblemStatement } from "@/components/drills/ProblemStatement"
import { TimerRing, useElapsed } from "@/components/drills/TimerRing"
import { describePointsTo } from "@/components/drills/highlight"
import { Button } from "@/components/ui/button"
import { Kbd } from "@/components/ui/kbd"
import type { ProblemCard } from "@/lib/api/drills"
import { usePatterns, useStructures } from "@/lib/api/hooks"
import type { PlanCard, PlanGrade, Signal } from "@/lib/api/schemas"
import { cn } from "@/lib/utils"
import { EMPTY_PLAN, patternName, planForRequest } from "@/lib/workspace/plan"

export interface PlanFeedback {
  correct: boolean
  planGrade?: PlanGrade
  signals?: Signal[]
  title?: string
}

function RevealPanel({
  feedback,
  structureNames,
  patternNames,
}: {
  feedback: PlanFeedback
  structureNames: Record<string, string>
  patternNames: Record<string, string>
}) {
  const reveal = feedback.planGrade?.reveal
  const signals = feedback.signals ?? []
  return (
    <div className="flex flex-col gap-4">
      <div
        className={cn(
          "flex items-start gap-3 rounded-lg border p-4 animate-in duration-200 zoom-in-[0.98]",
          feedback.correct ? "border-good/50 bg-confirmed" : "border-border bg-surface-2"
        )}
        role="status"
      >
        {feedback.correct ? (
          <CheckCircle2Icon aria-hidden className="mt-0.5 size-5 shrink-0 text-good" />
        ) : (
          <CircleDotDashedIcon aria-hidden className="mt-0.5 size-5 shrink-0 text-close" />
        )}
        <div className="flex flex-col gap-0.5">
          <p className="font-semibold">
            {feedback.correct ? "Right plan." : "Not quite. Here's the plan that fits."}
          </p>
          {feedback.title ? (
            <p className="text-sm text-muted">
              This was <span className="font-medium text-text">{feedback.title}</span>.
            </p>
          ) : null}
        </div>
      </div>
      {reveal ? (
        <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-2 rounded-lg border border-border bg-surface p-4 text-sm">
          <dt className="text-muted">Pattern</dt>
          <dd className="font-medium">
            {patternNames[reveal.patternId] ?? reveal.patternId.replace(/_/g, " ")}
          </dd>
          <dt className="text-muted">Structures</dt>
          <dd>{reveal.structures.map((id) => structureNames[id] ?? id).join(", ") || "–"}</dd>
          <dt className="text-muted">Time · space</dt>
          <dd className="font-mono">
            {reveal.time} · {reveal.space}
          </dd>
          <dt className="text-muted">Twist</dt>
          <dd>{reveal.twist}</dd>
        </dl>
      ) : null}
      {feedback.planGrade?.note ? (
        <p className="text-sm text-muted">{feedback.planGrade.note}</p>
      ) : null}
      {signals.length ? (
        <div className="flex flex-col gap-2">
          <p className="text-xs font-medium text-muted">Signals in the statement</p>
          <ol className="flex flex-col gap-2">
            {signals.map((signal, index) => (
              <li key={signal.phrase} className="flex gap-2 text-sm">
                <span className="font-mono text-xs text-muted">{index + 1}</span>
                <span className="flex flex-col gap-0.5">
                  <span>
                    <mark className="rounded-sm bg-signal px-0.5 text-text">{signal.phrase}</mark>
                    <span className="ml-2 text-xs text-muted">
                      {describePointsTo(signal.pointsTo, {
                        patterns: patternNames,
                        structures: structureNames,
                      })}
                    </span>
                  </span>
                  <span className="text-muted">{signal.meaning}</span>
                </span>
              </li>
            ))}
          </ol>
        </div>
      ) : null}
    </div>
  )
}

/**
 * One plan question (a recognition drill card or a problem-plan review): the statement on
 * the left (60%), the compact Plan card on the right (40%); Enter submits, then goes next.
 * Remount it (a new `key`) for each card.
 */
export function PlanQuestion({
  card,
  limit,
  timer,
  feedback,
  submitting,
  onSubmit,
  onNext,
  nextLabel = "Next",
  canGoNext = true,
  afterFeedback,
  progress,
}: {
  card: ProblemCard
  limit: number
  timer: boolean
  feedback: PlanFeedback | null
  submitting: boolean
  onSubmit: (plan: PlanCard, seconds: number, overtime: boolean) => void
  onNext: () => void
  nextLabel?: string
  canGoNext?: boolean
  afterFeedback?: React.ReactNode
  progress?: React.ReactNode
}) {
  const [startedAt] = useState(() => Date.now())
  const [plan, setPlan] = useState<PlanCard>(EMPTY_PLAN)
  const answered = feedback !== null
  const elapsed = useElapsed(startedAt, !answered)
  const patterns = usePatterns()
  const structures = useStructures()
  const nextRef = useRef<HTMLButtonElement>(null)

  const patternNames = Object.fromEntries((patterns.data ?? []).map((p) => [p.id, p.name]))
  const structureNames = Object.fromEntries((structures.data ?? []).map((s) => [s.id, s.label]))

  const submit = () => {
    if (answered || submitting) return
    const seconds = (Date.now() - startedAt) / 1000
    onSubmit(planForRequest(plan), Math.round(seconds * 10) / 10, timer && seconds > limit)
  }

  useEnterKey(() => {
    if (!answered) submit()
    else if (canGoNext) onNext()
  })

  useEffect(() => {
    if (answered && canGoNext) nextRef.current?.focus()
  }, [answered, canGoNext])

  const ready = patterns.data && structures.data

  return (
    <div className="grid grid-cols-1 gap-6 min-[900px]:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
      <section
        aria-label="Problem"
        className="flex flex-col gap-4 self-start rounded-lg border border-border bg-surface p-5 min-[900px]:sticky min-[900px]:top-6"
      >
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-sm font-medium text-muted">
            {feedback?.title ? feedback.title : "Which plan fits?"}
          </h2>
          <div className="flex items-center gap-3">
            {progress}
            {timer && !answered ? <TimerRing elapsed={elapsed} limit={limit} /> : null}
          </div>
        </div>
        <ProblemStatement card={card} signals={feedback?.signals ?? []} />
      </section>

      <section
        aria-label="Your plan"
        className="flex flex-col gap-5 rounded-lg border border-border bg-surface p-5"
      >
        <h2 className="text-base font-semibold">Your plan</h2>
        {ready ? (
          <PlanForm
            plan={plan}
            onChange={setPlan}
            patterns={patterns.data}
            structures={structures.data}
            grade={feedback?.planGrade}
            disabled={answered || submitting}
          />
        ) : (
          <div className="flex items-center gap-2 text-sm text-muted" aria-busy="true">
            <LoaderIcon aria-hidden className="size-4 animate-spin" />
            Loading the Plan card…
          </div>
        )}
        {!answered ? (
          <Button onClick={submit} disabled={submitting || !ready} className="w-full">
            {submitting ? "Checking…" : "Check plan"}
            <Kbd className="border-on-accent/40 text-on-accent">↵</Kbd>
          </Button>
        ) : null}
        {answered ? (
          <>
            <RevealPanel
              feedback={feedback}
              patternNames={patternNames}
              structureNames={structureNames}
            />
            {afterFeedback}
            {canGoNext ? (
              <Button ref={nextRef} onClick={onNext} className="w-full">
                {nextLabel}
                <ArrowRightIcon />
              </Button>
            ) : null}
          </>
        ) : null}
        {answered && plan.pattern ? (
          <p className="text-xs text-muted">
            You picked {patternName(plan.pattern, patterns.data) ?? plan.pattern}.
          </p>
        ) : null}
      </section>
    </div>
  )
}

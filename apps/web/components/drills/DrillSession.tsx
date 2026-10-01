"use client"

import { useQuery, useQueryClient } from "@tanstack/react-query"
import { XIcon, ZapIcon } from "lucide-react"
import Link from "next/link"
import { useSearchParams } from "next/navigation"
import { useState } from "react"

import { DrillSummaryView } from "@/components/drills/DrillSummaryView"
import { PlanQuestion, type PlanFeedback } from "@/components/drills/PlanQuestion"
import { ToolkitQuestion, type ToolkitFeedback } from "@/components/drills/ToolkitQuestion"
import { playAnswerSound } from "@/components/drills/sound"
import {
  ErrorState,
  LoadingState,
  RequireAuth,
  SignedOutState,
} from "@/components/today/PageStates"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { ApiError } from "@/lib/api/client"
import {
  answerDrillCard,
  finishDrillSession,
  parseDrillParams,
  startDrillSession,
  type DrillCard,
  type DrillSessionRequest,
  type DrillSummary,
} from "@/lib/api/drills"
import { useUserId } from "@/lib/api/patterns"
import { useSettings } from "@/lib/api/profile"
import type { PlanCard } from "@/lib/api/schemas"

/** Section 6.6: 30 seconds per card, shown but never enforced. */
export const DRILL_SECONDS = 30

type Feedback = PlanFeedback | ToolkitFeedback

export function SessionProgress({ index, total }: { index: number; total: number }) {
  return (
    <div className="flex items-center gap-3">
      <span className="font-mono text-sm tabular-nums" aria-label={`Card ${index + 1} of ${total}`}>
        {index + 1} / {total}
      </span>
      <div
        className="hidden h-1.5 w-32 overflow-hidden rounded-full bg-surface-2 min-[640px]:block"
        aria-hidden
      >
        <div
          className="h-full rounded-full bg-accent transition-[width] duration-300"
          style={{ width: `${(index / total) * 100}%` }}
        />
      </div>
    </div>
  )
}

function Session({
  request,
  sessionId,
  cards,
  onAgain,
}: {
  request: DrillSessionRequest
  sessionId: string
  cards: DrillCard[]
  onAgain: () => void
}) {
  const settings = useSettings()
  const queryClient = useQueryClient()
  const [index, setIndex] = useState(0)
  const [feedback, setFeedback] = useState<Feedback | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [summary, setSummary] = useState<DrillSummary | null>(null)
  const [finishing, setFinishing] = useState(false)
  const card = cards[index]

  const answer = async (
    answerBody: PlanCard | { tool: string },
    seconds: number,
    overtime: boolean
  ) => {
    setSubmitting(true)
    setError(null)
    try {
      const result = await answerDrillCard(sessionId, {
        cardId: card.id,
        answer: answerBody,
        seconds,
        overtime,
      })
      if (settings.sound) playAnswerSound(result.correct)
      setFeedback(result)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Couldn't check that answer.")
    } finally {
      setSubmitting(false)
    }
  }

  const finish = async () => {
    setFinishing(true)
    setError(null)
    try {
      setSummary(await finishDrillSession(sessionId))
      for (const key of ["today", "stats", "review-queue"]) {
        void queryClient.invalidateQueries({ queryKey: [key] })
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Couldn't finish the session.")
    } finally {
      setFinishing(false)
    }
  }

  const next = () => {
    if (index + 1 >= cards.length) {
      void finish()
      return
    }
    setFeedback(null)
    setIndex(index + 1)
  }

  if (summary) return <DrillSummaryView summary={summary} onAgain={onAgain} />

  const last = index + 1 >= cards.length
  const progress = <SessionProgress index={index} total={cards.length} />
  const timer = settings.drillTimer

  return (
    <div className="flex flex-col gap-5">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <ZapIcon aria-hidden className="size-4 text-accent" />
          <h1 className="text-base font-semibold">
            {request.mode === "recognition" ? "Recognition drill" : "Toolkit drill"}
          </h1>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => void finish()}
          disabled={finishing}
          className="text-muted"
        >
          <XIcon />
          End session
        </Button>
      </header>
      {error ? (
        <p role="alert" className="rounded-md border border-error/40 px-3 py-2 text-sm text-error">
          {error}
        </p>
      ) : null}
      {card.mode === "recognition" ? (
        <PlanQuestion
          key={card.id}
          card={card}
          limit={DRILL_SECONDS}
          timer={timer}
          feedback={feedback as PlanFeedback | null}
          submitting={submitting}
          onSubmit={(plan, seconds, overtime) => void answer(plan, seconds, overtime)}
          onNext={next}
          nextLabel={last ? "See results" : "Next card"}
          progress={progress}
        />
      ) : (
        <ToolkitQuestion
          key={card.id}
          prompt={card}
          limit={DRILL_SECONDS}
          timer={timer}
          feedback={feedback as ToolkitFeedback | null}
          submitting={submitting}
          onSubmit={(tool, seconds, overtime) => void answer({ tool }, seconds, overtime)}
          onNext={next}
          nextLabel={last ? "See results" : "Next card"}
          progress={progress}
        />
      )}
    </div>
  )
}

function SessionLoader({ request }: { request: DrillSessionRequest }) {
  const userId = useUserId()
  const [round, setRound] = useState(0)
  // Dealing a session is a POST; the query caches it so re-renders never deal twice.
  const session = useQuery({
    queryKey: ["drill-session", userId, request.mode, request.patternFilter, request.size, round],
    queryFn: () => startDrillSession(request),
    staleTime: Infinity,
    gcTime: 0,
    retry: false,
    refetchOnMount: false,
    refetchOnReconnect: false,
    enabled: userId !== null,
  })

  if (session.isPending) return <LoadingState label="Dealing your cards" rows={1} />
  if (session.isError) {
    const conflict = session.error instanceof ApiError && session.error.status < 500
    return conflict ? (
      <Card className="flex flex-col items-start gap-3">
        <h1 className="text-lg font-semibold">This drill can&apos;t start yet</h1>
        <p className="text-sm text-muted">{session.error.message}</p>
        <Button asChild variant="secondary" size="sm">
          <Link href="/drills">Choose another drill</Link>
        </Button>
      </Card>
    ) : (
      <ErrorState
        title="We couldn't deal your cards"
        error={session.error}
        onRetry={() => void session.refetch()}
      />
    )
  }
  return (
    <Session
      key={session.data.sessionId}
      request={request}
      sessionId={session.data.sessionId}
      cards={session.data.cards}
      onAgain={() => setRound((r) => r + 1)}
    />
  )
}

// Drill session (Section 6.6): `?mode=recognition|toolkit&pattern=&size=`.
export function DrillSession() {
  const params = useSearchParams()
  const request = parseDrillParams(params)
  return (
    <RequireAuth
      loadingLabel="Loading your drill"
      signedOut={
        <SignedOutState
          title="Drills"
          icon={ZapIcon}
          pitch="Drills train recognition: read a problem, plan it in 30 seconds, see why."
        />
      }
    >
      <SessionLoader request={request} />
    </RequireAuth>
  )
}

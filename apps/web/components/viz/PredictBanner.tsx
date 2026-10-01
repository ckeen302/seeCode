"use client"

// Predict mode (Section 8.6): the question as a banner over the canvas. `index` questions are
// answered by clicking a cell (the canvas makes them buttons), `yesno` with two buttons and
// `value` by typing. Right answers get a check and move on; otherwise the right answer shows
// (its cell highlighted) until the learner continues with Enter.
import { useEffect, useRef, useState } from "react"
import { CheckIcon, CircleHelpIcon, MinusIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { answerLabel, type PendingPredict, type PredictFeedback } from "@/stores/player"

interface PredictBannerProps {
  pending: PendingPredict | null
  feedback: PredictFeedback | null
  onAnswer: (value: unknown) => void
  onSkip: () => void
  onContinue: () => void
}

function ValueForm({ onAnswer }: { onAnswer: (value: string) => void }) {
  const [value, setValue] = useState("")
  const input = useRef<HTMLInputElement>(null)
  useEffect(() => input.current?.focus(), [])
  return (
    <form
      className="flex items-center gap-2"
      onSubmit={(event) => {
        event.preventDefault()
        if (value.trim()) onAnswer(value)
      }}
    >
      <label className="sr-only" htmlFor="predict-value">
        Your answer
      </label>
      <input
        id="predict-value"
        ref={input}
        value={value}
        onChange={(event) => setValue(event.currentTarget.value)}
        className="h-8 w-32 rounded-md border border-border bg-surface-2 px-2 font-mono text-sm text-text focus-visible:border-accent"
        autoComplete="off"
        spellCheck={false}
      />
      <Button type="submit" size="sm" disabled={!value.trim()}>
        Check
      </Button>
    </form>
  )
}

export function PredictBanner({
  pending,
  feedback,
  onAnswer,
  onSkip,
  onContinue,
}: PredictBannerProps) {
  const first = useRef<HTMLButtonElement>(null)
  const continueButton = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    if (pending?.point.kind === "yesno") first.current?.focus()
  }, [pending])
  useEffect(() => {
    if (feedback && !feedback.correct) continueButton.current?.focus()
  }, [feedback])

  if (feedback) {
    return (
      <div
        role="status"
        className={cn(
          "flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border bg-surface px-3 py-2 shadow-popover",
          feedback.correct ? "border-good" : "border-wrong"
        )}
        data-testid="predict-feedback"
        data-correct={feedback.correct}
      >
        <span
          aria-hidden
          className={cn(
            "flex size-6 shrink-0 items-center justify-center rounded-full",
            feedback.correct ? "bg-good text-on-accent" : "bg-wrong text-on-accent"
          )}
        >
          {feedback.correct ? <CheckIcon className="size-4" /> : <MinusIcon className="size-4" />}
        </span>
        <p className="min-w-0 flex-1 text-sm text-text">
          {feedback.correct ? (
            <>
              <span className="font-medium">Right:</span>{" "}
              <span className="font-mono">{answerLabel(feedback)}</span>.
            </>
          ) : (
            <>
              <span className="font-medium">Not quite.</span> You said {feedback.given}; the answer
              is <span className="font-mono">{answerLabel(feedback)}</span>.
            </>
          )}
        </p>
        <Button
          ref={continueButton}
          size="sm"
          variant={feedback.correct ? "ghost" : "primary"}
          onClick={onContinue}
          shortcut="↵"
        >
          Continue
        </Button>
      </div>
    )
  }
  if (!pending) return null
  const { point } = pending
  return (
    <div
      role="group"
      aria-label="Predict"
      className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border border-close bg-surface px-3 py-2 shadow-popover"
      data-testid="predict-banner"
    >
      <CircleHelpIcon aria-hidden className="size-5 shrink-0 text-close" />
      <div className="flex min-w-0 flex-1 flex-col">
        <p className="text-sm font-medium text-text" aria-live="assertive">
          {point.ask}
        </p>
        {point.kind === "index" ? (
          <p className="text-xs text-muted">
            Click the cell{pending.array ? ` of ${pending.array}` : ""}.
          </p>
        ) : null}
      </div>
      {point.kind === "yesno" ? (
        <div className="flex gap-2">
          <Button ref={first} size="sm" variant="secondary" onClick={() => onAnswer(true)}>
            Yes
          </Button>
          <Button size="sm" variant="secondary" onClick={() => onAnswer(false)}>
            No
          </Button>
        </div>
      ) : null}
      {point.kind === "value" ? <ValueForm onAnswer={onAnswer} /> : null}
      <Button size="sm" variant="ghost" className="text-muted" onClick={onSkip}>
        Skip
      </Button>
    </div>
  )
}

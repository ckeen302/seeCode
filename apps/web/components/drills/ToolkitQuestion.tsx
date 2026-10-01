"use client"

import { ArrowRightIcon, CheckCircle2Icon, CircleDotDashedIcon } from "lucide-react"
import { useEffect, useId, useRef, useState } from "react"

import { CodeBlock } from "@/components/patterns/CodeBlock"
import { useEnterKey, useNumberKeys } from "@/components/drills/keys"
import { TimerRing, useElapsed } from "@/components/drills/TimerRing"
import { Button } from "@/components/ui/button"
import { Kbd } from "@/components/ui/kbd"
import type { ToolkitPrompt } from "@/lib/api/drills"
import { useToolkit } from "@/lib/api/hooks"
import { cn } from "@/lib/utils"

export interface ToolkitFeedback {
  correct: boolean
  tool?: string
  example?: string
}

/** Section 6.6: the four options appear after this many seconds (or on request). */
export const OPTIONS_AFTER_SECONDS = 10

/**
 * A toolkit card: a phrase; type the Python tool (with suggestions) or, after 10 s, pick
 * one of four options (keys 1–4). Remount it (a new `key`) for each card.
 */
export function ToolkitQuestion({
  prompt,
  limit,
  timer,
  feedback,
  submitting,
  onSubmit,
  onNext,
  nextLabel = "Next",
  progress,
}: {
  prompt: ToolkitPrompt
  limit: number
  timer: boolean
  feedback: ToolkitFeedback | null
  submitting: boolean
  onSubmit: (tool: string, seconds: number, overtime: boolean) => void
  onNext: () => void
  nextLabel?: string
  progress?: React.ReactNode
}) {
  const [startedAt] = useState(() => Date.now())
  const [typed, setTyped] = useState("")
  const [picked, setPicked] = useState<string | null>(null)
  const [askedForOptions, setAskedForOptions] = useState(false)
  const answered = feedback !== null
  const elapsed = useElapsed(startedAt, !answered)
  const showOptions = askedForOptions || answered || elapsed >= OPTIONS_AFTER_SECONDS
  const toolkit = useToolkit()
  const listId = useId()
  const inputId = useId()
  const nextRef = useRef<HTMLButtonElement>(null)

  const submit = (tool: string) => {
    if (answered || submitting || !tool.trim()) return
    setPicked(tool)
    const seconds = (Date.now() - startedAt) / 1000
    onSubmit(tool.trim(), Math.round(seconds * 10) / 10, timer && seconds > limit)
  }

  useEnterKey(() => (answered ? onNext() : submit(typed)))
  useNumberKeys(
    prompt.options.length,
    (index) => submit(prompt.options[index]),
    showOptions && !answered
  )

  useEffect(() => {
    if (answered) nextRef.current?.focus()
  }, [answered])

  const tools = [...new Set((toolkit.data ?? []).map((card) => card.tool))].sort()

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-5">
      <section
        aria-label="Toolkit card"
        className="flex flex-col gap-6 rounded-lg border border-border bg-surface p-6"
      >
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm text-muted">Which Python tool does this call for?</p>
          <div className="flex items-center gap-3">
            {progress}
            {timer && !answered ? <TimerRing elapsed={elapsed} limit={limit} /> : null}
          </div>
        </div>
        <p className="text-center text-2xl font-semibold tracking-tight">
          <span className="rounded-md bg-signal px-2 py-0.5">“{prompt.phrase}”</span>
        </p>

        <div className="flex flex-col gap-2">
          <label htmlFor={inputId} className="text-xs font-medium text-muted">
            Type the tool
          </label>
          <div className="flex gap-2">
            <input
              id={inputId}
              type="text"
              list={listId}
              value={typed}
              onChange={(event) => setTyped(event.target.value)}
              disabled={answered || submitting}
              autoComplete="off"
              autoFocus
              placeholder="e.g. .lower()"
              className="h-9 min-w-0 flex-1 rounded-md border border-border bg-bg px-3 font-mono text-sm placeholder:text-muted"
            />
            <datalist id={listId}>
              {tools.map((tool) => (
                <option key={tool} value={tool} />
              ))}
            </datalist>
            {!answered ? (
              <Button onClick={() => submit(typed)} disabled={!typed.trim() || submitting}>
                Check
                <Kbd className="border-on-accent/40 text-on-accent">↵</Kbd>
              </Button>
            ) : null}
          </div>
        </div>

        {showOptions ? (
          <div className="flex flex-col gap-2">
            <p className="text-xs font-medium text-muted">Or pick one</p>
            <ul className="grid grid-cols-1 gap-2 min-[640px]:grid-cols-2">
              {prompt.options.map((option, index) => {
                const isAnswer = answered && feedback?.tool === option
                const isPick = picked === option
                return (
                  <li key={option}>
                    <button
                      type="button"
                      onClick={() => submit(option)}
                      disabled={answered || submitting}
                      className={cn(
                        "flex h-11 w-full items-center gap-3 rounded-md border px-3 text-left font-mono text-sm transition-colors enabled:hover:bg-surface-2",
                        isAnswer
                          ? "border-good bg-confirmed"
                          : isPick && answered
                            ? "border-close"
                            : "border-border"
                      )}
                    >
                      <Kbd>{index + 1}</Kbd>
                      <span className="truncate">{option}</span>
                    </button>
                  </li>
                )
              })}
            </ul>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setAskedForOptions(true)}
            className="w-fit rounded-md text-sm text-muted underline-offset-4 hover:text-text hover:underline"
          >
            Show options now
          </button>
        )}
      </section>

      {answered ? (
        <section
          aria-label="Feedback"
          className="flex flex-col gap-4 rounded-lg border border-border bg-surface p-5 animate-in duration-200 slide-in-from-bottom-1"
        >
          <div className="flex items-start gap-3" role="status">
            {feedback.correct ? (
              <CheckCircle2Icon aria-hidden className="mt-0.5 size-5 text-good" />
            ) : (
              <CircleDotDashedIcon aria-hidden className="mt-0.5 size-5 text-close" />
            )}
            <p className="font-semibold">
              {feedback.correct ? "Right tool." : "Not quite."}{" "}
              <span className="font-normal text-muted">
                It&apos;s <code className="font-mono text-text">{feedback.tool}</code>.
              </span>
            </p>
          </div>
          {feedback.example ? <CodeBlock code={feedback.example} label="Example" /> : null}
          <Button ref={nextRef} onClick={onNext} className="w-full">
            {nextLabel}
            <ArrowRightIcon />
          </Button>
        </section>
      ) : null}
    </div>
  )
}

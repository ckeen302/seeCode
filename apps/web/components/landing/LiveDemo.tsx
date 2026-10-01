"use client"

import { ChevronLeftIcon, ChevronRightIcon, PauseIcon, PlayIcon } from "lucide-react"
import { useEffect, useMemo, useState } from "react"

import { HighlightedLine } from "@/components/patterns/CodeBlock"
import { DEMO_CODE, palindromeSteps } from "@/components/landing/palindromeDemo"
import { useReducedMotion } from "@/components/settings/motion"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

const INPUTS = ["Top spot!", "Top 2 spot"] as const
const STEP_MS = 1100
const END_PAUSE_MS = 2600

/**
 * The landing demo strip (Section 6.1): an auto-playing, muted walkthrough of Valid
 * Palindrome with pointers, narration and the running line, plus a Pause control.
 */
export function LiveDemo() {
  const reduced = useReducedMotion()
  const [inputIndex, setInputIndex] = useState(0)
  const [step, setStep] = useState(0)
  const [paused, setPaused] = useState(false)
  const input = INPUTS[inputIndex]
  const steps = useMemo(() => palindromeSteps(input), [input])
  const current = steps[Math.min(step, steps.length - 1)]
  const playing = !paused && !reduced
  const atEnd = step >= steps.length - 1

  useEffect(() => {
    if (!playing) return
    const id = window.setTimeout(
      () => {
        if (atEnd) {
          setInputIndex((i) => (i + 1) % INPUTS.length)
          setStep(0)
        } else setStep((s) => s + 1)
      },
      atEnd ? END_PAUSE_MS : STEP_MS
    )
    return () => window.clearTimeout(id)
  }, [playing, step, atEnd])

  const go = (delta: number) => {
    setPaused(true)
    setStep((s) => Math.max(0, Math.min(steps.length - 1, s + delta)))
  }
  const codeLines = DEMO_CODE.split("\n")
  const inRange = (i: number) => i >= 0 && i < input.length
  const done = current.result !== null

  return (
    <div
      className="overflow-hidden rounded-xl border border-border bg-surface shadow-popover"
      role="region"
      aria-label="Live walkthrough of Valid Palindrome"
      tabIndex={0}
      onKeyDown={(event) => {
        if (event.target !== event.currentTarget) return
        if (event.key === " ") {
          event.preventDefault()
          setPaused((p) => !p)
        } else if (event.key === "ArrowRight") go(1)
        else if (event.key === "ArrowLeft") go(-1)
      }}
    >
      <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-2.5">
        <div className="flex items-center gap-2">
          <span aria-hidden className="flex gap-1.5">
            <span className="size-2.5 rounded-full bg-border" />
            <span className="size-2.5 rounded-full bg-border" />
            <span className="size-2.5 rounded-full bg-border" />
          </span>
          <span className="text-sm font-medium">Valid Palindrome</span>
          <span className="hidden rounded-full border border-border px-2 text-xs text-muted min-[640px]:inline">
            Two pointers + skip non-alphanumeric
          </span>
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Previous step"
            onClick={() => go(-1)}
            disabled={step === 0}
          >
            <ChevronLeftIcon />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setPaused((p) => !p)}
            aria-pressed={!playing}
            disabled={reduced}
          >
            {playing ? <PauseIcon /> : <PlayIcon />}
            {playing ? "Pause" : "Play"}
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Next step"
            onClick={() => go(1)}
            disabled={atEnd}
          >
            <ChevronRightIcon />
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 min-[900px]:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
        <div className="flex flex-col gap-5 p-5">
          <div className="flex items-center gap-2 font-mono text-sm text-muted">
            s =<span className="text-text">&quot;{input}&quot;</span>
          </div>
          <div className="flex flex-wrap gap-1.5 pb-6" aria-hidden>
            {[...input].map((char, i) => {
              const isL = inRange(current.l) && current.l === i && !done
              const isR = inRange(current.r) && current.r === i && !done
              const matched = current.matched.includes(i)
              const skipped = current.skipped.includes(i)
              const mismatch = current.result === false && (current.l === i || current.r === i)
              return (
                <div key={i} className="relative">
                  <div
                    className={cn(
                      "flex size-9 items-center justify-center rounded-md border font-mono text-base transition-all duration-200 min-[640px]:size-10",
                      matched ? "border-good/50 bg-confirmed" : "border-border bg-bg",
                      skipped && "opacity-35",
                      (isL || isR) && "border-accent",
                      mismatch &&
                        "border-accent-2 bg-[color-mix(in_srgb,var(--accent-2)_14%,transparent)]"
                    )}
                  >
                    {char === " " ? "␣" : char}
                  </div>
                  <span className="absolute top-full left-1/2 mt-1 flex -translate-x-1/2 gap-0.5 font-mono text-xs font-semibold">
                    {isL ? <span className="text-ptr-a">l</span> : null}
                    {isR ? <span className="text-ptr-b">r</span> : null}
                  </span>
                </div>
              )
            })}
          </div>
          <p
            className={cn(
              "min-h-12 rounded-md border-l-2 bg-surface-2 px-3 py-2 text-sm",
              current.result === true
                ? "border-good"
                : current.result === false
                  ? "border-accent-2"
                  : "border-accent"
            )}
            aria-live="polite"
          >
            {current.say}
          </p>
          <div className="flex items-center gap-2" aria-hidden>
            {steps.map((_, i) => (
              <span
                key={i}
                className={cn(
                  "h-1 flex-1 rounded-full transition-colors",
                  i <= step ? "bg-accent" : "bg-border"
                )}
              />
            ))}
          </div>
        </div>
        <pre
          role="region"
          aria-label="Solution code"
          tabIndex={0}
          className="overflow-x-auto border-t border-border bg-bg py-4 font-mono text-[13px] leading-6 min-[900px]:border-t-0 min-[900px]:border-l"
        >
          <code>
            {codeLines.map((line, i) => (
              <div
                key={i}
                className={cn(
                  "border-l-2 px-4 transition-colors duration-200",
                  current.line === i + 1 ? "border-accent bg-window" : "border-transparent"
                )}
              >
                <HighlightedLine line={line} />
              </div>
            ))}
          </code>
        </pre>
      </div>
    </div>
  )
}

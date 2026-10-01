"use client"

import type { Decorate } from "@/components/workspace/Markdown"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import type { PatternSummary, Signal } from "@/lib/api/schemas"
import { familyColor } from "@/lib/workspace/plan"
import { signalTarget, splitBySignals } from "@/lib/workspace/signals"

// Signal highlights (Section 7.2): once rung 2 is open, every signal phrase in the summary and
// constraints is marked in the color of the pattern it points to (toolkit and structure
// signals use the signal amber). Hovering or focusing a mark shows what the phrase means.

/** The color of a signal: its pattern family's, or the signal amber for tools and structures. */
export function signalColor(signal: Signal, patterns: readonly PatternSummary[] | undefined) {
  const target = signalTarget(signal.pointsTo)
  if (target.kind !== "pattern") return "var(--close)"
  return familyColor(patterns?.find((pattern) => pattern.id === target.id)?.family ?? target.id)
}

function SignalMark({ text, signal, color }: { text: string; signal: Signal; color: string }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <mark
          tabIndex={0}
          data-signal={signal.phrase}
          className="cursor-help rounded-sm px-0.5 text-text"
          style={{
            backgroundColor: `color-mix(in srgb, ${color} 22%, transparent)`,
            boxShadow: `inset 0 -2px 0 ${color}`,
          }}
        >
          {text}
        </mark>
      </TooltipTrigger>
      <TooltipContent side="top" className="max-w-72 text-left leading-4">
        {signal.meaning}
      </TooltipContent>
    </Tooltip>
  )
}

/** A Markdown `decorate` that marks signal phrases; plain text when there are none. */
export function signalDecorator(
  signals: readonly Signal[] | null,
  patterns: readonly PatternSummary[] | undefined
): Decorate | undefined {
  if (!signals || signals.length === 0) return undefined
  return function decorate(text, key) {
    const segments = splitBySignals(text, signals)
    if (segments.length === 1 && !segments[0].signal) return text
    return segments.map((segment, index) =>
      segment.signal ? (
        <SignalMark
          key={`${key}-${index}`}
          text={segment.text}
          signal={segment.signal}
          color={signalColor(segment.signal, patterns)}
        />
      ) : (
        segment.text
      )
    )
  }
}

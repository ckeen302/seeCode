import { CheckIcon, LockIcon } from "lucide-react"

import type { PatternState } from "@/lib/api/patterns"
import { STATE_LABELS } from "@/lib/api/patterns"
import { cn } from "@/lib/utils"
import { familyColor } from "@/lib/workspace/plan"

/** Section 18.4: a 24 px pill with a 6 px dot in the pattern family's color. */
export function PatternChip({
  name,
  family,
  className,
}: {
  name: string
  family?: string | null
  className?: string
}) {
  return (
    <span
      className={cn(
        "inline-flex h-6 max-w-full shrink-0 items-center gap-1.5 rounded-full border border-border px-2.5 text-xs font-medium text-text",
        className
      )}
    >
      <span
        aria-hidden
        className="size-1.5 shrink-0 rounded-full"
        style={{ backgroundColor: familyColor(family) }}
      />
      <span className="truncate">{name}</span>
    </span>
  )
}

const STATE_STYLES: Record<PatternState, string> = {
  locked: "border-border text-muted",
  available: "border-border text-text",
  in_progress: "border-accent text-accent",
  mastered: "border-accent bg-accent text-on-accent",
}

/** The pattern state as a badge: icon + label, so color is never the only signal. */
export function PatternStateBadge({
  state,
  className,
}: {
  state: PatternState
  className?: string
}) {
  return (
    <span
      className={cn(
        "inline-flex h-6 shrink-0 items-center gap-1 rounded-full border px-2.5 text-xs font-medium",
        STATE_STYLES[state],
        className
      )}
    >
      {state === "locked" ? <LockIcon aria-hidden className="size-3" /> : null}
      {state === "mastered" ? <CheckIcon aria-hidden className="size-3" /> : null}
      {state === "in_progress" ? (
        <span aria-hidden className="size-1.5 rounded-full bg-accent" />
      ) : null}
      {STATE_LABELS[state]}
    </span>
  )
}

/** A small progress ring (solved / total) for roadmap nodes and pattern headers. */
export function ProgressRing({
  value,
  total,
  size = 40,
  stroke = 4,
  className,
  label,
}: {
  value: number
  total: number
  size?: number
  stroke?: number
  className?: string
  label?: string
}) {
  const radius = (size - stroke) / 2
  const circumference = 2 * Math.PI * radius
  const fraction = total > 0 ? Math.min(1, value / total) : 0
  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      className={cn("shrink-0 -rotate-90", className)}
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    >
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke="var(--border)"
        strokeWidth={stroke}
      />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke="var(--accent)"
        strokeWidth={stroke}
        strokeLinecap="round"
        strokeDasharray={circumference}
        strokeDashoffset={circumference * (1 - fraction)}
        style={{ transition: "stroke-dashoffset 600ms ease-out" }}
      />
    </svg>
  )
}

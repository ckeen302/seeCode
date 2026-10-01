"use client"

import { useEffect, useState } from "react"

import { cn } from "@/lib/utils"

/** Seconds since `startedAt`, ticking while `running` (4 times a second). */
export function useElapsed(startedAt: number, running: boolean): number {
  const [now, setNow] = useState(() => startedAt)
  useEffect(() => {
    if (!running) return
    const id = window.setInterval(() => setNow(Date.now()), 250)
    return () => window.clearInterval(id)
  }, [running, startedAt])
  return Math.max(0, (now - startedAt) / 1000)
}

/**
 * Section 6.6: a visible timer ring that never auto-submits; past the limit it turns amber
 * (overtime). The remaining seconds are announced only when the timer runs out.
 */
export function TimerRing({
  elapsed,
  limit,
  size = 44,
}: {
  elapsed: number
  limit: number
  size?: number
}) {
  const stroke = 4
  const radius = (size - stroke) / 2
  const circumference = 2 * Math.PI * radius
  const over = elapsed >= limit
  const fraction = Math.min(1, elapsed / limit)
  const remaining = Math.max(0, Math.ceil(limit - elapsed))
  return (
    <div
      className="relative flex shrink-0 items-center justify-center"
      style={{ width: size, height: size }}
      data-overtime={over ? "true" : "false"}
    >
      <svg width={size} height={size} className="-rotate-90" aria-hidden>
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
          stroke={over ? "var(--close)" : "var(--accent)"}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * fraction}
          style={{ transition: "stroke-dashoffset 250ms linear" }}
        />
      </svg>
      <span
        className={cn(
          "absolute font-mono text-xs tabular-nums",
          over ? "font-semibold text-text" : "text-muted"
        )}
      >
        {over ? `+${Math.floor(elapsed - limit)}` : remaining}
      </span>
      <span className="sr-only" aria-live="polite">
        {over ? "Time's up. Take the time you need." : ""}
      </span>
    </div>
  )
}

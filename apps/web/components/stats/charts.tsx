"use client"

import { useEffect, useRef, useState } from "react"

import { cn } from "@/lib/utils"

// Plain SVG charts (Section 6.8 with docs/DECISIONS.md: no chart library). Thin marks,
// recessive grid, a hover tooltip per point or bar, and a table for screen readers.

/** The width of an element, kept current with a ResizeObserver. */
export function useWidth<T extends HTMLElement>(fallback = 640) {
  const ref = useRef<T>(null)
  const [width, setWidth] = useState(fallback)
  useEffect(() => {
    const element = ref.current
    if (!element) return
    const observer = new ResizeObserver((entries) => {
      const next = Math.round(entries[0]?.contentRect.width ?? 0)
      if (next > 0) setWidth(next)
    })
    observer.observe(element)
    return () => observer.disconnect()
  }, [])
  return [ref, width] as const
}

/** "Sep 7" for an ISO date (yyyy-mm-dd), read as a local calendar date. */
export function weekLabel(isoDate: string): string {
  const [y, m, d] = isoDate.split("-").map(Number)
  return new Date(y, (m ?? 1) - 1, d ?? 1).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  })
}

/** Round axis maximum: 1, 2, 5 × 10ⁿ at or above `value` (at least `min`). */
export function niceMax(value: number, min = 1): number {
  const target = Math.max(value, min)
  const power = 10 ** Math.floor(Math.log10(target))
  for (const step of [1, 2, 5, 10]) {
    if (step * power >= target) return step * power
  }
  return 10 * power
}

const M = { top: 12, right: 12, bottom: 28, left: 40 }

function Tooltip({ x, y, children }: { x: number; y: number; children: React.ReactNode }) {
  return (
    <div
      className="pointer-events-none absolute z-10 min-w-28 -translate-x-1/2 -translate-y-full rounded-md border border-border bg-surface px-2.5 py-1.5 text-xs shadow-popover"
      style={{ left: x, top: y - 8 }}
    >
      {children}
    </div>
  )
}

export interface LinePoint {
  label: string
  value: number | null
}

/** One series over time (no legend: the title names it). Null values leave a gap. */
export function LineChart({
  points,
  height = 200,
  format,
  emptyText,
  ariaLabel,
}: {
  points: LinePoint[]
  height?: number
  format: (value: number) => string
  emptyText: string
  ariaLabel: string
}) {
  const [ref, width] = useWidth<HTMLDivElement>()
  const [hover, setHover] = useState<number | null>(null)
  const values = points.map((p) => p.value).filter((v): v is number => v !== null)
  const max = niceMax(Math.max(0, ...values), 10)
  const innerW = Math.max(10, width - M.left - M.right)
  const innerH = height - M.top - M.bottom
  const step = points.length > 1 ? innerW / (points.length - 1) : 0
  const x = (i: number) => M.left + i * step
  const y = (v: number) => M.top + innerH - (v / max) * innerH

  const segments: string[] = []
  let current = ""
  points.forEach((p, i) => {
    if (p.value === null) {
      if (current) segments.push(current)
      current = ""
      return
    }
    current += `${current ? "L" : "M"} ${x(i)} ${y(p.value)} `
  })
  if (current) segments.push(current)

  return (
    <div ref={ref} className="relative w-full">
      <svg
        width={width}
        height={height}
        role="img"
        aria-label={ariaLabel}
        onPointerLeave={() => setHover(null)}
        className="block"
      >
        {[0, 0.5, 1].map((t) => (
          <g key={t}>
            <line
              x1={M.left}
              x2={width - M.right}
              y1={y(max * t)}
              y2={y(max * t)}
              stroke="var(--border)"
              strokeWidth={1}
            />
            <text
              x={M.left - 6}
              y={y(max * t)}
              textAnchor="end"
              dominantBaseline="middle"
              className="fill-muted font-mono text-[11px]"
            >
              {format(max * t)}
            </text>
          </g>
        ))}
        {points.map((p, i) => (
          <text
            key={i}
            x={x(i)}
            y={height - 8}
            textAnchor="middle"
            className={cn("fill-muted text-[11px]", i % 2 === 1 && width < 480 && "hidden")}
          >
            {p.label}
          </text>
        ))}
        {hover !== null ? (
          <line
            x1={x(hover)}
            x2={x(hover)}
            y1={M.top}
            y2={M.top + innerH}
            stroke="var(--muted)"
            strokeDasharray="3 3"
          />
        ) : null}
        {segments.map((d, i) => (
          <path
            key={i}
            d={d}
            fill="none"
            stroke="var(--accent)"
            strokeWidth={2}
            strokeLinejoin="round"
            strokeLinecap="round"
          />
        ))}
        {points.map((p, i) =>
          p.value === null ? null : (
            <circle
              key={i}
              cx={x(i)}
              cy={y(p.value)}
              r={hover === i ? 5 : 4}
              fill="var(--accent)"
              stroke="var(--surface)"
              strokeWidth={2}
            />
          )
        )}
        {points.map((_, i) => (
          <rect
            key={`hit-${i}`}
            x={x(i) - Math.max(step, 24) / 2}
            y={M.top}
            width={Math.max(step, 24)}
            height={innerH}
            fill="transparent"
            onPointerEnter={() => setHover(i)}
          />
        ))}
      </svg>
      {values.length === 0 ? (
        <div className="absolute inset-0 flex items-center justify-center pb-6 pl-10 text-sm text-muted">
          {emptyText}
        </div>
      ) : null}
      {hover !== null ? (
        <Tooltip
          x={x(hover)}
          y={points[hover].value === null ? M.top + innerH / 2 : y(points[hover].value as number)}
        >
          <div className="text-muted">Week of {points[hover].label}</div>
          <div className="font-mono font-semibold">
            {points[hover].value === null ? "No data" : format(points[hover].value as number)}
          </div>
        </Tooltip>
      ) : null}
    </div>
  )
}

export interface StackedBar {
  label: string
  values: number[]
}

/** Sequential shades of the accent, light (little help) to full (lots of help). */
export function rungColor(rung: number, rungs = 7): string {
  const pct = Math.round(25 + (75 * rung) / Math.max(1, rungs - 1))
  return `color-mix(in srgb, var(--accent) ${pct}%, var(--surface))`
}

/** Stacked bars with a 2 px surface gap between segments and a legend. */
export function StackedBars({
  bars,
  seriesLabels,
  height = 200,
  emptyText,
  ariaLabel,
}: {
  bars: StackedBar[]
  seriesLabels: string[]
  height?: number
  emptyText: string
  ariaLabel: string
}) {
  const [ref, width] = useWidth<HTMLDivElement>()
  const [hover, setHover] = useState<number | null>(null)
  const totals = bars.map((b) => b.values.reduce((a, v) => a + v, 0))
  const rawMax = niceMax(Math.max(0, ...totals), 2)
  // Even, so the middle gridline is a whole number of attempts.
  const max = rawMax % 2 ? rawMax + 1 : rawMax
  const innerW = Math.max(10, width - M.left - M.right)
  const innerH = height - M.top - M.bottom
  const slot = innerW / Math.max(1, bars.length)
  const barW = Math.min(36, slot * 0.6)
  const y = (v: number) => M.top + innerH - (v / max) * innerH

  return (
    <div className="flex flex-col gap-3">
      <div ref={ref} className="relative w-full">
        <svg
          width={width}
          height={height}
          role="img"
          aria-label={ariaLabel}
          onPointerLeave={() => setHover(null)}
          className="block"
        >
          {[0, 0.5, 1].map((t) => (
            <g key={t}>
              <line
                x1={M.left}
                x2={width - M.right}
                y1={y(max * t)}
                y2={y(max * t)}
                stroke="var(--border)"
              />
              <text
                x={M.left - 6}
                y={y(max * t)}
                textAnchor="end"
                dominantBaseline="middle"
                className="fill-muted font-mono text-[11px]"
              >
                {Math.round(max * t)}
              </text>
            </g>
          ))}
          {bars.map((bar, i) => {
            const cx = M.left + slot * i + slot / 2
            let acc = 0
            return (
              <g
                key={i}
                onPointerEnter={() => setHover(i)}
                opacity={hover !== null && hover !== i ? 0.55 : 1}
              >
                <rect x={cx - slot / 2} y={M.top} width={slot} height={innerH} fill="transparent" />
                {bar.values.map((value, s) => {
                  if (!value) return null
                  const top = y(acc + value)
                  const h = y(acc) - top
                  acc += value
                  return (
                    <rect
                      key={s}
                      x={cx - barW / 2}
                      y={top}
                      width={barW}
                      height={Math.max(0, h - 2)}
                      rx={2}
                      fill={rungColor(s, bar.values.length)}
                    />
                  )
                })}
                <text
                  x={cx}
                  y={height - 8}
                  textAnchor="middle"
                  className={cn("fill-muted text-[11px]", i % 2 === 1 && width < 480 && "hidden")}
                >
                  {bar.label}
                </text>
              </g>
            )
          })}
        </svg>
        {totals.every((t) => t === 0) ? (
          <div className="absolute inset-0 flex items-center justify-center pb-6 pl-10 text-sm text-muted">
            {emptyText}
          </div>
        ) : null}
        {hover !== null && totals[hover] > 0 ? (
          <Tooltip x={M.left + slot * hover + slot / 2} y={y(totals[hover])}>
            <div className="mb-1 text-muted">Week of {bars[hover].label}</div>
            {bars[hover].values.map((v, s) =>
              v ? (
                <div key={s} className="flex items-center justify-between gap-3">
                  <span className="flex items-center gap-1.5">
                    <span
                      aria-hidden
                      className="size-2 rounded-sm"
                      style={{ backgroundColor: rungColor(s, bars[hover].values.length) }}
                    />
                    {seriesLabels[s]}
                  </span>
                  <span className="font-mono">{v}</span>
                </div>
              ) : null
            )}
          </Tooltip>
        ) : null}
      </div>
      <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted" aria-label="Legend">
        {seriesLabels.map((label, s) => (
          <li key={label} className="flex items-center gap-1.5">
            <span
              aria-hidden
              className="size-2.5 rounded-sm"
              style={{ backgroundColor: rungColor(s, seriesLabels.length) }}
            />
            {label}
          </li>
        ))}
      </ul>
    </div>
  )
}

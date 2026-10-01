"use client"

// Timeline (Sections 8.6 and 18.4): a 6 px track with one tick per step and 10 px diamonds
// for event steps, labeled underneath; mismatch and return markers use accent-2. Dragging or
// clicking the track scrubs; clicking a label jumps to its moment.
import { memo, useEffect, useMemo, useRef, useState } from "react"

import { cn } from "@/lib/utils"
import type { Marker } from "@/lib/viz/timeline"

const LABEL_GAP_PX = 52
const MAX_TICKS = 400

interface TimelineProps {
  total: number
  index: number
  markers: Marker[]
  onSeek: (index: number) => void
  /** Spoken value of the slider, e.g. "Step 7 of 31: compare". */
  valueText: string
}

function position(index: number, total: number): number {
  return total <= 1 ? 0 : (index / (total - 1)) * 100
}

function TimelineImpl({ total, index, markers, onSeek, valueText }: TimelineProps) {
  const track = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(0)
  useEffect(() => {
    const element = track.current
    if (!element) return
    setWidth(element.clientWidth)
    if (typeof ResizeObserver === "undefined") return
    const observer = new ResizeObserver(() => setWidth(element.clientWidth))
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  // Labels that do not collide with the one before them.
  const labeled = useMemo(() => {
    const shown = new Set<number>()
    let last = -Infinity
    for (const marker of markers) {
      const x = (position(marker.index, total) / 100) * width
      if (x - last >= LABEL_GAP_PX) {
        shown.add(marker.index)
        last = x
      }
    }
    return shown
  }, [markers, total, width])

  const ticks = useMemo(() => {
    if (total <= 1 || total > MAX_TICKS) return null
    return Array.from({ length: total }, (_, i) => (
      <span
        key={i}
        aria-hidden
        className="absolute top-1/2 h-2.5 w-0.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-border"
        style={{ left: `${position(i, total)}%` }}
      />
    ))
  }, [total])

  const progress = position(index, total)
  return (
    // The side padding leaves room for the first and last labels.
    <div className="flex min-w-0 flex-1 flex-col gap-1 px-6" data-testid="timeline">
      <div ref={track} className="relative h-5">
        <div
          aria-hidden
          className="absolute inset-x-0 top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-surface-2"
        />
        <div
          aria-hidden
          className="absolute top-1/2 left-0 h-1.5 -translate-y-1/2 rounded-full bg-accent/40"
          style={{ width: `${progress}%` }}
        />
        {ticks}
        {markers.map((marker) => (
          <span
            key={marker.index}
            aria-hidden
            className={cn(
              "absolute top-1/2 size-2.5 -translate-x-1/2 -translate-y-1/2 rotate-45 rounded-[2px] border",
              marker.tone === "end" ? "border-accent-2 bg-accent-2" : "border-accent bg-surface",
              marker.predict && "ring-2 ring-close"
            )}
            style={{ left: `${position(marker.index, total)}%` }}
          />
        ))}
        <span
          aria-hidden
          className="pointer-events-none absolute top-1/2 size-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-surface bg-accent shadow-popover"
          style={{ left: `${progress}%` }}
        />
        <input
          type="range"
          min={0}
          max={Math.max(0, total - 1)}
          step={1}
          value={index}
          onChange={(event) => onSeek(Number(event.currentTarget.value))}
          aria-label="Step"
          aria-valuetext={valueText}
          className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
        />
      </div>
      <div className="relative h-4">
        {markers
          .filter((marker) => labeled.has(marker.index))
          .map((marker) => (
            <button
              key={marker.index}
              type="button"
              tabIndex={-1}
              onClick={() => onSeek(marker.index)}
              className={cn(
                "absolute top-0 max-w-[52px] -translate-x-1/2 truncate text-[11px] leading-4 hover:text-text",
                marker.index === index ? "font-medium text-text" : "text-muted"
              )}
              style={{ left: `${position(marker.index, total)}%` }}
              aria-label={`Jump to step ${marker.index + 1}: ${marker.label}`}
            >
              {marker.label}
            </button>
          ))}
      </div>
    </div>
  )
}

export const Timeline = memo(TimelineImpl)

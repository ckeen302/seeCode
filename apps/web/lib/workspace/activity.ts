// Active time (Section 11.2): time counts while the tab is visible and the user gave some
// input (a key, a click, a scroll, a pointer move) in the last 2 minutes. It is tracked in the
// browser and sent with each attempt sync (7.9).
import { useEffect, useRef } from "react"

export const IDLE_AFTER_MS = 2 * 60_000
export const TICK_MS = 1000
/** A tick never adds more than this: a laptop that slept between ticks was not active. */
const MAX_TICK_MS = 5 * TICK_MS

export interface ActivityTrackerOptions {
  onActiveSeconds: (seconds: number) => void
  now?: () => number
  isVisible?: () => boolean
  idleAfterMs?: number
}

export interface ActivityTracker {
  /** The user did something. */
  input(): void
  /** Called every TICK_MS: adds the time since the last tick if the user counts as active. */
  tick(): void
}

export function createActivityTracker({
  onActiveSeconds,
  now = Date.now,
  isVisible = () => typeof document === "undefined" || document.visibilityState === "visible",
  idleAfterMs = IDLE_AFTER_MS,
}: ActivityTrackerOptions): ActivityTracker {
  let lastInput = Number.NEGATIVE_INFINITY
  let lastTick = now()
  let carryMs = 0
  return {
    input() {
      lastInput = now()
    },
    tick() {
      const at = now()
      const elapsed = Math.min(Math.max(0, at - lastTick), MAX_TICK_MS)
      lastTick = at
      if (!isVisible() || at - lastInput > idleAfterMs) return
      carryMs += elapsed
      const seconds = Math.floor(carryMs / 1000)
      if (seconds > 0) {
        carryMs -= seconds * 1000
        onActiveSeconds(seconds)
      }
    },
  }
}

const INPUT_EVENTS = ["keydown", "pointerdown", "pointermove", "wheel", "touchstart"] as const

/** Tracks active time while `enabled`, reporting whole seconds. Opening the page counts as input. */
export function useActiveTime(enabled: boolean, onActiveSeconds: (seconds: number) => void): void {
  const callback = useRef(onActiveSeconds)
  useEffect(() => {
    callback.current = onActiveSeconds
  })

  useEffect(() => {
    if (!enabled) return
    const tracker = createActivityTracker({
      onActiveSeconds: (seconds) => callback.current(seconds),
    })
    tracker.input()
    const onInput = () => tracker.input()
    // Capture phase: the code editor handles its own keys, but they still count.
    for (const type of INPUT_EVENTS) {
      window.addEventListener(type, onInput, { capture: true, passive: true })
    }
    const timer = window.setInterval(() => tracker.tick(), TICK_MS)
    return () => {
      for (const type of INPUT_EVENTS) window.removeEventListener(type, onInput, { capture: true })
      window.clearInterval(timer)
    }
  }, [enabled])
}

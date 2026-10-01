"use client"

// Motion for the coach (Section 18.5): 150 ms ease-out for UI, and nothing that moves when
// the system asks for reduced motion or the Settings toggle sets `data-reduced-motion` on
// <html>. CSS transitions already obey both (styles/globals.css); this covers `motion`.
import { MotionConfig } from "motion/react"
import { useSyncExternalStore } from "react"

const ATTR = "data-reduced-motion"

function subscribe(listener: () => void): () => void {
  const observer = new MutationObserver(listener)
  observer.observe(document.documentElement, { attributes: true, attributeFilter: [ATTR] })
  return () => observer.disconnect()
}

/** The Settings toggle (M6) asks for reduced motion, whatever the system says. */
export function useReducedMotionSetting(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => document.documentElement.getAttribute(ATTR) === "true",
    () => false
  )
}

/** UI transitions: 150 ms ease-out (18.5). */
export const UI_TRANSITION = { duration: 0.15, ease: "easeOut" } as const

export function CoachMotion({ children }: { children: React.ReactNode }) {
  const forced = useReducedMotionSetting()
  return (
    <MotionConfig reducedMotion={forced ? "always" : "user"} transition={UI_TRANSITION}>
      {children}
    </MotionConfig>
  )
}

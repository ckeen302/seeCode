"use client"

// Reduced motion (Section 18.5): the system setting, or the Settings toggle, which sets
// `data-reduced-motion="true"` on <html> (styles/globals.css then stops CSS animations).
import { useSyncExternalStore } from "react"

const QUERY = "(prefers-reduced-motion: reduce)"

export function reducedMotionNow(): boolean {
  if (typeof window === "undefined") return true
  if (document.documentElement.getAttribute("data-reduced-motion") === "true") return true
  return window.matchMedia?.(QUERY).matches ?? false
}

function subscribe(listener: () => void): () => void {
  const media = window.matchMedia?.(QUERY)
  media?.addEventListener?.("change", listener)
  const observer = new MutationObserver(listener)
  observer.observe(document.documentElement, { attributeFilter: ["data-reduced-motion"] })
  return () => {
    media?.removeEventListener?.("change", listener)
    observer.disconnect()
  }
}

/** True when animations should be skipped; true on the server so nothing jumps. */
export function useReducedMotion(): boolean {
  return useSyncExternalStore(subscribe, reducedMotionNow, () => true)
}

/** Applies the Settings choice: "on" forces reduced motion; "system" and "off" defer to CSS. */
export function applyReducedMotion(choice: "system" | "on" | "off"): void {
  const root = document.documentElement
  if (choice === "on") root.setAttribute("data-reduced-motion", "true")
  else root.removeAttribute("data-reduced-motion")
}

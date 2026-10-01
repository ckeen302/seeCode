"use client"

// Shared pieces of the walkthrough player: the player store context, motion settings
// (Section 18.5) and pointer colors (18.1).
import { createContext, useContext, useSyncExternalStore } from "react"
import { useReducedMotion, type Transition } from "motion/react"
import { useStore } from "zustand"

import type { PlayerState, PlayerStore } from "@/stores/player"
import type { PointerColor } from "@/lib/viz/types"

export const PlayerContext = createContext<PlayerStore | null>(null)

/** A slice of the surrounding player's state. */
export function usePlayer<T>(selector: (state: PlayerState) => T): T {
  const store = useContext(PlayerContext)
  if (!store) throw new Error("usePlayer needs a WalkthroughPlayer around it.")
  return useStore(store, selector)
}

export function usePlayerStore(): PlayerStore {
  const store = useContext(PlayerContext)
  if (!store) throw new Error("usePlayerStore needs a WalkthroughPlayer around it.")
  return store
}

/** 18.5: visualization layout transitions are a 180 ms-ish spring (stiffness 400, damping 32). */
export const SPRING: Transition = { type: "spring", stiffness: 400, damping: 32, mass: 0.7 }
export const FADE: Transition = { duration: 0.15, ease: "easeOut" }
export const FLASH_MS = 300

function subscribeRoot(listener: () => void): () => void {
  if (typeof MutationObserver === "undefined") return () => {}
  const observer = new MutationObserver(listener)
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["data-reduced-motion"],
  })
  return () => observer.disconnect()
}

/** Reduced motion: the system setting or the app's own toggle (`data-reduced-motion` on <html>). */
export function useVizReducedMotion(): boolean {
  const system = useReducedMotion()
  const app = useSyncExternalStore(
    subscribeRoot,
    () => document.documentElement.dataset.reducedMotion === "true",
    () => false
  )
  return Boolean(system) || app
}

export const POINTER_TEXT: Record<PointerColor, string> = {
  a: "text-ptr-a",
  b: "text-ptr-b",
  c: "text-ptr-c",
  d: "text-ptr-d",
}

export const POINTER_BG: Record<PointerColor, string> = {
  a: "bg-ptr-a",
  b: "bg-ptr-b",
  c: "bg-ptr-c",
  d: "bg-ptr-d",
}

export const POINTER_BORDER: Record<PointerColor, string> = {
  a: "border-ptr-a",
  b: "border-ptr-b",
  c: "border-ptr-c",
  d: "border-ptr-d",
}

/** A block's title: the variable name in mono, with an optional caption. */
export function BlockTitle({ name, caption }: { name: string; caption?: string | null }) {
  return (
    <div className="flex items-baseline gap-2 text-xs">
      <span className="font-mono text-sm font-medium text-text">{name}</span>
      {caption ? <span className="text-muted">{caption}</span> : null}
    </div>
  )
}

export function plural(count: number, one: string, many = `${one}s`): string {
  return `${count} ${count === 1 ? one : many}`
}

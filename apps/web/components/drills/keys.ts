"use client"

import { useEffect, useRef } from "react"

import { isInDialog } from "@/lib/keyboard"

/** Whether a plain key press should drive the card (not while typing in a select or editor). */
export function isCardKey(event: KeyboardEvent): boolean {
  if (event.metaKey || event.ctrlKey || event.altKey || event.defaultPrevented) return false
  if (isInDialog(event)) return false
  const target = event.target
  if (target instanceof Element) {
    if (target.closest("textarea, select, [contenteditable='true'], .monaco-editor")) return false
  }
  return true
}

/** `Enter` submits or goes next (Section 17.4), unless focus is on a button or link. */
export function useEnterKey(handler: () => void, enabled = true): void {
  const ref = useRef(handler)
  useEffect(() => {
    ref.current = handler
  })
  useEffect(() => {
    if (!enabled) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Enter" || event.shiftKey || !isCardKey(event)) return
      const target = event.target
      if (target instanceof Element && target.closest("button, a, [role='button']")) return
      event.preventDefault()
      ref.current()
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [enabled])
}

/** `1`–`4` pick a toolkit option (Section 17.4), unless typing in a text field. */
export function useNumberKeys(count: number, handler: (index: number) => void, enabled = true) {
  const ref = useRef(handler)
  useEffect(() => {
    ref.current = handler
  })
  useEffect(() => {
    if (!enabled) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (!isCardKey(event)) return
      if (event.target instanceof HTMLInputElement && event.target.type === "text") return
      const n = Number(event.key)
      if (Number.isInteger(n) && n >= 1 && n <= count) {
        event.preventDefault()
        ref.current(n - 1)
      }
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [count, enabled])
}

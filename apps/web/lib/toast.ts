// Toasts (Section 18.4): bottom-right, 4 s, only for sync and network news ("Saved your
// progress", "Couldn't save"). A tiny external store that any module can push to.
import { useSyncExternalStore } from "react"

export type ToastTone = "success" | "error" | "info"

export interface ToastItem {
  id: number
  title: string
  description?: string
  tone: ToastTone
}

let items: ToastItem[] = []
let nextId = 1
const listeners = new Set<() => void>()

function publish(next: ToastItem[]): void {
  items = next
  listeners.forEach((listener) => listener())
}

/** Shows a toast. A toast with the same title already showing is not repeated. */
export function toast(
  title: string,
  options: { description?: string; tone?: ToastTone } = {}
): number {
  const existing = items.find((item) => item.title === title)
  if (existing) return existing.id
  const item: ToastItem = { id: nextId++, title, tone: options.tone ?? "info" }
  if (options.description) item.description = options.description
  publish([...items, item].slice(-3))
  return item.id
}

export function dismissToast(id: number): void {
  if (items.some((item) => item.id === id)) publish(items.filter((item) => item.id !== id))
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

const EMPTY: ToastItem[] = []

export function useToasts(): ToastItem[] {
  return useSyncExternalStore(
    subscribe,
    () => items,
    () => EMPTY
  )
}

/** For tests: forget every toast. */
export function resetToasts(): void {
  publish([])
}

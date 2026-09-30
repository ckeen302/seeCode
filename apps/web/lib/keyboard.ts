// Global keyboard map (Section 17.4). On Windows and Linux, ⌘ means Ctrl.
import { useEffect, useRef, useSyncExternalStore } from "react"

export interface Hotkey {
  key: string
  mod?: boolean
  shift?: boolean
  alt?: boolean
}

export const HOTKEYS = {
  commandPalette: { key: "k", mod: true },
} as const satisfies Record<string, Hotkey>

export function isMacPlatform(platform: string): boolean {
  return /mac|iphone|ipad|ipod/i.test(platform)
}

function currentPlatform(): string {
  const nav = navigator as Navigator & { userAgentData?: { platform?: string } }
  return nav.userAgentData?.platform ?? nav.platform ?? ""
}

export function matchesHotkey(event: KeyboardEvent, hotkey: Hotkey, mac: boolean): boolean {
  const mod = mac ? event.metaKey : event.ctrlKey
  const otherMod = mac ? event.ctrlKey : event.metaKey
  return (
    event.key.toLowerCase() === hotkey.key.toLowerCase() &&
    mod === Boolean(hotkey.mod) &&
    !otherMod &&
    event.shiftKey === Boolean(hotkey.shift) &&
    event.altKey === Boolean(hotkey.alt)
  )
}

export function formatHotkey(hotkey: Hotkey, mac: boolean): string {
  const key = hotkey.key.length === 1 ? hotkey.key.toUpperCase() : hotkey.key
  if (mac) {
    return `${hotkey.mod ? "⌘" : ""}${hotkey.alt ? "⌥" : ""}${hotkey.shift ? "⇧" : ""}${key}`
  }
  const parts = [hotkey.mod && "Ctrl", hotkey.alt && "Alt", hotkey.shift && "Shift", key]
  return parts.filter(Boolean).join(" ")
}

const noopSubscribe = () => () => {}

/** Whether the user is on a Mac; `null` during server rendering and hydration. */
export function useIsMac(): boolean | null {
  return useSyncExternalStore(
    noopSubscribe,
    () => isMacPlatform(currentPlatform()),
    () => null
  )
}

export function useHotkey(
  hotkey: Hotkey,
  handler: (event: KeyboardEvent) => void,
  { enabled = true }: { enabled?: boolean } = {}
): void {
  const handlerRef = useRef(handler)
  useEffect(() => {
    handlerRef.current = handler
  })

  useEffect(() => {
    if (!enabled) return
    const mac = isMacPlatform(currentPlatform())
    const onKeyDown = (event: KeyboardEvent) => {
      if (matchesHotkey(event, hotkey, mac)) {
        event.preventDefault()
        handlerRef.current(event)
      }
    }
    // Capture phase: global shortcuts must work even where a widget (a dialog, later
    // the code editor) stops keyboard events from bubbling.
    window.addEventListener("keydown", onKeyDown, { capture: true })
    return () => window.removeEventListener("keydown", onKeyDown, { capture: true })
  }, [enabled, hotkey])
}

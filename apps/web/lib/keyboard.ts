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
  run: { key: "Enter", mod: true },
  submit: { key: "Enter", mod: true, shift: true },
  toggleBottomPanel: { key: "j", mod: true },
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
    const symbol = key === "Enter" ? "↵" : key
    return `${hotkey.mod ? "⌘" : ""}${hotkey.alt ? "⌥" : ""}${hotkey.shift ? "⇧" : ""}${symbol}`
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

/** True while focus is inside an open dialog (the ⌘K palette, a confirm dialog). */
export function isInDialog(event: KeyboardEvent): boolean {
  return event.target instanceof Element && event.target.closest('[role="dialog"]') !== null
}

export interface HotkeyOptions {
  enabled?: boolean
  /** Also keep the key from widgets under the focus (the code editor would insert a line). */
  stopPropagation?: boolean
  /** Leave the key alone while focus is inside a dialog. */
  ignoreInDialogs?: boolean
}

export function useHotkey(
  hotkey: Hotkey,
  handler: (event: KeyboardEvent) => void,
  { enabled = true, stopPropagation = false, ignoreInDialogs = false }: HotkeyOptions = {}
): void {
  const handlerRef = useRef(handler)
  useEffect(() => {
    handlerRef.current = handler
  })

  useEffect(() => {
    if (!enabled) return
    const mac = isMacPlatform(currentPlatform())
    const onKeyDown = (event: KeyboardEvent) => {
      if (!matchesHotkey(event, hotkey, mac)) return
      if (ignoreInDialogs && isInDialog(event)) return
      event.preventDefault()
      if (stopPropagation) event.stopPropagation()
      handlerRef.current(event)
    }
    // Capture phase: global shortcuts must work even where a widget (a dialog, later
    // the code editor) stops keyboard events from bubbling.
    window.addEventListener("keydown", onKeyDown, { capture: true })
    return () => window.removeEventListener("keydown", onKeyDown, { capture: true })
  }, [enabled, hotkey, stopPropagation, ignoreInDialogs])
}

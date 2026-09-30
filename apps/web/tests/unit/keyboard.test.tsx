import { render } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

import {
  HOTKEYS,
  formatHotkey,
  isMacPlatform,
  matchesHotkey,
  useHotkey,
  type HotkeyOptions,
} from "@/lib/keyboard"

const key = (init: KeyboardEventInit) => new KeyboardEvent("keydown", init)

describe("keyboard map (Section 17.4)", () => {
  it("uses ⌘ on a Mac and Ctrl elsewhere", () => {
    const palette = HOTKEYS.commandPalette
    expect(matchesHotkey(key({ key: "k", metaKey: true }), palette, true)).toBe(true)
    expect(matchesHotkey(key({ key: "k", ctrlKey: true }), palette, true)).toBe(false)
    expect(matchesHotkey(key({ key: "k", ctrlKey: true }), palette, false)).toBe(true)
    expect(matchesHotkey(key({ key: "K", ctrlKey: true }), palette, false)).toBe(true)
    expect(matchesHotkey(key({ key: "k", ctrlKey: true, shiftKey: true }), palette, false)).toBe(
      false
    )
    expect(matchesHotkey(key({ key: "k" }), palette, false)).toBe(false)
  })

  it("formats hotkeys per platform", () => {
    expect(formatHotkey(HOTKEYS.commandPalette, true)).toBe("⌘K")
    expect(formatHotkey(HOTKEYS.commandPalette, false)).toBe("Ctrl K")
    expect(formatHotkey({ key: "Enter", mod: true, shift: true }, false)).toBe("Ctrl Shift Enter")
  })

  it("detects Apple platforms", () => {
    expect(isMacPlatform("MacIntel")).toBe(true)
    expect(isMacPlatform("macOS")).toBe(true)
    expect(isMacPlatform("Linux x86_64")).toBe(false)
    expect(isMacPlatform("Win32")).toBe(false)
  })
})

describe("Workspace keys (Section 17.4)", () => {
  it("runs with ⌘↵ and submits with ⌘⇧↵", () => {
    const enter = { key: "Enter", ctrlKey: true }
    expect(matchesHotkey(key(enter), HOTKEYS.run, false)).toBe(true)
    expect(matchesHotkey(key(enter), HOTKEYS.submit, false)).toBe(false)
    expect(matchesHotkey(key({ ...enter, shiftKey: true }), HOTKEYS.submit, false)).toBe(true)
    expect(matchesHotkey(key({ ...enter, shiftKey: true }), HOTKEYS.run, false)).toBe(false)
    expect(matchesHotkey(key({ key: "j", metaKey: true }), HOTKEYS.toggleBottomPanel, true)).toBe(
      true
    )
  })

  it("shows ↵ for Enter on a Mac", () => {
    expect(formatHotkey(HOTKEYS.run, true)).toBe("⌘↵")
    expect(formatHotkey(HOTKEYS.submit, true)).toBe("⌘⇧↵")
    expect(formatHotkey(HOTKEYS.run, false)).toBe("Ctrl Enter")
    expect(formatHotkey(HOTKEYS.toggleBottomPanel, true)).toBe("⌘J")
  })
})

describe("useHotkey", () => {
  function Listener({ onKey, ...options }: { onKey: () => void } & HotkeyOptions) {
    useHotkey(HOTKEYS.run, onKey, options)
    return null
  }

  it("keeps the key from the focused widget when asked (the editor would insert a line)", () => {
    const onKey = vi.fn()
    const inner = vi.fn()
    render(<Listener onKey={onKey} stopPropagation />)
    const target = document.createElement("textarea")
    document.body.append(target)
    target.addEventListener("keydown", inner)
    target.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Enter", ctrlKey: true, bubbles: true })
    )
    expect(onKey).toHaveBeenCalledOnce()
    expect(inner).not.toHaveBeenCalled()
    target.remove()
  })

  it("can leave keys alone inside dialogs", () => {
    const onKey = vi.fn()
    render(<Listener onKey={onKey} ignoreInDialogs />)
    const dialog = document.createElement("div")
    dialog.setAttribute("role", "dialog")
    const input = document.createElement("input")
    dialog.append(input)
    document.body.append(dialog)
    input.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Enter", ctrlKey: true, bubbles: true })
    )
    expect(onKey).not.toHaveBeenCalled()
    document.body.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Enter", ctrlKey: true, bubbles: true })
    )
    expect(onKey).toHaveBeenCalledOnce()
    dialog.remove()
  })
})

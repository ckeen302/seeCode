import { describe, expect, it } from "vitest"

import { HOTKEYS, formatHotkey, isMacPlatform, matchesHotkey } from "@/lib/keyboard"

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

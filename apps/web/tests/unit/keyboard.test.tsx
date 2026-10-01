import { act, render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"

import { ShortcutsHelp } from "@/components/shell/ShortcutsHelp"
import {
  HOTKEYS,
  formatHotkey,
  isHelpKey,
  isMacPlatform,
  isTypingTarget,
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

describe("shortcut help (Section 17.4: ? anywhere)", () => {
  function press(target: Element, init: KeyboardEventInit = {}) {
    const event = new KeyboardEvent("keydown", {
      key: "?",
      shiftKey: true,
      bubbles: true,
      cancelable: true,
      ...init,
    })
    act(() => {
      target.dispatchEvent(event)
    })
    return event
  }

  it("knows when a key press is typing", () => {
    const input = document.createElement("input")
    const editable = document.createElement("div")
    editable.contentEditable = "true"
    const editor = document.createElement("div")
    editor.className = "monaco-editor"
    const inEditor = document.createElement("div")
    editor.append(inEditor)
    expect(isTypingTarget(input)).toBe(true)
    expect(isTypingTarget(document.createElement("textarea"))).toBe(true)
    expect(isTypingTarget(inEditor)).toBe(true)
    expect(isTypingTarget(document.body)).toBe(false)
    expect(isTypingTarget(null)).toBe(false)
    // jsdom has no isContentEditable; a browser reports it on the element.
    Object.defineProperty(editable, "isContentEditable", { value: true })
    expect(isTypingTarget(editable)).toBe(true)
  })

  it("opens on ? outside text fields, and lists the Workspace keys", async () => {
    render(<ShortcutsHelp />)
    const input = document.createElement("input")
    document.body.append(input)
    expect(press(input).defaultPrevented).toBe(false)
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
    expect(press(document.body, { ctrlKey: true }).defaultPrevented).toBe(false)

    expect(press(document.body).defaultPrevented).toBe(true)
    const dialog = await screen.findByRole("dialog", { name: "Keyboard shortcuts" })
    expect(dialog).toHaveTextContent("Run the examples")
    expect(dialog).toHaveTextContent("Submit (every test)")
    expect(dialog).toHaveTextContent("Show or hide the tests panel")
    expect(dialog).toHaveTextContent("Search problems and patterns")
    // A second ? inside the open dialog leaves it alone.
    expect(isHelpKey(new KeyboardEvent("keydown", { key: "?" }))).toBe(true)
    await userEvent.keyboard("{Escape}")
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
    input.remove()
  })
})

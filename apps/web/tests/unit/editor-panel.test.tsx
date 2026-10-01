import { act, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import { TooltipProvider } from "@/components/ui/tooltip"
import { DEFAULT_EDITOR_SETTINGS, setEditorSettings } from "@/lib/editor/settings"
import { workspaceStore } from "@/stores/workspace"

import { PALINDROME } from "./fixtures"

// The code editor panel without Monaco: the loader is a fake that fails or never settles.

const loaderState = vi.hoisted(() => ({ fail: false }))

vi.mock("@monaco-editor/react", () => {
  function cancelable(promise: Promise<unknown>) {
    return Object.assign(promise, { cancel: () => undefined })
  }
  return {
    default: ({ options }: { options: Record<string, unknown> }) => (
      <div
        data-testid="monaco"
        data-font-size={String(options.fontSize)}
        data-line-height={String(options.lineHeight)}
        data-accessibility={String(options.accessibilitySupport)}
      />
    ),
    loader: {
      config: () => undefined,
      init: () =>
        cancelable(
          loaderState.fail
            ? Promise.reject(new Error("Script error for vs/editor/editor.main"))
            : new Promise(() => undefined)
        ),
    },
  }
})

const { EditorPanel } = await import("@/components/workspace/EditorPanel")

function renderPanel() {
  return render(
    <TooltipProvider>
      <EditorPanel />
    </TooltipProvider>
  )
}

afterEach(() => {
  setEditorSettings(DEFAULT_EDITOR_SETTINGS)
  loaderState.fail = false
  act(() => workspaceStore.setState({ slug: "", problem: null, code: "" }))
})

describe("code editor panel", () => {
  it("shows the editor while Monaco loads", () => {
    act(() => workspaceStore.getState().open(PALINDROME))
    renderPanel()
    expect(screen.getByTestId("monaco")).toBeInTheDocument()
    expect(screen.queryByRole("alert")).not.toBeInTheDocument()
  })

  it("says so, with a reload, when Monaco cannot load from the CDN", async () => {
    loaderState.fail = true
    act(() => workspaceStore.getState().open(PALINDROME))
    renderPanel()
    expect(await screen.findByRole("alert")).toHaveTextContent("The code editor couldn't load.")
    expect(screen.getByRole("button", { name: "Reload" })).toBeInTheDocument()
    expect(screen.queryByTestId("monaco")).not.toBeInTheDocument()
  })

  it("warns when the code is over the 50 KB limit (Section 20)", () => {
    act(() => {
      workspaceStore.getState().open(PALINDROME)
      workspaceStore.getState().setCode("x".repeat(51 * 1024))
    })
    renderPanel()
    expect(screen.getByText("Over 50 KB: shorten it to save your changes")).toBeInTheDocument()
    act(() => workspaceStore.getState().setCode("x = 1"))
    expect(screen.queryByText(/Over 50 KB/)).not.toBeInTheDocument()
  })

  it("uses the saved font size and screen-reader mode (Settings → Code editor)", () => {
    act(() => workspaceStore.getState().open(PALINDROME))
    renderPanel()
    const editor = screen.getByTestId("monaco")
    expect(editor).toHaveAttribute("data-font-size", "14")
    expect(editor).toHaveAttribute("data-line-height", "22")
    expect(editor).toHaveAttribute("data-accessibility", "auto")
    act(() => setEditorSettings({ fontSize: 18, accessibility: "on" }))
    expect(editor).toHaveAttribute("data-font-size", "18")
    expect(editor).toHaveAttribute("data-line-height", "28")
    expect(editor).toHaveAttribute("data-accessibility", "on")
  })
})

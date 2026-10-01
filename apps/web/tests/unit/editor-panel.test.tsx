import { act, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import { TooltipProvider } from "@/components/ui/tooltip"
import { workspaceStore } from "@/stores/workspace"

import { PALINDROME } from "./fixtures"

// The code editor panel without Monaco: the loader is a fake that fails or never settles.

const loaderState = vi.hoisted(() => ({ fail: false }))

vi.mock("@monaco-editor/react", () => {
  function cancelable(promise: Promise<unknown>) {
    return Object.assign(promise, { cancel: () => undefined })
  }
  return {
    default: () => <div data-testid="monaco" />,
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
})

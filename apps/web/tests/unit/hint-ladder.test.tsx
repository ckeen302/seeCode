import { act, fireEvent, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { COPY_DELAY_SECONDS, HintLadder, slotComment } from "@/components/workspace/HintLadder"
import { registerEditor } from "@/lib/workspace/editorBridge"

import { HINTS, stubApi } from "./coach-fixtures"
import { renderWithProviders, resetWorkspace, setWorkspace } from "./coach-render"

// The hint ladder (Section 7.4).

beforeEach(() => {
  stubApi()
})

afterEach(() => {
  resetWorkspace()
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

const rung = (n: number) => document.querySelector(`[data-rung="${n}"]`) as HTMLElement

describe("hint ladder", () => {
  it("lists six rungs: the next one opens, the rest stay locked", () => {
    setWorkspace()
    renderWithProviders(<HintLadder />)
    expect([1, 2, 3, 4, 5, 6].map((n) => rung(n).dataset.state)).toEqual([
      "next",
      "locked",
      "locked",
      "locked",
      "locked",
      "locked",
    ])
    expect(screen.getByRole("button", { name: "Open Rung 1, Clarify" })).toBeEnabled()
    expect(rung(2)).toHaveTextContent("Phrases in the problem that point the way")
    expect(within(rung(2)).queryByRole("button")).not.toBeInTheDocument()
  })

  it("asks to confirm before opening a rung, inline", async () => {
    const user = userEvent.setup()
    const openRung = vi.fn(async () => {})
    setWorkspace({ openRung, openedRungs: [HINTS[1], HINTS[2]] })
    renderWithProviders(<HintLadder />)
    await user.click(screen.getByRole("button", { name: "Open Rung 3, Approach" }))
    const confirm = screen.getByRole("group", { name: "Confirm opening Approach" })
    expect(confirm).toHaveTextContent("Hints count toward this attempt")
    expect(within(confirm).getByRole("button", { name: "Open approach" })).toHaveFocus()
    await user.click(within(confirm).getByRole("button", { name: "Not yet" }))
    // The confirm folds away (150 ms).
    await waitFor(() =>
      expect(screen.queryByRole("group", { name: /Confirm/ })).not.toBeInTheDocument()
    )
    expect(openRung).not.toHaveBeenCalled()

    await user.click(screen.getByRole("button", { name: "Open Rung 3, Approach" }))
    await user.keyboard("{Escape}")
    // The confirm folds away (150 ms).
    await waitFor(() =>
      expect(screen.queryByRole("group", { name: /Confirm/ })).not.toBeInTheDocument()
    )
    await user.click(screen.getByRole("button", { name: "Open Rung 3, Approach" }))
    await user.keyboard("{Enter}")
    expect(openRung).toHaveBeenCalledWith(3)
  })

  it("warns that rung 6 shows the solution", async () => {
    const user = userEvent.setup()
    setWorkspace({ openedRungs: [1, 2, 3, 4, 5].map((n) => HINTS[n as 1]) })
    renderWithProviders(<HintLadder />)
    await user.click(screen.getByRole("button", { name: "Open Rung 6, Solution" }))
    expect(screen.getByRole("group", { name: "Confirm opening Solution" })).toHaveTextContent(
      "Rung 6 shows the full solution."
    )
  })

  it("opens a free rung (11.6) without a confirm", async () => {
    const user = userEvent.setup()
    const openRung = vi.fn(async () => {})
    setWorkspace({ openRung, fading: { givenPattern: null, freeRungs: [1] } })
    renderWithProviders(<HintLadder />)
    expect(rung(1)).toHaveTextContent("Free")
    await user.click(screen.getByRole("button", { name: "Open Rung 1, Clarify" }))
    expect(openRung).toHaveBeenCalledWith(1)
  })

  it("⌘⇧H asks for the next rung, and a second press opens it", () => {
    const openRung = vi.fn(async () => {})
    setWorkspace({ openRung })
    renderWithProviders(<HintLadder />)
    const press = () =>
      fireEvent.keyDown(window, { key: "H", ctrlKey: true, shiftKey: true, bubbles: true })
    press()
    expect(screen.getByRole("group", { name: "Confirm opening Clarify" })).toBeInTheDocument()
    expect(openRung).not.toHaveBeenCalled()
    press()
    expect(openRung).toHaveBeenCalledWith(1)
  })

  it("shows opened rungs, collapsible", async () => {
    const user = userEvent.setup()
    setWorkspace({ openedRungs: [HINTS[1], HINTS[2], HINTS[3]] })
    renderWithProviders(<HintLadder />)
    const clarify = screen.getByRole("region", { name: "Rung 1, Clarify" })
    expect(clarify).toHaveTextContent("Does a space count? Try No, on! by hand.")
    const signals = screen.getByRole("region", { name: "Rung 2, Signals" })
    expect(signals).toHaveTextContent("n ≤ 2·10⁵ → O(n) or O(n log n)")
    expect(within(signals).getByText("“reads the same forward and backward”")).toBeInTheDocument()
    expect(await within(signals).findByText("Two pointers (opposite ends)")).toBeInTheDocument()
    expect(await within(signals).findByText(".lower()")).toBeInTheDocument()
    const approach = screen.getByRole("region", { name: "Rung 3, Approach" })
    expect(within(approach).getByRole("link", { name: /Two pointers/ })).toHaveAttribute(
      "href",
      "/patterns/two_pointers_opposite"
    )
    expect(approach).toHaveTextContent("A reversed copy takes O(n) space.")

    const toggle = screen.getByRole("button", { name: "Rung 1, Clarify, opened" })
    expect(toggle).toHaveAttribute("aria-expanded", "true")
    await user.click(toggle)
    expect(toggle).toHaveAttribute("aria-expanded", "false")
    await waitFor(() =>
      expect(screen.queryByRole("region", { name: "Rung 1, Clarify" })).not.toBeInTheDocument()
    )
  })

  it("rung 4 inserts its slots into the editor as comments", async () => {
    const user = userEvent.setup()
    const insertLines = vi.fn()
    const unregister = registerEditor({ goToLine: vi.fn(), focus: vi.fn(), insertLines })
    setWorkspace({ openedRungs: [1, 2, 3, 4].map((n) => HINTS[n as 1]) })
    renderWithProviders(<HintLadder />)
    await user.click(screen.getByRole("button", { name: "Insert as comments" }))
    expect(insertLines).toHaveBeenCalledWith([
      "# Place the pointers: Put l on the first index.",
      "# Stop condition: While l is left of r.",
    ])
    expect(screen.getByText("Added at your cursor. ⌘Z takes them out.")).toBeInTheDocument()
    unregister()
    await user.click(screen.getByRole("button", { name: "Insert as comments" }))
    expect(screen.getByText("The code editor isn't ready yet.")).toBeInTheDocument()
  })

  it("rung 5 points to the walkthrough in the bottom panel", async () => {
    const user = userEvent.setup()
    const showWalkthrough = vi.fn(async () => {})
    setWorkspace({ showWalkthrough, openedRungs: [1, 2, 3, 4, 5].map((n) => HINTS[n as 1]) })
    renderWithProviders(<HintLadder />)
    await user.click(screen.getByRole("button", { name: "Show the walkthrough" }))
    expect(showWalkthrough).toHaveBeenCalled()
  })

  it("rung 6 holds Copy back for 10 s, and offers to end the attempt", async () => {
    vi.useFakeTimers()
    const end = vi.fn(async () => true)
    setWorkspace({ end, openedRungs: [1, 2, 3, 4, 5, 6].map((n) => HINTS[n as 1]) })
    renderWithProviders(<HintLadder />)
    const solution = screen.getByRole("region", { name: "Rung 6, Solution" })
    expect(within(solution).getByLabelText("Solution code")).toHaveTextContent("return True")
    expect(solution).toHaveTextContent(".lower() for “ignore letter case”")
    const copy = within(solution).getByRole("button", { name: /Try typing it yourself \(10\)/ })
    expect(copy).toBeDisabled()
    for (let i = 0; i < COPY_DELAY_SECONDS; i++) {
      await act(async () => {
        await vi.advanceTimersByTimeAsync(1000)
      })
    }
    expect(within(solution).getByRole("button", { name: "Copy" })).toBeEnabled()
    vi.useRealTimers()

    fireEvent.click(within(solution).getByRole("button", { name: "End attempt" }))
    const dialog = await screen.findByRole("alertdialog", { name: "End this attempt?" })
    fireEvent.click(within(dialog).getByRole("button", { name: "End attempt" }))
    expect(end).toHaveBeenCalled()
  })

  it("opens nothing once the attempt has ended", () => {
    setWorkspace({ attemptStatus: "finished", openedRungs: [HINTS[1]] })
    renderWithProviders(<HintLadder />)
    expect(screen.queryByRole("button", { name: /^Open Rung/ })).not.toBeInTheDocument()
    expect(rung(2)).toHaveTextContent("Signals")
  })

  it("announces an error", () => {
    setWorkspace({ hintError: "Couldn't reach SeeCode. Check your connection, then try again." })
    renderWithProviders(<HintLadder />)
    expect(screen.getByRole("alert")).toHaveTextContent("Couldn't reach SeeCode.")
  })
})

describe("slotComment", () => {
  it("drops the backticks around identifiers", () => {
    expect(slotComment("Loop", "While `l` < `r`.")).toBe("# Loop: While l < r.")
  })
})

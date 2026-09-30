import { act, fireEvent, render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, describe, expect, it, vi } from "vitest"

import {
  TestsPanel,
  TestsPanelView,
  type TestsPanelViewProps,
} from "@/components/workspace/TestsPanel"
import type { TestResult } from "@/lib/runner/types"
import { registerEditor } from "@/lib/workspace/editorBridge"
import { workspaceStore } from "@/stores/workspace"

import { PALINDROME } from "./fixtures"

// Tests panel (Section 7.5).

function view(props: Partial<TestsPanelViewProps> = {}) {
  return render(
    <TestsPanelView
      problem={PALINDROME}
      results={null}
      resultsKind={null}
      running="idle"
      runError={null}
      customCases={[]}
      pythonLoading={false}
      {...props}
    />
  )
}

const selectedPanel = () => screen.getByRole("tabpanel")

afterEach(() => {
  act(() => workspaceStore.setState({ slug: "", problem: null, customCases: [], results: null }))
})

describe("Tests panel", () => {
  it("lists the visible cases with input and expected before any run", () => {
    view()
    expect(screen.getByText("Run your code to check it against the examples.")).toBeInTheDocument()
    const tabs = screen.getAllByRole("tab")
    expect(tabs.map((tab) => tab.textContent)).toEqual(["Case 1", "Case 2"])
    expect(tabs[0]).toHaveAttribute("aria-selected", "true")
    expect(tabs[0]).toHaveAccessibleName("Case 1, not run yet")
    expect(selectedPanel()).toHaveTextContent('s = "Top spot!"')
    expect(within(selectedPanel()).getByText("true")).toBeInTheDocument()
    expect(screen.queryByText("Output")).not.toBeInTheDocument()
  })

  it("shows expected next to the actual output for a failing case", () => {
    const results: TestResult[] = [
      { id: "e1", status: "fail", got: false, stdout: "checking\n", ms: 0.3 },
      { id: "e2", status: "pass", got: false, stdout: "" },
    ]
    view({ results, resultsKind: "run" })
    expect(screen.getByTestId("tests-summary")).toHaveTextContent("Not quite")
    expect(screen.getByText("1 of 2 cases passed.")).toBeInTheDocument()
    const [first, second] = screen.getAllByRole("tab")
    expect(first).toHaveAccessibleName("Case 1, not quite")
    expect(second).toHaveAccessibleName("Case 2, passed")
    const panel = selectedPanel()
    expect(within(panel).getByText("Expected").nextSibling).toHaveTextContent("true")
    expect(within(panel).getByText("Output").nextSibling).toHaveTextContent("false")
    // Printed output is open; an empty one stays collapsed.
    expect(within(panel).getByText("checking")).toBeVisible()
    expect(panel.querySelector("details")).toHaveAttribute("open")
    fireEvent.click(second)
    expect(selectedPanel().querySelector("details")).not.toHaveAttribute("open")
    expect(within(selectedPanel()).getByText("Stdout (nothing printed)")).toBeInTheDocument()
  })

  it("links traceback lines to the editor", async () => {
    const goToLine = vi.fn()
    const unregister = registerEditor({ goToLine, focus: vi.fn() })
    const error =
      'Traceback (most recent call last):\n  File "<solution>", line 4, in isPalindrome\n    return s[99]\nIndexError: string index out of range\n'
    view({
      results: [
        { id: "e1", status: "error", error, stdout: "" },
        { id: "e2", status: "pass", got: false },
      ],
      resultsKind: "run",
    })
    await userEvent.click(screen.getByRole("button", { name: "Go to line 4 in the editor" }))
    expect(goToLine).toHaveBeenCalledWith(4)
    expect(screen.getAllByRole("tab")[0]).toHaveAccessibleName("Case 1, error")
    unregister()
  })

  it("reports code that does not load once, with a link to its line", async () => {
    const goToLine = vi.fn()
    const unregister = registerEditor({ goToLine, focus: vi.fn() })
    const error = '  File "<solution>", line 3\n    return s ==\nSyntaxError: invalid syntax\n'
    view({
      results: ["e1", "e2"].map((id) => ({ id, status: "error" as const, error })),
      resultsKind: "run",
    })
    expect(screen.getByTestId("tests-summary")).toHaveTextContent("Error")
    expect(screen.getByText(/SyntaxError: invalid syntax \(line 3\)/)).toBeInTheDocument()
    await userEvent.click(screen.getByRole("button", { name: "Show line 3" }))
    expect(goToLine).toHaveBeenCalledWith(3)
    unregister()
  })

  it("after Submit, shows only the first failing hidden case", () => {
    const results: TestResult[] = [
      { id: "e1", status: "pass", got: true },
      { id: "e2", status: "pass", got: false },
      { id: "h1", status: "fail", got: false },
      { id: "h2", status: "fail", got: false },
    ]
    view({ results, resultsKind: "submit" })
    expect(screen.getByText("2 of 4 tests passed (hidden: 0 of 2).")).toBeInTheDocument()
    const tabs = screen.getAllByRole("tab")
    expect(tabs.map((tab) => tab.textContent)).toEqual(["Case 1", "Case 2", "Hidden case"])
    expect(tabs[2]).toHaveAttribute("aria-selected", "true")
    expect(selectedPanel()).toHaveTextContent('s = "z"')
    expect(screen.queryByText(/"AbBa"/)).not.toBeInTheDocument()
  })

  it("says Solved. when every test passes", () => {
    const results = PALINDROME.tests.map((test) => ({ id: test.id, status: "pass" as const }))
    view({ results, resultsKind: "submit" })
    expect(screen.getByTestId("tests-summary")).toHaveTextContent(/^Solved\.$/)
    expect(screen.getByText("All 4 tests passed, including 2 hidden ones.")).toBeInTheDocument()
  })

  it("explains a time limit", () => {
    const results = PALINDROME.tests.map((test) => ({ id: test.id, status: "timeout" as const }))
    view({ results, resultsKind: "submit" })
    expect(screen.getByTestId("tests-summary")).toHaveTextContent("Time limit exceeded")
    expect(screen.getByText(/Stopped after 5 seconds/)).toBeInTheDocument()
  })

  it("shows progress while running and while Python loads", () => {
    const { rerender } = view({ running: "run" })
    expect(screen.getByText("Running…")).toBeInTheDocument()
    rerender(
      <TestsPanelView
        problem={PALINDROME}
        results={null}
        resultsKind={null}
        running="submit"
        runError={null}
        customCases={[]}
        pythonLoading
      />
    )
    expect(screen.getByText(/Loading Python/)).toBeInTheDocument()
  })

  it("offers a retry when Python could not run the code", () => {
    view({ runError: "Python took too long to load." })
    expect(screen.getByRole("alert")).toHaveTextContent("Python couldn't run your code.")
    expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument()
  })

  it("moves between cases with the arrow keys", async () => {
    view()
    const [first, second] = screen.getAllByRole("tab")
    first.focus()
    await userEvent.keyboard("{ArrowRight}")
    expect(second).toHaveAttribute("aria-selected", "true")
    expect(second).toHaveFocus()
    await userEvent.keyboard("{ArrowRight}")
    expect(first).toHaveAttribute("aria-selected", "true")
  })
})

describe("custom cases", () => {
  it("adds a case from the selected one and validates its JSON", async () => {
    act(() => workspaceStore.getState().open(PALINDROME))
    render(<TestsPanel />)
    await userEvent.click(screen.getByRole("button", { name: "Add a custom case" }))
    const tab = screen.getByRole("tab", { name: "Custom 1, not run yet" })
    expect(tab).toHaveAttribute("aria-selected", "true")
    expect(workspaceStore.getState().customCases).toEqual([{ id: "custom-1", args: ["Top spot!"] }])

    const input = screen.getByLabelText("s =")
    expect(input).toHaveValue('"Top spot!"')
    await userEvent.clear(input)
    await userEvent.type(input, "racecar")
    expect(input).toHaveAttribute("aria-invalid", "true")
    expect(screen.getByText(/Not valid JSON/)).toBeInTheDocument()
    // The last valid arguments stay in the store.
    expect(workspaceStore.getState().customCases[0].args).toEqual(["Top spot!"])

    await userEvent.clear(input)
    await userEvent.type(input, '"racecar"')
    expect(input).not.toHaveAttribute("aria-invalid")
    expect(workspaceStore.getState().customCases[0].args).toEqual(["racecar"])
    expect(screen.getByText(/Custom cases show your output only/)).toBeInTheDocument()

    await userEvent.click(screen.getByRole("button", { name: "Remove case" }))
    expect(workspaceStore.getState().customCases).toEqual([])
    expect(screen.queryByRole("tab", { name: /Custom 1/ })).not.toBeInTheDocument()
  })

  it("shows a custom case's output without pass or fail", () => {
    act(() => {
      workspaceStore.getState().open(PALINDROME)
      workspaceStore.getState().addCustomCase(["abc"])
    })
    render(
      <TestsPanelView
        problem={PALINDROME}
        results={[{ id: "custom-1", status: "fail", got: false, stdout: "" }]}
        resultsKind="run"
        running="idle"
        runError={null}
        customCases={[{ id: "custom-1", args: ["abc"] }]}
        pythonLoading={false}
      />
    )
    const tab = screen.getByRole("tab", { name: "Custom 1, ran" })
    fireEvent.click(tab)
    expect(within(selectedPanel()).getByText("Output").nextSibling).toHaveTextContent("false")
    expect(within(selectedPanel()).queryByText("Expected")).not.toBeInTheDocument()
  })
})

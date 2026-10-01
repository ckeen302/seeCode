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

import { MIN_STACK, PALINDROME, TWO_SUM } from "./fixtures"

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
    // Printed output is open; an empty one is a single quiet line.
    expect(within(panel).getByText("checking")).toBeVisible()
    expect(panel.querySelector("details")).toHaveAttribute("open")
    expect(within(panel).getByText("Ran in 0.3 ms")).toBeInTheDocument()
    fireEvent.click(second)
    expect(selectedPanel().querySelector("details")).toBeNull()
    expect(within(selectedPanel()).getByText("Stdout: nothing printed")).toBeInTheDocument()
  })

  it("says how a test compares when order does not matter", () => {
    view({ problem: TWO_SUM })
    expect(within(selectedPanel()).getByText("(any order)")).toBeInTheDocument()
    expect(within(selectedPanel()).getByText(/^Expected/)).toHaveTextContent("Expected (any order)")
  })

  it("cuts a huge output short instead of rendering all of it", () => {
    const huge = Array.from({ length: 200_000 }, (_, i) => i)
    view({ results: [{ id: "e1", status: "fail", got: huge }], resultsKind: "run" })
    const output = within(selectedPanel()).getByText("Output").nextSibling as HTMLElement
    expect(output).toHaveTextContent(/^\[0, 1, 2, /)
    expect(output).toHaveTextContent("too long to show in full")
    expect(output.textContent?.length).toBeLessThan(20_100)
  })

  it("links traceback lines to the editor", async () => {
    const goToLine = vi.fn()
    const unregister = registerEditor({ goToLine, focus: vi.fn(), insertLines: vi.fn() })
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
    const unregister = registerEditor({ goToLine, focus: vi.fn(), insertLines: vi.fn() })
    const error = '  File "<solution>", line 3\n    return s ==\nSyntaxError: invalid syntax\n'
    view({
      results: ["e1", "e2"].map((id) => ({ id, status: "error" as const, error })),
      resultsKind: "run",
    })
    expect(screen.getByTestId("tests-summary")).toHaveTextContent("Error")
    expect(screen.getByRole("status")).toHaveTextContent(
      /^Error SyntaxError: invalid syntax Show line 3$/
    )
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

  it("says why Python could not run the code, and retries the same action", async () => {
    const { rerender } = view({
      runError: { kind: "submit", reason: "load", message: "Python took too long to load." },
    })
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Python couldn't load. Check your connection, then try again."
    )
    const submit = vi.spyOn(workspaceStore.getState(), "submit").mockResolvedValue()
    await userEvent.click(screen.getByRole("button", { name: "Try again" }))
    expect(submit).toHaveBeenCalledOnce()
    submit.mockRestore()

    rerender(
      <TestsPanelView
        problem={PALINDROME}
        results={null}
        resultsKind={null}
        running="idle"
        runError={{ kind: "run", reason: "crash", message: "Aborted(OOM)" }}
        customCases={[]}
        pythonLoading={false}
      />
    )
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Python stopped while running your code. It may have run out of memory."
    )
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

  it("keeps the custom case in view after a Run, with no output left from its old input", async () => {
    act(() => {
      workspaceStore.getState().open(PALINDROME)
      workspaceStore.getState().addCustomCase(["abc"])
    })
    render(<TestsPanel />)
    await userEvent.click(screen.getByRole("tab", { name: "Custom 1, not run yet" }))
    act(() =>
      workspaceStore.setState({
        results: [
          { id: "e1", status: "fail", got: true },
          { id: "e2", status: "pass", got: false },
          { id: "custom-1", status: "pass", got: false, stdout: "" },
        ],
        resultsKind: "run",
      })
    )
    // The run's failing Case 1 does not pull the view away from the case being edited.
    expect(screen.getByRole("tab", { name: "Custom 1, ran" })).toHaveAttribute(
      "aria-selected",
      "true"
    )
    expect(within(selectedPanel()).getByText("Output")).toBeInTheDocument()

    const input = screen.getByLabelText("s =")
    await userEvent.clear(input)
    await userEvent.type(input, '"xyz"')
    expect(within(selectedPanel()).queryByText("Output")).not.toBeInTheDocument()
    expect(screen.getByRole("tab", { name: "Custom 1, not run yet" })).toBeInTheDocument()
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

  it("shows a design problem's calls with the expected and returned value of each", () => {
    const results: TestResult[] = [
      { id: "e1", status: "fail", got: [null, null, null, 3, null, 3], stdout: "" },
    ]
    view({ problem: MIN_STACK, results, resultsKind: "run" })
    const panel = selectedPanel()
    const rows = within(panel).getAllByRole("row")
    expect(rows[0]).toHaveTextContent("CallExpectedOutput")
    expect(rows[1]).toHaveTextContent("MinStack()nullnull")
    expect(rows[2]).toHaveTextContent(".push(3)nullnull")
    expect(within(rows[4]).getByLabelText("different from expected")).toHaveTextContent("3")
    // Custom cases are argument lists, so a design problem offers none.
    expect(screen.queryByRole("button", { name: "Add a custom case" })).not.toBeInTheDocument()
  })

  it("shows a value JSON cannot hold as its Python repr, and a failed test's reason", () => {
    const results: TestResult[] = [
      { id: "e1", status: "fail", got: "nan", gotRepr: true, error: "The checker said no." },
      { id: "e2", status: "pass", got: false },
    ]
    view({ results, resultsKind: "run" })
    expect(within(selectedPanel()).getByText("nan")).toBeInTheDocument()
    expect(within(selectedPanel()).queryByText('"nan"')).not.toBeInTheDocument()
    expect(within(selectedPanel()).getByText("The checker said no.")).toBeInTheDocument()
  })
})

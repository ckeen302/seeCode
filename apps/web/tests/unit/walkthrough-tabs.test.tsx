import { act, fireEvent, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, describe, expect, it, vi } from "vitest"

import type { TraceRequest } from "@/lib/runner/types"
import {
  EMPTY_VIZ,
  customInputs,
  demoPayload,
  traceMinePayload,
  visibleInputs,
} from "@/lib/viz/payloads"
import type { Trace } from "@/lib/viz/types"
import { workspaceStore } from "@/stores/workspace"

import { renderWithProviders, resetWorkspace, setWorkspace } from "./coach-render"
import { MIN_STACK, PALINDROME } from "./fixtures"
import { fixture } from "./viz-fixtures"

// The Workspace's bottom-panel Walkthrough and Trace my code tabs (Sections 7.6, 7.7, 8.6)
// with the real player and a fake Pyodide runner, plus the payloads the app builds itself.

const runner = vi.hoisted(() => ({
  trace: vi.fn<(req: TraceRequest) => Promise<Trace>>(),
}))
vi.mock("@/lib/runner/runner", () => ({
  getRunner: () => ({
    trace: runner.trace,
    subscribe: () => () => {},
    getStatus: () => "ready",
  }),
}))

const { BottomPanel } = await import("@/components/workspace/BottomPanel")

const PLAIN: Trace = {
  steps: [
    {
      line: 3,
      event: "line",
      func: "isPalindrome",
      depth: 1,
      locals: { s: { t: "str", v: "Top spot!", n: 9 } },
      tags: [],
    },
    {
      line: 3,
      event: "return",
      func: "isPalindrome",
      depth: 1,
      locals: { s: { t: "str", v: "Top spot!", n: 9 } },
      tags: [],
      ret: { t: "prim", v: null },
    },
  ],
  result: { t: "prim", v: null },
  error: null,
  truncated: false,
}

function renderPanel() {
  return renderWithProviders(<BottomPanel collapsed={false} onToggleCollapsed={() => {}} />)
}

afterEach(() => {
  runner.trace.mockReset()
  resetWorkspace()
})

describe("walkthrough payloads", () => {
  it("lists the visible tests as examples, never the hidden ones", () => {
    expect(visibleInputs(PALINDROME)).toEqual([
      { label: "Example 1", args: ["Top spot!"] },
      { label: "Example 2", args: ["Top 2 spot"] },
    ])
    expect(visibleInputs(MIN_STACK)[0]).toEqual({
      label: "Example 1",
      ops: MIN_STACK.tests[0].ops,
    })
  })

  it("adds custom cases for function problems only", () => {
    const cases = [{ id: "custom-1", args: ["aba"] }]
    expect(customInputs(PALINDROME, cases)).toEqual([{ label: "Custom 1", args: ["aba"] }])
    expect(customInputs(MIN_STACK, cases)).toEqual([])
  })

  it("builds Trace my code's payload from the public problem alone", () => {
    const payload = traceMinePayload(PALINDROME)
    expect(payload).toEqual({
      code: "",
      kind: "function",
      entry: "isPalindrome",
      io: undefined,
      viz: EMPTY_VIZ,
      inputs: visibleInputs(PALINDROME),
    })
  })

  it("plays a pattern's demo on its own input", () => {
    const demo = {
      code: "class Solution:\n    def demo(self, nums):\n        return nums\n",
      entry: "demo",
      args: [[1, 2]],
      viz: { ...EMPTY_VIZ, primary: "nums" },
    }
    expect(demoPayload(demo)).toEqual({
      code: demo.code,
      kind: "function",
      entry: "demo",
      viz: demo.viz,
      inputs: [{ label: "Demo", args: [[1, 2]] }],
    })
  })
})

describe("Trace my code tab (7.7)", () => {
  it("traces the learner's editor code before any hint, with no reference solution", async () => {
    runner.trace.mockResolvedValue(PLAIN)
    const code = "class Solution:\n    def isPalindrome(self, s):\n        return s\n"
    setWorkspace({
      mode: "guest",
      guest: true,
      attemptId: null,
      bottomTab: "trace",
      code,
      customCases: [{ id: "custom-1", args: ["aba"] }],
    })
    renderPanel()
    await screen.findByTestId("viz-canvas")
    expect(runner.trace).toHaveBeenCalledWith({
      code,
      entry: "isPalindrome",
      args: ["Top spot!"],
    })
    // No viz config, no reference code: only the learner's code is ever traced.
    for (const [req] of runner.trace.mock.calls) {
      expect(req.code).toBe(code)
      expect(req.viz).toBeUndefined()
    }
    const player = screen.getByRole("region", { name: "Trace my code" })
    const select = within(player).getByLabelText("Input", { exact: true })
    expect(
      within(select)
        .getAllByRole("option")
        .map((option) => option.textContent)
    ).toEqual(['Example 1: "Top spot!"', 'Example 2: "Top 2 spot"', 'Custom 1: "aba"'])
    expect(screen.getByTestId("narration")).toHaveTextContent("Line 3 is about to run")
    expect(screen.queryByText(/arrives in/)).toBeNull()
  })

  it("follows the editor a moment after typing stops", async () => {
    runner.trace.mockResolvedValue(PLAIN)
    setWorkspace({ bottomTab: "trace" })
    renderPanel()
    await screen.findByTestId("viz-canvas")
    const next = "class Solution:\n    def isPalindrome(self, s):\n        return True\n"
    act(() => workspaceStore.setState({ code: next }))
    await vi.waitFor(() =>
      expect(runner.trace).toHaveBeenLastCalledWith(expect.objectContaining({ code: next }))
    )
  })
})

describe("Walkthrough tab (7.6)", () => {
  it("plays the reference walkthrough and records predictions with the attempt", async () => {
    const { payload, traces } = fixture("valid-palindrome")
    runner.trace.mockImplementation(async (req) =>
      req.args?.[0] === "Top 2 spot" ? traces[1] : traces[0]
    )
    const recordPrediction = vi.fn()
    setWorkspace({
      bottomTab: "walkthrough",
      walkthrough: payload,
      customCases: [{ id: "custom-1", args: ["aba"] }],
    })
    act(() => workspaceStore.setState({ recordPrediction }))
    renderPanel()
    await screen.findByTestId("viz-canvas")
    const player = screen.getByRole("region", { name: "Walkthrough" })
    expect(runner.trace).toHaveBeenCalledWith(expect.objectContaining({ code: payload.code }))
    // Custom cases come after the examples (8.6).
    expect(within(player).getByRole("option", { name: 'Custom 1: "aba"' })).toBeInTheDocument()
    // Predict mode is on for this browser's first walkthrough of the problem.
    expect(screen.getByRole("switch", { name: "Predict mode" })).toHaveAttribute(
      "aria-checked",
      "true"
    )
    fireEvent.keyDown(player, { key: "ArrowRight" })
    await userEvent.click(screen.getByRole("button", { name: /^Pick index 7,/ }))
    expect(recordPrediction).toHaveBeenCalledWith({ id: "predict:0", correct: true })
    expect(screen.queryByText(/next update/)).toBeNull()
  })

  it("explains how to get there before rung 5 or a solve", () => {
    setWorkspace({ bottomTab: "walkthrough" })
    renderPanel()
    expect(screen.getByText(/It opens with hint rung 5/)).toBeInTheDocument()
    expect(runner.trace).not.toHaveBeenCalled()
  })
})

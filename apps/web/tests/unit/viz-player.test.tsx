import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"

import { WalkthroughPlayer, inputPreview } from "@/components/viz/WalkthroughPlayer"
import type { TraceRequest } from "@/lib/runner/types"
import type { Trace } from "@/lib/viz/types"

import { fixture, stepWith, type FixtureSlug } from "./viz-fixtures"

// The walkthrough player (Sections 7.6, 7.7, 8.6) with a fake runner serving real traces.

function fakeRunner(slug: FixtureSlug, override?: (req: TraceRequest) => Trace | Promise<Trace>) {
  const { traces, payload } = fixture(slug)
  return {
    trace: vi.fn(async (req: TraceRequest) => {
      if (override) return override(req)
      const index = payload.inputs.findIndex(
        (input) => JSON.stringify(input.args ?? input.ops) === JSON.stringify(req.args ?? req.ops)
      )
      return traces[Math.max(0, index)] ?? traces[0]
    }),
  }
}

async function renderPlayer(
  slug: FixtureSlug,
  props: Partial<React.ComponentProps<typeof WalkthroughPlayer>> = {}
) {
  const runner = props.runner ?? fakeRunner(slug)
  const view = render(
    <WalkthroughPlayer
      payload={fixture(slug).payload}
      runner={runner}
      predictDefault={false}
      {...props}
    />
  )
  await screen.findByTestId("viz-canvas")
  return { ...view, runner, player: screen.getByTestId("walkthrough-player") }
}

const counter = () => screen.getByTestId("step-counter").textContent
const narration = () => screen.getByTestId("narration")

describe("WalkthroughPlayer", () => {
  it("traces the first example and draws the string with its pointers", async () => {
    const { runner } = await renderPlayer("valid-palindrome")
    const { payload, viz } = fixture("valid-palindrome")
    expect(runner.trace).toHaveBeenCalledWith({
      code: payload.code,
      entry: "isPalindrome",
      args: ["Top spot!"],
      viz,
    })
    expect(counter()).toBe("1 / 29")
    // Step 1 is before `l, r = 0, len(s) - 1` runs: no pointers yet.
    const strip = screen.getByRole("list", { name: "s, 9 characters" })
    expect(within(strip).getByRole("listitem", { name: "index 0, value 'T'" })).toBeVisible()
    fireEvent.keyDown(screen.getByTestId("walkthrough-player"), { key: "ArrowRight" })
    expect(
      within(strip).getByRole("listitem", { name: "index 0, value 'T', pointer l" })
    ).toBeVisible()
    expect(
      within(strip).getByRole("listitem", { name: "index 8, value '!', pointer r" })
    ).toBeVisible()
    fireEvent.keyDown(screen.getByTestId("walkthrough-player"), { key: "Home" })
    expect(narration()).toHaveAttribute("aria-live", "polite")
    expect(screen.getByRole("slider", { name: "Step" })).toHaveAttribute(
      "aria-valuetext",
      "Step 1 of 29"
    )
  })

  it("steps through key moments with the keyboard and narrates each", async () => {
    const { player } = await renderPlayer("valid-palindrome")
    const trace = fixture("valid-palindrome").traces[0]
    const skip = stepWith(trace, "skip_r")
    fireEvent.keyDown(player, { key: "ArrowRight" })
    expect(counter()).toBe(`${skip + 1} / 29`)
    expect(narration()).toHaveTextContent("s[8] is '!', not a letter or digit, so r steps past it")
    expect(screen.getByRole("listitem", { current: "step" })).toHaveTextContent("r -= 1")
    expect(screen.getByText("about to run")).toBeVisible()

    fireEvent.keyDown(player, { key: "End" })
    expect(counter()).toBe("29 / 29")
    expect(screen.getByText("returns")).toBeVisible()
    fireEvent.keyDown(player, { key: "Home" })
    expect(counter()).toBe("1 / 29")

    await userEvent.click(screen.getByRole("button", { name: "Every line" }))
    fireEvent.keyDown(player, { key: "ArrowRight" })
    expect(counter()).toBe("2 / 29")
    fireEvent.keyDown(player, { key: "ArrowLeft" })
    expect(counter()).toBe("1 / 29")
  })

  it("plays and pauses with Space, and sets the speed", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    try {
      const { player } = await renderPlayer("valid-palindrome")
      await userEvent.click(screen.getByRole("button", { name: "2×" }))
      expect(screen.getByRole("button", { name: "2×" })).toHaveAttribute("aria-pressed", "true")
      fireEvent.keyDown(player, { key: " " })
      expect(screen.getByRole("button", { name: "Pause" })).toBeVisible()
      await act(async () => {
        await vi.advanceTimersByTimeAsync(360)
      })
      expect(counter()).not.toBe("1 / 29")
      fireEvent.keyDown(player, { key: " " })
      expect(screen.getByRole("button", { name: "Play" })).toBeVisible()
    } finally {
      vi.useRealTimers()
    }
  })

  it("asks predict questions, grades a clicked cell and records the first answer", async () => {
    const onPrediction = vi.fn()
    const { player } = await renderPlayer("valid-palindrome", {
      predictDefault: true,
      onPrediction,
    })
    expect(screen.getByRole("switch", { name: "Predict mode" })).toHaveAttribute(
      "aria-checked",
      "true"
    )
    fireEvent.keyDown(player, { key: "ArrowRight" })
    const banner = screen.getByTestId("predict-banner")
    expect(banner).toHaveTextContent("Where will r point next?")
    expect(screen.getByRole("button", { name: "Next step" })).toBeDisabled()
    // The cells became buttons; one past the end is offered too.
    await userEvent.click(screen.getByRole("button", { name: /^Pick index 7, value 't'/ }))
    expect(screen.getByTestId("predict-feedback")).toHaveAttribute("data-correct", "true")
    expect(onPrediction).toHaveBeenCalledWith({ id: "predict:0", correct: true })

    await userEvent.click(screen.getByRole("button", { name: /Continue/ }))
    expect(screen.getByTestId("predict-banner")).toHaveTextContent(
      "Do these two characters count as a match?"
    )
    await userEvent.click(screen.getByRole("button", { name: "No" }))
    const feedback = screen.getByTestId("predict-feedback")
    expect(feedback).toHaveAttribute("data-correct", "false")
    expect(feedback).toHaveTextContent("Not quite. You said No; the answer is Yes.")
    expect(onPrediction).toHaveBeenLastCalledWith({ id: "predict:1", correct: false })
    fireEvent.keyDown(player, { key: "Enter" })
    expect(screen.queryByTestId("predict-feedback")).toBeNull()
  })

  it("lets the learner skip a question", async () => {
    const { player } = await renderPlayer("valid-palindrome", { predictDefault: true })
    fireEvent.keyDown(player, { key: "ArrowRight" })
    await userEvent.click(screen.getByRole("button", { name: "Skip" }))
    expect(screen.queryByTestId("predict-banner")).toBeNull()
    expect(screen.getByRole("button", { name: "Next step" })).toBeEnabled()
  })

  it("turns predict mode on for a problem's first walkthrough only", async () => {
    const first = await renderPlayer("binary-search", { predictDefault: undefined })
    await waitFor(() =>
      expect(screen.getByRole("switch", { name: "Predict mode" })).toHaveAttribute(
        "aria-checked",
        "true"
      )
    )
    first.unmount()
    await renderPlayer("binary-search", { predictDefault: undefined })
    expect(screen.getByRole("switch", { name: "Predict mode" })).toHaveAttribute(
      "aria-checked",
      "false"
    )
  })

  it("re-traces when another input is picked", async () => {
    const { runner } = await renderPlayer("valid-palindrome")
    const select = screen.getByLabelText("Input")
    expect(
      within(select)
        .getAllByRole("option")
        .map((o) => o.textContent)
    ).toEqual(['Example 1: "Top spot!"', 'Example 2: "Top 2 spot"', 'Example 3: "?! ."'])
    await userEvent.selectOptions(select, "1")
    await waitFor(() =>
      expect(counter()).toBe(`1 / ${fixture("valid-palindrome").traces[1].steps.length}`)
    )
    expect(runner.trace).toHaveBeenLastCalledWith(expect.objectContaining({ args: ["Top 2 spot"] }))
    fireEvent.keyDown(screen.getByTestId("walkthrough-player"), { key: "End" })
    expect(screen.getByRole("slider", { name: "Step" }).getAttribute("aria-valuetext")).toMatch(
      /^Step \d+ of \d+/
    )
  })

  it("plays a design problem's calls with both stacks", async () => {
    const { player } = await renderPlayer("min-stack")
    fireEvent.keyDown(player, { key: "End" })
    expect(screen.getByRole("list", { name: /^vals, a stack of/ })).toBeVisible()
    expect(screen.getByRole("list", { name: /^mins, a stack of/ })).toBeVisible()
    expect(screen.getByText("in top()")).toBeVisible()
  })

  it("draws hash maps", async () => {
    const { player } = await renderPlayer("two-sum")
    fireEvent.keyDown(player, { key: "End" })
    expect(screen.getByRole("table", { name: /^seen: / })).toBeVisible()
  })
})

describe("Trace my code", () => {
  it("traces the learner's code without the viz config or predict mode", async () => {
    const userCode =
      "class Solution:\n    def isPalindrome(self, s):\n        return s == s[::-1]\n"
    const plain: Trace = {
      steps: [
        {
          line: 3,
          event: "line",
          func: "isPalindrome",
          depth: 1,
          locals: { s: { t: "str", v: "ab", n: 2 } },
          tags: [],
        },
        {
          line: 3,
          event: "return",
          func: "isPalindrome",
          depth: 1,
          locals: { s: { t: "str", v: "ab", n: 2 } },
          tags: [],
          ret: { t: "prim", v: false },
        },
      ],
      result: { t: "prim", v: false },
      error: null,
      truncated: false,
    }
    const runner = fakeRunner("valid-palindrome", () => plain)
    await renderPlayer("valid-palindrome", { userCode, runner, predictDefault: undefined })
    expect(runner.trace).toHaveBeenCalledWith({
      code: userCode,
      entry: "isPalindrome",
      args: ["Top spot!"],
    })
    expect(screen.getByRole("region", { name: "Trace my code" })).toBeVisible()
    expect(screen.queryByRole("switch", { name: "Predict mode" })).toBeNull()
    expect(screen.queryByRole("button", { name: "Key moments" })).toBeNull()
    expect(narration()).toHaveTextContent("Line 3 is about to run: return s == s[::-1]")
    expect(screen.getByRole("list", { name: "s, 2 characters" })).toBeVisible()
  })

  it("shows the error a trace ends with", async () => {
    const failing: Trace = {
      steps: [],
      result: { t: "prim", v: null },
      error: "SyntaxError: invalid syntax (line 2)",
      errorLine: 2,
      truncated: false,
    }
    render(
      <WalkthroughPlayer
        payload={fixture("two-sum").payload}
        userCode={"class Solution:\n  def twoSum(self:\n"}
        runner={fakeRunner("two-sum", () => failing)}
      />
    )
    expect(await screen.findByTestId("trace-error")).toHaveTextContent(
      "Error on line 2: SyntaxError: invalid syntax (line 2)"
    )
  })

  it("offers Try again when tracing fails", async () => {
    let calls = 0
    const runner = fakeRunner("two-sum", () => {
      calls += 1
      if (calls === 1) throw new Error("Python stopped.")
      return fixture("two-sum").traces[0]
    })
    render(
      <WalkthroughPlayer
        payload={fixture("two-sum").payload}
        runner={runner}
        predictDefault={false}
      />
    )
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Could not trace the code: Python stopped."
    )
    await userEvent.click(screen.getByRole("button", { name: /Try again/ }))
    expect(await screen.findByTestId("viz-canvas")).toBeVisible()
  })
})

describe("inputPreview", () => {
  it("shows arguments as JSON, or the number of calls", () => {
    expect(inputPreview({ label: "E", args: [[1, 2], 3] })).toBe("[1,2], 3")
    expect(inputPreview({ label: "E", ops: [["MinStack"], ["push", 1]] })).toBe("2 calls")
    expect(inputPreview({ label: "E", args: ["x".repeat(50)] })).toHaveLength(36)
  })
})

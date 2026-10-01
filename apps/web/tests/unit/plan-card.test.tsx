import { act, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { PlanCard, focusPlanCard } from "@/components/workspace/PlanCard"
import type { PlanCard as PlanValue } from "@/lib/api/schemas"
import { isInPlanCard } from "@/lib/workspace/hotkeys"
import { EMPTY_PLAN } from "@/lib/workspace/plan"
import { workspaceStore } from "@/stores/workspace"

import { HINTS, grade, stubApi } from "./coach-fixtures"
import { renderWithProviders, resetWorkspace, setWorkspace } from "./coach-render"

// The Plan card (Section 7.3).

const PLAN: PlanValue = {
  pattern: "two_pointers_opposite",
  structures: ["array"],
  time: "O(n)",
  space: "O(n)",
  twist: "skip punctuation",
}

beforeEach(() => {
  stubApi()
})

afterEach(() => {
  resetWorkspace()
  vi.unstubAllGlobals()
})

const card = () => screen.getByRole("region", { name: "Plan" })

describe("Plan card", () => {
  it("lists every field, with 3 checks to spend", async () => {
    setWorkspace()
    renderWithProviders(<PlanCard />)
    expect(card()).toHaveTextContent("3 checks left")
    expect(await screen.findByRole("button", { name: /^Pattern/ })).toHaveTextContent(
      "Pick a pattern"
    )
    expect(await screen.findByRole("button", { name: "Hash map (dict)" })).toHaveAttribute(
      "aria-pressed",
      "false"
    )
    expect(screen.getByRole("combobox", { name: "Time" })).toBeInTheDocument()
    expect(screen.getByRole("combobox", { name: "Space" })).toBeInTheDocument()
    expect(screen.getByRole("textbox", { name: "Twist" })).toHaveAttribute(
      "placeholder",
      "What's different about this problem?"
    )
    expect(screen.getByRole("button", { name: /^Check plan/ })).toBeEnabled()
  })

  it("picks a pattern by typing to filter", async () => {
    const user = userEvent.setup()
    setWorkspace()
    renderWithProviders(<PlanCard />)
    const trigger = await screen.findByRole("button", { name: /^Pattern/ })
    await user.click(trigger)
    await user.type(screen.getByRole("combobox", { name: "Filter patterns" }), "two")
    const options = screen.getAllByRole("option")
    expect(options.map((option) => option.textContent)).toEqual(["Two pointers (opposite ends)"])
    await user.click(options[0])
    expect(workspaceStore.getState().plan.pattern).toBe("two_pointers_opposite")
    expect(trigger).toHaveTextContent("Two pointers (opposite ends)")
  })

  it("offers Brute force and Not sure as patterns", async () => {
    const user = userEvent.setup()
    setWorkspace()
    renderWithProviders(<PlanCard />)
    await user.click(await screen.findByRole("button", { name: /^Pattern/ }))
    const other = screen.getByRole("group", { name: "Other" })
    expect(
      within(other)
        .getAllByRole("option")
        .map((o) => o.textContent)
    ).toEqual(["Brute force", "Not sure"])
    await user.click(within(other).getByRole("option", { name: "Not sure" }))
    expect(workspaceStore.getState().plan.pattern).toBe("not_sure")
  })

  it("shows a given pattern as locked (11.6)", () => {
    setWorkspace({
      plan: { ...EMPTY_PLAN, pattern: "two_pointers_opposite" },
      fading: { givenPattern: "two_pointers_opposite", freeRungs: [1, 2] },
    })
    renderWithProviders(<PlanCard />)
    expect(screen.getByText("Given")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: /^Pattern/ })).toBeDisabled()
  })

  it("picks up to 4 structures", async () => {
    const user = userEvent.setup()
    setWorkspace()
    renderWithProviders(<PlanCard />)
    for (const name of ["Array / string", "Hash map (dict)", "Hash set", "Stack"]) {
      await user.click(await screen.findByRole("button", { name }))
    }
    expect(workspaceStore.getState().plan.structures).toEqual([
      "array",
      "hash_map",
      "hash_set",
      "stack",
    ])
    const fifth = screen.getByRole("button", { name: "Queue / deque" })
    expect(fifth).toHaveAttribute("aria-disabled", "true")
    await user.click(fifth)
    expect(workspaceStore.getState().plan.structures).toHaveLength(4)
    expect(screen.getByText("Up to 4. Remove one to pick another.")).toBeVisible()
    await user.click(screen.getByRole("button", { name: "Stack" }))
    expect(workspaceStore.getState().plan.structures).toEqual(["array", "hash_map", "hash_set"])
  })

  it("picks time and space, including Not sure", async () => {
    const user = userEvent.setup()
    setWorkspace()
    renderWithProviders(<PlanCard />)
    await user.click(screen.getByRole("combobox", { name: "Time" }))
    expect(screen.getByRole("option", { name: "O(n log n)" })).toBeInTheDocument()
    expect(screen.getByRole("option", { name: "O(V + E)" })).toBeInTheDocument() // under More
    await user.click(screen.getByRole("option", { name: "O(n)" }))
    await user.click(screen.getByRole("combobox", { name: "Space" }))
    await user.click(screen.getByRole("option", { name: "Not sure" }))
    expect(workspaceStore.getState().plan).toMatchObject({ time: "O(n)", space: "Not sure" })
  })

  it("counts twist characters up to 140", async () => {
    const user = userEvent.setup()
    setWorkspace()
    renderWithProviders(<PlanCard />)
    const twist = screen.getByRole("textbox", { name: "Twist" })
    expect(twist).toHaveAttribute("maxLength", "140")
    await user.type(twist, "skip spaces")
    expect(workspaceStore.getState().plan.twist).toBe("skip spaces")
    expect(twist).toHaveAccessibleDescription("11/140")
  })

  it("checks the plan with the button or Enter in the twist", async () => {
    const user = userEvent.setup()
    const checkPlan = vi.fn(async () => {})
    setWorkspace({ checkPlan })
    renderWithProviders(<PlanCard />)
    await user.click(screen.getByRole("button", { name: /^Check plan/ }))
    await user.type(screen.getByRole("textbox", { name: "Twist" }), "x{Enter}")
    expect(checkPlan).toHaveBeenCalledTimes(2)
  })

  it("shows per-field feedback with nudges, while a field holds what was checked", async () => {
    const user = userEvent.setup()
    setWorkspace({ plan: PLAN, checkedPlan: PLAN, planGrade: grade(), checksLeft: 2 })
    renderWithProviders(<PlanCard />)
    expect(card()).toHaveTextContent("2 checks left")
    const field = (name: string) => card().querySelector(`[data-field="${name}"]`) as HTMLElement
    expect(within(field("pattern")).getByText("Correct")).toBeInTheDocument()
    expect(within(field("space")).getByText("Not quite")).toBeInTheDocument()
    expect(within(field("space")).getByText("Check the space target in the problem.")).toBeVisible()
    expect(within(field("twist")).getByText("Close")).toBeInTheDocument()
    expect(screen.getByRole("status")).toHaveTextContent("Your plan is on track. Time to code it.")
    expect(screen.getByRole("combobox", { name: "Space" })).toHaveAccessibleDescription(
      "Check the space target in the problem."
    )

    await user.type(screen.getByRole("textbox", { name: "Twist" }), " too")
    expect(within(field("twist")).queryByText("Close")).not.toBeInTheDocument()
    expect(screen.getByText("You changed the plan since the last check.")).toBeInTheDocument()
  })

  it("shows the suboptimal approach's note", () => {
    const note = "Works, but uses O(n) extra space."
    setWorkspace({
      plan: PLAN,
      checkedPlan: PLAN,
      planGrade: grade({ correct: false, note }),
    })
    renderWithProviders(<PlanCard />)
    expect(screen.getByRole("status")).toHaveTextContent(
      "Not quite yet. The notes under each field point the way."
    )
    expect(screen.getByText(note)).toBeInTheDocument()
  })

  it("reveals the reference plan once rung 3 is open, read-only", async () => {
    setWorkspace({ plan: PLAN, openedRungs: [HINTS[1], HINTS[2], HINTS[3]] })
    renderWithProviders(<PlanCard />)
    const reference = screen.getByRole("region", { name: "Reference plan" })
    expect(reference).toHaveTextContent("Shown because rung 3 is open.")
    expect(await within(reference).findByText("Two pointers (opposite ends)")).toBeInTheDocument()
    expect(within(reference).getByText("O(1)")).toBeInTheDocument()
    expect(card()).toHaveTextContent("Revealed")
    expect(screen.queryByRole("button", { name: /^Check plan/ })).not.toBeInTheDocument()
    expect(screen.getByRole("textbox", { name: "Twist" })).toBeDisabled()
  })

  it("explains a reveal after the third check", () => {
    const revealed = grade({
      correct: false,
      reveal: { ...HINTS[3].reveal },
    } as Parameters<typeof grade>[0])
    setWorkspace({ plan: PLAN, checkedPlan: PLAN, planGrade: revealed, checksLeft: 0 })
    renderWithProviders(<PlanCard />)
    expect(screen.getByRole("region", { name: "Reference plan" })).toHaveTextContent(
      "Shown after your third check."
    )
  })

  it("announces a plan error", () => {
    setWorkspace({ planError: "Pick a pattern and a time or space target first." })
    renderWithProviders(<PlanCard />)
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Pick a pattern and a time or space target first."
    )
  })

  it("is focusable with ⌘⇧P and owns ⌘↵ while focused (17.4)", async () => {
    setWorkspace()
    renderWithProviders(<PlanCard />)
    await screen.findByRole("button", { name: "Array / string" })
    act(() => {
      expect(focusPlanCard()).toBe(true)
    })
    expect(screen.getByRole("button", { name: /^Pattern/ })).toHaveFocus()
    expect(isInPlanCard(document.activeElement)).toBe(true)
    expect(isInPlanCard(document.body)).toBe(false)
  })
})

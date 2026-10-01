import { screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { CoachPanel } from "@/components/workspace/CoachPanel"
import {
  WalkthroughSlot,
  describe as describeWalkthrough,
} from "@/components/workspace/WalkthroughSlot"
import { WrapUpPanel, nextInOrder } from "@/components/workspace/WrapUpPanel"
import type { ProblemListItem } from "@/lib/api/schemas"
import { formatDuration, hintsUsed, reviewLine } from "@/lib/workspace/wrapup"
import type { WrapUpView } from "@/stores/workspace"

import { WALKTHROUGH, WRAP_UP, stubApi } from "./coach-fixtures"
import { renderWithProviders, resetWorkspace, setWorkspace } from "./coach-render"

// The coach column (7.1), the wrap-up (7.8) and the walkthrough slot (rung 5, 7.6).

const NOW = new Date("2026-09-30T12:00:00Z")

const USER_WRAP: WrapUpView = { guest: false, outcome: "solved_clean", ...WRAP_UP }

const GUEST_WRAP: WrapUpView = {
  guest: true,
  outcome: null,
  patternId: "two_pointers_opposite",
  patternName: null,
  twist: "Skip characters that are not letters or digits.",
  maxRung: 3,
  planRightFirstTime: false,
  timeSeconds: 42,
  related: [],
  nextReviewAt: null,
  nextProblemSlug: null,
}

beforeEach(() => {
  stubApi()
})

afterEach(() => {
  resetWorkspace()
  vi.unstubAllGlobals()
})

describe("coach panel", () => {
  it("shows a skeleton while the attempt loads", () => {
    setWorkspace({ coach: "loading" })
    renderWithProviders(<CoachPanel />)
    expect(screen.getByLabelText("Loading your attempt")).toHaveAttribute("aria-busy", "true")
    expect(screen.queryByRole("region", { name: "Plan" })).not.toBeInTheDocument()
  })

  it("offers a retry when the attempt could not load", async () => {
    const user = userEvent.setup()
    const loadAttempt = vi.fn(async () => {})
    setWorkspace({ coach: "error", loadAttempt })
    renderWithProviders(<CoachPanel />)
    expect(screen.getByRole("alert")).toHaveTextContent("We couldn't load your attempt.")
    await user.click(screen.getByRole("button", { name: "Try again" }))
    expect(loadAttempt).toHaveBeenCalled()
  })

  it("holds the Plan card and the hint ladder, and says when work is saved", () => {
    setWorkspace({ dirty: false })
    renderWithProviders(<CoachPanel />)
    expect(screen.getByRole("region", { name: "Plan" })).toBeInTheDocument()
    expect(screen.getByRole("region", { name: "Hints" })).toBeInTheDocument()
    expect(screen.getByTestId("sync-status")).toHaveTextContent("Saved")
    expect(screen.queryByRole("region", { name: "Save your progress" })).not.toBeInTheDocument()
  })

  it("invites a guest to save their progress", () => {
    setWorkspace({ mode: "guest", guest: true, attemptId: null })
    renderWithProviders(<CoachPanel />)
    const save = screen.getByRole("region", { name: "Save your progress" })
    expect(within(save).getByRole("link", { name: "Sign in" })).toHaveAttribute("href", "/login")
    expect(screen.queryByTestId("sync-status")).not.toBeInTheDocument()
  })

  it("links the pattern page on the first problem of a pattern (11.6)", async () => {
    setWorkspace({ fading: { givenPattern: "two_pointers_opposite", freeRungs: [1, 2] } })
    renderWithProviders(<CoachPanel />)
    const note = screen.getByRole("region", { name: "New pattern" })
    expect(await within(note).findByText("Two pointers (opposite ends)")).toBeInTheDocument()
    expect(within(note).getByRole("link", { name: /Read the pattern page/ })).toHaveAttribute(
      "href",
      "/patterns/two_pointers_opposite"
    )
  })

  it("the plan-first tip checks the plan, or skips it", async () => {
    const user = userEvent.setup()
    const checkPlan = vi.fn(async () => {})
    const skipPlanTip = vi.fn()
    setWorkspace({
      runTip: true,
      checkPlan,
      skipPlanTip,
      plan: { pattern: "hashing", structures: [], time: "O(n)", space: null, twist: "" },
    })
    renderWithProviders(<CoachPanel />)
    const tip = screen
      .getByText("Planning first helps it stick. Check your plan?")
      .closest("[role=status]") as HTMLElement
    expect(tip).toBeVisible()
    await user.click(within(tip).getByRole("button", { name: "Check plan" }))
    expect(checkPlan).toHaveBeenCalled()
    await user.click(within(tip).getByRole("button", { name: "Skip" }))
    expect(skipPlanTip).toHaveBeenCalled()
  })

  it("Start over asks first", async () => {
    const user = userEvent.setup()
    const restart = vi.fn(async () => true)
    setWorkspace({ restart })
    renderWithProviders(<CoachPanel />)
    await user.click(screen.getByRole("button", { name: "Attempt options" }))
    await user.click(await screen.findByRole("menuitem", { name: "Start over" }))
    const dialog = await screen.findByRole("alertdialog", { name: "Start over?" })
    await user.click(within(dialog).getByRole("button", { name: "Start over" }))
    expect(restart).toHaveBeenCalled()
  })

  it("guests cannot end an attempt from the menu", async () => {
    const user = userEvent.setup()
    setWorkspace({ mode: "guest", guest: true, attemptId: null })
    renderWithProviders(<CoachPanel />)
    await user.click(screen.getByRole("button", { name: "Attempt options" }))
    expect(await screen.findByRole("menuitem", { name: "Start over" })).toBeInTheDocument()
    expect(screen.queryByRole("menuitem", { name: "End attempt" })).not.toBeInTheDocument()
  })

  it("shows how an ended attempt went, with Start over", () => {
    setWorkspace({ attemptStatus: "finished", outcome: "gave_up" })
    renderWithProviders(<CoachPanel />)
    expect(
      screen.getByText("Attempt ended. It comes back for review soon, so you can try it fresh.")
    ).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Start over" })).toBeInTheDocument()
  })

  it("offers Try again when a solve could not be saved", async () => {
    const user = userEvent.setup()
    const retrySubmit = vi.fn(async () => {})
    setWorkspace({ submitError: "Your solve isn't saved to your account yet.", retrySubmit })
    renderWithProviders(<CoachPanel />)
    await user.click(within(screen.getByRole("alert")).getByRole("button", { name: "Try again" }))
    expect(retrySubmit).toHaveBeenCalled()
  })

  it("slides the wrap-up over the coach, and brings it back after closing", async () => {
    const user = userEvent.setup()
    setWorkspace({
      attemptStatus: "finished",
      outcome: "solved_clean",
      solved: true,
      wrapUp: USER_WRAP,
      wrapUpOpen: true,
    })
    renderWithProviders(<CoachPanel />)
    const heading = screen.getByRole("heading", { name: "Solved." })
    expect(heading).toHaveFocus()
    await user.click(screen.getByRole("button", { name: "Close the wrap-up" }))
    await waitFor(() =>
      expect(screen.queryByRole("heading", { name: "Solved." })).not.toBeInTheDocument()
    )
    await user.click(screen.getByRole("button", { name: "Show wrap-up" }))
    expect(await screen.findByRole("heading", { name: "Solved." })).toBeInTheDocument()
  })
})

describe("wrap-up panel (7.8)", () => {
  it("names the outcome, time, hints, plan, what to remember and what's next", async () => {
    setWorkspace({ wrapUp: USER_WRAP, wrapUpOpen: true })
    renderWithProviders(<WrapUpPanel wrapUp={USER_WRAP} now={NOW} />)
    const panel = screen.getByRole("region", { name: "Solved." })
    expect(panel).toHaveTextContent("Solved on your own. That's the kind of solve that sticks.")
    expect(panel).toHaveTextContent("Time13 min")
    expect(panel).toHaveTextContent("HintsNo hints")
    expect(panel).toHaveTextContent("PlanRight first time")
    expect(within(panel).getByRole("region", { name: "What to remember" })).toHaveTextContent(
      "Two pointers (opposite ends) + skip characters that are not letters or digits, and compare in lowercase."
    )
    const related = within(panel).getByRole("region", { name: "Related problems" })
    expect(within(related).getByRole("link", { name: "Two Sum II" })).toHaveAttribute(
      "href",
      "/p/two-sum-ii"
    )
    expect(related).toHaveTextContent("Same pointers, a sum decides which moves.")
    expect(panel).toHaveTextContent("We'll bring this back for review in 3 days.")
    expect(await within(panel).findByRole("link", { name: /Next: Two Sum II/ })).toHaveAttribute(
      "href",
      "/p/two-sum-ii"
    )
    expect(within(panel).getByRole("link", { name: /Back to Today/ })).toHaveAttribute(
      "href",
      "/today"
    )
  })

  it("See it run opens the walkthrough", async () => {
    const user = userEvent.setup()
    const showWalkthrough = vi.fn(async () => {})
    setWorkspace({ wrapUp: USER_WRAP, wrapUpOpen: true, showWalkthrough })
    renderWithProviders(<WrapUpPanel wrapUp={USER_WRAP} now={NOW} />)
    await user.click(screen.getByRole("button", { name: "See it run" }))
    expect(showWalkthrough).toHaveBeenCalled()
  })

  it("for a guest: the pattern's name from content, the next problem in order, and sign-in", async () => {
    setWorkspace({ mode: "guest", wrapUp: GUEST_WRAP, wrapUpOpen: true })
    renderWithProviders(<WrapUpPanel wrapUp={GUEST_WRAP} now={NOW} />)
    const panel = screen.getByRole("region", { name: "Solved." })
    expect(panel).toHaveTextContent("Every test passed, the hidden ones too.")
    expect(panel).toHaveTextContent("HintsUp to rung 3, Approach")
    expect(panel).toHaveTextContent("PlanNot first time")
    expect(await within(panel).findByText("Two pointers (opposite ends)")).toBeInTheDocument()
    expect(panel).toHaveTextContent("Sign in and we'll bring this back for review")
    expect(await within(panel).findByRole("link", { name: /Next: Two Sum II/ })).toBeVisible()
    expect(within(panel).getByRole("link", { name: /Save progress/ })).toHaveAttribute(
      "href",
      "/login"
    )
  })

  it("nextInOrder follows the roadmap order", () => {
    const item = (slug: string, order: number) => ({ slug, order }) as ProblemListItem
    const list = [item("c", 3), item("a", 1), item("b", 2)]
    expect(nextInOrder(list, "a")?.slug).toBe("b")
    expect(nextInOrder(list, "c")).toBeNull()
    expect(nextInOrder(undefined, "a")).toBeNull()
  })
})

describe("walkthrough slot (rung 5)", () => {
  it("lists the inputs it will run, and none of the solution", () => {
    renderWithProviders(<WalkthroughSlot payload={WALKTHROUGH} />)
    const slot = screen.getByRole("region", { name: "Step-through walkthrough" })
    const inputs = within(slot).getAllByRole("listitem")
    expect(inputs.map((item) => item.textContent)).toEqual([
      'Example 1s = "Top spot!"',
      'Example 2s = "Top 2 spot"',
    ])
    expect(slot).toHaveTextContent("1 key moment marked on the timeline")
    expect(slot).not.toHaveTextContent("return True")
  })

  it("names a design problem's calls", () => {
    renderWithProviders(
      <WalkthroughSlot
        payload={{
          ...WALKTHROUGH,
          kind: "design",
          entry: "MinStack",
          inputs: [{ label: "Example 1", ops: [["MinStack"], ["push", 3], ["getMin"]] }],
        }}
      />
    )
    expect(screen.getByRole("listitem")).toHaveTextContent("3 calls: MinStack, push, getMin")
  })

  it("mentions predictions when there are any", () => {
    expect(describeWalkthrough(0, 2)).toMatch(/every step\. Before some steps .*\(2 questions\)\.$/)
  })
})

describe("wrap-up copy", () => {
  it("formats durations", () => {
    expect(formatDuration(42)).toBe("42 s")
    expect(formatDuration(754)).toBe("13 min")
    expect(formatDuration(3600)).toBe("1 h")
    expect(formatDuration(3900)).toBe("1 h 5 min")
  })

  it("names the hints used", () => {
    expect(hintsUsed(0)).toBe("No hints")
    expect(hintsUsed(6)).toBe("Up to rung 6, Solution")
  })

  it("counts review days from now, at least one", () => {
    expect(reviewLine("2026-10-01T12:00:00Z", NOW)).toBe(
      "We'll bring this back for review in 1 day."
    )
    expect(reviewLine("2026-10-03T11:00:00Z", NOW)).toBe(
      "We'll bring this back for review in 3 days."
    )
    expect(reviewLine("2026-09-30T13:00:00Z", NOW)).toBe(
      "We'll bring this back for review in 1 day."
    )
  })
})

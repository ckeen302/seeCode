import { screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, describe, expect, it, vi } from "vitest"

import { ProblemsList } from "@/components/problems/ProblemsList"

import { PATTERNS, renderWithClient, stubApi } from "./page-helpers"

const ROWS = [
  {
    slug: "two-sum",
    title: "Two Sum",
    difficulty: "easy",
    order: 1,
    patternId: "hashing",
    status: "solved",
    bestRung: 2,
    lastAttemptAt: null,
  },
  {
    slug: "3sum",
    title: "3Sum",
    difficulty: "medium",
    order: 6,
    status: null,
    bestRung: null,
    lastAttemptAt: null,
  },
]

function stub() {
  return stubApi({
    "GET /content/problems": ({ path }: { path: string }) => path && ROWS,
    "GET /content/patterns": PATTERNS,
  })
}

afterEach(() => vi.unstubAllGlobals())

describe("Problems list filters (Section 6.5)", () => {
  it("searches by title and filters by difficulty and status", async () => {
    stub()
    renderWithClient(<ProblemsList />)
    expect(await screen.findByRole("link", { name: "Two Sum" })).toBeInTheDocument()
    expect(screen.getByText("2 problems · 1 solved")).toBeInTheDocument()
    // Solved problems show their pattern and best hint rung.
    expect(screen.getByText("Hash map and counting")).toBeInTheDocument()
    expect(screen.getAllByText("Best: hint rung 2 of 6").length).toBeGreaterThan(0)

    await userEvent.type(screen.getByLabelText("Search"), "3s")
    expect(screen.queryByRole("link", { name: "Two Sum" })).not.toBeInTheDocument()
    expect(screen.getByText("1 of 2 problems")).toBeInTheDocument()
    await userEvent.clear(screen.getByLabelText("Search"))

    await userEvent.selectOptions(screen.getByLabelText("Difficulty"), "easy")
    expect(screen.queryByRole("link", { name: "3Sum" })).not.toBeInTheDocument()
    await userEvent.selectOptions(screen.getByLabelText("Status"), "new")
    expect(screen.getByText("No problems match these filters.")).toBeInTheDocument()
    await userEvent.click(screen.getByRole("button", { name: "Clear filters" }))
    expect(screen.getByRole("link", { name: "3Sum" })).toBeInTheDocument()
  })

  it("reveals patterns only when asked, and then filters by pattern", async () => {
    const { calls } = stub()
    renderWithClient(<ProblemsList />)
    await screen.findByRole("link", { name: "3Sum" })
    expect(screen.queryByLabelText("Pattern")).not.toBeInTheDocument()
    const toggle = screen.getByRole("button", { name: "Show patterns" })
    expect(toggle).toHaveAttribute("aria-pressed", "false")
    await userEvent.click(toggle)
    expect(toggle).toHaveAttribute("aria-pressed", "true")
    expect(window.localStorage.getItem("seecode:problems:show-patterns")).toBe("true")
    await vi.waitFor(() => expect(calls.length).toBeGreaterThanOrEqual(3))
    await userEvent.selectOptions(screen.getByLabelText("Pattern"), "hashing")
    const table = screen.getByRole("table")
    expect(within(table).getByRole("link", { name: "Two Sum" })).toBeInTheDocument()
    expect(within(table).queryByRole("link", { name: "3Sum" })).not.toBeInTheDocument()
  })
})

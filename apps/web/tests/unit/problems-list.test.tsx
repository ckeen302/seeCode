import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, describe, expect, it, vi } from "vitest"

import { ProblemsList } from "@/components/problems/ProblemsList"
import { furtherStatus } from "@/components/problems/ProblemStatusIcon"
import { attemptKey } from "@/lib/workspace/storage"

const ROWS = [
  {
    slug: "binary-search",
    title: "Binary Search",
    difficulty: "easy",
    order: 13,
    status: null,
    bestRung: null,
    lastAttemptAt: null,
  },
  {
    slug: "two-sum",
    title: "Two Sum",
    difficulty: "easy",
    order: 1,
    status: "solved",
    bestRung: 2,
    lastAttemptAt: "2026-09-30T10:00:00Z",
  },
  {
    slug: "valid-palindrome",
    title: "Valid Palindrome",
    difficulty: "medium",
    order: 4,
    status: null,
    bestRung: null,
    lastAttemptAt: null,
  },
]

function renderList() {
  return render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <ProblemsList />
    </QueryClientProvider>
  )
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe("Problems list (Section 6.5, basic)", () => {
  it("lists problems in roadmap order with difficulty and status, linking to the Workspace", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json(ROWS))
    )
    // This browser attempted Valid Palindrome (seecode:attempt:{slug}).
    window.localStorage.setItem(
      attemptKey("valid-palindrome"),
      JSON.stringify({
        v: 1,
        code: "x",
        customCases: [],
        solved: false,
        startedAt: "t",
        updatedAt: "t",
        solvedAt: null,
      })
    )
    renderList()
    const links = await screen.findAllByRole("link")
    expect(links.map((link) => [link.textContent, link.getAttribute("href")])).toEqual([
      ["Two Sum", "/p/two-sum"],
      ["Valid Palindrome", "/p/valid-palindrome"],
      ["Binary Search", "/p/binary-search"],
    ])
    const rows = screen.getAllByRole("row").slice(1) // after the header row
    expect(within(rows[0]).getByText("Solved")).toBeInTheDocument()
    expect(within(rows[1]).getByText("Attempted")).toBeInTheDocument()
    expect(within(rows[1]).getByText("Medium")).toBeInTheDocument()
    expect(within(rows[2]).getByText("Not started")).toBeInTheDocument()
  })

  it("offers a retry when the list cannot load", async () => {
    const fetch = vi.fn(async () => new Response("down", { status: 503 }))
    vi.stubGlobal("fetch", fetch)
    renderList()
    expect(await screen.findByRole("alert")).toHaveTextContent("We couldn't load the problems.")
    fetch.mockImplementation(async () => Response.json(ROWS))
    await userEvent.click(screen.getByRole("button", { name: "Try again" }))
    expect(await screen.findByRole("link", { name: "Two Sum" })).toBeInTheDocument()
  })

  it("never shows less progress than the API or this browser knows", () => {
    expect(furtherStatus(null, null)).toBe("new")
    expect(furtherStatus("new", "attempted")).toBe("attempted")
    expect(furtherStatus("mastered", "solved")).toBe("mastered")
    expect(furtherStatus(null, "solved")).toBe("solved")
  })
})

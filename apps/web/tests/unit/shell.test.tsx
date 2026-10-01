import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, describe, expect, it, vi } from "vitest"

import { CommandPaletteProvider } from "@/components/shell/CommandPalette"
import { NAV_ITEMS, SidebarContent, isActivePath } from "@/components/shell/Sidebar"
import { firstName, greetingFor } from "@/components/today/TodayView"
import { TooltipProvider } from "@/components/ui/tooltip"

const router = vi.hoisted(() => ({ replace: vi.fn(), refresh: vi.fn(), push: vi.fn() }))

vi.mock("next/navigation", () => ({
  usePathname: () => "/drills/session",
  useRouter: () => router,
}))

// What the API answers for the palette's two queries.
const CONTENT: Record<string, unknown> = {
  "/content/problems": [
    {
      slug: "valid-palindrome",
      title: "Valid Palindrome",
      difficulty: "easy",
      order: 4,
      status: null,
      bestRung: null,
      lastAttemptAt: null,
    },
    {
      slug: "two-sum",
      title: "Two Sum",
      difficulty: "easy",
      order: 1,
      status: null,
      bestRung: null,
      lastAttemptAt: null,
    },
  ],
  "/content/patterns": [
    {
      id: "hashing",
      family: "hashing",
      name: "Hash map and counting",
      idea: "Remember what you've seen.",
      problemCount: 1,
    },
  ],
}

function stubContentApi() {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      const path = new URL(url).pathname.replace(/^\/api\/v1/, "")
      return new Response(JSON.stringify(CONTENT[path] ?? null), {
        status: path in CONTENT ? 200 : 404,
        headers: { "Content-Type": "application/json" },
      })
    })
  )
}

afterEach(() => {
  vi.unstubAllGlobals()
})

function renderShell(ui: React.ReactNode) {
  return render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <TooltipProvider>
        <CommandPaletteProvider>{ui}</CommandPaletteProvider>
      </TooltipProvider>
    </QueryClientProvider>
  )
}

describe("sidebar", () => {
  it("lists the Section 5 destinations in order", () => {
    expect(NAV_ITEMS.map((item) => item.label)).toEqual([
      "Today",
      "Roadmap",
      "Problems",
      "Walkthroughs",
      "Drills",
      "Review",
      "Stats",
    ])
    expect(NAV_ITEMS.find((item) => item.label === "Walkthroughs")?.href).toBe("/viz")
  })

  it("marks the current section, including nested pages", () => {
    expect(isActivePath("/drills/session", "/drills")).toBe(true)
    expect(isActivePath("/drillsx", "/drills")).toBe(false)
    renderShell(<SidebarContent variant="sheet" reviewsDue={3} />)
    const nav = screen.getByRole("navigation", { name: "Main" })
    expect(within(nav).getByRole("link", { name: "Drills" })).toHaveAttribute(
      "aria-current",
      "page"
    )
    expect(within(nav).getByRole("link", { name: "Today" })).not.toHaveAttribute("aria-current")
    expect(within(nav).getByRole("link", { name: /Review/ })).toHaveTextContent("3 due")
  })

  it("opens the command palette from the search button", async () => {
    stubContentApi()
    renderShell(<SidebarContent variant="sheet" />)
    await userEvent.click(screen.getByRole("button", { name: "Search problems and patterns" }))
    expect(await screen.findByPlaceholderText("Search problems and patterns…")).toBeVisible()
    expect(await screen.findByRole("option", { name: /Valid Palindrome/ })).toBeInTheDocument()
  })

  it("offers sign-in when nobody is signed in", async () => {
    renderShell(<SidebarContent variant="sheet" />)
    expect(await screen.findByRole("link", { name: "Sign in" })).toHaveAttribute("href", "/login")
  })
})

describe("command palette (⌘K)", () => {
  it("lists problems in roadmap order, then patterns, without giving patterns away", async () => {
    stubContentApi()
    renderShell(<SidebarContent variant="sheet" />)
    await userEvent.click(screen.getByRole("button", { name: "Search problems and patterns" }))
    await screen.findByRole("option", { name: /Two Sum/ })
    const options = screen.getAllByRole("option").map((option) => option.textContent)
    expect(options).toEqual([
      "Two SumEasy",
      "Valid PalindromeEasy",
      "Hash map and counting1 problem",
    ])
  })

  it("filters as you type and opens the chosen problem", async () => {
    stubContentApi()
    renderShell(<SidebarContent variant="sheet" />)
    await userEvent.click(screen.getByRole("button", { name: "Search problems and patterns" }))
    await screen.findByRole("option", { name: /Two Sum/ })
    await userEvent.keyboard("palin")
    expect(screen.getAllByRole("option").map((option) => option.textContent)).toEqual([
      "Valid PalindromeEasy",
    ])
    await userEvent.keyboard("{Enter}")
    expect(router.push).toHaveBeenCalledWith("/p/valid-palindrome")
    expect(screen.queryByPlaceholderText("Search problems and patterns…")).not.toBeInTheDocument()
  })

  it("says so when nothing matches, and opens patterns", async () => {
    stubContentApi()
    renderShell(<SidebarContent variant="sheet" />)
    await userEvent.click(screen.getByRole("button", { name: "Search problems and patterns" }))
    await screen.findByRole("option", { name: /Two Sum/ })
    await userEvent.keyboard("zzzz")
    expect(screen.getByText("No matches.")).toBeInTheDocument()
    await userEvent.clear(screen.getByPlaceholderText("Search problems and patterns…"))
    await userEvent.keyboard("hash map")
    await userEvent.keyboard("{Enter}")
    expect(router.push).toHaveBeenCalledWith("/patterns/hashing")
  })
})

describe("Today header", () => {
  it("greets by time of day", () => {
    expect(greetingFor(5)).toBe("Good morning")
    expect(greetingFor(11)).toBe("Good morning")
    expect(greetingFor(12)).toBe("Good afternoon")
    expect(greetingFor(17)).toBe("Good afternoon")
    expect(greetingFor(18)).toBe("Good evening")
    expect(greetingFor(2)).toBe("Good evening")
  })

  it("uses the first name, or a friendly fallback", () => {
    expect(firstName("Ada Lovelace")).toBe("Ada")
    expect(firstName("  Grace  ")).toBe("Grace")
    expect(firstName(null)).toBe("there")
    expect(firstName("")).toBe("there")
  })
})

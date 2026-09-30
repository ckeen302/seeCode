import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"

import { CommandPaletteProvider } from "@/components/shell/CommandPalette"
import { NAV_ITEMS, SidebarContent, isActivePath } from "@/components/shell/Sidebar"
import { firstName, greetingFor } from "@/components/today/TodayView"
import { TooltipProvider } from "@/components/ui/tooltip"

vi.mock("next/navigation", () => ({
  usePathname: () => "/drills/session",
  useRouter: () => ({ replace: vi.fn(), refresh: vi.fn(), push: vi.fn() }),
}))

function renderShell(ui: React.ReactNode) {
  return render(
    <QueryClientProvider client={new QueryClient()}>
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
      "Drills",
      "Review",
      "Stats",
    ])
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
    renderShell(<SidebarContent variant="sheet" />)
    await userEvent.click(screen.getByRole("button", { name: "Search problems and patterns" }))
    expect(await screen.findByPlaceholderText("Search problems and patterns…")).toBeVisible()
    expect(screen.getByText("No results yet.")).toBeInTheDocument()
  })

  it("offers sign-in when nobody is signed in", async () => {
    renderShell(<SidebarContent variant="sheet" />)
    expect(await screen.findByRole("link", { name: "Sign in" })).toHaveAttribute("href", "/login")
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

import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { render, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { WalkthroughGallery } from "@/components/viz/WalkthroughGallery"

import { fixture } from "./viz-fixtures"

// The public gallery (/viz): the problem list and each walkthrough through public endpoints.

const search = { value: new URLSearchParams() }
const replace = vi.fn()
vi.mock("next/navigation", () => ({
  useSearchParams: () => search.value,
  usePathname: () => "/viz",
  useRouter: () => ({ replace }),
}))

const trace = vi.fn(async () => fixture("binary-search").traces[0])
vi.mock("@/lib/runner/runner", () => ({
  getRunner: () => ({ trace, subscribe: () => () => {}, getStatus: () => "ready" }),
}))

const PROBLEMS = [
  {
    slug: "two-sum",
    title: "Two Sum",
    difficulty: "easy",
    order: 1,
    status: null,
    bestRung: null,
    lastAttemptAt: null,
  },
  {
    slug: "binary-search",
    title: "Binary Search",
    difficulty: "easy",
    order: 13,
    status: null,
    bestRung: null,
    lastAttemptAt: null,
  },
]

function stubApi() {
  const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input)
    if (url.endsWith("/content/problems")) return Response.json(PROBLEMS)
    if (url.endsWith("/guest/problems/binary-search/hints/5")) {
      return Response.json({ rung: 5, walkthrough: fixture("binary-search").payload })
    }
    return Response.json({ error: { code: "not_found", message: "Not found." } }, { status: 404 })
  })
  vi.stubGlobal("fetch", fetchMock)
  return fetchMock
}

function renderGallery() {
  return render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <WalkthroughGallery />
    </QueryClientProvider>
  )
}

beforeEach(() => {
  search.value = new URLSearchParams()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe("Walkthrough gallery", () => {
  it("lists every Workspace problem and plays the chosen one's walkthrough", async () => {
    const fetchMock = stubApi()
    search.value = new URLSearchParams("p=binary-search")
    renderGallery()
    expect(await screen.findByRole("heading", { name: "Walkthroughs", level: 1 })).toBeVisible()
    const links = await screen.findAllByRole("link", { name: /Two Sum|Binary Search/ })
    expect(links.map((link) => link.getAttribute("href"))).toEqual([
      "/viz?p=two-sum",
      "/viz?p=binary-search",
    ])
    expect(screen.getByRole("link", { name: /Binary Search/ })).toHaveAttribute(
      "aria-current",
      "page"
    )
    expect(await screen.findByTestId("viz-canvas")).toBeVisible()
    expect(screen.getByRole("heading", { name: "Binary Search", level: 2 })).toBeVisible()
    expect(screen.getByRole("link", { name: /Solve it/ })).toHaveAttribute(
      "href",
      "/p/binary-search"
    )
    const urls = fetchMock.mock.calls.map(([url]) => String(url))
    expect(urls.some((url) => url.endsWith("/guest/problems/binary-search/hints/5"))).toBe(true)
    expect(trace).toHaveBeenCalled()
  })

  it("reports a walkthrough that does not load", async () => {
    stubApi()
    renderGallery() // the first problem, two-sum, answers 404
    expect(await screen.findByText("Could not load this walkthrough.")).toBeVisible()
  })
})

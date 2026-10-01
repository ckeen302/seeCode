import { act, fireEvent, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import {
  PATTERNS,
  PROBLEM_CARD,
  PROFILE,
  STRUCTURES,
  USER_ID,
  planGrade,
  renderWithClient,
  stubApi,
} from "./page-helpers"

const auth = vi.hoisted(() => ({
  current: { status: "signed_in", user: { id: "", email: null, name: null, provider: "dev" } } as {
    status: string
    user: unknown
  },
  signOut: vi.fn(async () => {}),
}))
const nav = vi.hoisted(() => ({
  router: { push: vi.fn(), replace: vi.fn(), refresh: vi.fn() },
  search: new URLSearchParams(),
}))

vi.mock("@/lib/auth/session", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/auth/session")>()),
  useAuth: () => auth.current,
  getAuthHeaders: async () => ({}),
  refreshSession: async () => false,
  signOut: auth.signOut,
}))
vi.mock("next/navigation", () => ({
  usePathname: () => "/today",
  useRouter: () => nav.router,
  useSearchParams: () => nav.search,
}))

import { DrillSession } from "@/components/drills/DrillSession"
import { PatternPage } from "@/components/patterns/PatternPage"
import { ReviewSession } from "@/components/review/ReviewSession"
import { RoadmapView } from "@/components/roadmap/RoadmapView"
import { SettingsView } from "@/components/settings/SettingsView"
import { StatsView } from "@/components/stats/StatsView"
import { TodayView } from "@/components/today/TodayView"
import { LiveDemo } from "@/components/landing/LiveDemo"

function signIn() {
  auth.current = {
    status: "signed_in",
    user: { id: USER_ID, email: null, name: null, provider: "dev" },
  }
}
function signOutState() {
  auth.current = { status: "signed_out", user: null }
}

beforeEach(() => {
  signIn()
  nav.search = new URLSearchParams()
})
afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

const WEEK = { solved: 2, drills: 14, reviews: 3, medianPlanSeconds: 42 }
const TODAY = {
  greetingName: "Ada",
  streak: 4,
  reviewsDue: 3,
  reviewPatterns: ["hashing", "two_pointers_opposite"],
  continue: {
    slug: "two-sum",
    title: "Two Sum",
    difficulty: "easy",
    patternId: null,
    inProgress: true,
    lastActiveAt: new Date(Date.now() - 2 * 3600_000).toISOString(),
  },
  drill: {
    patternId: "hashing",
    patternName: "Hash map and counting",
    reason: "You needed hints.",
  },
  week: WEEK,
  start: null,
}

describe("Today (Sections 6.2, 11.8)", () => {
  it("shows reviews, the next problem, a drill and this week, with the streak", async () => {
    stubApi({ "GET /today": TODAY, "GET /me": PROFILE, "GET /content/patterns": PATTERNS })
    renderWithClient(<TodayView />)
    expect(await screen.findByRole("heading", { name: "3 reviews waiting" })).toBeInTheDocument()
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(/, Ada$/)
    expect(screen.getByText("4 days streak")).toBeInTheDocument()
    expect(screen.getByRole("link", { name: /Start review/ })).toHaveAttribute("href", "/review")
    expect(screen.getByRole("link", { name: /Resume/ })).toHaveAttribute("href", "/p/two-sum")
    expect(screen.getByText(/Last time: 2 hours ago/)).toBeInTheDocument()
    expect(screen.getByRole("link", { name: /Start drill/ })).toHaveAttribute(
      "href",
      "/drills/session?mode=recognition&pattern=hashing"
    )
    expect(await screen.findByText("Two pointers (opposite ends)")).toBeInTheDocument()
    expect(screen.getByText("42 s")).toBeInTheDocument()
  })

  it("gives a brand-new user one card: start with the first pattern", async () => {
    stubApi({
      "GET /today": {
        ...TODAY,
        reviewsDue: 0,
        streak: 0,
        start: { patternId: "hashing", patternName: "Hash map and counting" },
      },
      "GET /me": PROFILE,
      "GET /content/patterns": PATTERNS,
    })
    renderWithClient(<TodayView />)
    expect(
      await screen.findByRole("heading", {
        name: "Start with your first pattern: Hash map and counting",
      })
    ).toBeInTheDocument()
    expect(screen.getByRole("link", { name: /Open the pattern/ })).toHaveAttribute(
      "href",
      "/patterns/hashing"
    )
    expect(screen.queryByText("Two Sum")).not.toBeInTheDocument()
    expect(screen.queryByRole("link", { name: /Start drill/ })).not.toBeInTheDocument()
  })

  it("offers a retry when Today cannot load", async () => {
    let fail = true
    stubApi({
      "GET /today": () => (fail ? new Response("x", { status: 503 }) : TODAY),
      "GET /me": PROFILE,
      "GET /content/patterns": PATTERNS,
    })
    renderWithClient(<TodayView />)
    expect(await screen.findByRole("alert")).toHaveTextContent("We couldn't load your day")
    fail = false
    await userEvent.click(screen.getByRole("button", { name: "Try again" }))
    expect(await screen.findByRole("heading", { name: "3 reviews waiting" })).toBeInTheDocument()
  })

  it("asks a signed-out visitor to sign in", () => {
    signOutState()
    stubApi({})
    renderWithClient(<TodayView />)
    expect(screen.getByRole("link", { name: /Continue to sign in/ })).toHaveAttribute(
      "href",
      "/login?next=%2Ftoday"
    )
  })
})

const ROADMAP = {
  patterns: [
    {
      id: "hashing",
      name: "Hash map and counting",
      family: "hashing",
      x: 0,
      y: 1,
      prereqs: [],
      problemCount: 3,
      state: "in_progress",
      progress: { solved: 1, mastered: 0 },
    },
    {
      id: "two_pointers_opposite",
      name: "Two pointers (opposite ends)",
      family: "two_pointers",
      x: 1,
      y: 0,
      prereqs: ["hashing"],
      problemCount: 3,
      state: "locked",
      progress: { solved: 0, mastered: 0 },
    },
  ],
  unlockRule: { solvedInPrereq: 2 },
}

describe("Roadmap (Section 6.3)", () => {
  it("draws every pattern with its state, progress and unlock rule", async () => {
    stubApi({ "GET /content/roadmap": ROADMAP })
    renderWithClient(<RoadmapView />)
    const graph = await screen.findByTestId("roadmap-graph")
    const hashing = within(graph).getByRole("link", { name: /^Hash map and counting/ })
    expect(hashing).toHaveAttribute("href", "/patterns/hashing")
    expect(hashing).toHaveAccessibleName("Hash map and counting: In progress, 1 of 3 solved.")
    expect(within(graph).getByRole("link", { name: /^Two pointers/ })).toHaveAccessibleName(
      "Two pointers (opposite ends): Locked, 0 of 3 solved. Unlocks after you solve 2 problems in Hash map and counting."
    )
    expect(screen.getByText("Next up")).toBeInTheDocument()
    expect(graph.querySelectorAll("path[data-edge]")).toHaveLength(1)
  })

  it("shows signed-out visitors every pattern and a sign-in banner", async () => {
    signOutState()
    stubApi({
      "GET /content/roadmap": {
        ...ROADMAP,
        patterns: ROADMAP.patterns.map((p) => ({ ...p, state: "available", progress: null })),
      },
    })
    renderWithClient(<RoadmapView />)
    expect(await screen.findByText(/Sign in to track progress/)).toBeInTheDocument()
    expect(screen.getByRole("link", { name: "Get started free" })).toBeInTheDocument()
    expect(screen.queryByText("Next up")).not.toBeInTheDocument()
  })
})

const PATTERN_VIEW = {
  id: "hashing",
  family: "hashing",
  name: "Hash map and counting",
  idea: "Remember what you've seen.",
  explanation: "A `dict` remembers.\n\nSecond paragraph.",
  signals: [{ phrase: "how many times", meaning: "Count it." }],
  template:
    "def solve(a):\n    seen = {}  # SETUP: map\n    for x in a:  # LOOP\n    return 0  # RETURN\n",
  slots: [
    { id: "setup", label: "Pick the map", prompt: "What is the key?" },
    { id: "loop", label: "One pass", prompt: "What do you visit?" },
    { id: "return", label: "Answer", prompt: "What do you return?" },
  ],
  variations: [{ name: "Seen set", line: "Add each item to a set." }],
  mistakes: ["Storing x before looking up its partner."],
  demo: {
    code: "class Solution:\n    def demo(self, nums):\n        return []\n",
    entry: "demo",
    args: [[4, 7, 1]],
    viz: { primary: "nums", events: [{ id: "check", at: "check", label: "look up" }] },
  },
  toolkit: ["counter"],
  toolkitCards: [
    {
      id: "counter",
      tool: "Counter",
      phrases: ["how many times"],
      example: 'Counter("aab")',
      patterns: ["hashing"],
    },
  ],
  problemCount: 2,
  state: "in_progress",
  progress: { solved: 1, mastered: 0 },
  problems: [
    {
      slug: "two-sum",
      title: "Two Sum",
      difficulty: "easy",
      order: 1,
      status: "solved",
      twist: "Look up the partner first.",
    },
    { slug: "valid-anagram", title: "Valid Anagram", difficulty: "easy", order: 2, status: "new" },
  ],
}

describe("Pattern page (Section 6.4)", () => {
  it("shows the idea, template slots, problems and toolkit; twists only once solved", async () => {
    stubApi({ "GET /content/patterns/hashing": PATTERN_VIEW, "GET /content/roadmap": ROADMAP })
    renderWithClient(<PatternPage patternId="hashing" />)
    expect(
      await screen.findByRole("heading", { level: 1, name: "Hash map and counting" })
    ).toBeInTheDocument()
    expect(screen.getByText("1 of 2 solved")).toBeInTheDocument()
    expect(screen.getByRole("link", { name: /Continue/ })).toHaveAttribute(
      "href",
      "/p/valid-anagram"
    )
    // Hovering a slot lights up its line in the template.
    await userEvent.hover(screen.getByRole("button", { name: /Pick the map/ }))
    expect(document.querySelector('[data-slot="setup"]')).toHaveClass("bg-window")
    // Solved problem: twist behind "Show twist". Unsolved: no twist at all.
    expect(screen.queryByText("Look up the partner first.")).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole("button", { name: "Show twist of Two Sum" }))
    expect(screen.getByText("Look up the partner first.")).toBeInTheDocument()
    expect(screen.getByText("Solve it to see the twist")).toBeInTheDocument()
    expect(screen.getByText("Storing x before looking up its partner.")).toBeInTheDocument()
    expect(screen.getByRole("link", { name: /Watch it run/ })).toHaveAttribute(
      "href",
      "/viz?pattern=hashing"
    )
  })

  it("says so when the pattern does not exist", async () => {
    stubApi({ "GET /content/roadmap": ROADMAP })
    renderWithClient(<PatternPage patternId="nope" />)
    expect(await screen.findByRole("heading", { name: "Pattern not found" })).toBeInTheDocument()
  })
})

const SUMMARY = {
  sessionId: "s1",
  mode: "recognition",
  size: 2,
  answered: 2,
  correct: 1,
  accuracy: 0.5,
  medianSeconds: 12,
  overtime: 0,
  fields: {
    pattern: { correct: 2, total: 2 },
    structures: { correct: 1, total: 2 },
    time: { correct: 2, total: 2 },
    space: { correct: 1, total: 2 },
    twist: { correct: 0, total: 0 },
  },
  patterns: [
    { patternId: "hashing", patternName: "Hash map and counting", answered: 2, correct: 1 },
  ],
  missed: [
    {
      cardId: "c2",
      slug: "valid-anagram",
      title: "Valid Anagram",
      patternId: "hashing",
      inReview: true,
    },
  ],
  addMissedToReview: true,
  startedAt: "2026-10-01T10:00:00Z",
  finishedAt: "2026-10-01T10:05:00Z",
}

const CONTENT_ROUTES = {
  "GET /me": PROFILE,
  "GET /content/patterns": PATTERNS,
  "GET /content/structures": STRUCTURES,
  "GET /content/toolkit": [],
}

describe("Drill session (Section 6.6)", () => {
  it("runs recognition cards with Enter, shows feedback, and ends on the summary", async () => {
    nav.search = new URLSearchParams("mode=recognition&pattern=hashing")
    const { calls } = stubApi({
      ...CONTENT_ROUTES,
      "POST /drills/sessions": {
        sessionId: "s1",
        cards: [
          { id: "c1", mode: "recognition", ...PROBLEM_CARD },
          { id: "c2", mode: "recognition", ...PROBLEM_CARD, slug: "group-anagrams" },
        ],
      },
      "POST /drills/sessions/s1/answers": ({ body }: { body: unknown }) => {
        const correct = (body as { cardId: string }).cardId === "c1"
        return {
          correct,
          planGrade: planGrade(correct),
          signals: [
            { phrase: "in any order", meaning: "Order doesn't matter.", pointsTo: "hashing" },
          ],
          title: "Valid Anagram",
        }
      },
      "POST /drills/sessions/s1/finish": ({ body }: { body: unknown }) => ({
        ...SUMMARY,
        addMissedToReview:
          (body as { addMissedToReview?: boolean } | undefined)?.addMissedToReview ?? true,
      }),
    })
    renderWithClient(<DrillSession />)
    expect(await screen.findByText("1 / 2")).toBeInTheDocument()
    expect(calls.find((c) => c.path === "/drills/sessions")?.body).toEqual({
      mode: "recognition",
      size: 10,
      patternFilter: "hashing",
    })
    await userEvent.click(await screen.findByText("Hash map and counting"))
    await userEvent.click(screen.getByText("Counter / frequency array"))
    await userEvent.keyboard("{Enter}")
    expect(await screen.findByText("Right plan.")).toBeInTheDocument()
    const answer = calls.find((c) => c.path.endsWith("/answers"))?.body as {
      answer: { pattern: string; structures: string[] }
    }
    expect(answer.answer).toMatchObject({ pattern: "hashing", structures: ["counter"] })
    // The signal phrase lights up in the statement; the title is revealed.
    expect(screen.getAllByText("in any order")[0].tagName).toBe("MARK")
    expect(screen.getAllByText("Valid Anagram").length).toBeGreaterThan(0)
    await userEvent.click(screen.getByRole("button", { name: /Next card/ }))
    expect(await screen.findByText("2 / 2")).toBeInTheDocument()
    await userEvent.click(screen.getByRole("button", { name: /Check plan/ }))
    expect(await screen.findByText(/Not quite. Here's the plan that fits./)).toBeInTheDocument()
    await userEvent.click(screen.getByRole("button", { name: /See results/ }))
    expect(await screen.findByRole("heading", { name: "Good session." })).toBeInTheDocument()
    expect(screen.getByText("50%")).toBeInTheDocument()
    const toggle = screen.getByRole("switch", { name: "Add missed to review" })
    expect(toggle).toHaveAttribute("aria-checked", "true")
    await userEvent.click(toggle)
    await waitFor(() => expect(toggle).toHaveAttribute("aria-checked", "false"))
    expect(calls.at(-1)).toMatchObject({
      path: "/drills/sessions/s1/finish",
      body: { addMissedToReview: false },
    })
  })

  it("picks toolkit options with number keys after asking for them", async () => {
    nav.search = new URLSearchParams("mode=toolkit")
    const { calls } = stubApi({
      ...CONTENT_ROUTES,
      "POST /drills/sessions": {
        sessionId: "s2",
        cards: [
          {
            id: "c1",
            mode: "toolkit",
            toolkitId: "lower",
            phrase: "ignore letter case",
            options: [".split()", ".lower()", "Counter", "sorted()"],
          },
        ],
      },
      "POST /drills/sessions/s2/answers": {
        correct: true,
        tool: ".lower()",
        example: '"Ab".lower()',
      },
    })
    renderWithClient(<DrillSession />)
    expect(await screen.findByText("“ignore letter case”")).toBeInTheDocument()
    await userEvent.click(screen.getByRole("button", { name: "Show options now" }))
    act(() => {
      ;(document.activeElement as HTMLElement | null)?.blur()
    })
    await userEvent.keyboard("2")
    expect(await screen.findByText("Right tool.")).toBeInTheDocument()
    expect(calls.find((c) => c.path.endsWith("/answers"))?.body).toMatchObject({
      cardId: "c1",
      answer: { tool: ".lower()" },
    })
  })

  it("explains a drill that cannot start", async () => {
    nav.search = new URLSearchParams("mode=recognition&pattern=stack")
    stubApi({
      ...CONTENT_ROUTES,
      "POST /drills/sessions": new Response(
        JSON.stringify({
          error: {
            code: "validation_error",
            message: "patternFilter: this pattern is still locked.",
          },
        }),
        { status: 422 }
      ),
    })
    renderWithClient(<DrillSession />)
    expect(await screen.findByText("This drill can't start yet")).toBeInTheDocument()
    expect(screen.getByRole("link", { name: "Choose another drill" })).toHaveAttribute(
      "href",
      "/drills"
    )
  })
})

describe("Review (Section 6.7)", () => {
  it("asks for a self-rating on a borderline plan, then shows when items come back", async () => {
    const tomorrow = new Date(Date.now() + 86_400_000).toISOString()
    const { calls } = stubApi({
      ...CONTENT_ROUTES,
      "GET /review/queue": [
        {
          itemId: "i1",
          kind: "problem_plan",
          resolve: false,
          problem: PROBLEM_CARD,
          hasWorkspace: true,
        },
        {
          itemId: "i2",
          kind: "toolkit",
          resolve: false,
          toolkit: {
            toolkitId: "lower",
            phrase: "ignore letter case",
            options: ["a", "b", "c", "d"],
          },
        },
        {
          itemId: "i3",
          kind: "problem_plan",
          resolve: true,
          problem: { ...PROBLEM_CARD, slug: "two-sum" },
          hasWorkspace: true,
        },
      ],
      "POST /review/i1/answer": {
        correct: false,
        needsSelfRating: true,
        planGrade: planGrade(false, 0.6),
        title: "Valid Anagram",
        signals: [],
      },
      "POST /review/i1/rate": { grade: "hard", nextDueAt: tomorrow },
      "POST /review/i2/answer": {
        correct: true,
        needsSelfRating: false,
        grade: "good",
        nextDueAt: tomorrow,
        tool: ".lower()",
        example: '"A".lower()',
      },
    })
    renderWithClient(<ReviewSession />)
    expect(await screen.findByText("1 / 3")).toBeInTheDocument()
    await userEvent.click(await screen.findByText("Hash map and counting"))
    await userEvent.click(screen.getByRole("button", { name: /Check plan/ }))
    expect(await screen.findByText("Close call. How did that feel?")).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: /^Next/ })).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole("button", { name: /Hard/ }))
    expect(await screen.findByText("Next review tomorrow.")).toBeInTheDocument()
    expect(calls.find((c) => c.path === "/review/i1/rate")?.body).toEqual({ rating: "hard" })
    await userEvent.click(screen.getByRole("button", { name: /^Next/ }))

    expect(await screen.findByText("2 / 3")).toBeInTheDocument()
    await userEvent.type(screen.getByLabelText("Type the tool"), ".lower(){Enter}")
    expect(await screen.findByText("Right tool.")).toBeInTheDocument()
    await userEvent.click(screen.getByRole("button", { name: /^Next/ }))

    // A re-solve item sends the user to the Workspace (or lets them skip).
    expect(await screen.findByRole("link", { name: /Re-solve in Workspace/ })).toHaveAttribute(
      "href",
      "/p/two-sum"
    )
    await userEvent.click(screen.getByRole("button", { name: /Skip for now/ }))
    expect(await screen.findByRole("heading", { name: "2 reviews done." })).toBeInTheDocument()
    expect(screen.getByText("Coming back: 2 items tomorrow.")).toBeInTheDocument()
  })

  it("says when everything is caught up", async () => {
    stubApi({ ...CONTENT_ROUTES, "GET /review/queue": [] })
    renderWithClient(<ReviewSession />)
    expect(await screen.findByRole("heading", { name: "All caught up" })).toBeInTheDocument()
    expect(screen.getByRole("link", { name: /Do a quick drill/ })).toHaveAttribute(
      "href",
      "/drills/session?mode=recognition"
    )
  })
})

const STATS = {
  streak: 3,
  longestStreak: 9,
  totals: { solved: 4, mastered: 1, problems: 16, drills: 40, reviews: 12, activeDays: 10 },
  patterns: [
    {
      patternId: "hashing",
      patternName: "Hash map and counting",
      state: "in_progress",
      solved: 2,
      mastered: 1,
      total: 3,
      medianFirstRung: 2,
      drillAccuracy: 0.75,
      drillAnswers: 20,
    },
  ],
  weeks: Array.from({ length: 8 }, (_, i) => ({
    weekStart: `2026-08-${String(10 + i * 7 > 31 ? 31 : 10 + i).padStart(2, "0")}`,
    activeDays: i,
    solved: i % 2,
    drills: i * 3,
    reviews: i,
    remembered: i,
    medianPlanSeconds: i === 3 ? null : 60 - i * 5,
    firstAttemptRungs: [i, 1, 0, 0, 1, 0, i % 2],
  })),
  commonMisses: [
    { kind: "structure", id: "counter", label: "Counter / frequency array", count: 5 },
  ],
  reviewRetention: { reviews: 12, remembered: 9, rate: 0.75 },
}

describe("Stats (Section 6.8)", () => {
  it("shows totals, both charts with a table view, patterns and common misses", async () => {
    stubApi({ "GET /stats": STATS })
    renderWithClient(<StatsView />)
    expect(await screen.findByRole("heading", { name: "Your progress" })).toBeInTheDocument()
    expect(screen.getByText("Longest 9 days")).toBeInTheDocument()
    expect(screen.getByText("4/16")).toBeInTheDocument()
    expect(screen.getByText("75% remembered")).toBeInTheDocument()
    expect(screen.getByRole("img", { name: /Line chart of median plan time/ })).toBeInTheDocument()
    expect(screen.getByRole("img", { name: /Stacked bar chart/ })).toBeInTheDocument()
    expect(screen.getByText("6 Solution")).toBeInTheDocument()
    expect(screen.getByText("Counter / frequency array")).toBeInTheDocument()
    expect(screen.getByRole("link", { name: "Hash map and counting" })).toHaveAttribute(
      "href",
      "/patterns/hashing"
    )
    expect(screen.getByText("Show as a table")).toBeInTheDocument()
  })
})

describe("Settings (Section 6.9)", () => {
  it("saves preferences, exports data, and deletes the account only after typing delete", async () => {
    const { calls } = stubApi({
      "GET /me": PROFILE,
      "PATCH /me": ({ body }: { body: unknown }) => ({
        ...PROFILE,
        settings: { ...(body as { settings?: object }).settings },
      }),
      "GET /me/export": { profile: PROFILE, attempts: [] },
      "DELETE /me": undefined,
    })
    const createObjectURL = vi.fn(() => "blob:x")
    vi.stubGlobal("URL", Object.assign(URL, { createObjectURL, revokeObjectURL: vi.fn() }))
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {})
    renderWithClient(<SettingsView />)

    const timer = await screen.findByRole("switch", { name: "Drill timer" })
    expect(timer).toHaveAttribute("aria-checked", "true")
    await userEvent.click(timer)
    await waitFor(() =>
      expect(calls.find((c) => c.method === "PATCH")?.body).toEqual({
        settings: { drillTimer: false },
      })
    )

    await userEvent.click(screen.getByRole("button", { name: /Export my data/ }))
    await waitFor(() => expect(click).toHaveBeenCalled())
    expect(createObjectURL).toHaveBeenCalled()
    expect(await screen.findByText("Your data was downloaded as a JSON file.")).toBeInTheDocument()

    await userEvent.click(screen.getByRole("button", { name: /Delete account/ }))
    const dialog = await screen.findByRole("alertdialog")
    const confirm = within(dialog).getByRole("button", { name: "Delete forever" })
    expect(confirm).toBeDisabled()
    await userEvent.type(within(dialog).getByLabelText(/to confirm/), "delete")
    expect(confirm).toBeEnabled()
    await userEvent.click(confirm)
    await waitFor(() => expect(auth.signOut).toHaveBeenCalled())
    expect(calls.some((c) => c.method === "DELETE" && c.path === "/me")).toBe(true)
    expect(nav.router.replace).toHaveBeenCalledWith("/")
  })

  it("saves the display name", async () => {
    const { calls } = stubApi({
      "GET /me": PROFILE,
      "PATCH /me": ({ body }: { body: unknown }) => ({ ...PROFILE, ...(body as object) }),
    })
    renderWithClient(<SettingsView />)
    const input = await screen.findByLabelText("Display name")
    await userEvent.clear(input)
    await userEvent.type(input, "Grace Hopper")
    await userEvent.click(screen.getByRole("button", { name: "Save name" }))
    expect(await screen.findByText("Name saved.")).toBeInTheDocument()
    expect(calls.find((c) => c.method === "PATCH")?.body).toEqual({ displayName: "Grace Hopper" })
  })
})

describe("Landing demo (Section 6.1)", () => {
  it("plays on its own and pauses", () => {
    vi.useFakeTimers()
    renderWithClient(<LiveDemo />)
    // jsdom has no reduced-motion preference, so it plays.
    const narration = screen.getByText(/Start l at the left end/)
    act(() => {
      vi.advanceTimersByTime(1200)
    })
    expect(narration).toHaveTextContent(/skips it/)
    fireEvent.click(screen.getByRole("button", { name: "Pause" }))
    const before = narration.textContent
    act(() => {
      vi.advanceTimersByTime(5000)
    })
    expect(narration.textContent).toBe(before)
    fireEvent.click(screen.getByRole("button", { name: "Next step" }))
    expect(narration.textContent).not.toBe(before)
  })
})

import { describe, expect, it } from "vitest"

import { describePointsTo, splitBySignals } from "@/components/drills/highlight"
import { palindromeSteps } from "@/components/landing/palindromeDemo"
import { startTarget } from "@/components/patterns/PatternPage"
import { parseTemplate, tokenizePython } from "@/components/patterns/template"
import { NO_FILTERS, filterProblems, type ProblemRowData } from "@/components/problems/ProblemsList"
import { formatDue } from "@/components/review/ReviewSession"
import { layoutRoadmap, lockReason, nextPattern, NODE_W } from "@/components/roadmap/layout"
import { niceMax, rungColor, weekLabel } from "@/components/stats/charts"
import { formatPercent, formatRelative, formatSeconds, plural } from "@/components/stats/format"
import { reviewMinutes } from "@/components/today/TodayView"
import { drillSessionHref, parseDrillParams } from "@/lib/api/drills"
import type { RoadmapNode } from "@/lib/api/patterns"
import { exportFileName, resolveSettings } from "@/lib/api/profile"
import { summarizeNextDue } from "@/lib/api/review"

function node(partial: Partial<RoadmapNode> & { id: string }): RoadmapNode {
  return {
    name: partial.id,
    family: "hashing",
    x: 0,
    y: 0,
    prereqs: [],
    problemCount: 3,
    state: "available",
    progress: { solved: 0, mastered: 0 },
    ...partial,
  }
}

const ROADMAP: RoadmapNode[] = [
  node({
    id: "hashing",
    name: "Hashing",
    x: 0,
    y: 1,
    progress: { solved: 1, mastered: 0 },
    state: "in_progress",
  }),
  node({ id: "tp", name: "Two pointers", x: 1, y: 0, prereqs: ["hashing"], state: "locked" }),
  node({ id: "stack", name: "Stack", x: 1, y: 2, prereqs: ["hashing"], state: "locked" }),
  node({ id: "sw", name: "Sliding window", x: 2, y: 0, prereqs: ["tp", "stack"], state: "locked" }),
]

describe("roadmap layout (Section 6.3)", () => {
  it("places nodes on a compact grid and connects prerequisites left to right", () => {
    const layout = layoutRoadmap(ROADMAP, 2)
    expect(layout.nodes.map((n) => [n.node.id, n.left > 0, n.top >= 0])).toHaveLength(4)
    const hashing = layout.nodes.find((n) => n.node.id === "hashing")!
    const tp = layout.nodes.find((n) => n.node.id === "tp")!
    expect(tp.left).toBeGreaterThan(hashing.left + NODE_W)
    expect(layout.edges.map((e) => e.id)).toEqual([
      "hashing->tp",
      "hashing->stack",
      "tp->sw",
      "stack->sw",
    ])
    expect(layout.width).toBeGreaterThan(3 * NODE_W)
    // One solve of two needed: the edge out of hashing is not open yet.
    expect(layout.edges[0].met).toBe(false)
    expect(
      layoutRoadmap(
        ROADMAP.map((n) => ({ ...n, progress: { solved: 2, mastered: 0 } })),
        2
      ).edges[0].met
    ).toBe(true)
  })

  it("explains what unlocks a locked pattern, naming only unmet prerequisites", () => {
    expect(lockReason(ROADMAP[1], ROADMAP, 2)).toBe(
      "Unlocks after you solve 2 problems in Hashing."
    )
    expect(lockReason(ROADMAP[3], ROADMAP, 2)).toBe(
      "Unlocks after you solve 2 problems in Two pointers and Stack."
    )
    expect(lockReason(ROADMAP[0], ROADMAP, 2)).toBeNull()
    expect(layoutRoadmap([], 2).nodes).toEqual([])
  })

  it("suggests the pattern in progress first, then the first available", () => {
    expect(nextPattern(ROADMAP)?.id).toBe("hashing")
    expect(nextPattern([{ ...ROADMAP[0], state: "available" }, ROADMAP[1]])?.id).toBe("hashing")
    expect(nextPattern([ROADMAP[1]])).toBeNull()
  })
})

describe("pattern template (Section 6.4)", () => {
  it("finds each slot marker", () => {
    const lines = parseTemplate(
      "def solve(a):\n    seen = {}  # SETUP: map\n    for x in a:  # LOOP\n    return 0  # RETURN\n"
    )
    expect(lines.map((l) => l.slot)).toEqual([null, "setup", "loop", "return"])
  })

  it("tokenizes Python for highlighting", () => {
    const tokens = tokenizePython('    if x in seen:  # look "up"')
    expect(tokens.find((t) => t.text === "if")?.kind).toBe("keyword")
    expect(tokens.find((t) => t.text === "in")?.kind).toBe("keyword")
    expect(tokens.at(-1)).toEqual({ kind: "comment", text: '# look "up"' })
    expect(tokenizePython('s = "a#b" + 12').map((t) => t.kind)).toEqual([
      "text",
      "string",
      "text",
      "number",
    ])
    expect(tokens.map((t) => t.text).join("")).toBe('    if x in seen:  # look "up"')
  })

  it("starts with the first unsolved problem, and says Continue once there is progress", () => {
    const problems = [
      { slug: "b", title: "B", difficulty: "easy" as const, order: 2, status: null },
      { slug: "a", title: "A", difficulty: "easy" as const, order: 1, status: null },
    ]
    expect(startTarget(problems)).toMatchObject({ problem: { slug: "a" }, label: "Start" })
    const progressed = [{ ...problems[1], status: "solved" as const }, problems[0]]
    expect(startTarget(progressed)).toMatchObject({ problem: { slug: "b" }, label: "Continue" })
    const done = progressed.map((p) => ({ ...p, status: "mastered" as const }))
    expect(startTarget(done)).toMatchObject({ problem: { slug: "a" }, label: "Practice again" })
  })
})

describe("signal highlighting (Section 6.6)", () => {
  it("splits text around phrases, case-insensitively, longest first", () => {
    const parts = splitBySignals("The Same letters in any order, same letters", [
      "same letters",
      "same letters in any order",
    ])
    expect(parts).toEqual([
      { text: "The ", signal: null },
      { text: "Same letters in any order", signal: 1 },
      { text: ", ", signal: null },
      { text: "same letters", signal: 0 },
    ])
    expect(splitBySignals("plain", [])).toEqual([{ text: "plain", signal: null }])
  })

  it("describes what a signal points to", () => {
    const names = { patterns: { hashing: "Hash map" }, structures: { counter: "Counter" } }
    expect(describePointsTo("hashing", names)).toBe("Pattern: Hash map")
    expect(describePointsTo("structure:counter", names)).toBe("Structure: Counter")
    expect(describePointsTo("toolkit:set_ops", names)).toBe("Python tool: set ops")
  })
})

describe("drill and review helpers", () => {
  it("reads drill session params with defaults", () => {
    const params = (q: string) => new URLSearchParams(q)
    expect(parseDrillParams(params(""))).toEqual({
      mode: "recognition",
      size: 10,
      patternFilter: null,
    })
    expect(parseDrillParams(params("mode=toolkit&size=20&pattern=stack"))).toEqual({
      mode: "toolkit",
      size: 20,
      patternFilter: "stack",
    })
    expect(parseDrillParams(params("mode=x&size=7")).size).toBe(10)
    expect(drillSessionHref({ mode: "recognition", patternFilter: "stack", size: 10 })).toBe(
      "/drills/session?mode=recognition&pattern=stack"
    )
    expect(drillSessionHref({ mode: "toolkit", size: 30 })).toBe(
      "/drills/session?mode=toolkit&size=30"
    )
  })

  it("summarizes next review dates", () => {
    const now = new Date(2026, 9, 1, 12)
    const at = (days: number) => new Date(2026, 9, 1 + days, 9).toISOString()
    expect(summarizeNextDue([at(1), at(1), at(3), at(8), at(9)], now)).toEqual([
      "2 items tomorrow",
      "1 item in 3 days",
      "2 items next week",
    ])
    expect(summarizeNextDue([at(20), at(60)], now)).toEqual([
      "1 item in 3 weeks",
      "1 item in 2 months",
    ])
    expect(formatDue(at(1), now)).toBe("tomorrow")
    expect(summarizeNextDue([], now)).toEqual([])
  })

  it("estimates review minutes", () => {
    expect(reviewMinutes(1)).toBe("about 1 minute")
    expect(reviewMinutes(4)).toBe("about 4 minutes")
  })
})

describe("settings (Section 6.9)", () => {
  it("fills defaults and ignores malformed keys", () => {
    expect(resolveSettings(null)).toEqual({
      theme: "dark",
      sound: false,
      reducedMotion: "system",
      drillTimer: true,
      editorFontSize: 14,
      monacoAccessibility: "auto",
    })
    expect(resolveSettings({ theme: "light", sound: "yes", drillTimer: false })).toMatchObject({
      theme: "light",
      sound: false,
      drillTimer: false,
    })
  })

  it("names the export file by date", () => {
    expect(exportFileName(new Date(2026, 9, 1))).toBe("seecode-export-2026-10-01.json")
  })
})

describe("formatting", () => {
  it("formats durations, percents and relative times", () => {
    expect(formatSeconds(null)).toBeNull()
    expect(formatSeconds(42.4)).toBe("42 s")
    expect(formatSeconds(125)).toBe("2 min 5 s")
    expect(formatSeconds(3600)).toBe("1 h")
    expect(formatPercent(0.756)).toBe("76%")
    expect(formatPercent(null)).toBeNull()
    expect(plural(1, "day")).toBe("1 day")
    expect(plural(3, "day")).toBe("3 days")
    const now = new Date(2026, 9, 1, 12)
    expect(formatRelative(new Date(2026, 9, 1, 11, 59, 30).toISOString(), now)).toBe("just now")
    expect(formatRelative(new Date(2026, 9, 1, 9).toISOString(), now)).toBe("3 hours ago")
    expect(formatRelative(new Date(2026, 8, 30, 9).toISOString(), now)).toBe("yesterday")
    expect(formatRelative(new Date(2026, 8, 27, 9).toISOString(), now)).toBe("4 days ago")
    expect(formatRelative(new Date(2026, 8, 2).toISOString(), now)).toBe("on Sep 2")
  })

  it("picks round chart maxima and sequential colors", () => {
    expect(niceMax(0, 10)).toBe(10)
    expect(niceMax(37)).toBe(50)
    expect(niceMax(3, 2)).toBe(5)
    expect(weekLabel("2026-09-07")).toBe("Sep 7")
    expect(rungColor(0)).toContain("25%")
    expect(rungColor(6)).toContain("100%")
  })
})

describe("problem filters (Section 6.5)", () => {
  const rows: ProblemRowData[] = [
    {
      item: {
        slug: "two-sum",
        title: "Two Sum",
        difficulty: "easy",
        order: 1,
        status: "solved",
        bestRung: 0,
        lastAttemptAt: null,
      },
      status: "solved",
      patternId: "hashing",
    },
    {
      item: {
        slug: "3sum",
        title: "3Sum",
        difficulty: "medium",
        order: 6,
        status: null,
        bestRung: null,
        lastAttemptAt: null,
      },
      status: "new",
      patternId: "two_pointers_opposite",
    },
  ]
  it("filters by title, difficulty, status and pattern", () => {
    const slugs = (f: Partial<typeof NO_FILTERS>, show = false) =>
      filterProblems(rows, { ...NO_FILTERS, ...f }, show).map((r) => r.item.slug)
    expect(slugs({})).toEqual(["two-sum", "3sum"])
    expect(slugs({ query: "SUM" })).toEqual(["two-sum", "3sum"])
    expect(slugs({ query: "two" })).toEqual(["two-sum"])
    expect(slugs({ difficulty: "medium" })).toEqual(["3sum"])
    expect(slugs({ status: "new" })).toEqual(["3sum"])
    // The pattern filter applies only while patterns are shown.
    expect(slugs({ pattern: "hashing" })).toEqual(["two-sum", "3sum"])
    expect(slugs({ pattern: "hashing" }, true)).toEqual(["two-sum"])
  })
})

describe("landing demo (Section 6.1)", () => {
  it("walks Valid Palindrome with the reference logic", () => {
    const steps = palindromeSteps("Top spot!")
    expect(steps[0]).toMatchObject({ l: 0, r: 8, line: 3 })
    expect(steps[1]).toMatchObject({ line: 8, skipped: [8] })
    expect(steps.at(-1)).toMatchObject({ result: true, line: 13 })
    expect(steps.at(-1)?.matched).toEqual(expect.arrayContaining([0, 7, 1, 6, 2, 5]))
    const no = palindromeSteps("Top 2 spot")
    expect(no.at(-1)).toMatchObject({ result: false, line: 10 })
  })
})

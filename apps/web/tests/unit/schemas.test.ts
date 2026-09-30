import { describe, expect, it } from "vitest"

import { PatternSummarySchema, ProblemListItemSchema, ProblemPublicSchema } from "@/lib/api/schemas"

// Shapes as the API returns them (apps/api/app/schemas/content.py; docs/DECISIONS.md).

describe("content schemas", () => {
  it("parses ProblemPublic, with optional explanation and compare", () => {
    const problem = ProblemPublicSchema.parse({
      slug: "two-sum",
      title: "Two Sum",
      leetcodeUrl: "https://leetcode.com/problems/two-sum/",
      difficulty: "easy",
      order: 1,
      summary: "You get a list of integers `nums`.",
      examples: [
        { input: "nums = [4, 9, 4], target = 8", output: "[0, 2]" },
        { input: "nums = [5, 11], target = 16", output: "[0, 1]", explanation: "5 + 11 = 16." },
      ],
      constraints: ["2 ≤ len(nums) ≤ 10⁴"],
      targets: { time: "O(n)", space: "O(n)" },
      entry: "twoSum",
      starterCode: "class Solution:\n    pass\n",
      tests: [
        { id: "e1", args: [[4, 9, 4], 8], expected: [0, 2], hidden: false, compare: "unordered" },
        { id: "h1", args: [[1], 1], expected: null, hidden: true },
      ],
      contentVersion: "6717eb5e5afc",
    })
    expect(problem.tests[1]).toEqual({ id: "h1", args: [[1], 1], expected: null, hidden: true })
    expect(problem.examples[0].explanation).toBeUndefined()
  })

  it("rejects an unknown difficulty or complexity", () => {
    const base = {
      slug: "x",
      title: "X",
      leetcodeUrl: "https://leetcode.com/problems/x/",
      difficulty: "easy",
      order: 1,
      summary: "",
      examples: [],
      constraints: [],
      targets: { time: "O(n)", space: "O(1)" },
      entry: "f",
      starterCode: "",
      tests: [],
      contentVersion: "v",
    }
    expect(ProblemPublicSchema.safeParse(base).success).toBe(true)
    expect(ProblemPublicSchema.safeParse({ ...base, difficulty: "extreme" }).success).toBe(false)
    expect(
      ProblemPublicSchema.safeParse({ ...base, targets: { time: "O(n³)", space: "O(1)" } }).success
    ).toBe(false)
  })

  it("parses problem list rows signed out and signed in", () => {
    expect(
      ProblemListItemSchema.parse({
        slug: "two-sum",
        title: "Two Sum",
        difficulty: "easy",
        order: 1,
        status: null,
        bestRung: null,
        lastAttemptAt: null,
      })
    ).not.toHaveProperty("patternId")
    expect(
      ProblemListItemSchema.parse({
        slug: "two-sum",
        title: "Two Sum",
        difficulty: "easy",
        order: 1,
        patternId: "hashing",
        status: "solved",
        bestRung: 2,
        lastAttemptAt: "2026-09-30T03:13:28.192065Z",
      }).patternId
    ).toBe("hashing")
  })

  it("parses pattern summaries", () => {
    expect(
      PatternSummarySchema.parse({
        id: "hashing",
        family: "hashing",
        name: "Hash map and counting",
        idea: "Trade memory for speed.",
        problemCount: 1,
      }).problemCount
    ).toBe(1)
  })
})

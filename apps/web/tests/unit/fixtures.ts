import type { ProblemPublic } from "@/lib/api/schemas"

/** Valid Palindrome as `GET /content/problems/valid-palindrome` returns it (fewer hidden tests). */
export const PALINDROME: ProblemPublic = {
  slug: "valid-palindrome",
  title: "Valid Palindrome",
  leetcodeUrl: "https://leetcode.com/problems/valid-palindrome/",
  difficulty: "easy",
  order: 4,
  summary:
    "You get a string `s`. Decide whether it reads the same forward and backward.\n\nA string with no letters counts as a palindrome.",
  examples: [
    { input: 's = "Top spot!"', output: "true", explanation: "It reads `topspot`." },
    { input: 's = "Top 2 spot"', output: "false" },
  ],
  constraints: ["1 ≤ len(s) ≤ 2·10⁵", "`s` is printable ASCII"],
  targets: { time: "O(n)", space: "O(1)" },
  kind: "function",
  entry: "isPalindrome",
  starterCode: "class Solution:\n    def isPalindrome(self, s: str) -> bool:\n        pass\n",
  tests: [
    { id: "e1", args: ["Top spot!"], expected: true, hidden: false },
    { id: "e2", args: ["Top 2 spot"], expected: false, hidden: false },
    { id: "h1", args: ["z"], expected: true, hidden: true },
    { id: "h2", args: ["AbBa"], expected: true, hidden: true },
  ],
  contentVersion: "6717eb5e5afc",
}

export const TWO_SUM: ProblemPublic = {
  ...PALINDROME,
  slug: "two-sum",
  title: "Two Sum",
  order: 1,
  entry: "twoSum",
  starterCode:
    "class Solution:\n    def twoSum(self, nums: list[int], target: int) -> list[int]:\n        pass\n",
  tests: [
    {
      id: "e1",
      args: [[5, 11, 2, 8, 6], 10],
      expected: [2, 3],
      hidden: false,
      compare: "unordered",
    },
    { id: "h1", args: [[1, 2], 3], expected: [0, 1], hidden: true, compare: "unordered" },
  ],
}

/** A design problem: each test is a list of calls (docs/PARITY_PLAN.md 4.2). */
export const MIN_STACK: ProblemPublic = {
  slug: "min-stack",
  title: "Min Stack",
  leetcodeUrl: "https://leetcode.com/problems/min-stack/",
  difficulty: "medium",
  order: 16,
  summary: "Build a stack that also returns its smallest value in O(1).",
  examples: [{ input: '["MinStack", "push", "getMin"]', output: "[null, null, 3]" }],
  constraints: ["At most 3·10⁴ calls"],
  targets: { time: "O(1)", space: "O(n)" },
  kind: "design",
  entry: "MinStack",
  starterCode: "class MinStack:\n    def __init__(self):\n        pass\n",
  tests: [
    {
      id: "e1",
      ops: [["MinStack"], ["push", 3], ["push", 1], ["getMin"], ["pop"], ["getMin"]],
      expected: [null, null, null, 1, null, 3],
      hidden: false,
    },
    {
      id: "h1",
      ops: [["MinStack"], ["push", 5], ["top"]],
      expected: [null, null, 5],
      hidden: true,
    },
  ],
  contentVersion: "test",
}

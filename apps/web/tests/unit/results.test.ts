import { describe, expect, it } from "vitest"

import { buildCases, caseAfterRun, firstInterestingCase, summarize } from "@/lib/workspace/results"

import { PALINDROME } from "./fixtures"

const pass = (id: string) => ({ id, status: "pass" as const, got: true })

describe("Tests panel summary (Section 7.5)", () => {
  it("invites a first run", () => {
    expect(summarize(PALINDROME, null, null)).toMatchObject({ tone: "idle" })
  })

  it("counts visible cases after Run", () => {
    expect(summarize(PALINDROME, [pass("e1"), pass("e2")], "run")).toEqual({
      tone: "pass",
      title: "All 2 cases passed",
      detail: "Submit to run the hidden tests too.",
    })
    expect(
      summarize(PALINDROME, [pass("e1"), { id: "e2", status: "fail", got: true }], "run")
    ).toEqual({ tone: "fail", title: "Not quite", detail: "1 of 2 cases passed." })
  })

  it("says Solved. when Submit passes every test", () => {
    const all = PALINDROME.tests.map((test) => pass(test.id))
    expect(summarize(PALINDROME, all, "submit")).toEqual({
      tone: "solved",
      title: "Solved.",
      detail: "All 4 tests passed, including 2 hidden ones.",
    })
    const oneHiddenFails = [...all.slice(0, 3), { id: "h2", status: "fail" as const, got: false }]
    expect(summarize(PALINDROME, oneHiddenFails, "submit")).toEqual({
      tone: "fail",
      title: "Not quite",
      detail: "3 of 4 tests passed (hidden: 1 of 2).",
    })
  })

  it("reports a time limit", () => {
    const timeouts = PALINDROME.tests.map((test) => ({ id: test.id, status: "timeout" as const }))
    expect(summarize(PALINDROME, timeouts, "submit")).toMatchObject({
      tone: "timeout",
      title: "Time limit exceeded",
    })
  })

  it("reports code that does not load once, with its line", () => {
    const error = '  File "<solution>", line 3\n    return s ==\nSyntaxError: invalid syntax\n'
    const results = ["e1", "e2"].map((id) => ({ id, status: "error" as const, error }))
    expect(summarize(PALINDROME, results, "run")).toEqual({
      tone: "error",
      title: "Error",
      detail: "SyntaxError: invalid syntax",
      line: 3,
    })
  })

  it("mentions custom cases that raised an error on a Run", () => {
    const custom = [
      { id: "custom-1", args: ["a"] },
      { id: "custom-4", args: ["b"] },
    ]
    const results = [
      pass("e1"),
      pass("e2"),
      { id: "custom-1", status: "pass" as const, got: true },
      { id: "custom-4", status: "error" as const, error: "IndexError: x" },
    ]
    expect(summarize(PALINDROME, results, "run", custom)).toEqual({
      tone: "pass",
      title: "All 2 cases passed",
      detail: "Custom 2 raised an error. Submit to run the hidden tests too.",
    })
    const failing = [{ ...results[0], status: "fail" as const }, ...results.slice(1)]
    expect(summarize(PALINDROME, failing, "run", custom).detail).toBe(
      "1 of 2 cases passed. Custom 2 raised an error."
    )
  })

  it("treats errors in some cases as a partial pass", () => {
    const results = [pass("e1"), { id: "e2", status: "error" as const, error: "IndexError: x" }]
    expect(summarize(PALINDROME, results, "run")).toMatchObject({ tone: "fail" })
  })
})

describe("case list", () => {
  it("lists visible cases, then the first failing hidden case, then custom cases", () => {
    const results = [
      pass("e1"),
      pass("e2"),
      { id: "h1", status: "fail" as const, got: false },
      { id: "h2", status: "fail" as const, got: false },
    ]
    const cases = buildCases(PALINDROME, results, [{ id: "custom-1", args: ["x"] }])
    expect(cases.map((item) => [item.kind, item.id, item.label])).toEqual([
      ["visible", "e1", "Case 1"],
      ["visible", "e2", "Case 2"],
      ["hidden", "h1", "Hidden case"],
      ["custom", "custom-1", "Custom 1"],
    ])
    expect(firstInterestingCase(cases)).toBe("h1")
  })

  it("never shows passing hidden tests", () => {
    const results = PALINDROME.tests.map((test) => pass(test.id))
    expect(buildCases(PALINDROME, results, []).map((item) => item.kind)).toEqual([
      "visible",
      "visible",
    ])
  })

  it("starts on the first case when everything passed", () => {
    const cases = buildCases(PALINDROME, [pass("e1"), pass("e2")], [])
    expect(firstInterestingCase(cases)).toBe("e1")
  })

  it("shows a custom case that raised an error when every test passed", () => {
    const custom = [{ id: "custom-1", args: ["x"] }]
    const results = [pass("e1"), pass("e2"), { id: "custom-1", status: "error" as const }]
    expect(firstInterestingCase(buildCases(PALINDROME, results, custom))).toBe("custom-1")
  })

  it("stays on the custom case being edited after a Run, not after a Submit", () => {
    const custom = [{ id: "custom-1", args: ["x"] }]
    const results = [{ id: "e1", status: "fail" as const, got: false }, pass("e2")]
    const cases = buildCases(PALINDROME, results, custom)
    expect(caseAfterRun(cases, "custom-1", "run")).toBe("custom-1")
    expect(caseAfterRun(cases, "custom-1", "submit")).toBe("e1")
    expect(caseAfterRun(cases, "e2", "run")).toBe("e1")
    expect(caseAfterRun(cases, "custom-9", "run")).toBe("e1")
  })
})

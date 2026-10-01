import { describe, expect, it } from "vitest"

import {
  MAX_SHOWN_CHARS,
  formatMs,
  formatValue,
  formatValueForDisplay,
  splitExampleInput,
} from "@/lib/workspace/format"

// How the Tests panel and the problem examples show values (Section 7.5).

describe("formatValueForDisplay", () => {
  it("shows ordinary values whole", () => {
    expect(formatValueForDisplay([[1, 2], "a", null, true])).toEqual({
      text: '[[1, 2], "a", null, true]',
      truncated: false,
    })
    expect(formatValueForDisplay("x".repeat(MAX_SHOWN_CHARS - 2))).toEqual({
      text: `"${"x".repeat(MAX_SHOWN_CHARS - 2)}"`,
      truncated: false,
    })
  })

  it("cuts a huge value at the limit without formatting all of it", () => {
    const huge = Array.from({ length: 1_000_000 }, (_, i) => i)
    const started = performance.now()
    const { text, truncated } = formatValueForDisplay(huge, 1000)
    expect(performance.now() - started).toBeLessThan(200)
    expect(truncated).toBe(true)
    expect(text).toHaveLength(1000)
    expect(text.startsWith("[0, 1, 2, 3")).toBe(true)
    expect(formatValue(huge.slice(0, 300)).startsWith(text.slice(0, 900))).toBe(true)
  })

  it("cuts long strings and nested lists too", () => {
    expect(formatValueForDisplay("y".repeat(50), 10)).toEqual({
      text: '"yyyyyyyyy',
      truncated: true,
    })
    const nested = Array.from({ length: 100 }, () => [1, 2, 3])
    const { text, truncated } = formatValueForDisplay(nested, 30)
    expect(truncated).toBe(true)
    expect(text).toBe("[[1, 2, 3], [1, 2, 3], [1, 2, ")
  })
})

describe("formatMs", () => {
  it("never shows 0.0 ms", () => {
    expect(formatMs(0)).toBe("under 0.1 ms")
    expect(formatMs(0.04)).toBe("under 0.1 ms")
    expect(formatMs(0.06)).toBe("0.1 ms")
    expect(formatMs(0.42)).toBe("0.4 ms")
  })
})

describe("splitExampleInput", () => {
  it("puts each argument on its own line", () => {
    expect(splitExampleInput("nums = [5, 11, 2, 8, 6], target = 10")).toEqual([
      { name: "nums", value: "[5, 11, 2, 8, 6]" },
      { name: "target", value: "10" },
    ])
    expect(splitExampleInput('s = "ABBCBBA", k = 1')).toEqual([
      { name: "s", value: '"ABBCBBA"' },
      { name: "k", value: "1" },
    ])
  })

  it("never splits inside brackets or strings", () => {
    expect(splitExampleInput('tokens = ["9", "1", "-", "/"]')).toEqual([
      { name: "tokens", value: '["9", "1", "-", "/"]' },
    ])
    expect(splitExampleInput('s = "a, b = c", t = "x\\", y = z"')).toEqual([
      { name: "s", value: '"a, b = c"' },
      { name: "t", value: '"x\\", y = z"' },
    ])
    expect(splitExampleInput("grid = [[1, 2], [3, 4]], k = 2")).toEqual([
      { name: "grid", value: "[[1, 2], [3, 4]]" },
      { name: "k", value: "2" },
    ])
  })

  it("keeps text of another shape whole", () => {
    expect(splitExampleInput("[1, 2, 3]")).toEqual([{ name: null, value: "[1, 2, 3]" }])
    expect(splitExampleInput("a == b, c")).toEqual([{ name: null, value: "a == b, c" }])
  })
})

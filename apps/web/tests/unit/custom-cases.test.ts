import { describe, expect, it } from "vitest"

import {
  MAX_CUSTOM_ARGS_BYTES,
  argumentNames,
  argumentText,
  isCustomCaseId,
  nextCustomCaseId,
  parseArgument,
  parseCustomArgs,
  parseParamNames,
} from "@/lib/workspace/customCases"
import { formatMs, formatValue } from "@/lib/workspace/format"

describe("custom case arguments (Section 7.5)", () => {
  it("parses each argument as JSON", () => {
    expect(parseArgument('"Top spot!"')).toEqual({ ok: true, value: "Top spot!" })
    expect(parseArgument("[1, 2, 3]")).toEqual({ ok: true, value: [1, 2, 3] })
    expect(parseArgument(" 42 ")).toEqual({ ok: true, value: 42 })
    expect(parseArgument("null")).toEqual({ ok: true, value: null })
    expect(parseArgument("true")).toEqual({ ok: true, value: true })
  })

  it("explains what is wrong", () => {
    expect(parseArgument("")).toMatchObject({ ok: false, error: expect.stringContaining("Enter") })
    expect(parseArgument("'single'")).toMatchObject({
      ok: false,
      error: expect.stringContaining("double quotes"),
    })
    expect(parseArgument("True")).toMatchObject({ ok: false })
    expect(parseArgument("[1, 2,]")).toMatchObject({ ok: false })
  })

  it("validates every argument and reports errors by position", () => {
    expect(parseCustomArgs(["[2, 7, 11]", "9"])).toEqual({ ok: true, args: [[2, 7, 11], 9] })
    expect(parseCustomArgs(["[2, 7", "9"])).toEqual({
      ok: false,
      errors: [expect.any(String), null],
      tooLarge: false,
    })
  })

  it("caps custom case arguments at 10 KB (Section 20)", () => {
    const big = JSON.stringify("x".repeat(MAX_CUSTOM_ARGS_BYTES))
    expect(parseCustomArgs([big])).toEqual({ ok: false, errors: [null], tooLarge: true })
    expect(parseCustomArgs([JSON.stringify("x".repeat(1000))]).ok).toBe(true)
  })

  it("shows arguments as compact JSON for editing", () => {
    expect(argumentText("a b")).toBe('"a b"')
    expect(argumentText([1, [2]])).toBe("[1,[2]]")
  })

  it("numbers custom cases after the highest existing one", () => {
    expect(nextCustomCaseId([])).toBe("custom-1")
    expect(nextCustomCaseId([{ id: "custom-1" }, { id: "custom-4" }])).toBe("custom-5")
    expect(isCustomCaseId("custom-2")).toBe(true)
    expect(isCustomCaseId("e1")).toBe(false)
  })
})

describe("argument names from the starter code", () => {
  it("reads the entry method's parameters without self and type hints", () => {
    const code =
      "class Solution:\n    def twoSum(self, nums: list[int], target: int) -> list[int]:\n        pass\n"
    expect(parseParamNames(code, "twoSum")).toEqual(["nums", "target"])
  })

  it("handles commas inside type hints, defaults and multi-line signatures", () => {
    const code =
      "class Solution:\n    def f(\n        self,\n        grid: dict[str, list[int]],\n        k: int = 3,\n    ) -> int:\n        pass\n"
    expect(parseParamNames(code, "f")).toEqual(["grid", "k"])
  })

  it("falls back to numbered names", () => {
    expect(parseParamNames("def other(self, x): pass", "f")).toBeNull()
    expect(argumentNames("def other(self, x): pass", "f", 2)).toEqual(["arg 1", "arg 2"])
    expect(argumentNames("class S:\n    def f(self, s): pass", "f", 1)).toEqual(["s"])
  })
})

describe("value formatting", () => {
  it("uses one JSON convention for inputs, expected values and outputs", () => {
    expect(formatValue(true)).toBe("true")
    expect(formatValue(false)).toBe("false")
    expect(formatValue(null)).toBe("null")
    expect(formatValue('a"b')).toBe('"a\\"b"')
    expect(formatValue([2, 3])).toBe("[2, 3]")
    expect(formatValue([[1, 2], []])).toBe("[[1, 2], []]")
    expect(formatValue({ a: [1] })).toBe('{"a": [1]}')
    expect(formatValue(1.5)).toBe("1.5")
    expect(formatValue(undefined)).toBe("")
  })

  it("formats run times", () => {
    expect(formatMs(0.42)).toBe("0.4 ms")
    expect(formatMs(12.3)).toBe("12 ms")
    expect(formatMs(1500)).toBe("1.50 s")
  })
})

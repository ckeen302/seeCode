import { describe, expect, it } from "vitest"

import {
  PRELUDE_LINES,
  editorLine,
  errorLine,
  errorSummary,
  parseTraceback,
} from "@/lib/runner/traceback"

// Tracebacks as harness.py formats them (Section 9.2): only the user's own frames.
const RUNTIME = `Traceback (most recent call last):
  File "<solution>", line 7, in isPalindrome
    return helper(s)
  File "<solution>", line 3, in helper
    return s[len(s)]
           ~^^^^^^^^
IndexError: string index out of range
`

const SYNTAX = `  File "<solution>", line 3
    return s ==
               ^
SyntaxError: invalid syntax
`

describe("traceback line mapping (Section 9.2)", () => {
  it("keeps harness line numbers: the prelude runs separately", () => {
    expect(PRELUDE_LINES).toBe(0)
    expect(editorLine(1)).toBe(1)
    expect(editorLine(12)).toBe(12)
    expect(editorLine(0)).toBeNull()
  })

  it("turns each `line N` of the user's code into a link", () => {
    const segments = parseTraceback(RUNTIME)
    expect(segments.filter((s) => s.kind === "line")).toEqual([
      { kind: "line", text: "line 7", line: 7 },
      { kind: "line", text: "line 3", line: 3 },
    ])
    expect(segments.map((s) => s.text).join("")).toBe(RUNTIME)
    expect(segments[0]).toEqual({
      kind: "text",
      text: 'Traceback (most recent call last):\n  File "<solution>", ',
    })
  })

  it("links syntax errors too", () => {
    expect(parseTraceback(SYNTAX)[1]).toEqual({ kind: "line", text: "line 3", line: 3 })
  })

  it("leaves other files alone", () => {
    const text = '  File "/lib/python3.14/json/__init__.py", line 346, in loads\n'
    expect(parseTraceback(text)).toEqual([{ kind: "text", text }])
    expect(errorLine(text)).toBeNull()
  })

  it("finds the innermost line and the error message", () => {
    expect(errorLine(RUNTIME)).toBe(3)
    expect(errorLine(SYNTAX)).toBe(3)
    expect(errorSummary(RUNTIME)).toBe("IndexError: string index out of range")
    expect(errorSummary(SYNTAX)).toBe("SyntaxError: invalid syntax")
  })
})

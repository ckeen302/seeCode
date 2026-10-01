import { describe, expect, it } from "vitest"

import { editorOptions } from "@/lib/editor/monaco"
import { MAX_CODE_BYTES, codeTooLarge, utf8Bytes } from "@/lib/workspace/limits"

describe("code size limit (Section 20)", () => {
  it("counts UTF-8 bytes, as the API does", () => {
    expect(utf8Bytes("abc")).toBe(3)
    expect(utf8Bytes("é")).toBe(2)
    expect(codeTooLarge("x".repeat(MAX_CODE_BYTES))).toBe(false)
    expect(codeTooLarge("x".repeat(MAX_CODE_BYTES + 1))).toBe(true)
    expect(codeTooLarge("é".repeat(MAX_CODE_BYTES / 2 + 1))).toBe(true)
    expect(codeTooLarge("é".repeat(MAX_CODE_BYTES / 2))).toBe(false)
  })
})

describe("editor options", () => {
  it("names the Tab focus key of the user's platform (Section 18.8)", () => {
    expect(editorOptions(false, false).ariaLabel).toContain("Ctrl+M")
    expect(editorOptions(false, true).ariaLabel).toContain("Control+Shift+M")
  })

  it("wraps long lines instead of scrolling sideways", () => {
    expect(editorOptions(false)).toMatchObject({ wordWrap: "on", minimap: { enabled: false } })
    expect(editorOptions(true).smoothScrolling).toBe(false)
  })
})

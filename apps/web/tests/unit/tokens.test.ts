import { readdirSync, readFileSync, statSync } from "node:fs"
import path from "node:path"

import { describe, expect, it } from "vitest"

const root = path.resolve(__dirname, "../..")
const css = readFileSync(path.join(root, "styles/globals.css"), "utf8")

// Section 18.1, verbatim: token -> [dark, light].
const SPEC_TOKENS: Record<string, [string, string]> = {
  "--bg": ["#0D0F12", "#FAFAF9"],
  "--surface": ["#15181D", "#FFFFFF"],
  "--surface-2": ["#1C2027", "#F3F4F6"],
  "--border": ["#262B33", "#E5E7EB"],
  "--text": ["#E8EAED", "#111827"],
  "--muted": ["#9AA1AC", "#6B7280"],
  "--accent": ["#7C8CFF", "#4F5BD5"],
  "--accent-2": ["#F2A65A", "#C26A1B"],
  "--good": ["#4CC38A", "#1F9D63"],
  "--close": ["#E5B454", "#B7791F"],
  "--wrong": ["#8B93A1", "#6B7280"],
  "--error": ["#F06A6A", "#D64545"],
  "--ptr-a": ["#7C8CFF", "#4F5BD5"],
  "--ptr-b": ["#F2A65A", "#C26A1B"],
  "--ptr-c": ["#4CC38A", "#1F9D63"],
  "--ptr-d": ["#D57BE0", "#A33BB0"],
  "--window": ["rgba(124,140,255,0.14)", "rgba(79,91,213,0.10)"],
  "--confirmed": ["rgba(76,195,138,0.14)", "rgba(31,157,99,0.10)"],
  "--signal": ["rgba(229,180,84,0.22)", "rgba(183,121,31,0.16)"],
}

function block(selector: string): Record<string, string> {
  const start = css.indexOf(`${selector} {`)
  expect(start, `${selector} block`).toBeGreaterThanOrEqual(0)
  const body = css.slice(start, css.indexOf("}", start))
  const vars: Record<string, string> = {}
  for (const match of body.matchAll(/(--[\w-]+):\s*([^;]+);/g)) vars[match[1]] = match[2]
  return vars
}

function normalize(value: string): number[] | string {
  const v = value.replace(/\s+/g, "").toLowerCase()
  const rgba = v.match(/^rgba\(([^)]+)\)$/)
  return rgba ? rgba[1].split(",").map(Number) : v
}

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name)
    if (statSync(full).isDirectory()) return sourceFiles(full)
    return /\.(ts|tsx)$/.test(name) ? [full] : []
  })
}

describe("design tokens (Section 18.1)", () => {
  const light = block(":root")
  const dark = block('[data-theme="dark"]')

  it.each(Object.entries(SPEC_TOKENS))("%s matches the spec in both themes", (token, [d, l]) => {
    expect(normalize(dark[token] ?? "missing")).toEqual(normalize(d))
    expect(normalize(light[token] ?? "missing")).toEqual(normalize(l))
  })

  it("components use design tokens, not shadcn or palette color names", () => {
    const forbidden =
      /\b(?:bg|text|border|ring|fill|stroke|outline)-(?:primary|secondary|foreground|background|popover|card|destructive|input|ring|muted-foreground|accent-foreground|black|white|(?:slate|gray|zinc|neutral|red|green|blue|amber|yellow)-\d{2,3})\b/
    const offenders = ["app", "components", "lib"]
      .flatMap((dir) => sourceFiles(path.join(root, dir)))
      .filter((file) => forbidden.test(readFileSync(file, "utf8")))
      .map((file) => path.relative(root, file))
    expect(offenders).toEqual([])
  })
})

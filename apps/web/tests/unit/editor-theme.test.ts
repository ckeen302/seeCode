import { readFileSync } from "node:fs"
import path from "node:path"

import { describe, expect, it } from "vitest"

import {
  EDITOR_TOKENS,
  MONACO_VERSION,
  MONACO_VS_URL,
  buildEditorTheme,
  contrastRatio,
  editorSyntaxColors,
  readableColor,
} from "@/lib/editor/monaco"

const root = path.resolve(__dirname, "../..")
const css = readFileSync(path.join(root, "styles/globals.css"), "utf8")
const pkg = JSON.parse(readFileSync(path.join(root, "package.json"), "utf8")) as {
  devDependencies: Record<string, string>
}

function cssBlock(selector: string): Record<string, string> {
  const start = css.indexOf(`${selector} {`)
  const body = css.slice(start, css.indexOf("}", start))
  const vars: Record<string, string> = {}
  for (const match of body.matchAll(/(--[\w-]+):\s*([^;]+);/g)) vars[match[1]] = match[2].trim()
  return vars
}

const CSS_NAMES: Record<keyof typeof EDITOR_TOKENS, string> = {
  bg: "--bg",
  surface: "--surface",
  surface2: "--surface-2",
  border: "--border",
  text: "--text",
  muted: "--muted",
  accent: "--accent",
  accent2: "--accent-2",
  good: "--good",
  close: "--close",
  error: "--error",
  ptrD: "--ptr-d",
}

describe("Monaco (Sections 13.2 and 18)", () => {
  it("loads the pinned CDN build that matches the types package", () => {
    expect(pkg.devDependencies["monaco-editor"]).toBe(MONACO_VERSION)
    expect(MONACO_VS_URL).toBe(
      `https://cdn.jsdelivr.net/npm/monaco-editor@${MONACO_VERSION}/min/vs`
    )
  })

  it("builds its themes from the design tokens", () => {
    const dark = cssBlock('[data-theme="dark"]')
    const light = cssBlock(":root")
    for (const [name, [darkValue, lightValue]] of Object.entries(EDITOR_TOKENS)) {
      const cssName = CSS_NAMES[name as keyof typeof EDITOR_TOKENS]
      expect(dark[cssName]?.toLowerCase(), cssName).toBe(darkValue.toLowerCase())
      expect(light[cssName]?.toLowerCase(), cssName).toBe(lightValue.toLowerCase())
    }
    expect(buildEditorTheme("dark").colors["editor.background"]).toBe("#15181D")
    expect(buildEditorTheme("light").colors["editor.background"]).toBe("#FFFFFF")
    expect(buildEditorTheme("dark").base).toBe("vs-dark")
  })

  it.each(["dark", "light"] as const)("keeps %s syntax colors readable (4.5:1)", (theme) => {
    const index = theme === "dark" ? 0 : 1
    const backgrounds = [
      EDITOR_TOKENS.surface[index],
      theme === "dark" ? EDITOR_TOKENS.surface2[index] : EDITOR_TOKENS.bg[index],
    ]
    for (const color of Object.values(editorSyntaxColors(theme))) {
      for (const background of backgrounds) {
        expect(contrastRatio(color, background)).toBeGreaterThanOrEqual(4.5)
      }
    }
  })

  it("keeps dark-theme tokens as they are", () => {
    const colors = editorSyntaxColors("dark")
    expect(colors.keyword).toBe("#7C8CFF")
    expect(colors.string).toBe("#4CC38A")
    expect(colors.number).toBe("#F2A65A")
  })

  it("computes WCAG contrast", () => {
    expect(contrastRatio("#000000", "#FFFFFF")).toBeCloseTo(21, 5)
    expect(contrastRatio("#6B7280", "#FFFFFF")).toBeCloseTo(4.83, 1)
    expect(readableColor("#1F9D63", "#111827", ["#FFFFFF"])).not.toBe("#1F9D63")
  })
})

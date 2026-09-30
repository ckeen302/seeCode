// Monaco (Section 13.2: @monaco-editor/react). The editor itself loads from jsDelivr at a
// pinned version, like Pyodide; the `monaco-editor` dev dependency, pinned to the same
// version, only provides types. Themes are built from the Section 18.1 tokens.
import { loader } from "@monaco-editor/react"
import type * as Monaco from "monaco-editor"

import type { ResolvedTheme } from "@/lib/theme"

/** Keep equal to the `monaco-editor` version in package.json (a unit test checks it). */
export const MONACO_VERSION = "0.57.0"
export const MONACO_VS_URL = `https://cdn.jsdelivr.net/npm/monaco-editor@${MONACO_VERSION}/min/vs`

let configured = false

/** Points the loader at the pinned CDN build. Safe to call more than once. */
export function configureMonacoLoader(): void {
  if (configured) return
  configured = true
  loader.config({ paths: { vs: MONACO_VS_URL } })
}

/** Starts downloading the editor in the background (hover warm-up). */
export function preloadMonaco(): void {
  if (typeof window === "undefined") return
  configureMonacoLoader()
  loader.init().catch(() => undefined)
}

// Section 18.1 values: [dark, light]. tests/unit/editor-theme.test.ts compares them with
// styles/globals.css.
export const EDITOR_TOKENS = {
  bg: ["#0D0F12", "#FAFAF9"],
  surface: ["#15181D", "#FFFFFF"],
  surface2: ["#1C2027", "#F3F4F6"],
  border: ["#262B33", "#E5E7EB"],
  text: ["#E8EAED", "#111827"],
  muted: ["#9AA1AC", "#6B7280"],
  accent: ["#7C8CFF", "#4F5BD5"],
  accent2: ["#F2A65A", "#C26A1B"],
  good: ["#4CC38A", "#1F9D63"],
  close: ["#E5B454", "#B7791F"],
  error: ["#F06A6A", "#D64545"],
  ptrD: ["#D57BE0", "#A33BB0"],
} as const satisfies Record<string, readonly [string, string]>

export const EDITOR_THEME_NAMES: Record<ResolvedTheme, string> = {
  dark: "seecode-dark",
  light: "seecode-light",
}

type Palette = { [K in keyof typeof EDITOR_TOKENS]: string }

function palette(theme: ResolvedTheme): Palette {
  const index = theme === "dark" ? 0 : 1
  return Object.fromEntries(
    Object.entries(EDITOR_TOKENS).map(([name, values]) => [name, values[index]])
  ) as Palette
}

/** `#RRGGBB` plus an alpha from 0 to 1, as Monaco's `#RRGGBBAA`. */
function alpha(hex: string, amount: number): string {
  return `${hex}${Math.round(amount * 255)
    .toString(16)
    .padStart(2, "0")}`
}

function channels(hex: string): [number, number, number] {
  const value = Number.parseInt(hex.slice(1, 7), 16)
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255]
}

function toHex([r, g, b]: [number, number, number]): string {
  return `#${[r, g, b].map((v) => Math.round(v).toString(16).padStart(2, "0")).join("")}`.toUpperCase()
}

/** WCAG 2 contrast ratio of two `#RRGGBB` colors. */
export function contrastRatio(a: string, b: string): number {
  const luminance = (hex: string) => {
    const [r, g, b] = channels(hex).map((v) => {
      const c = v / 255
      return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
    })
    return 0.2126 * r + 0.7152 * g + 0.0722 * b
  }
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}

/**
 * The token color, mixed toward the text color in small steps until it reads at 4.5:1 on
 * every background (Section 18.1). Dark-theme tokens already pass; a few light-theme
 * tokens (good, close, accent-2) need darkening to be readable as code.
 */
export function readableColor(color: string, text: string, backgrounds: string[]): string {
  const [from, to] = [channels(color), channels(text)]
  for (let step = 0; step <= 20; step++) {
    const t = step / 20
    const mixed = toHex(
      [0, 1, 2].map((i) => from[i] + (to[i] - from[i]) * t) as [number, number, number]
    )
    if (backgrounds.every((bg) => contrastRatio(mixed, bg) >= 4.5)) return mixed
  }
  return text
}

function strip(hex: string): string {
  return hex.replace("#", "")
}

/** The current-line highlight: surface-2 in dark; the page background in light, where
 * surface-2 would drop muted text below 4.5:1. */
function lineHighlight(c: Palette, theme: ResolvedTheme): string {
  return theme === "dark" ? c.surface2 : c.bg
}

export function editorSyntaxColors(theme: ResolvedTheme) {
  const c = palette(theme)
  const backgrounds = [c.surface, lineHighlight(c, theme)]
  const readable = (color: string) => readableColor(color, c.text, backgrounds)
  return {
    text: c.text,
    comment: readable(c.muted),
    keyword: readable(c.accent),
    string: readable(c.good),
    escape: readable(c.close),
    number: readable(c.accent2),
    type: readable(c.ptrD),
  }
}

export function buildEditorTheme(theme: ResolvedTheme): Monaco.editor.IStandaloneThemeData {
  const c = palette(theme)
  const syntax = editorSyntaxColors(theme)
  return {
    base: theme === "dark" ? "vs-dark" : "vs",
    inherit: true,
    // Syntax colors stay few: keywords, strings, numbers, types; comments are muted.
    rules: [
      { token: "", foreground: strip(syntax.text) },
      { token: "comment", foreground: strip(syntax.comment), fontStyle: "italic" },
      { token: "keyword", foreground: strip(syntax.keyword) },
      { token: "string", foreground: strip(syntax.string) },
      { token: "string.escape", foreground: strip(syntax.escape) },
      { token: "number", foreground: strip(syntax.number) },
      { token: "number.hex", foreground: strip(syntax.number) },
      { token: "type", foreground: strip(syntax.type) },
      { token: "tag", foreground: strip(syntax.escape) },
      { token: "delimiter", foreground: strip(syntax.text) },
      { token: "identifier", foreground: strip(syntax.text) },
    ],
    colors: {
      focusBorder: c.accent,
      "editor.background": c.surface,
      "editor.foreground": c.text,
      "editorGutter.background": c.surface,
      "editorLineNumber.foreground": syntax.comment,
      "editorLineNumber.activeForeground": c.text,
      "editorCursor.foreground": c.accent,
      "editor.selectionBackground": alpha(c.accent, 0.3),
      "editor.inactiveSelectionBackground": alpha(c.accent, 0.16),
      "editor.selectionHighlightBackground": alpha(c.accent, 0.14),
      "editor.wordHighlightBackground": alpha(c.accent, 0.12),
      "editor.lineHighlightBackground": lineHighlight(c, theme),
      "editor.lineHighlightBorder": alpha(c.surface2, 0),
      "editor.findMatchBackground": alpha(c.close, 0.4),
      "editor.findMatchHighlightBackground": alpha(c.close, 0.22),
      "editorBracketMatch.background": alpha(c.accent, 0.16),
      "editorBracketMatch.border": alpha(c.accent, 0.5),
      "editorIndentGuide.background1": c.border,
      "editorIndentGuide.activeBackground1": alpha(c.muted, 0.5),
      "editorWhitespace.foreground": c.border,
      "editorError.foreground": c.error,
      "editorWarning.foreground": c.close,
      "editorWidget.background": c.surface2,
      "editorWidget.border": c.border,
      "editorHoverWidget.background": c.surface2,
      "editorHoverWidget.border": c.border,
      "editorSuggestWidget.background": c.surface,
      "editorSuggestWidget.border": c.border,
      "editorSuggestWidget.selectedBackground": c.surface2,
      "editorSuggestWidget.highlightForeground": c.accent,
      "editorOverviewRuler.border": alpha(c.border, 0),
      "scrollbar.shadow": alpha(c.bg, 0),
      "scrollbarSlider.background": alpha(c.muted, 0.2),
      "scrollbarSlider.hoverBackground": alpha(c.muted, 0.32),
      "scrollbarSlider.activeBackground": alpha(c.muted, 0.44),
      "input.background": c.surface2,
      "input.border": c.border,
      "input.foreground": c.text,
    },
  }
}

let themesDefined = false

export function defineEditorThemes(monaco: typeof Monaco): void {
  if (themesDefined) return
  themesDefined = true
  monaco.editor.defineTheme(EDITOR_THEME_NAMES.dark, buildEditorTheme("dark"))
  monaco.editor.defineTheme(EDITOR_THEME_NAMES.light, buildEditorTheme("light"))
}

/** JetBrains Mono as loaded by next/font (Section 18.2), with fallbacks. */
export function editorFontFamily(): string {
  const loaded =
    typeof window === "undefined"
      ? ""
      : getComputedStyle(document.documentElement).getPropertyValue("--font-jetbrains-mono").trim()
  return [loaded, "ui-monospace", "SFMono-Regular", "Menlo", "monospace"].filter(Boolean).join(", ")
}

export const EDITOR_FONT_SIZE = 14
export const EDITOR_LINE_HEIGHT = 22

export function editorOptions(
  reducedMotion: boolean
): Monaco.editor.IStandaloneEditorConstructionOptions {
  return {
    ariaLabel: "Code editor (Python). Press Ctrl+M to let Tab move focus.",
    fontFamily: editorFontFamily(),
    fontSize: EDITOR_FONT_SIZE,
    lineHeight: EDITOR_LINE_HEIGHT,
    fontLigatures: false,
    tabSize: 4,
    insertSpaces: true,
    detectIndentation: false,
    automaticLayout: true,
    minimap: { enabled: false },
    scrollBeyondLastLine: false,
    padding: { top: 12, bottom: 12 },
    glyphMargin: false,
    folding: false,
    lineDecorationsWidth: 10,
    lineNumbersMinChars: 3,
    overviewRulerLanes: 0,
    hideCursorInOverviewRuler: true,
    renderLineHighlight: "line",
    bracketPairColorization: { enabled: false },
    guides: { indentation: true, bracketPairs: false },
    stickyScroll: { enabled: false },
    fixedOverflowWidgets: true,
    smoothScrolling: !reducedMotion,
    cursorSmoothCaretAnimation: "off",
    scrollbar: { useShadows: false, verticalScrollbarSize: 10, horizontalScrollbarSize: 10 },
    contextmenu: true,
    // Word completions only; there is no Python language server.
    wordBasedSuggestions: "currentDocument",
  }
}

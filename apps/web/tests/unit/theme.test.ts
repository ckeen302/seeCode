import { afterEach, describe, expect, it, vi } from "vitest"

import {
  THEME_INIT_SCRIPT,
  THEME_STORAGE_KEY,
  nextThemePreference,
  parseThemePreference,
  resolveTheme,
  setThemePreference,
} from "@/lib/theme"

function mockSystemTheme(light: boolean) {
  vi.stubGlobal(
    "matchMedia",
    vi.fn((query: string) => ({
      matches: light && query.includes("light"),
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }))
  )
}

afterEach(() => {
  vi.unstubAllGlobals()
  document.documentElement.removeAttribute("data-theme")
})

describe("theme preference", () => {
  it("defaults to dark for anything unknown", () => {
    expect(parseThemePreference(null)).toBe("dark")
    expect(parseThemePreference("purple")).toBe("dark")
    expect(parseThemePreference("light")).toBe("light")
    expect(parseThemePreference("system")).toBe("system")
  })

  it("resolves system from the OS setting", () => {
    expect(resolveTheme("system", true)).toBe("light")
    expect(resolveTheme("system", false)).toBe("dark")
    expect(resolveTheme("light", false)).toBe("light")
    expect(resolveTheme("dark", true)).toBe("dark")
  })

  it("cycles dark, light, system", () => {
    expect(nextThemePreference("dark")).toBe("light")
    expect(nextThemePreference("light")).toBe("system")
    expect(nextThemePreference("system")).toBe("dark")
  })

  it("stores and applies a new preference", () => {
    mockSystemTheme(true)
    setThemePreference("system")
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe("system")
    expect(document.documentElement.dataset.theme).toBe("light")
  })

  it.each([
    [null, false, "dark"],
    ["light", false, "light"],
    ["system", true, "light"],
    ["system", false, "dark"],
    ["dark", true, "dark"],
  ])("init script: stored %s, system light %s -> %s", (stored, systemLight, expected) => {
    mockSystemTheme(systemLight)
    if (stored) window.localStorage.setItem(THEME_STORAGE_KEY, stored)
    new Function(THEME_INIT_SCRIPT)()
    expect(document.documentElement.dataset.theme).toBe(expected)
  })
})

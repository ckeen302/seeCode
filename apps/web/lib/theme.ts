// Theme preference: dark (default), light or system (Sections 6.9 and 18.1).
// Stored in localStorage until Settings (M6) saves it to the profile.

export type ThemePreference = "dark" | "light" | "system"
export type ResolvedTheme = "dark" | "light"

export const THEME_STORAGE_KEY = "seecode:theme"
export const THEME_PREFERENCES: readonly ThemePreference[] = ["dark", "light", "system"]
const LIGHT_QUERY = "(prefers-color-scheme: light)"

export function parseThemePreference(value: string | null | undefined): ThemePreference {
  return value === "light" || value === "system" ? value : "dark"
}

export function resolveTheme(
  preference: ThemePreference,
  systemPrefersLight: boolean
): ResolvedTheme {
  if (preference === "system") return systemPrefersLight ? "light" : "dark"
  return preference
}

export function nextThemePreference(current: ThemePreference): ThemePreference {
  const index = THEME_PREFERENCES.indexOf(current)
  return THEME_PREFERENCES[(index + 1) % THEME_PREFERENCES.length]
}

export function readThemePreference(): ThemePreference {
  try {
    return parseThemePreference(window.localStorage.getItem(THEME_STORAGE_KEY))
  } catch {
    return "dark"
  }
}

export function systemPrefersLight(): boolean {
  return typeof window !== "undefined" && window.matchMedia(LIGHT_QUERY).matches
}

export function applyTheme(preference: ThemePreference): void {
  const theme = resolveTheme(preference, systemPrefersLight())
  const root = document.documentElement
  if (root.getAttribute("data-theme") === theme) return
  // Switch every color at once: without this, elements with color transitions fade
  // through muddy in-between shades for 150 ms.
  const pause = document.createElement("style")
  pause.textContent = "*,*::before,*::after{transition:none!important}"
  document.head.appendChild(pause)
  root.setAttribute("data-theme", theme)
  void window.getComputedStyle(root).color // apply the new colors while paused
  requestAnimationFrame(() => requestAnimationFrame(() => pause.remove()))
}

// Runs in <head> before first paint so a stored preference never flashes the default.
// Keep it in sync with parseThemePreference/resolveTheme above.
export const THEME_INIT_SCRIPT = `(function(){try{var p=localStorage.getItem(${JSON.stringify(
  THEME_STORAGE_KEY
)});var t=p==="light"?"light":p==="system"&&window.matchMedia(${JSON.stringify(
  LIGHT_QUERY
)}).matches?"light":"dark";document.documentElement.setAttribute("data-theme",t)}catch(e){}})()`

// Theme preference as an external store, so React renders the server default during
// hydration and the stored value right after, without a hydration mismatch.
const listeners = new Set<() => void>()

export function subscribeTheme(listener: () => void): () => void {
  listeners.add(listener)
  const media = window.matchMedia(LIGHT_QUERY)
  const onStorage = (event: StorageEvent) => {
    if (event.key === THEME_STORAGE_KEY) {
      applyTheme(readThemePreference())
      listener()
    }
  }
  media.addEventListener("change", listener)
  window.addEventListener("storage", onStorage)
  return () => {
    listeners.delete(listener)
    media.removeEventListener("change", listener)
    window.removeEventListener("storage", onStorage)
  }
}

export function setThemePreference(preference: ThemePreference): void {
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, preference)
  } catch {
    // Private mode or storage disabled: the choice lasts for this page only.
  }
  applyTheme(preference)
  listeners.forEach((listener) => listener())
}

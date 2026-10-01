"use client"

import { MonitorIcon, MoonIcon, SunIcon } from "lucide-react"
import { useLayoutEffect, useSyncExternalStore } from "react"

import { Button } from "@/components/ui/button"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { applySidebar, readSidebarCollapsed, subscribeSidebar } from "@/lib/sidebar"
import {
  applyTheme,
  nextThemePreference,
  readThemePreference,
  resolveTheme,
  setThemePreference,
  subscribeTheme,
  systemPrefersLight,
  type ResolvedTheme,
  type ThemePreference,
} from "@/lib/theme"

const LABELS: Record<ThemePreference, string> = {
  dark: "Dark",
  light: "Light",
  system: "System",
}
const ICONS = { dark: MoonIcon, light: SunIcon, system: MonitorIcon }

export function useThemePreference(): ThemePreference {
  return useSyncExternalStore(subscribeTheme, readThemePreference, () => "dark")
}

/** The theme on screen (a "system" preference resolved), e.g. for the code editor. */
export function useResolvedTheme(): ResolvedTheme {
  return useSyncExternalStore(
    subscribeTheme,
    () => resolveTheme(readThemePreference(), systemPrefersLight()),
    () => "dark"
  )
}

export function useSidebarCollapsed(): boolean {
  return useSyncExternalStore(subscribeSidebar, readSidebarCollapsed, () => false)
}

/**
 * Keeps <html> attributes in sync with stored preferences. The inline script sets them
 * before paint; React's development remount clears them, so re-apply before paint here.
 */
export function PreferencesSync() {
  const theme = useThemePreference()
  const collapsed = useSidebarCollapsed()
  useLayoutEffect(() => {
    applyTheme(theme)
    applySidebar(collapsed)
  })
  return null
}

export function ThemeToggle() {
  const preference = useThemePreference()
  const next = nextThemePreference(preference)
  const Icon = ICONS[preference]
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="icon-sm"
          className="text-muted hover:text-text"
          aria-label={`Theme: ${LABELS[preference]}. Switch to ${LABELS[next]}.`}
          onClick={() => setThemePreference(next)}
        >
          <Icon />
        </Button>
      </TooltipTrigger>
      <TooltipContent side="top">Theme: {LABELS[preference]}</TooltipContent>
    </Tooltip>
  )
}

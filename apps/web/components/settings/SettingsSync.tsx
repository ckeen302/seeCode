"use client"

import { useQueryClient } from "@tanstack/react-query"
import { useEffect } from "react"

import { applyReducedMotion } from "@/components/settings/motion"
import { useMe } from "@/lib/api/hooks"
import { browserTimeZone, patchMe, resolveSettings } from "@/lib/api/profile"
import { THEME_STORAGE_KEY, setThemePreference } from "@/lib/theme"

const TZ_SYNCED_KEY = "seecode:tz-synced"

/**
 * Applies the signed-in user's saved settings in this browser: reduced motion, the theme on a
 * browser that has no theme choice of its own yet, and the browser's time zone while the
 * profile still has the default UTC (streak days use it; docs/DECISIONS.md M6 note).
 */
export function SettingsSync() {
  const me = useMe()
  const queryClient = useQueryClient()
  const profile = me.data

  useEffect(() => {
    if (!profile) return
    const settings = resolveSettings(profile.settings)
    applyReducedMotion(settings.reducedMotion)

    try {
      if ("theme" in profile.settings && !window.localStorage.getItem(THEME_STORAGE_KEY)) {
        setThemePreference(settings.theme)
      }
    } catch {
      // Storage blocked: keep the current theme.
    }

    const zone = browserTimeZone()
    let synced = false
    try {
      synced = window.sessionStorage.getItem(TZ_SYNCED_KEY) === profile.id
    } catch {
      synced = false
    }
    if (zone && zone !== "UTC" && profile.timezone === "UTC" && !synced) {
      try {
        window.sessionStorage.setItem(TZ_SYNCED_KEY, profile.id)
      } catch {
        // Ignore: at worst we try again on the next page load.
      }
      patchMe({ timezone: zone })
        .then((updated) => queryClient.setQueryData(["me", profile.id], updated))
        .catch(() => {
          // The zone is a nicety for streak days; never bother the user about it.
        })
    }
  }, [profile, queryClient])

  return null
}

// Profile, settings and account (Sections 6.9 and 16.2): PATCH /me, export and delete.
import { z } from "zod"

import { api, useMe } from "@/lib/api/hooks"
import { ProfileSchema, type Profile } from "@/lib/api/schemas"

export const ReducedMotionSchema = z.enum(["system", "on", "off"])
export type ReducedMotion = z.infer<typeof ReducedMotionSchema>

/** Settings as stored (only keys the user set); see `resolveSettings` for defaults. */
export const UserSettingsSchema = z.object({
  theme: z.enum(["dark", "light", "system"]).optional(),
  sound: z.boolean().optional(),
  reducedMotion: ReducedMotionSchema.optional(),
  drillTimer: z.boolean().optional(),
  editorFontSize: z.number().int().min(10).max(28).optional(),
  monacoAccessibility: z.enum(["auto", "on", "off"]).optional(),
})
export type UserSettings = z.infer<typeof UserSettingsSchema>
export type ResolvedSettings = Required<UserSettings>

/** Section 6.9 defaults (theme dark, sound off, motion follows the system, timer on). */
export const DEFAULT_SETTINGS: ResolvedSettings = {
  theme: "dark",
  sound: false,
  reducedMotion: "system",
  drillTimer: true,
  editorFontSize: 14,
  monacoAccessibility: "auto",
}

/** The profile's settings with defaults filled in; unknown or malformed keys are ignored. */
export function resolveSettings(raw: Record<string, unknown> | null | undefined): ResolvedSettings {
  const resolved: ResolvedSettings = { ...DEFAULT_SETTINGS }
  if (!raw) return resolved
  for (const key of Object.keys(DEFAULT_SETTINGS) as (keyof ResolvedSettings)[]) {
    const field = UserSettingsSchema.shape[key].safeParse(raw[key])
    if (field.success && field.data !== undefined) {
      ;(resolved as Record<string, unknown>)[key] = field.data
    }
  }
  return resolved
}

export interface ProfilePatch {
  displayName?: string | null
  timezone?: string
  /** Merged key by key; null resets a key to its default. */
  settings?: { [K in keyof UserSettings]?: UserSettings[K] | null }
}

export function patchMe(patch: ProfilePatch): Promise<Profile> {
  return api.patch("/me", ProfileSchema, patch)
}

/** Every row the user owns, as the API exports it. */
export function exportMe(): Promise<unknown> {
  return api.get("/me/export", z.unknown())
}

export function deleteMe(): Promise<unknown> {
  return api.delete("/me", z.unknown())
}

export function exportFileName(now: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, "0")
  return `seecode-export-${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}.json`
}

/** Saves JSON as a file download in the browser. */
export function downloadJson(data: unknown, fileName: string): void {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" })
  const url = URL.createObjectURL(blob)
  const link = document.createElement("a")
  link.href = url
  link.download = fileName
  document.body.appendChild(link)
  link.click()
  link.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

/** The browser's IANA time zone, or null when unavailable. */
export function browserTimeZone(): string | null {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || null
  } catch {
    return null
  }
}

/** The signed-in user's settings with defaults (the defaults while loading or signed out). */
export function useSettings(): ResolvedSettings {
  const me = useMe()
  return resolveSettings(me.data?.settings)
}

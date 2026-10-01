// The Workspace editor's saved preferences (Section 6.9, Settings → Code editor): font size
// and screen-reader mode. SettingsSync copies them from the signed-in profile; the editor
// reads them here, so it needs no profile query of its own and guests get the defaults.
import { useSyncExternalStore } from "react"

import type * as Monaco from "monaco-editor"

export type EditorAccessibility = "auto" | "on" | "off"

export interface EditorSettings {
  fontSize: number
  /** Monaco's `accessibilitySupport`: "on" is screen-reader mode, "auto" asks the browser. */
  accessibility: EditorAccessibility
}

export const DEFAULT_EDITOR_SETTINGS: EditorSettings = { fontSize: 14, accessibility: "auto" }

let current: EditorSettings = DEFAULT_EDITOR_SETTINGS
const listeners = new Set<() => void>()

export function getEditorSettings(): EditorSettings {
  return current
}

export function setEditorSettings(next: EditorSettings): void {
  if (next.fontSize === current.fontSize && next.accessibility === current.accessibility) return
  current = { ...next }
  for (const listener of listeners) listener()
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function useEditorSettings(): EditorSettings {
  return useSyncExternalStore(subscribe, getEditorSettings, () => DEFAULT_EDITOR_SETTINGS)
}

/** The editor options these settings set (line height keeps the 14/22 rhythm). */
export function editorSettingsOptions(
  settings: EditorSettings
): Pick<
  Monaco.editor.IStandaloneEditorConstructionOptions,
  "fontSize" | "lineHeight" | "accessibilitySupport"
> {
  return {
    fontSize: settings.fontSize,
    lineHeight: Math.round((settings.fontSize * 22) / 14),
    accessibilitySupport: settings.accessibility,
  }
}

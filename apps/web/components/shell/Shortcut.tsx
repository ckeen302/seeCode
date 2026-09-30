"use client"

import { Kbd } from "@/components/ui/kbd"
import { formatHotkey, useIsMac, type Hotkey } from "@/lib/keyboard"

/** Renders a hotkey for the user's platform (⌘K on a Mac, Ctrl K elsewhere). */
export function Shortcut({ hotkey, className }: { hotkey: Hotkey; className?: string }) {
  const mac = useIsMac()
  if (mac === null) return null
  return <Kbd className={className}>{formatHotkey(hotkey, mac)}</Kbd>
}

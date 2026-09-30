"use client"

import { createContext, useContext, useState } from "react"

import { CommandDialog, CommandEmpty, CommandInput, CommandList } from "@/components/ui/command"
import { HOTKEYS, useHotkey } from "@/lib/keyboard"

// ⌘K opens a palette to jump to any problem or pattern (Section 5).
// Results arrive with the content system (M1); for now the list is always empty.

interface PaletteControls {
  open: () => void
}

const PaletteContext = createContext<PaletteControls | null>(null)

export function CommandPaletteProvider({ children }: { children: React.ReactNode }) {
  const [isOpen, setIsOpen] = useState(false)
  useHotkey(HOTKEYS.commandPalette, () => setIsOpen((open) => !open))

  return (
    <PaletteContext value={{ open: () => setIsOpen(true) }}>
      {children}
      <CommandDialog open={isOpen} onOpenChange={setIsOpen}>
        <CommandInput placeholder="Search problems and patterns…" />
        <CommandList>
          <CommandEmpty>No results yet.</CommandEmpty>
        </CommandList>
      </CommandDialog>
    </PaletteContext>
  )
}

export function useCommandPalette(): PaletteControls {
  const controls = useContext(PaletteContext)
  if (!controls) throw new Error("useCommandPalette must be used inside CommandPaletteProvider")
  return controls
}

"use client"

import { useEffect, useState } from "react"

import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog"
import { Kbd } from "@/components/ui/kbd"
import { HELP_KEY, HOTKEYS, formatHotkey, isHelpKey, useIsMac } from "@/lib/keyboard"

// Section 17.4: `?` anywhere opens a list of the keyboard shortcuts. It lists only what works
// today; the Plan card, hint and walkthrough keys join when those features arrive.

interface Row {
  label: string
  keys: (mac: boolean) => string
}

const SECTIONS: { title: string; rows: Row[] }[] = [
  {
    title: "Anywhere",
    rows: [
      {
        label: "Search problems and patterns",
        keys: (mac) => formatHotkey(HOTKEYS.commandPalette, mac),
      },
      { label: "Show keyboard shortcuts", keys: () => HELP_KEY },
    ],
  },
  {
    title: "Workspace",
    rows: [
      { label: "Run the examples", keys: (mac) => formatHotkey(HOTKEYS.run, mac) },
      { label: "Submit (every test)", keys: (mac) => formatHotkey(HOTKEYS.submit, mac) },
      {
        label: "Show or hide the tests panel",
        keys: (mac) => formatHotkey(HOTKEYS.toggleBottomPanel, mac),
      },
      // Monaco's own binding: Tab indents until this is turned on (Section 18.8).
      { label: "Let Tab leave the code editor", keys: (mac) => (mac ? "⌃⇧M" : "Ctrl M") },
    ],
  },
]

export function ShortcutsHelp() {
  const [open, setOpen] = useState(false)
  const mac = useIsMac() ?? false

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!isHelpKey(event)) return
      event.preventDefault()
      setOpen(true)
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [])

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="gap-5">
        <div className="flex flex-col gap-1">
          <DialogTitle>Keyboard shortcuts</DialogTitle>
          <DialogDescription>Press ? anywhere to open this list.</DialogDescription>
        </div>
        {SECTIONS.map((section) => (
          <section key={section.title} className="flex flex-col gap-2">
            <h3 className="text-xs font-medium tracking-wide text-muted uppercase">
              {section.title}
            </h3>
            <dl className="flex flex-col gap-1.5">
              {section.rows.map((row) => (
                <div key={row.label} className="flex items-center justify-between gap-4 text-sm">
                  <dt>{row.label}</dt>
                  <dd>
                    <Kbd className="h-6 px-1.5 text-text">{row.keys(mac)}</Kbd>
                  </dd>
                </div>
              ))}
            </dl>
          </section>
        ))}
      </DialogContent>
    </Dialog>
  )
}

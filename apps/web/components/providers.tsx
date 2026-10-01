"use client"

import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { useState } from "react"

import { SettingsSync } from "@/components/settings/SettingsSync"
import { CommandPaletteProvider } from "@/components/shell/CommandPalette"
import { PreferencesSync } from "@/components/shell/Preferences"
import { ShortcutsHelp } from "@/components/shell/ShortcutsHelp"
import { Toaster } from "@/components/ui/toast"
import { TooltipProvider } from "@/components/ui/tooltip"
import { GuestImport } from "@/components/workspace/GuestImport"
import { shouldRetry } from "@/lib/api/hooks"

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: { staleTime: 30_000, retry: shouldRetry, refetchOnWindowFocus: false },
        },
      })
  )

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <CommandPaletteProvider>
          <PreferencesSync />
          <SettingsSync />
          <ShortcutsHelp />
          {children}
          <GuestImport />
          <Toaster />
        </CommandPaletteProvider>
      </TooltipProvider>
    </QueryClientProvider>
  )
}

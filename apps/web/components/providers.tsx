"use client"

import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { useState } from "react"

import { CommandPaletteProvider } from "@/components/shell/CommandPalette"
import { PreferencesSync } from "@/components/shell/Preferences"
import { TooltipProvider } from "@/components/ui/tooltip"
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
          {children}
        </CommandPaletteProvider>
      </TooltipProvider>
    </QueryClientProvider>
  )
}

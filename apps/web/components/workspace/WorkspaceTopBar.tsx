"use client"

import { ChevronLeftIcon, SearchIcon } from "lucide-react"
import Link from "next/link"

import { useCommandPalette } from "@/components/shell/CommandPalette"
import { ThemeToggle } from "@/components/shell/Preferences"
import { ProfileMenu } from "@/components/shell/ProfileMenu"
import { Shortcut } from "@/components/shell/Shortcut"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { HOTKEYS } from "@/lib/keyboard"

/**
 * Section 7.1 top bar. The breadcrumb reads "Problems · <title>": the pattern name would
 * give the approach away during the attempt. Once the attempt ended or rung 3 opened, it
 * reads "Problems · <pattern> · <title>".
 */
export function WorkspaceTopBar({
  title,
  pattern = null,
}: {
  title: string | null
  pattern?: string | null
}) {
  const palette = useCommandPalette()
  return (
    <header className="flex h-12 shrink-0 items-center gap-2 border-b border-border bg-surface px-2">
      <nav aria-label="Breadcrumb" className="min-w-0">
        <ol className="flex min-w-0 items-center gap-1 text-sm">
          <li>
            <Link
              href="/problems"
              className="inline-flex h-8 items-center gap-1 rounded-md pr-2 pl-1 text-muted hover:bg-surface-2 hover:text-text"
            >
              <ChevronLeftIcon aria-hidden className="size-4" />
              Problems
            </Link>
          </li>
          <li aria-hidden className="text-muted">
            ·
          </li>
          {pattern ? (
            <>
              <li className="shrink-0 px-1 text-muted" data-testid="breadcrumb-pattern">
                {pattern}
              </li>
              <li aria-hidden className="text-muted">
                ·
              </li>
            </>
          ) : null}
          <li className="min-w-0 truncate px-1 font-medium" aria-current="page">
            {title ?? <Skeleton className="h-4 w-40" />}
          </li>
        </ol>
      </nav>
      <div className="ml-auto flex items-center gap-1">
        <Button
          variant="ghost"
          size="sm"
          className="gap-2 text-muted hover:text-text"
          onClick={palette.open}
          aria-label="Search problems and patterns"
        >
          <SearchIcon />
          <Shortcut hotkey={HOTKEYS.commandPalette} className="hidden min-[640px]:inline-flex" />
        </Button>
        <ThemeToggle />
        <ProfileMenu compact />
      </div>
    </header>
  )
}

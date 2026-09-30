"use client"

import { useQueryClient } from "@tanstack/react-query"
import { defaultFilter } from "cmdk"
import { CodeIcon, ShapesIcon } from "lucide-react"
import { useRouter } from "next/navigation"
import { createContext, useContext, useRef, useState } from "react"

import { DifficultyChip } from "@/components/problems/DifficultyChip"
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command"
import { usePatterns, useProblems } from "@/lib/api/hooks"
import { HOTKEYS, useHotkey } from "@/lib/keyboard"
import { warmUpWorkspace } from "@/lib/workspace/warmup"

// ⌘K opens a palette to jump to any problem or pattern (Section 5). Problems never show
// their pattern here: that would spoil recognition.

interface PaletteControls {
  open: () => void
}

const PaletteContext = createContext<PaletteControls | null>(null)

const PROBLEM_PREFIX = "problem:"

function PaletteResults({ onNavigate }: { onNavigate: (href: string) => void }) {
  const problems = useProblems()
  const patterns = usePatterns()
  const sortedProblems = [...(problems.data ?? [])].sort((a, b) => a.order - b.order)
  const loading = problems.isPending || patterns.isPending
  const failed = problems.isError && patterns.isError

  return (
    <CommandList>
      <CommandEmpty>
        {loading ? "Loading…" : failed ? "Couldn't load results. Try again soon." : "No matches."}
      </CommandEmpty>
      {sortedProblems.length > 0 ? (
        <CommandGroup heading="Problems">
          {sortedProblems.map((problem) => (
            <CommandItem
              key={problem.slug}
              value={`${PROBLEM_PREFIX}${problem.slug}`}
              keywords={[problem.title, problem.difficulty]}
              onSelect={() => onNavigate(`/p/${problem.slug}`)}
            >
              <CodeIcon aria-hidden className="text-muted" />
              <span className="truncate">{problem.title}</span>
              <DifficultyChip difficulty={problem.difficulty} className="ml-auto" />
            </CommandItem>
          ))}
        </CommandGroup>
      ) : null}
      {patterns.data && patterns.data.length > 0 ? (
        <CommandGroup heading="Patterns">
          {patterns.data.map((pattern) => (
            <CommandItem
              key={pattern.id}
              value={`pattern:${pattern.id}`}
              keywords={[pattern.name, pattern.family.replace(/_/g, " ")]}
              onSelect={() => onNavigate(`/patterns/${pattern.id}`)}
            >
              <ShapesIcon aria-hidden className="text-muted" />
              <span className="truncate">{pattern.name}</span>
              <span className="ml-auto shrink-0 text-xs text-muted in-data-[selected=true]:text-text">
                {pattern.problemCount} {pattern.problemCount === 1 ? "problem" : "problems"}
              </span>
            </CommandItem>
          ))}
        </CommandGroup>
      ) : null}
    </CommandList>
  )
}

export function CommandPaletteProvider({ children }: { children: React.ReactNode }) {
  const [isOpen, setIsOpen] = useState(false)
  const router = useRouter()
  const queryClient = useQueryClient()
  // The first highlight is cmdk's automatic pick of the top item, not the user's choice.
  const highlights = useRef(0)
  const setOpen = (open: boolean) => {
    if (open) highlights.current = 0
    setIsOpen(open)
  }
  useHotkey(HOTKEYS.commandPalette, () => setOpen(!isOpen), { stopPropagation: true })

  function navigate(href: string) {
    setOpen(false)
    router.push(href)
  }

  return (
    <PaletteContext value={{ open: () => setOpen(true) }}>
      {children}
      <CommandDialog
        open={isOpen}
        onOpenChange={setOpen}
        commandProps={{
          // Match on what the user sees (the keywords), not on the internal item ids.
          filter: (_value, search, keywords = []) =>
            defaultFilter(keywords[0] ?? "", search, keywords.slice(1)),
          // Moving to a problem warms up Python and the editor for it (Section 9.1).
          onValueChange: (value) => {
            highlights.current += 1
            if (highlights.current > 1 && value.startsWith(PROBLEM_PREFIX)) {
              warmUpWorkspace(value.slice(PROBLEM_PREFIX.length), queryClient)
            }
          },
        }}
      >
        <CommandInput placeholder="Search problems and patterns…" />
        <PaletteResults onNavigate={navigate} />
      </CommandDialog>
    </PaletteContext>
  )
}

export function useCommandPalette(): PaletteControls {
  const controls = useContext(PaletteContext)
  if (!controls) throw new Error("useCommandPalette must be used inside CommandPaletteProvider")
  return controls
}

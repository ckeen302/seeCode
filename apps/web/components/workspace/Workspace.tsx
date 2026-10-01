"use client"

import { MonitorIcon, RotateCwIcon } from "lucide-react"
import Link from "next/link"
import { useCallback, useEffect, useState } from "react"
import {
  Group,
  Panel,
  Separator,
  useDefaultLayout,
  usePanelRef,
  type LayoutStorage,
} from "react-resizable-panels"

import { BOTTOM_HEADER_PX, BottomPanel } from "@/components/workspace/BottomPanel"
import { CoachPanel } from "@/components/workspace/CoachPanel"
import { EditorPanel } from "@/components/workspace/EditorPanel"
import { ProblemPanel } from "@/components/workspace/ProblemPanel"
import { WorkspaceTopBar } from "@/components/workspace/WorkspaceTopBar"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { focusPlanCard } from "@/components/workspace/PlanCard"
import { ApiError } from "@/lib/api/client"
import { api, usePatterns, useProblem, useProblemPatterns } from "@/lib/api/hooks"
import type { ProblemPublic } from "@/lib/api/schemas"
import { useAuth } from "@/lib/auth/session"
import { HOTKEYS, useHotkey } from "@/lib/keyboard"
import { useMediaQuery } from "@/lib/useMediaQuery"
import { cn } from "@/lib/utils"
import { useActiveTime } from "@/lib/workspace/activity"
import { importGuestAttempts } from "@/lib/workspace/guestImport"
import { COACH_HOTKEYS, isInPlanCard } from "@/lib/workspace/hotkeys"
import { REVEAL_RUNG, patternFromRungs } from "@/lib/workspace/ladder"
import { CoachMotion } from "@/lib/workspace/motion"
import { patternName } from "@/lib/workspace/plan"
import { WIDE_SCREEN_QUERY, warmUpWorkspace } from "@/lib/workspace/warmup"
import { useWorkspace, workspaceStore } from "@/stores/workspace"

// Section 7.1: 30 / 46 / 24 columns with minimum widths, the bottom panel at 40% of the
// middle column. Sizes are remembered in localStorage.
const MIN_PROBLEM_PX = 260
const MIN_EDITOR_PX = 420
const MIN_COACH_PX = 280

/** localStorage that never throws (private mode, blocked storage, server). */
const layoutStorage: LayoutStorage = {
  getItem(key) {
    try {
      return typeof window === "undefined" ? null : window.localStorage.getItem(key)
    } catch {
      return null
    }
  },
  setItem(key, value) {
    try {
      window.localStorage.setItem(key, value)
    } catch {
      // The layout lasts for this page only.
    }
  },
}

function ResizeHandle({ orientation }: { orientation: "horizontal" | "vertical" }) {
  return (
    <Separator
      className={cn(
        "relative shrink-0 bg-border transition-colors hover:bg-accent focus-visible:bg-accent data-[separator=active]:bg-accent data-[separator=hover]:bg-accent",
        orientation === "horizontal" ? "w-px" : "h-px"
      )}
    />
  )
}

function WorkspaceColumns({ problem }: { problem: ProblemPublic }) {
  const columns = useDefaultLayout({ id: "seecode:workspace:columns", storage: layoutStorage })
  const middle = useDefaultLayout({ id: "seecode:workspace:middle", storage: layoutStorage })
  const bottomRef = usePanelRef()
  const [collapsed, setCollapsed] = useState(false)

  const setBottomCollapsed = useCallback(
    (next: boolean) => {
      const panel = bottomRef.current
      if (!panel) return
      if (next) panel.collapse()
      else panel.expand()
    },
    [bottomRef]
  )

  useHotkey(
    HOTKEYS.toggleBottomPanel,
    () => setBottomCollapsed(!(bottomRef.current?.isCollapsed() ?? false)),
    { stopPropagation: true, ignoreInDialogs: true }
  )

  // A Run or Submit (button or shortcut) brings back a collapsed panel: its results show there.
  const running = useWorkspace((state) => state.running)
  useEffect(() => {
    if (running !== "idle" && bottomRef.current?.isCollapsed()) setBottomCollapsed(false)
  }, [running, bottomRef, setBottomCollapsed])

  return (
    <Group
      orientation="horizontal"
      id="seecode-workspace-columns"
      className="h-full"
      defaultLayout={columns.defaultLayout}
      onLayoutChanged={columns.onLayoutChanged}
    >
      <Panel id="problem" defaultSize="30%" minSize={MIN_PROBLEM_PX}>
        <ProblemPanel problem={problem} />
      </Panel>
      <ResizeHandle orientation="horizontal" />
      <Panel id="editor" defaultSize="46%" minSize={MIN_EDITOR_PX}>
        <Group
          orientation="vertical"
          id="seecode-workspace-middle"
          className="h-full"
          defaultLayout={middle.defaultLayout}
          onLayoutChanged={middle.onLayoutChanged}
        >
          <Panel id="code" defaultSize="60%" minSize={120}>
            <EditorPanel key={problem.slug} />
          </Panel>
          <ResizeHandle orientation="vertical" />
          <Panel
            id="bottom"
            defaultSize="40%"
            minSize={140}
            collapsible
            collapsedSize={BOTTOM_HEADER_PX}
            panelRef={bottomRef}
            onResize={(size) => setCollapsed(size.inPixels <= BOTTOM_HEADER_PX + 1)}
          >
            <BottomPanel collapsed={collapsed} onToggleCollapsed={setBottomCollapsed} />
          </Panel>
        </Group>
      </Panel>
      <ResizeHandle orientation="horizontal" />
      <Panel id="coach" defaultSize="24%" minSize={MIN_COACH_PX}>
        <CoachPanel />
      </Panel>
    </Group>
  )
}

function WorkspaceSkeleton() {
  // After 3 s, a free API host may be waking up (Section 22.4).
  const [slow, setSlow] = useState(false)
  useEffect(() => {
    const timer = setTimeout(() => setSlow(true), 3000)
    return () => clearTimeout(timer)
  }, [])
  return (
    <div className="flex h-full" aria-busy="true">
      <div className="flex w-[30%] flex-col gap-3 border-r border-border bg-surface p-5">
        <Skeleton className="h-7 w-2/3" />
        <Skeleton className="h-6 w-24" />
        <Skeleton className="mt-3 h-4 w-full" />
        <Skeleton className="h-4 w-11/12" />
        <Skeleton className="h-4 w-4/5" />
        <Skeleton className="mt-4 h-24 w-full" />
        {slow ? <p className="mt-2 text-sm text-muted">Waking up the server…</p> : null}
      </div>
      <div className="flex w-[46%] flex-col border-r border-border">
        <div className="flex-[3] bg-surface" />
        <div className="flex-[2] border-t border-border bg-surface" />
      </div>
      <div className="w-[24%] bg-surface" />
    </div>
  )
}

function NarrowScreenNotice() {
  return (
    <div className="flex h-full items-center justify-center px-4 py-12">
      <div className="flex max-w-sm flex-col items-center gap-3 text-center">
        <MonitorIcon aria-hidden className="size-8 text-muted" />
        <h1 className="text-xl font-semibold">Use a larger screen</h1>
        <p className="text-muted">
          The Workspace needs at least 900 px of width to fit the problem, the editor and the tests
          side by side. On a phone, a quick drill works well instead.
        </p>
        <div className="flex flex-wrap justify-center gap-2">
          <Button asChild>
            <Link href="/drills">Go to drills</Link>
          </Button>
          <Button asChild variant="secondary">
            <Link href="/problems">All problems</Link>
          </Button>
        </div>
      </div>
    </div>
  )
}

function LoadError({ error, onRetry }: { error: Error; onRetry: () => void }) {
  const missing = error instanceof ApiError && error.status === 404
  return (
    <div className="flex h-full items-center justify-center px-4 py-12">
      <div role="alert" className="flex max-w-sm flex-col items-center gap-3 text-center">
        <h1 className="text-xl font-semibold">
          {missing ? "Problem not found" : "We couldn't load this problem"}
        </h1>
        <p className="text-muted">
          {missing
            ? "There is no problem at this address."
            : "Check your connection, then try again."}
        </p>
        <div className="flex gap-2">
          {missing ? null : (
            <Button onClick={onRetry}>
              <RotateCwIcon />
              Try again
            </Button>
          )}
          <Button asChild variant="secondary">
            <Link href="/problems">All problems</Link>
          </Button>
        </div>
      </div>
    </div>
  )
}

/**
 * Signed in: uploads guest work first (journey 4.1), then resumes or creates the attempt
 * (`POST /attempts`). The store ignores a second call while one is in flight.
 */
function useSignedInAttempt(ready: boolean) {
  const mode = useWorkspace((state) => state.mode)
  const coach = useWorkspace((state) => state.coach)
  const slug = useWorkspace((state) => state.slug)
  useEffect(() => {
    if (!ready || mode !== "user" || coach !== "loading") return
    let cancelled = false
    void importGuestAttempts(api)
      .catch(() => null) // tried again on the next page; the attempt loads anyway
      .then(() => {
        if (!cancelled) void workspaceStore.getState().loadAttempt()
      })
    return () => {
      cancelled = true
    }
  }, [ready, mode, coach, slug])
}

/**
 * Section 7.1: the top bar names the pattern only once the attempt ended or rung 3 opened,
 * so it never spoils recognition.
 */
function useRevealedPatternName(slug: string): string | null {
  const fromCoach = useWorkspace(
    (state) =>
      state.wrapUp?.patternId ??
      (state.openedRungs.some((hint) => hint.rung >= REVEAL_RUNG)
        ? patternFromRungs(state.openedRungs)
        : null)
  )
  const ended = useWorkspace((state) => state.attemptStatus === "finished")
  const lookUp = ended && fromCoach === null
  const problems = useProblemPatterns({ enabled: lookUp })
  const patterns = usePatterns({ enabled: fromCoach !== null || ended })
  const id = fromCoach ?? (lookUp ? problems.data?.find((p) => p.slug === slug)?.patternId : null)
  return patternName(id, patterns.data)
}

/** The Workspace (Section 7): problem, editor with tests, coach. Guests can use it fully. */
export function Workspace({ slug }: { slug: string }) {
  const wide = useMediaQuery(WIDE_SCREEN_QUERY)
  const query = useProblem(slug)
  const auth = useAuth()
  const openSlug = useWorkspace((state) => state.slug)
  const problem = query.data

  // Start Python and the editor as soon as the Workspace mounts (on wide screens).
  useEffect(() => {
    if (wide) warmUpWorkspace()
  }, [wide])

  useEffect(() => {
    if (problem) workspaceStore.getState().open(problem)
  }, [problem])

  useEffect(() => {
    if (auth.status !== "loading") workspaceStore.getState().setGuest(auth.status === "signed_out")
  }, [auth.status])

  // Save the code before the tab goes away (Section 7.9).
  useEffect(() => {
    const flush = () => workspaceStore.getState().flush()
    const onVisibility = () => {
      if (document.visibilityState === "hidden") flush()
    }
    window.addEventListener("pagehide", flush)
    document.addEventListener("visibilitychange", onVisibility)
    return () => {
      flush()
      window.removeEventListener("pagehide", flush)
      document.removeEventListener("visibilitychange", onVisibility)
    }
  }, [])

  const ready = Boolean(problem) && openSlug === slug
  useSignedInAttempt(ready)
  const patternLabel = useRevealedPatternName(slug)

  // Active time (11.2) counts while the attempt is open and the user is at it.
  const timing = useWorkspace(
    (state) => ready && state.coach === "ready" && state.attemptStatus === "active"
  )
  useActiveTime(timing, (seconds) => workspaceStore.getState().addActiveSeconds(seconds))

  // Capture phase, kept from the editor: Monaco would otherwise insert a line on ⌘↵.
  const hotkeyOptions = {
    enabled: ready && wide === true,
    stopPropagation: true,
    ignoreInDialogs: true,
  }
  // ⌘↵ checks the plan while focus is in the Plan card (7.3), and runs the code elsewhere.
  useHotkey(
    HOTKEYS.run,
    (event) => {
      const store = workspaceStore.getState()
      if (isInPlanCard(event.target)) void store.checkPlan()
      else void store.run()
    },
    hotkeyOptions
  )
  useHotkey(HOTKEYS.submit, () => void workspaceStore.getState().submit(), hotkeyOptions)
  useHotkey(COACH_HOTKEYS.focusPlan, () => focusPlanCard(), hotkeyOptions)

  let body: React.ReactNode
  if (wide === false) body = <NarrowScreenNotice />
  else if (query.isError)
    body = <LoadError error={query.error} onRetry={() => void query.refetch()} />
  else if (!ready || !problem || wide === null) body = <WorkspaceSkeleton />
  else body = <WorkspaceColumns problem={problem} />

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-bg">
      <a
        href="#main"
        className="sr-only z-50 rounded-md bg-accent px-3 py-2 text-sm font-medium text-on-accent focus:not-sr-only focus:fixed focus:top-3 focus:left-3"
      >
        Skip to content
      </a>
      <WorkspaceTopBar
        title={problem?.title ?? (query.isError ? "Problem" : null)}
        pattern={ready ? patternLabel : null}
      />
      <main id="main" className="min-h-0 flex-1">
        <CoachMotion>{body}</CoachMotion>
      </main>
    </div>
  )
}

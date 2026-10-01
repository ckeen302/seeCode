"use client"

import { ChevronDownIcon, ChevronUpIcon, FootprintsIcon, RotateCwIcon } from "lucide-react"
import { useEffect, useMemo, useRef } from "react"

import { TestsPanel } from "@/components/workspace/TestsPanel"
import { TraceMyCode } from "@/components/workspace/TraceMyCode"
import { WalkthroughSlot } from "@/components/workspace/WalkthroughSlot"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { HOTKEYS, formatHotkey, useIsMac } from "@/lib/keyboard"
import { customInputs } from "@/lib/viz/payloads"
import type { Prediction } from "@/lib/viz/types"
import { useWorkspace, workspaceStore, type BottomTab } from "@/stores/workspace"

/** Height of the tab row, which stays visible while the panel is collapsed. */
export const BOTTOM_HEADER_PX = 41

function EmptyTab({
  icon: Icon,
  title,
  children,
}: {
  icon: typeof FootprintsIcon
  title: string
  children: React.ReactNode
}) {
  return (
    <div className="flex h-full items-start px-4 py-4">
      <div className="flex max-w-md items-start gap-3 rounded-lg border border-border bg-bg p-4">
        <Icon aria-hidden className="mt-0.5 size-4 shrink-0 text-muted" />
        <div className="flex flex-col gap-1">
          <h3 className="text-sm font-semibold">{title}</h3>
          <p className="text-sm text-muted">{children}</p>
        </div>
      </div>
    </div>
  )
}

// Stable, so the player's subscription does not churn.
const recordPrediction = (prediction: Prediction) =>
  workspaceStore.getState().recordPrediction(prediction)

/**
 * The Walkthrough tab (7.6): the payload of rung 5, or of "See it run" after a solve. Before
 * either, it says how to get there without giving anything away.
 */
function WalkthroughTab() {
  const payload = useWorkspace((state) => state.walkthrough)
  const loading = useWorkspace((state) => state.walkthroughLoading)
  const error = useWorkspace((state) => state.walkthroughError)
  const problem = useWorkspace((state) => state.problem)
  const customCases = useWorkspace((state) => state.customCases)
  const extraInputs = useMemo(
    () => (problem ? customInputs(problem, customCases) : []),
    [problem, customCases]
  )
  if (payload) {
    return (
      <div className="h-full overflow-y-auto px-4 py-4">
        <WalkthroughSlot
          payload={payload}
          extraInputs={extraInputs}
          onPrediction={recordPrediction}
        />
      </div>
    )
  }
  if (loading) {
    return (
      <div className="flex flex-col gap-2 px-4 py-4" aria-busy="true">
        <Skeleton className="h-5 w-48" />
        <Skeleton className="h-16 w-full max-w-2xl" />
      </div>
    )
  }
  if (error) {
    return (
      <div role="alert" className="flex flex-col items-start gap-2 px-4 py-4 text-sm">
        <p>{error}</p>
        <Button
          size="sm"
          variant="secondary"
          onClick={() => void workspaceStore.getState().showWalkthrough()}
        >
          <RotateCwIcon />
          Try again
        </Button>
      </div>
    )
  }
  return (
    <EmptyTab icon={FootprintsIcon} title="Walkthrough">
      Watch the reference solution run on real data, step by step. It opens with hint rung 5, or any
      time after you solve the problem (See it run).
    </EmptyTab>
  )
}

/** The middle column's bottom panel (Section 7.1): Tests, Walkthrough, Trace my code. */
export function BottomPanel({
  collapsed,
  onToggleCollapsed,
}: {
  collapsed: boolean
  onToggleCollapsed: (collapsed: boolean) => void
}) {
  const tab = useWorkspace((state) => state.bottomTab)
  const running = useWorkspace((state) => state.running)
  const focusRequest = useWorkspace((state) => state.bottomFocus)
  const sectionRef = useRef<HTMLElement>(null)
  // A request made before this panel mounted (another problem) is not for it.
  const handledRequest = useRef(focusRequest)
  const toggleRef = useRef(onToggleCollapsed)
  useEffect(() => {
    toggleRef.current = onToggleCollapsed
  })
  const mac = useIsMac()
  const hint = (hotkey: (typeof HOTKEYS)[keyof typeof HOTKEYS]) =>
    mac === null ? undefined : formatHotkey(hotkey, mac)
  const toggleLabel = collapsed ? "Show the tests panel" : "Hide the tests panel"

  // Rung 5 and See it run open the Walkthrough tab and move focus to it (7.4), opening a
  // collapsed panel first.
  useEffect(() => {
    if (focusRequest === handledRequest.current) return
    handledRequest.current = focusRequest
    toggleRef.current(false)
    const frame = requestAnimationFrame(() => {
      sectionRef.current
        ?.querySelector<HTMLElement>("[role=tab][data-state=active]")
        ?.focus({ preventScroll: true })
    })
    return () => cancelAnimationFrame(frame)
  }, [focusRequest])

  return (
    <section
      ref={sectionRef}
      aria-label="Tests"
      className="@container flex h-full min-h-0 flex-col bg-surface"
    >
      <Tabs
        value={tab}
        onValueChange={(value) => {
          workspaceStore.getState().setBottomTab(value as BottomTab)
          if (collapsed) onToggleCollapsed(false)
        }}
        className="h-full min-h-0"
      >
        <div className="flex h-10 shrink-0 items-center gap-2 border-b border-border px-2">
          <TabsList aria-label="Bottom panel">
            <TabsTrigger value="tests">Tests</TabsTrigger>
            <TabsTrigger value="walkthrough">Walkthrough</TabsTrigger>
            <TabsTrigger value="trace">
              <span>
                Trace<span className="@max-[520px]:hidden"> my code</span>
              </span>
            </TabsTrigger>
          </TabsList>
          <div className="ml-auto flex items-center gap-2">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  className="text-muted hover:text-text"
                  aria-label={toggleLabel}
                  aria-expanded={!collapsed}
                  onClick={() => onToggleCollapsed(!collapsed)}
                >
                  {collapsed ? <ChevronUpIcon /> : <ChevronDownIcon />}
                </Button>
              </TooltipTrigger>
              <TooltipContent side="top">
                {toggleLabel} {hint(HOTKEYS.toggleBottomPanel)}
              </TooltipContent>
            </Tooltip>
            <Button
              variant="secondary"
              size="sm"
              shortcut={hint(HOTKEYS.run)}
              shortcutClassName="hidden @min-[600px]:inline"
              aria-busy={running === "run"}
              onClick={() => void workspaceStore.getState().run()}
            >
              Run
            </Button>
            <Button
              size="sm"
              shortcut={hint(HOTKEYS.submit)}
              shortcutClassName="hidden @min-[600px]:inline"
              aria-busy={running === "submit"}
              onClick={() => void workspaceStore.getState().submit()}
            >
              Submit
            </Button>
          </div>
        </div>
        {collapsed ? null : (
          <>
            <TabsContent value="tests" className="min-h-0">
              <TestsPanel />
            </TabsContent>
            <TabsContent value="walkthrough" className="min-h-0">
              <WalkthroughTab />
            </TabsContent>
            <TabsContent value="trace" className="min-h-0">
              <div className="h-full overflow-y-auto px-4 py-4">
                <TraceMyCode />
              </div>
            </TabsContent>
          </>
        )}
      </Tabs>
    </section>
  )
}
